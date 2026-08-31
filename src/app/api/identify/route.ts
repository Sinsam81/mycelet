import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';
import { getBillingCapabilities, getUserBillingSubscription } from '@/lib/billing/subscription';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { rankOrder } from '@/lib/utils/identify-ranking';
import { coarsenLocation } from '@/lib/privacy/coarsen-location';
import { normalizeIdentifyImages } from '@/lib/utils/identify-images';
import { enrichSuggestions } from '@/lib/identifications/enrich';
import { recordIdentification } from '@/lib/identifications/record';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

const PLANTID_API_URL = 'https://mushroom.kindwise.com/api/v1/identification';

/**
 * Feilmeldingene fra denne ruta genereres server-side, så next-intl dekker dem
 * ikke — samme felle som prediksjonstekstene og rate-limit-meldingen.
 *
 * `code` er like viktig som teksten. Klienten forgrenet tidligere på den norske
 * delstrengen «ikke aktivert» for å vise AI-deaktivert-panelet; i det serveren
 * begynner å svare på svensk, slutter den matchingen å virke. Oversettelsen og
 * kodefeltet MÅ derfor komme sammen — tar man bare det ene, innfører man en feil.
 */
const ERRORS = {
  ai_disabled: {
    nb: 'AI-identifikasjon er ikke aktivert ennå.',
    sv: 'AI-identifiering är inte aktiverad ännu.'
  },
  unauthenticated: {
    nb: 'Ikke autentisert',
    sv: 'Inte autentiserad'
  },
  rate_limit_check_failed: {
    nb: 'Kunne ikke validere rate limit',
    sv: 'Kunde inte validera hastighetsgränsen'
  },
  missing_image: {
    nb: 'Bilde mangler',
    sv: 'Bild saknas'
  },
  image_too_large: {
    nb: 'Bildet er for stort',
    sv: 'Bilden är för stor'
  },
  too_many_images: {
    nb: 'Maks tre bilder per identifisering',
    sv: 'Max tre bilder per identifiering'
  },
  provider_failed: {
    nb: 'Identifikasjon feilet. Prøv igjen.',
    sv: 'Identifieringen misslyckades. Försök igen.'
  },
  unexpected: {
    nb: 'En feil oppstod. Prøv igjen.',
    sv: 'Ett fel uppstod. Försök igen.'
  }
} as const satisfies Record<string, Record<Locale, string>>;

type ErrorCode = keyof typeof ERRORS;

/** Kvoten har sin egen, fordi den tar et tall — og den er oppgraderingsteksten. */
function dailyQuotaMessage(locale: Locale): string {
  return locale === 'sv'
    ? `Gratisanvändare har max ${FREE_DAILY_AI_LIMIT} identifieringar per dygn. Uppgradera till Premium eller Säsongspass för obegränsad användning.`
    : `Gratisbrukere har maks ${FREE_DAILY_AI_LIMIT} identifikasjoner per døgn. Oppgrader til Premium eller Sesongpass for ubegrenset bruk.`;
}

