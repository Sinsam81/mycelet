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
import { erAiNokkelSatt } from '@/lib/identifications/kindwise-status';
import { KINDWISE_TIMEOUT_MS } from '@/lib/identifications/config';
import { tellRader } from '@/lib/supabase/tabell-finnes';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';
import { osloIDag } from '@/lib/api/oslo-dag';

const PLANTID_API_URL = 'https://mushroom.kindwise.com/api/v1/identification';

/**
 * Uten denne arvet ruta plattformens standardgrense, og en Kindwise som hang
 * holdt forespørselen til Vercel drepte funksjonen — brukeren fikk en HTML-504
 * i stedet for rutens oversatte feilmelding. Tallet er valgt, ikke tilfeldig:
 * én Kindwise-frist (under) + berikelse og historikk etterpå, med god margin.
 */
export const maxDuration = 60;

/**
 * `details` og `language` er URL-PARAMETRE hos Kindwise, ikke felt i kroppen.
 * Kroppen tar bare bildene, posisjonen og «modifiers» (similar_images).
 *
 * Ruta sendte begge i kroppen fra første dag, og Kindwise svarte 400
 * «Unknown modifier: language=`no`. Available modifiers: [similar_images=true]»
 * på hvert eneste kall — som ruta gjorde om til 502 «Identifikasjon feilet»
 * uten å logge kroppen. Oppdaget 29. sep 2026 med 2 050 urørte kreditter:
 * ingen bruker hadde noen gang fått et AI-svar. Testene så det ikke, fordi de
 * mocker fetch og bare leste kroppen. kindwise-request-shape.test.ts vokter
 * nå selve formen på forespørselen.
 */
const PLANTID_DETAILS = ['common_names', 'taxonomy', 'description', 'edibility'] as const;
const PLANTID_LANGUAGE = 'no';

