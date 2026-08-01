import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { seasonFit, rankOrder } from '@/lib/utils/identify-ranking';
import { coarsenLocation } from '@/lib/privacy/coarsen-location';

const PLANTID_API_URL = 'https://mushroom.kindwise.com/api/v1/identification';

type PlantIdSuggestion = {
  name: string;
  probability: number;
  similar_images?: Array<{ url: string }>;
  details?: {
    common_names?: string[];
    taxonomy?: Record<string, string>;
    description?: { value?: string };
    edibility?: string;
  };
};

type IdentifyRequest = {
  image: string;
  latitude?: number;
  longitude?: number;
};

function isAiEnabled() {
  const apiKey = process.env.PLANTID_API_KEY;
  return Boolean(apiKey && apiKey !== 'your-api-key-here' && apiKey.length >= 20);
}

export async function GET() {
  return NextResponse.json({ enabled: isAiEnabled() });
}

export async function POST(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('identify.start');
  try {
    if (!isAiEnabled()) {
      log.warn('identify.ai_disabled');
      return NextResponse.json(
        { error: 'AI-identifikasjon er ikke aktivert ennå.', code: 'ai_disabled' },
        { status: 503 }
      );
    }
    const apiKey = process.env.PLANTID_API_KEY!;

    const supabase = createClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      log.info('identify.unauthenticated');
      return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
    }

    const userLog = log.child({ userId: user.id });

    // Short-term burst protection on top of the daily billing-tier limit
    // below. Stops compromised-account abuse and runaway client loops.
    const rateLimit = checkRateLimit(`identify:${getClientKey(request, user.id)}`, 20, 60);
    if (!rateLimit.allowed) {
      userLog.warn('identify.rate_limited', { retryAfterSeconds: rateLimit.retryAfterSeconds });
      return rateLimitResponse(rateLimit);
    }

    const subscription = await getUserBillingSubscription(supabase, user.id);
    const capabilities = getBillingCapabilities(subscription);

    if (!capabilities.paid) {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Count actual identify CALLS in the last 24h (migration 020), not saved
      // finds — counting saves let a user identify-without-saving past the cap.
      let usageCount: number | null = null;
      try {
        const admin = createAdminClient();
        const { count, error: countError } = await admin
          .from('ai_identifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .gte('created_at', oneDayAgo);
        if (countError) {
          // Anything other than "table missing" is a real failure.
          if (countError.code !== '42P01') {
            return NextResponse.json({ error: 'Kunne ikke validere rate limit' }, { status: 500 });
          }
        } else {
          usageCount = count ?? 0;
        }
      } catch {
        // Service-role client unavailable — fall through to the legacy count.
      }

      // Fallback (migration 020 not applied yet, or no service key): the old
      // saved-find count, so identify keeps working rather than failing.
      if (usageCount === null) {
        const { count: legacy, error: legacyError } = await supabase
          .from('findings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('ai_used', true)
          .gte('created_at', oneDayAgo);
        if (legacyError) {
          return NextResponse.json({ error: 'Kunne ikke validere rate limit' }, { status: 500 });
        }
        usageCount = legacy ?? 0;
      }

      if (usageCount >= FREE_DAILY_AI_LIMIT) {
        userLog.info('identify.daily_quota_reached', { used: usageCount, limit: FREE_DAILY_AI_LIMIT });
        return NextResponse.json(
          {
            error: `Gratisbrukere har maks ${FREE_DAILY_AI_LIMIT} identifikasjoner per døgn. Oppgrader til Premium eller Sesongpass for ubegrenset bruk.`
          },
          { status: 429 }
        );
      }
    }

    const body = (await request.json()) as IdentifyRequest;
    if (!body.image) {
      userLog.warn('identify.missing_image');
      return NextResponse.json({ error: 'Bilde mangler' }, { status: 400 });
    }
    // The client sends a ~1500px re-encoded JPEG (well under 2 MB of base64).
    // Reject absurd payloads before paying for a Kindwise call.
    if (typeof body.image !== 'string' || body.image.length > 8_000_000) {
      userLog.warn('identify.image_too_large');
      return NextResponse.json({ error: 'Bildet er for stort' }, { status: 400 });
    }

    // Grovkorn posisjonen FØR den forlater oss. Leverandøren bruker den til å
    // vekte artsforslag regionalt, og trenger derfor ikke å vite mer enn
    // hvilken landsdel bildet er tatt i. Se src/lib/privacy/coarsen-location.ts
    // for hvorfor vi snapper til midten av ruta i stedet for å trunkere.
    const coarseLocation = coarsenLocation(body.latitude, body.longitude);

    userLog.debug('identify.calling_plantid', {
      hasCoordinates: coarseLocation != null,
      tier: capabilities.tier
    });

    const plantIdResponse = await fetch(PLANTID_API_URL, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        images: [body.image],
        similar_images: true,
        language: 'no',
        details: ['common_names', 'taxonomy', 'description', 'edibility'],
        ...(coarseLocation ?? {})
      })
    });

    if (!plantIdResponse.ok) {
      userLog.error('identify.plantid_failed', undefined, { status: plantIdResponse.status });
      return NextResponse.json({ error: 'Identifikasjon feilet. Prøv igjen.' }, { status: 502 });
    }

    // Record this successful (cost-incurring) call against the free daily cap.
    // Best-effort + free-only: a logging hiccup must not fail the identification —
    // vi har allerede betalt for kallet, og å feile nå ville tatt fra brukeren
    // det de nettopp ventet på.
    //
    // MEN den må være synlig. Supabase-klienten KASTER ikke ved DB-feil, den
    // returnerer { error }. try/catch-en her fanget derfor aldri noe, og en
    // feilende insert var helt usynlig — mens konsekvensen er at gratisbrukere
    // får ubegrenset AI-bruk på vår regning. Nå logges det som warn, slik at
    // det dukker opp før det blir dyrt.
    if (!capabilities.paid) {
      try {
        const admin = createAdminClient();
        const { error: quotaError } = await admin.from('ai_identifications').insert({ user_id: user.id });
        if (quotaError) {
          userLog.warn('identify.quota_counter_failed', { message: quotaError.message });
        }
      } catch (quotaThrow) {
        // Naar admin-klienten ikke kan konstrueres (manglende service role key).
        userLog.warn('identify.quota_counter_unavailable', {
          message: quotaThrow instanceof Error ? quotaThrow.message : 'unknown'
        });
      }
    }

    const plantIdData = await plantIdResponse.json();
    const suggestionsRaw: PlantIdSuggestion[] = plantIdData?.result?.classification?.suggestions ?? [];

    const month = new Date().getMonth() + 1;

    // Settes hvis en spørring vi beriker resultatet med feiler. Da mangler
    // sikkerhetsinformasjon (spiselighet, forvekslingsarter) i svaret, og
    // klienten må si fra i stedet for å la stillhet bety «ingen fare».
    let safetyDataIncomplete = false;

    const suggestions = await Promise.all(
      suggestionsRaw.slice(0, 3).map(async (suggestion) => {
        const mapped = {
          name: suggestion.name,
          commonNames: suggestion.details?.common_names ?? [],
          probability: Math.round((suggestion.probability ?? 0) * 100),
          edibility: mapEdibility(suggestion.details?.edibility),
          description: suggestion.details?.description?.value ?? null,
          taxonomy: suggestion.details?.taxonomy ?? null,
          similarImages: (suggestion.similar_images ?? []).slice(0, 3).map((img) => img.url)
        } as {
          name: string;
          commonNames: string[];
          probability: number;
          edibility: string;
          description: string | null;
          taxonomy: Record<string, string> | null;
          similarImages: string[];
          speciesId?: number;
          norwegianName?: string;
          imageUrl?: string | null;
          inSeason?: boolean;
          peakSeason?: boolean;
          nearbyFindings: number;
          seasonFactor: number;
          dangerousLookAlikes?: Array<{
            name: string;
            danger: string;
            speciesId?: number;
            imageUrl?: string | null;
            edibility?: string | null;
            whySimilar?: string | null;
            howToTell?: string | null;
          }>;
        };
        mapped.seasonFactor = 1;
        mapped.nearbyFindings = 0;

        const SPECIES_FIELDS =
          'id,norwegian_name,edibility,primary_image_url,season_start,season_end,peak_season_start,peak_season_end';

        // eslint-disable-next-line prefer-const
        let { data: species, error: speciesError } = await supabase
          .from('mushroom_species')
          .select(SPECIES_FIELDS)
          .ilike('latin_name', suggestion.name)
          .maybeSingle();

        // Feiler oppslaget, mister vi BÅDE spiselighet og speciesId — og uten
        // speciesId kjører forvekslingssjekken under aldri for dette forslaget.
        // «Ingen treff i katalogen» og «spørringen feilet» så tidligere helt like
        // ut. Nå merker vi det, slik at brukeren får beskjed.
        if (speciesError) {
          safetyDataIncomplete = true;
          userLog.error('identify.species_lookup_failed', speciesError, { latinName: suggestion.name });
        }

        // Leverandøren rapporterer de innarbeidede, eldre artsnavnene, og flere
        // av dem er nå synonymer for det aksepterte navnet vi lagrer (migrasjon
        // 034). Uten denne reserven ville en omdøping strippet både det norske
        // navnet og spiselighetsmerket av resultatet — og blant de berørte
        // artene er én giftig og én dødelig, så merket er den sikkerhetskritiske
        // halvdelen av svaret.
        //
        // Kun binomialer: et bart slektsnavn ville truffet for mange rader til
        // at treffet kan stoles på.
        if (!species && suggestion.name.trim().includes(' ')) {
          const { data: bySynonym, error: synonymError } = await supabase
            .from('mushroom_species')
            .select(SPECIES_FIELDS)
            .ilike('synonyms_text', `%${suggestion.name.trim()}%`)
            .limit(1);
          if (synonymError) {
            safetyDataIncomplete = true;
            userLog.error('identify.synonym_lookup_failed', synonymError, { latinName: suggestion.name });
          }
          species = bySynonym?.[0] ?? null;
        }

        if (species) {
          mapped.speciesId = species.id;
          mapped.norwegianName = species.norwegian_name;
          mapped.edibility = species.edibility;
          mapped.imageUrl = (species.primary_image_url as string | null) ?? null;
          const fit = seasonFit(
            month,
            species.season_start,
            species.season_end,
            species.peak_season_start,
            species.peak_season_end
          );
          mapped.inSeason = fit.inSeason;
          mapped.peakSeason = fit.peakSeason;
          mapped.seasonFactor = fit.factor;
        }

        return mapped;
      })
    );

    const speciesIds = suggestions
      .map((s) => s.speciesId)
      .filter((id): id is number => id != null);

    // SAFETY: surface high/critical look-alikes right in the result (not hidden on
    // the species page). Location-independent, so always run.
    if (speciesIds.length > 0) {
      type LookAlikeEntry = {
        name: string;
        danger: string;
        speciesId?: number;
        imageUrl?: string | null;
        edibility?: string | null;
        whySimilar?: string | null;
        howToTell?: string | null;
      };
      const { data: lookAlikes, error: lookAlikeError } = await supabase
        .from('look_alikes')
        .select(
          'species_id, danger_level, similarity_description, difference_description, la:mushroom_species!look_alikes_look_alike_id_fkey(id, norwegian_name, primary_image_url, edibility)'
        )
        .in('species_id', speciesIds)
        .in('danger_level', ['high', 'critical']);

      // Dette er den viktigste feilsjekken i hele kodebasen.
      //
      // Spørringen droppet tidligere `error`, og `lookAlikes ?? []` gjorde en
      // hvilken som helst databasefeil om til en tom liste. Resultatet var at
      // appen viste nøyaktig det samme som når arten FAKTISK ikke har farlige
      // forvekslingsarter — altså ingen advarsel. For en soppapp er «vi klarte
      // ikke sjekke» og «det finnes ingen fare» de to mest forskjellige
      // beskjedene som finnes, og de så helt like ut.
      //
      // Vi avbryter ikke identifikasjonen — brukeren skal fortsatt få forslagene
      // sine — men flagget følger med ut, og klienten sier fra om at sjekken
      // ikke ble kjørt.
      if (lookAlikeError) {
        safetyDataIncomplete = true;
        userLog.error('identify.look_alikes_failed', lookAlikeError, { speciesIds });
      }

      const byId = new Map<number, LookAlikeEntry[]>();
      for (const row of lookAlikes ?? []) {
        const r = row as unknown as {
          species_id: number | null;
          danger_level: string;
          similarity_description: string | null;
          difference_description: string | null;
          la:
            | { id: number; norwegian_name: string; primary_image_url: string | null; edibility: string | null }
            | { id: number; norwegian_name: string; primary_image_url: string | null; edibility: string | null }[]
            | null;
        };
        const laObj = Array.isArray(r.la) ? r.la[0] : r.la;
        if (r.species_id == null || !laObj?.norwegian_name) continue;
        const arr = byId.get(r.species_id) ?? [];
        arr.push({
          name: laObj.norwegian_name,
          danger: r.danger_level,
          speciesId: laObj.id,
          imageUrl: laObj.primary_image_url ?? null,
          edibility: laObj.edibility ?? null,
          whySimilar: r.similarity_description ?? null,
          howToTell: r.difference_description ?? null
        });
        byId.set(r.species_id, arr);
      }
      for (const s of suggestions) {
        if (s.speciesId != null && byId.has(s.speciesId)) {
          // Critical first, so UIs that show "the worst" can take index 0.
          s.dangerousLookAlikes = byId
            .get(s.speciesId)!
            .sort((a, b) => (a.danger === b.danger ? 0 : a.danger === 'critical' ? -1 : 1));
        }
      }
    }

    // Count recent nearby finds (privacy-safe display coords from public_findings),
    // then re-rank by local relevance. The re-rank can never bury a poisonous match.
    if (body.latitude != null && body.longitude != null && speciesIds.length > 0) {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const delta = 0.25; // ~20-28 km box
      const { data: nearby } = await supabase
        .from('public_findings')
        .select('species_id')
        .in('species_id', speciesIds)
        .gte('found_at', since)
        .gte('display_lat', body.latitude - delta)
        .lte('display_lat', body.latitude + delta)
        .gte('display_lng', body.longitude - delta)
        .lte('display_lng', body.longitude + delta);
      const counts = new Map<number, number>();
      for (const row of nearby ?? []) {
        const sid = (row as { species_id: number | null }).species_id;
        if (sid != null) counts.set(sid, (counts.get(sid) ?? 0) + 1);
      }
      for (const s of suggestions) {
        if (s.speciesId != null) s.nearbyFindings = counts.get(s.speciesId) ?? 0;
      }
    }

    const order = rankOrder(
      suggestions.map((s) => ({
        probability: s.probability,
        edibility: s.edibility,
        seasonFactor: s.seasonFactor,
        nearbyFindings: s.nearbyFindings
      }))
    );
    const ranked = order.map((i) => {
      const s = suggestions[i];
      return {
        name: s.name,
        norwegianName: s.norwegianName,
        commonNames: s.commonNames,
        probability: s.probability,
        edibility: s.edibility,
        description: s.description,
        taxonomy: s.taxonomy,
        similarImages: s.similarImages,
        speciesId: s.speciesId,
        // Curated catalog photo — without this the client falls back to
        // Kindwise's similar_images CDN for the look-alike safety card.
        imageUrl: s.imageUrl,
        inSeason: s.inSeason,
        peakSeason: s.peakSeason,
        nearbyFindings: s.nearbyFindings,
        dangerousLookAlikes: s.dangerousLookAlikes
      };
    });

    userLog.info('identify.success', {
      suggestionCount: ranked.length,
      topMatch: ranked[0]?.name,
      topProbability: ranked[0]?.probability,
      safetyDataIncomplete
    });

    return NextResponse.json({
      suggestions: ranked,
      isPlant: plantIdData?.result?.is_plant?.binary ?? false,
      safetyDataIncomplete
    });
  } catch (error) {
    log.error('identify.unexpected_failure', error);
    return NextResponse.json(
      {
        error: 'En feil oppstod. Prøv igjen.',
        details: error instanceof Error ? error.message : 'unknown'
      },
      { status: 500 }
    );
  }
}

function mapEdibility(plantIdEdibility?: string): string {
  const mapping: Record<string, string> = {
    edible: 'edible',
    edible_with_caution: 'conditionally_edible',
    not_edible: 'inedible',
    poisonous: 'toxic',
    highly_poisonous: 'deadly'
  };

  return mapping[plantIdEdibility ?? ''] ?? 'unknown';
}