function errorResponse(code: ErrorCode, status: number, locale: Locale) {
  return NextResponse.json({ error: ERRORS[code][locale] ?? ERRORS[code][DEFAULT_LOCALE], code }, { status });
}


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
  /** Gammel enkeltbilde-form — godtas fortsatt (tester + åpne faner under deploy). */
  image?: string;
  /** Flerbilde: inntil tre bilder av SAMME sopp (hatt, underside, stilk). */
  images?: string[];
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

  // Hentes FØR try-blokken, av to grunner: feilsvarene inni er også tekst
  // leseren ser og ligger før alt annet i flyten, og catch-blokken nederst
  // trenger den også. Oppslaget leser cookies og kan kaste utenfor en
  // request-kontekst — en manglende språkverdi skal ikke ta ned ruta.
  let locale: Locale = DEFAULT_LOCALE;
  try {
    locale = await getUserLocale();
  } catch {
    // beholder norsk
  }

  try {
    if (!isAiEnabled()) {
      log.warn('identify.ai_disabled');
      return errorResponse('ai_disabled', 503, locale);
    }
    const apiKey = process.env.PLANTID_API_KEY!;

    const supabase = createClient();
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser();

    if (authError || !user) {
      log.info('identify.unauthenticated');
      return errorResponse('unauthenticated', 401, locale);
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

    // Gjenstående gratiskvote ETTER dette kallet — null for betalende.
    // Klienten bruker tallet til «N igjen i dag»-hintet, slik at taket er
    // kjent FØR veggen treffes, ikke en overraskelse på forsøk seks.
    let freeQuotaRemaining: number | null = null;

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
            return errorResponse('rate_limit_check_failed', 500, locale);
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
        // MERK: ingen .is('deleted_at', null) her, og det er med vilje.
        // Alle andre lesesteder filtrerer bort slettede funn (migrasjon 056),
        // men kvoten teller KALL, ikke funn. Filtrerte vi her, ville
        // «identifiser → lagre → slett» gitt en ny gratis AI-runde hver gang.
        const { count: legacy, error: legacyError } = await supabase
          .from('findings')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('ai_used', true)
          .gte('created_at', oneDayAgo);
        if (legacyError) {
          return errorResponse('rate_limit_check_failed', 500, locale);
        }
        usageCount = legacy ?? 0;
      }

      if (usageCount >= FREE_DAILY_AI_LIMIT) {
        userLog.info('identify.daily_quota_reached', { used: usageCount, limit: FREE_DAILY_AI_LIMIT });
        return NextResponse.json(
          { error: dailyQuotaMessage(locale), code: 'daily_quota' },
          { status: 429 }
        );
      }
      freeQuotaRemaining = Math.max(0, FREE_DAILY_AI_LIMIT - usageCount - 1);
    }

    const body = (await request.json()) as IdentifyRequest;
    // Grensene (antall, per bilde, totalt) og bakoverkompatibiliteten med den
    // gamle `image`-formen bor i normalizeIdentifyImages — avvis absurde
    // payloads FØR vi betaler for et Kindwise-kall.
    const normalized = normalizeIdentifyImages(body);
    if (!normalized.ok) {
      userLog.warn(`identify.${normalized.error}`);
      return errorResponse(normalized.error, 400, locale);
    }
    const images = normalized.images;

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
        // Inntil tre bilder av samme sopp = ÉN identifisering og én kreditt
        // hos Kindwise (deres SDK: «one identification composed of N images»).
        images,
        similar_images: true,
        language: 'no',
        details: ['common_names', 'taxonomy', 'description', 'edibility'],
        ...(coarseLocation ?? {})
      })
    });

    if (!plantIdResponse.ok) {
      userLog.error('identify.plantid_failed', undefined, { status: plantIdResponse.status });
      return errorResponse('provider_failed', 502, locale);
    }

    // Record this successful (cost-incurring) call against the free daily cap.
    // Best-effort: a logging hiccup must not fail the identification —
    // vi har allerede betalt for kallet, og å feile nå ville tatt fra brukeren
    // det de nettopp ventet på.
    //
    // MEN den må være synlig. Supabase-klienten KASTER ikke ved DB-feil, den
    // returnerer { error }. try/catch-en her fanget derfor aldri noe, og en
    // feilende insert var helt usynlig — mens konsekvensen er at gratisbrukere
    // får ubegrenset AI-bruk på vår regning. Nå logges det som warn, slik at
    // det dukker opp før det blir dyrt.
    //
    // Raden skrives for ALLE brukere, ikke bare gratisbrukere. Kvoten gjelder
    // fortsatt bare gratis (spørringen over kjører kun der), men hvert kall
    // koster oss det samme hos Kindwise uansett hvem som gjorde det. Skrev vi
    // bare gratisbrukernes kall, kunne ingen svare på hva de betalte kontoene
    // faktisk koster — og en betalt konto har ingen døgngrense i dag.
    //
    // Bivirkning, med vilje: mister noen den betalte planen midt på dagen,
    // teller kallene de allerede har gjort de siste 24 timene mot gratiskvoten.
    // Det er riktig lest — kvoten er «5 per døgn», ikke «5 etter nedgradering».
    try {
      const admin = createAdminClient();
      const { error: quotaError } = await admin.from('ai_identifications').insert({ user_id: user.id });
      if (quotaError) {
        userLog.warn('identify.quota_counter_failed', { message: quotaError.message, tier: capabilities.tier });
      }
    } catch (quotaThrow) {
      // Naar admin-klienten ikke kan konstrueres (manglende service role key).
      userLog.warn('identify.quota_counter_unavailable', {
        message: quotaThrow instanceof Error ? quotaThrow.message : 'unknown'
      });
    }

    const plantIdData = await plantIdResponse.json();
    const suggestionsRaw: PlantIdSuggestion[] = plantIdData?.result?.classification?.suggestions ?? [];

    const month = new Date().getMonth() + 1;

    // Berikelsen — katalogoppslag, spiselighet og farlige forvekslingsarter —
    // bor i src/lib/identifications/enrich.ts. Grunnen er at
    // identifiseringshistorikken viser det SAMME resultatet på nytt og må kjøre
    // nøyaktig samme sikkerhetslogikk; to kopier ville kunnet gi to ulike svar
    // på «har denne soppen en dødelig tvilling». Se filhodet der.
    const { suggestions, safetyDataIncomplete } = await enrichSuggestions(
      supabase,
      suggestionsRaw.slice(0, 3).map((suggestion) => ({
        name: suggestion.name,
        commonNames: suggestion.details?.common_names ?? [],
        probability: Math.round((suggestion.probability ?? 0) * 100),
        edibility: mapEdibility(suggestion.details?.edibility),
        description: suggestion.details?.description?.value ?? null,
        taxonomy: suggestion.details?.taxonomy ?? null,
        similarImages: (suggestion.similar_images ?? []).slice(0, 3).map((img) => img.url)
      })),
      { locale, month, log: userLog }
    );

    const speciesIds = suggestions
      .map((s) => s.speciesId)
      .filter((id): id is number => id != null);

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
        dangerousLookAlikes: s.dangerousLookAlikes,
        lookAlikeData: s.lookAlikeData
      };
    });

    // Historikkraden. Skrives med ØKTKLIENTEN, ikke tjenesterollen: RLS på
    // identifications er eier-låst, og da er det riktig at raden skrives som
    // brukeren selv. (Kvotetelleren over må gå via tjenesterollen, fordi den
    // tabellen med vilje ikke har en eneste policy.)
    //
    // Best effort — se recordIdentification. Feiler den, mister brukeren
    // historikken for dette ene kallet, men får resultatet sitt.
    const history = await recordIdentification(supabase, {
      userId: user.id,
      suggestions: ranked,
      // Det EKSAKTE punktet lagres hos oss. `coarseLocation` over er kun det
      // som ble sendt ut av huset til Kindwise.
      latitude: body.latitude,
      longitude: body.longitude,
      imageCount: images.length,
      safetyDataIncomplete
    });
    if (history.error) {
      userLog.warn('identify.history_record_failed', { message: history.error });
    }

    userLog.info('identify.success', {
      suggestionCount: ranked.length,
      topMatch: ranked[0]?.name,
      topProbability: ranked[0]?.probability,
      safetyDataIncomplete,
      historyRecorded: history.identificationId !== null
    });

    return NextResponse.json({
      suggestions: ranked,
      isPlant: plantIdData?.result?.is_plant?.binary ?? false,
      safetyDataIncomplete,
      // null = betalende (ingen kvote). Tall = gjenstående gratis i dag.
      freeQuotaRemaining,
      // null betyr «ingen rad ble skrevet» — klienten skal da ikke laste opp
      // et historikkbilde som ingenting peker på.
      identificationId: history.identificationId,
      imagePath: history.imagePath
    });
  } catch (error) {
    log.error('identify.unexpected_failure', error);
    return NextResponse.json(
      {
        error: ERRORS.unexpected[locale] ?? ERRORS.unexpected[DEFAULT_LOCALE],
        code: 'unexpected',
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