function plantIdUrl(language: string | null): string {
  const url = new URL(PLANTID_API_URL);
  url.searchParams.set('details', PLANTID_DETAILS.join(','));
  if (language) url.searchParams.set('language', language);
  return url.toString();
}

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
    nb: 'Du må være logget inn.',
    sv: 'Du måste vara inloggad.'
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
  // Kindwise svarte ikke (tidsavbrudd, DNS, brutt forbindelse). Egen kode, så
  // den kan skilles fra «Kindwise svarte nei» i Sentry og i loggen.
  provider_timeout: {
    nb: 'AI-tjenesten svarer ikke akkurat nå. Prøv igjen om litt.',
    sv: 'AI-tjänsten svarar inte just nu. Försök igen om en stund.'
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
  return erAiNokkelSatt(process.env.PLANTID_API_KEY);
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

  // Reservasjonen i ai_identifications (se «Reservasjon FØR det betalte
  // kallet» lenger ned). Står utenfor try-blokken fordi catch-blokken nederst
  // også må kunne gi den tilbake.
  let reservertId: number | string | null = null;
  let kredittBrukt = false;
  let frigiReservasjon: (grunn: string) => Promise<void> = async () => {};

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

    // Døgngrensa gjelder GRATISKONTOER: FREE_DAILY_AI_LIMIT er en
    // produktgrense, og svaret er oppgraderingsteksten (kode daily_quota).
    //
    // Betalte kontoer og prøveperioder har INGEN døgngrense, og det er ikke en
    // forglemmelse: planen selges som «ubegrenset AI-identifikasjon» på
    // prissiden, på forsiden og i selve kvoteveggen. Et misbrukstak for dem er
    // foreslått (ett skript i en gratis prøveuke kan tømme den felles
    // Kindwise-potten), men tallet og teksten er eierens beslutning, og et tak
    // kan ikke innføres her uten at «ubegrenset» får et forbehold i prisside
    // og vilkår i samme endring. Til da er burst-vernet over det eneste som
    // bremser dem — og raden i ai_identifications, som skrives for alle, er
    // det som viser om noen konto faktisk bruker urimelig mye.
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const kvoteNadd = (brukt: number) => {
      userLog.info('identify.daily_quota_reached', { used: brukt, limit: FREE_DAILY_AI_LIMIT });
      return NextResponse.json({ error: dailyQuotaMessage(locale), code: 'daily_quota' }, { status: 429 });
    };

    // Tjenesterolle-klienten, satt bare når telleren i ai_identifications
    // faktisk svarte for en gratiskonto — forutsetningen for reservasjonen
    // lenger ned.
    let kvoteKlient: ReturnType<typeof createAdminClient> | null = null;

    if (!capabilities.paid) {
      // Count actual identify CALLS in the last 24h (migration 020), not saved
      // finds — counting saves let a user identify-without-saving past the cap.
      let usageCount: number | null = null;
      try {
        const admin = createAdminClient();
        // tellRader, ikke `count ?? 0`. Tellingen er et HEAD-kall, og mot en
        // tabell som ikke finnes gir det verken feil eller tall
        // (tabell-finnes.ts). Den gamle sjekken så etter feilkoden 42P01 og
        // kunne derfor aldri slå ut: uten migrasjon 020 ble forbruket lest
        // som 0, reserven under ble aldri brukt, og gratiskvoten var borte
        // uten at noe sa fra.
        const telling = await tellRader(
          admin
            .from('ai_identifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('created_at', oneDayAgo)
        );
        if (telling.feil !== undefined) {
          // Anything other than "table missing" is a real failure.
          userLog.warn('identify.quota_count_failed', { message: telling.feil });
          return errorResponse('rate_limit_check_failed', 500, locale);
        }
        if (telling.antall !== undefined) {
          usageCount = telling.antall;
          kvoteKlient = admin;
        } else {
          // Tabellen mangler: usageCount står som null, og reserven tar over.
          userLog.warn('identify.quota_table_missing', { tabell: 'ai_identifications', migrasjon: '020' });
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
        const legacy = await tellRader(
          supabase
            .from('findings')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('ai_used', true)
            .gte('created_at', oneDayAgo)
        );
        // Samme regel for reserven: «ikke noe tall» er ikke «null brukt». Uten
        // en telling kan ikke taket håndheves, og da skal kallet stoppe her —
        // kvoten skal aldri stille bli 0.
        if (legacy.antall === undefined) {
          userLog.warn('identify.quota_count_failed', {
            message: legacy.feil ?? 'ingen telling',
            reserve: true
          });
          return errorResponse('rate_limit_check_failed', 500, locale);
        }
        usageCount = legacy.antall;
      }

      // Billig forhåndssjekk: den som alt står på taket, avvises uten en
      // eneste skriving. Selve grensa håndheves av reservasjonen lenger ned.
      if (usageCount >= FREE_DAILY_AI_LIMIT) {
        return kvoteNadd(usageCount);
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

    // ── Reservasjon FØR det betalte kallet ──────────────────────────────────
    //
    // Før ble forbruket talt, så ventet ruta sekunder på Kindwise, og først
    // ETTERPÅ ble raden skrevet. Alle forespørsler som kom mens de forrige
    // ennå sto hos Kindwise, så derfor samme tall: en gratiskonto på 4 av 5
    // kunne fyre av så mange parallelle kall som burst-vernet slapp gjennom.
    //
    // Nå skrives raden først, og plassen avgjøres av rekkefølgen: vi teller
    // radene i døgnvinduet med id ≤ vår egen. Er vi over taket, slettes raden
    // og kallet avvises. Etter payload-valideringen med vilje — en 400 skal
    // aldri reservere noe.
    //
    // To kjente rester, begge på den trygge siden:
    //   • id-ene tildeles før commit, så to innsettinger i samme
    //     sub-millisekund kan i teorien ikke se hverandre. Vinduet er krympet
    //     fra sekunder til det; helt atomisk krever en DB-funksjon med lås
    //     (og dermed en migrasjon).
    //   • Drepes funksjonen mellom reservasjon og frigivelse, blir raden
    //     stående: brukeren er belastet for et kall de ikke fikk, og
    //     dagsrapporten teller det som vellykket. Derfor logges en mislykket
    //     frigivelse som warn (identify.reservation_release_failed).
    //
    // Svikter selve reservasjonen, fortsetter kallet på forhåndssjekken over
    // (dagens oppførsel) — aldri ubegrenset, og aldri en 500 for brukeren.
    //
    // Bare gratiskontoer reserverer: betalte kontoer har ingen grense å
    // reservere mot (se over), og får raden sin når Kindwise har svart OK.
    if (kvoteKlient) {
      const adminKlient = kvoteKlient;
      frigiReservasjon = async (grunn: string) => {
        if (reservertId == null) return;
        const id = reservertId;
        reservertId = null;
        try {
          const { error: frigiError } = await adminKlient.from('ai_identifications').delete().eq('id', id);
          if (frigiError) userLog.warn('identify.reservation_release_failed', { grunn, message: frigiError.message });
        } catch (frigiThrow) {
          userLog.warn('identify.reservation_release_failed', {
            grunn,
            message: frigiThrow instanceof Error ? frigiThrow.message : 'unknown'
          });
        }
      };
      try {
        const { data: reservert, error: reserverError } = await adminKlient
          .from('ai_identifications')
          .insert({ user_id: user.id })
          .select('id')
          .single();
        if (reserverError || reservert?.id == null) {
          userLog.warn('identify.reservation_failed', { message: reserverError?.message });
        } else {
          reservertId = reservert.id as number | string;
          const plass = await tellRader(
            adminKlient
              .from('ai_identifications')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id)
              .gte('created_at', oneDayAgo)
              .lte('id', reservertId)
          );
          if (plass.antall === undefined) {
            // Raden er skrevet og forhåndssjekken besto — fortsett. Det
            // gjelder også et svar uten tall: `count ?? 0` leste det som
            // plass null, altså «hele kvoten igjen».
            userLog.warn('identify.reservation_recount_failed', { message: plass.feil ?? 'ingen telling' });
          } else if (plass.antall > FREE_DAILY_AI_LIMIT) {
            await frigiReservasjon('over_tak');
            return kvoteNadd(plass.antall);
          } else {
            freeQuotaRemaining = Math.max(0, FREE_DAILY_AI_LIMIT - plass.antall);
          }
        }
      } catch (reserverThrow) {
        userLog.warn('identify.reservation_failed', {
          message: reserverThrow instanceof Error ? reserverThrow.message : 'unknown'
        });
      }
    }

    userLog.debug('identify.calling_plantid', {
      hasCoordinates: coarseLocation != null,
      tier: capabilities.tier
    });

    const plantIdBody = JSON.stringify({
      // Inntil tre bilder av samme sopp = ÉN identifisering og én kreditt
      // hos Kindwise (deres SDK: «one identification composed of N images»).
      images,
      similar_images: true,
      ...(coarseLocation ?? {})
    });
    const plantIdInit = {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: plantIdBody
    };

    // Hvert kall får sin EGEN frist. Lå signalet i plantIdInit, ville
    // språk-omforsøket under arvet en frist som alt var brukt opp.
    const kallKindwise = (url: string) =>
      fetch(url, { ...plantIdInit, signal: AbortSignal.timeout(KINDWISE_TIMEOUT_MS) });

    // Én rad per mislykket Kindwise-kall (migrasjon 073), uten bruker-ID. Det
    // er dette dagsrapporten leser for å skille «ingen bruker AI-en» fra «alle
    // kall feiler». `status` er HTTP-statusen Kindwise svarte med — eller 0
    // når det ALDRI kom et svar (tidsavbrudd, DNS, brutt forbindelse). Den
    // siste gruppa ble før ikke talt i det hele tatt: et kastet fetch gikk rett
    // til catch-blokken nederst, så en Kindwise som hang var like usynlig i
    // rapporten som de fire månedene med 400-svar var. Best effort: mangler
    // tabellen eller tjenesterollen, logges det, og brukeren får feilsvaret.
    const tellFeil = async (status: number) => {
      try {
        const { error: feilError } = await createAdminClient().from('ai_identifiseringsfeil').insert({ status });
        if (feilError) userLog.warn('identify.failure_counter_failed', { message: feilError.message });
      } catch (feilThrow) {
        userLog.warn('identify.failure_counter_unavailable', {
          message: feilThrow instanceof Error ? feilThrow.message : 'unknown'
        });
      }
    };

    // Kindwise svarte ikke. Fanges HER og ikke i catch-blokken nederst, fordi
    // den verken teller feilen eller kan si noe mer enn «en feil oppstod».
    // Ingen kvoterad skrives: vi vet ikke om Kindwise rakk å trekke en
    // kreditt, og brukeren fikk uansett ikke noe svar. Ikke noe automatisk
    // omforsøk heller — det kunne kostet en kreditt til for samme bilde.
    const kindwiseSvarteIkke = async (err: unknown) => {
      userLog.error('identify.plantid_unreachable', err, {
        timeout: err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      });
      // Reservasjonen gis tilbake når kallet aldri ble besvart. Stoppet
      // svaret midt i kroppen ETTER et OK, er kreditten brukt — da står den.
      if (!kredittBrukt) await frigiReservasjon('kindwise_svarte_ikke');
      await tellFeil(0);
      return errorResponse('provider_timeout', 504, locale);
    };

    let plantIdResponse: Response;
    try {
      plantIdResponse = await kallKindwise(plantIdUrl(PLANTID_LANGUAGE));

      // Språkkoden er det ene parameteret vi ikke har fått bekreftet mot
      // Kindwise sin liste. Avviser de den, koster et nytt kall uten språk
      // ingenting (400 trekker ikke kreditter), og engelske navn er langt bedre
      // enn en død funksjon — artsnavnene brukeren ser kommer uansett fra vår
      // egen katalog (enrichSuggestions). Logges som warn, så vi ser det.
      if (plantIdResponse.status === 400) {
        const feiltekst = await plantIdResponse.clone().text().catch(() => '');
        if (/language/i.test(feiltekst)) {
          userLog.warn('identify.plantid_language_rejected', { language: PLANTID_LANGUAGE, body: feiltekst.slice(0, 300) });
          plantIdResponse = await kallKindwise(plantIdUrl(null));
        }
      }
    } catch (err) {
      return await kindwiseSvarteIkke(err);
    }

    if (!plantIdResponse.ok) {
      // Kroppen MÅ med. Kindwise forklarer avvisningen der («Invalid API key»,
      // «Unsupported language», «Image too large» …), og med bare statuskoden
      // sto vi 29. sep 2026 med en 502 til brukeren og ingen anelse om hvorfor.
      // Avkortet: den inneholder aldri nøkkelen vår, men kan være lang.
      const feilkropp = await plantIdResponse.text().catch(() => '');
      userLog.error('identify.plantid_failed', undefined, {
        status: plantIdResponse.status,
        contentType: plantIdResponse.headers.get('content-type') ?? undefined,
        body: feilkropp.slice(0, 500)
      });
      await tellFeil(plantIdResponse.status);
      // Et avvist kall koster ingen kreditt hos Kindwise — da skal det heller
      // ikke koste brukeren en kvoteenhet.
      await frigiReservasjon('kindwise_avviste');
      return errorResponse('provider_failed', 502, locale);
    }
    // Fra her er kreditten brukt hos Kindwise. Reservasjonen blir stående
    // uansett hva som skjer videre (berikelse, historikk, en uventet feil).
    kredittBrukt = true;

    // Kvoteraden for dette kallet. For en gratiskonto er den normalt ALT
    // skrevet — som reservasjonen over — og da skal det ikke skrives en til.
    // Denne grenen er den vanlige veien for betalte kontoer, som ikke
    // reserverer, og reserven for gratiskontoer: telleren var utilgjengelig
    // da kallet startet (ingen tjenesterolle, tabellen manglet), eller
    // reservasjonen feilet.
    //
    // Best-effort: en logging-hikke må ikke felle identifiseringen — vi har
    // allerede betalt for kallet, og å feile nå ville tatt fra brukeren det de
    // nettopp ventet på. MEN den må være synlig. Supabase-klienten KASTER ikke
    // ved DB-feil, den returnerer { error }; en feilende insert var en gang
    // helt usynlig, mens konsekvensen er AI-bruk uten tak på vår regning.
    //
    // Raden skrives for ALLE brukere, ikke bare gratisbrukere: hvert kall
    // koster oss det samme hos Kindwise uansett hvem som gjorde det, og
    // tabellen er både kvoten og kostnadsregnskapet. Skrev vi bare
    // gratisbrukernes kall, kunne ingen svare på hva de betalte kontoene
    // faktisk koster — og en betalt konto har ingen døgngrense i dag.
    //
    // Bivirkning, med vilje: mister noen den betalte planen midt på dagen,
    // teller kallene de allerede har gjort de siste 24 timene mot gratiskvoten.
    // Det er riktig lest — kvoten er «5 per døgn», ikke «5 etter nedgradering».
    if (reservertId == null) {
      try {
        const { error: quotaError } = await createAdminClient().from('ai_identifications').insert({ user_id: user.id });
        if (quotaError) {
          userLog.warn('identify.quota_counter_failed', { message: quotaError.message, tier: capabilities.tier });
        }
      } catch (quotaThrow) {
        // Naar admin-klienten ikke kan konstrueres (manglende service role key).
        userLog.warn('identify.quota_counter_unavailable', {
          message: quotaThrow instanceof Error ? quotaThrow.message : 'unknown'
        });
      }
    }

    // Fristen i kallKindwise gjelder også lesingen av kroppen: stopper svaret
    // midt i, kaster .json() her — samme tilstand for brukeren som at Kindwise
    // aldri svarte, så den får samme feilsvar og samme rad i feiltelleren.
    let plantIdData;
    try {
      plantIdData = await plantIdResponse.json();
    } catch (err) {
      return await kindwiseSvarteIkke(err);
    }
    const suggestionsRaw: PlantIdSuggestion[] = plantIdData?.result?.classification?.suggestions ?? [];

    // Oslo-måneden: serveren går i UTC, og «i sesong» skal gjelde måneden
    // brukeren står i — også rett etter midnatt ved et månedsskifte.
    const month = osloIDag(new Date()).maaned;

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

    // Tre tilstander, aldri to: true, false eller null («Kindwise sa ikke noe
    // om det»). isPlant under faller tilbake på false når feltet mangler —
    // bygde vi «dette er kanskje ikke en sopp»-beskjeden på DET, ville den
    // stått på hvert eneste resultat den dagen Kindwise endret svarformen.
    const kindwiseErSopp: unknown = plantIdData?.result?.is_mushroom?.binary;
    const isMushroom: boolean | null = typeof kindwiseErSopp === 'boolean' ? kindwiseErSopp : null;

    userLog.info('identify.success', {
      // Med i loggen så den faktiske andelen «ikke sopp» kan måles før noen
      // gjør beskjeden strengere. Terskelen er Kindwise sin, ikke vår.
      isMushroom,
      suggestionCount: ranked.length,
      topMatch: ranked[0]?.name,
      topProbability: ranked[0]?.probability,
      safetyDataIncomplete,
      historyRecorded: history.identificationId !== null
    });

    return NextResponse.json({
      suggestions: ranked,
      // Mushroom.id heter feltet is_mushroom; is_plant er plant.id sitt og
      // sto her fra før. Begge leses, så eldre mocks og et eventuelt bytte
      // av leverandør ikke gir «alltid false».
      isPlant: plantIdData?.result?.is_mushroom?.binary ?? plantIdData?.result?.is_plant?.binary ?? false,
      // Se over: null betyr «ukjent», og bare et eksplisitt false viser
      // usikkerhetsbeskjeden på resultatsiden.
      isMushroom,
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
    // En uventet feil FØR Kindwise svarte OK har ikke kostet noe — gi
    // reservasjonen tilbake. Etter et OK er kreditten brukt, og raden står.
    if (!kredittBrukt) await frigiReservasjon('uventet_feil');
    return NextResponse.json(
      // Ingen `details` med den rå feilteksten: den er intern, ingen klient
      // leser den, og log.error over har den allerede.
      { error: ERRORS.unexpected[locale] ?? ERRORS.unexpected[DEFAULT_LOCALE], code: 'unexpected' },
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
