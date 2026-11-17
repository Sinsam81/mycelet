import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { VARSEL_KARANTENE_DAGER, VARSEL_MIN_SCORE } from '@/lib/alerts/decision';

/**
 * Soppvarsel-cronen kjørt helt gjennom — uten Supabase, Resend og vær-API.
 *
 * Reglene for NÅR et varsel går er testet som rene funksjoner
 * (decision.test.ts, historikk.test.ts), lenkene i lenkeside.test.ts. Men ingen
 * test kjørte selve ruta, der reglene møter ekte abonnementsrader — og den er
 * koblet om: historikken kommer fra lesRegionHistorikk, dagens tall flettes inn
 * fra minnet, og avmeldingslenka er delt i to. Denne fila låser koblingen:
 *
 *   · DOBBEL OPT-IN. En e-postpåmelding uten bekreftelse får aldri varselet.
 *     Filteret finnes bare her: cronen leser med admin-klienten (RLS gjelder
 *     ikke), påmeldingsruta lagrer nye rader som active + confirmed_at null, og
 *     bekreft-ruta bekrefter ikke lenger på en skanners GET — så flere rader
 *     blir stående ubekreftet.
 *   · HISTORIKKEN slås opp på samme nøkkel som dagens score og abonnementets
 *     region, og et hull på én dag brobygges gjennom ruta. Bommer oppslaget,
 *     svarer hver abonnent «ingen-gaardag», og kjøringen ser frisk ut med sendt: 0.
 *   · KREV FØR SENDING. En feilet sending gir kravet tilbake — ellers kan ikke
 *     regel 3 i decision.ts levere omslaget dagen etter. Et tapt krav sender
 *     ingenting, og rører ikke stempelet til kjøringen som vant.
 *   · AVMELDINGSLENKA i brødteksten bærer &s= og &sprak=; List-Unsubscribe-
 *     hodet får den rene adressen.
 *   · En feilet lagring av dagens tall slår alarm, men stopper ikke varselet.
 *
 * (At dagens tall flettes inn fra minnet etter en feilet lagring, endrer ikke
 * utfallet på en omslagsdag: «i går» og ukas bunn ligger da under terskelen
 * uansett. Det får bare betydning når tabellen alt har en ANNEN rad for i dag
 * fra en tidligere kjøring samme dag — den situasjonen bygges ikke her.)
 *
 * Databasen er en liten falsk PostgREST som oppfører seg som den ekte der det
 * betyr noe: en spørring får bare kolonnene den ba om, som kopier; en
 * oppdatering skrives inn i raden bare når filtrene treffer; og kravets
 * or()-filter — karantenen, uttrykt i databasen — evalueres mot raden. Ukjente
 * kall smeller i stedet for å svare tomt, og det samme gjør et filter grenen
 * ikke regner ut (bareFiltre): ellers ble et nytt .or() på abonnementene eller
 * en ekstra .eq() på historikken stille oversett, og testen fikk rader den ekte
 * databasen aldri ville gitt. Unntaket er pynten der ruta selv svelger alle
 * feil (artene i sesong, fasiten for forrige varsel): den svarer tomt uten å
 * se på filtrene.
 */

type Flis = { tile_date: string; score: number; center_lat: number; center_lng: number; metadata: { region: string } };
type Score = { region: string; tile_date: string; score: number };
type AbonnementRad = {
  id: string;
  /** null for konto-løse e-postpåmeldinger (migrasjon 057). */
  user_id: string | null;
  email: string | null;
  confirmed_at: string | null;
  region: string;
  locale: string;
  last_notified_at: string | null;
  last_notified_score: number | null;
  unsubscribe_token: string;
  active: boolean;
};
type Filter = { type: 'eq' | 'gte' | 'lte' | 'or'; kolonne: string; verdi: unknown };
type DbSvar = { data: unknown; error: { message: string } | null };
type Sporring = {
  nyttelast: unknown;
  kolonner: string | null;
  filtre: Filter[];
  /** Kolonnene en oppdatering ba om tilbake (.select etter .update). */
  retur: string | null;
  omrade: [number, number] | null;
};
type SendtEpost = {
  til: string;
  emne: string;
  html: string;
  tekst: string;
  avmeldingsUrl?: string;
  idempotensNokkel?: string;
  /** Sekundet e-posten gikk ut, på den falske klokka — det &s= skal bære. */
  sekund: number;
};

const db = {
  tileDato: null as string | null,
  fliser: [] as Flis[],
  scorer: [] as Score[],
  lagreFeil: null as { message: string } | null,
  abonnementer: [] as AbonnementRad[],
  /** user_id → adressen i auth.users. */
  brukere: {} as Record<string, string>,
  /** Kjøres idet ruta prøver å ta kravet på en rad — lar en annen kjøring komme først. */
  vedKrav: (() => undefined) as (id: string) => void,
  /** Hver tabell ruta åpner med from(), i rekkefølge. */
  tabeller: [] as string[],
  /** Det som skjer med abonnementene, i rekkefølge: «krav:a», «send:a», «tilbake:a». */
  hendelser: [] as string[],
  /** Oppdateringer som traff en rad. */
  oppdateringer: [] as Array<{ id: string; verdier: Record<string, unknown>; or: string | null }>,
  varselhendelser: [] as unknown[]
};

const epost = {
  svar: { ok: true, detalj: 'sendt' } as { ok: boolean; detalj: string },
  sendte: [] as SendtEpost[]
};

function filterVerdi(filtre: Filter[], type: Filter['type'], kolonne: string): unknown {
  const funnet = filtre.find((f) => f.type === type && f.kolonne === kolonne);
  if (!funnet) throw new Error(`den falske databasen ventet ${type}(${kolonne})`);
  return funnet.verdi;
}

/**
 * Hver gren sier hvilke filtre den regner ut («eq:id», «or:»), og alle andre
 * smeller. Uten dette ga et .or() som stengte kontoradene ute, eller en .eq()
 * som tømte historikken, de samme radene her som før — testene forble grønne
 * mens varslene stilnet. Samme filter to ganger smeller også: grenen leser
 * bare det første.
 */
function bareFiltre(tabell: string, s: Sporring, ...tillatt: string[]): void {
  const sett = new Set<string>();
  for (const f of s.filtre) {
    const nokkel = `${f.type}:${f.kolonne}`;
    const vis = `${f.type}(${[f.kolonne, String(f.verdi)].filter(Boolean).join(', ')})`;
    if (!tillatt.includes(nokkel)) throw new Error(`den falske databasen regner ikke ut ${vis} mot ${tabell}`);
    if (sett.has(nokkel)) throw new Error(`den falske databasen leser bare det første ${nokkel} mot ${tabell}, ikke ${vis}`);
    sett.add(nokkel);
  }
}

function side<T>(rader: T[], omrade: [number, number] | null): T[] {
  return omrade ? rader.slice(omrade[0], omrade[1] + 1) : rader;
}

/** Bare kolonnene spørringen ba om, som kopier — ruta skal holde sitt eget bilde av raden. */
function velgKolonner(rader: Array<Record<string, unknown>>, kolonner: string | null): Array<Record<string, unknown>> {
  if (!kolonner) throw new Error('select uten kolonner');
  const navn = kolonner.split(',').map((k) => k.trim());
  return rader.map((rad) =>
    Object.fromEntries(
      navn.map((k) => {
        if (!(k in rad)) throw new Error(`kolonnen ${k} finnes ikke`);
        return [k, rad[k]];
      })
    )
  );
}

/** Kravets or()-filter. Kjenner bare de to leddene karantenen består av, og smeller på alt annet. */
function oppfyllerOr(rad: AbonnementRad, uttrykk: string): boolean {
  return uttrykk.split(',').some((ledd) => {
    const treff = /^last_notified_at\.(is\.null|lt\.(.+))$/.exec(ledd);
    if (!treff) throw new Error(`den falske databasen kjenner ikke or-leddet «${ledd}»`);
    if (treff[1] === 'is.null') return rad.last_notified_at === null;
    return rad.last_notified_at !== null && Date.parse(rad.last_notified_at) < Date.parse(treff[2]);
  });
}

function utfor(tabell: string, op: 'select' | 'update' | 'upsert', s: Sporring): DbSvar {
  if (tabell === 'prediction_tiles' && op === 'select') {
    bareFiltre(tabell, s, 'eq:tile_date');
    const dato = filterVerdi(s.filtre, 'eq', 'tile_date');
    return { data: velgKolonner(side(db.fliser.filter((f) => f.tile_date === dato), s.omrade), s.kolonner), error: null };
  }
  if (tabell === 'region_daily_scores' && op === 'upsert') {
    bareFiltre(tabell, s);
    if (db.lagreFeil) return { data: null, error: db.lagreFeil };
    for (const ny of s.nyttelast as Score[]) {
      db.scorer = [...db.scorer.filter((r) => r.region !== ny.region || r.tile_date !== ny.tile_date), { ...ny }];
    }
    return { data: null, error: null };
  }
  if (tabell === 'region_daily_scores' && op === 'select') {
    bareFiltre(tabell, s, 'gte:tile_date', 'lte:tile_date');
    const fra = String(filterVerdi(s.filtre, 'gte', 'tile_date'));
    const til = String(filterVerdi(s.filtre, 'lte', 'tile_date'));
    return { data: velgKolonner(db.scorer.filter((r) => r.tile_date >= fra && r.tile_date <= til), s.kolonner), error: null };
  }
  if (tabell === 'alert_subscriptions' && op === 'select') {
    // Samtykket sjekkes i løkka. Et filter på det i spørringen smeller her til
    // den falske databasen lærer å regne det ut: feilskrevet stenger det ute
    // kontoradene eller de bekreftede e-postradene, og det skal en test se.
    bareFiltre(tabell, s, 'eq:active');
    const aktiv = filterVerdi(s.filtre, 'eq', 'active');
    return {
      data: velgKolonner(side(db.abonnementer.filter((a) => a.active === aktiv), s.omrade), s.kolonner),
      error: null
    };
  }
  if (tabell === 'alert_subscriptions' && op === 'update') {
    bareFiltre(tabell, s, 'eq:id', 'or:');
    const id = String(filterVerdi(s.filtre, 'eq', 'id'));
    const or = s.filtre.find((f) => f.type === 'or')?.verdi as string | undefined;
    // Kravet ber om radene tilbake (.select('id')); tilbakeføringene gjør det ikke.
    const erKrav = s.retur !== null;
    db.hendelser.push(`${erKrav ? 'krav' : 'tilbake'}:${id}`);
    if (erKrav) db.vedKrav(id);
    const rad = db.abonnementer.find((a) => a.id === id);
    if (!rad || (or !== undefined && !oppfyllerOr(rad, or))) return { data: erKrav ? [] : null, error: null };
    const verdier = s.nyttelast as Record<string, unknown>;
    db.oppdateringer.push({ id, verdier, or: or ?? null });
    Object.assign(rad, verdier);
    return { data: erKrav ? [{ id }] : null, error: null };
  }
  if (tabell === 'varsel_hendelser' && op === 'upsert') {
    bareFiltre(tabell, s);
    db.varselhendelser.push(s.nyttelast);
    return { data: null, error: null };
  }
  // Artene i sesong er pynt i e-posten; uten arter mangler bare den linja.
  // Filteret sjekkes ikke: ruta svelger alle feil her, så et smell ville ingen sett.
  if (tabell === 'mushroom_species' && op === 'select') return { data: [], error: null };
  throw new Error(`uventet kall: ${op} mot ${tabell}`);
}

function enkeltrad(tabell: string, s: Sporring): DbSvar {
  if (tabell === 'prediction_tiles') {
    // Nyeste rasterdato — spørringen har ingen filtre, bare order + limit.
    bareFiltre(tabell, s);
    return { data: db.tileDato ? { tile_date: db.tileDato } : null, error: null };
  }
  // Intet tidligere varsel i regionen: ingen fasit i e-posten, og dermed ingen GBIF-kall.
  // Filtrene sjekkes ikke, av samme grunn som for artene: ruta svelger feilene.
  if (tabell === 'varsel_hendelser') return { data: null, error: null };
  throw new Error(`uventet maybeSingle mot ${tabell}`);
}

/** Kjedbar OG ventbar, som supabase-byggeren. Svaret regnes ut idet kjeden ventes på. */
function sporring(tabell: string, op: 'select' | 'update' | 'upsert', nyttelast?: unknown, kolonner?: string) {
  const s: Sporring = { nyttelast, kolonner: kolonner ?? null, filtre: [], retur: null, omrade: null };
  const filter = (type: Filter['type']) => (kolonne: string, verdi: unknown) => {
    s.filtre.push({ type, kolonne, verdi });
    return kjede;
  };
  const kjede: Record<string, unknown> = {
    select: (k: string) => {
      s.retur = k;
      return kjede;
    },
    eq: filter('eq'),
    gte: filter('gte'),
    lte: filter('lte'),
    or: (uttrykk: string) => {
      s.filtre.push({ type: 'or', kolonne: '', verdi: uttrykk });
      return kjede;
    },
    order: () => kjede,
    limit: () => kjede,
    range: (fra: number, til: number) => {
      s.omrade = [fra, til];
      return kjede;
    },
    maybeSingle: async () => enkeltrad(tabell, s),
    then: (ok: (v: DbSvar) => unknown, feil?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => utfor(tabell, op, s))
        .then(ok, feil)
  };
  return kjede;
}

/** Abonnementet en adresse hører til — for hendelseslista. */
function hvem(til: string): string {
  return db.abonnementer.find((a) => (a.email ?? (a.user_id ? db.brukere[a.user_id] : null)) === til)?.id ?? til;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (tabell: string) => {
      db.tabeller.push(tabell);
      return {
        select: (kolonner: string) => sporring(tabell, 'select', undefined, kolonner),
        update: (verdier: unknown) => sporring(tabell, 'update', verdier),
        upsert: (rader: unknown) => sporring(tabell, 'upsert', rader)
      };
    },
    auth: {
      admin: {
        getUserById: async (id: string) => {
          const email = db.brukere[id];
          return email
            ? { data: { user: { id, email } }, error: null }
            : { data: { user: null }, error: { message: 'User not found' } };
        }
      }
    }
  })
}));
vi.mock('@/lib/email/send', () => ({
  manglendeEpostKonfig: () => [],
  sendEpost: async (args: Omit<SendtEpost, 'sekund'>) => {
    db.hendelser.push(`send:${hvem(args.til)}`);
    epost.sendte.push({ ...args, sekund: Math.floor(Date.now() / 1000) });
    return epost.svar;
  }
}));
vi.mock('@/lib/security/secret-compare', () => ({ bearerSecretMatches: (h: string | null) => h === 'Bearer hemmelig' }));
const logger = vi.hoisted(() => {
  const l = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => l };
  return l;
});
vi.mock('@/lib/log/request', () => ({ createRequestLogger: () => logger }));
const sentry = vi.hoisted(() => ({ captureMessage: vi.fn(), flush: vi.fn(async () => true) }));
vi.mock('@sentry/nextjs', () => sentry);
// Prognosen i e-posten er pynt (best-effort i ruta): her finnes den ikke, og ingen værtjeneste nås.
vi.mock('@/lib/weather', () => ({ fetchWeatherSummary: async () => null }));
vi.mock('@/lib/weather/forecast', () => ({ fetchDailyForecast: async () => [] }));

const { GET } = await import('../route');

const APP = 'https://forhandsvisning.example.com';
const D_MINUS_2 = '2026-09-08';
const D_MINUS_1 = '2026-09-09';
/** Omslagsdagen. */
const D = '2026-09-10';
const D_PLUSS_1 = '2026-09-11';
/** Cronen kjører 05:00 UTC (vercel.json), etter nattens fliser. */
const kl5 = (dato: string) => `${dato}T05:00:00.000Z`;
/** Bundet til terskelen, så en ny kalibrering etter sesongen ikke velter testene. */
const UNDER = VARSEL_MIN_SCORE - 11;
const OVER = VARSEL_MIN_SCORE + 8;
const SENTRUM: Record<string, [number, number]> = { Oslo: [59.91, 10.75], Göteborg: [57.71, 11.97] };

/** Ingenting her skal nå nettet: vær, GBIF og Resend er erstattet. */
const nettkall = vi.fn(async () => {
  throw new Error('nettverket er stengt i denne testen');
});

let lopenummer = 0;

/** En bekreftet e-postpåmelding for Oslo som aldri har fått varsel. */
function abonnement(id: string, over: Partial<AbonnementRad> = {}): AbonnementRad {
  lopenummer += 1;
  return {
    id,
    user_id: null,
    email: `${id}@example.com`,
    confirmed_at: '2026-08-20T09:00:00.000Z',
    region: 'Oslo',
    locale: 'nb',
    last_notified_at: null,
    last_notified_score: null,
    unsubscribe_token: `00000000-0000-4000-8000-${String(lopenummer).padStart(12, '0')}`,
    active: true,
    ...over
  };
}

/** Én rute er nok: for små regioner er regionstallet rutas egen score (region-score.ts). */
function flis(region: string, score: number, dato = D): Flis {
  const [lat, lng] = SENTRUM[region];
  return { tile_date: dato, score, center_lat: lat, center_lng: lng, metadata: { region } };
}

function rad(id: string): AbonnementRad {
  const funnet = db.abonnementer.find((a) => a.id === id);
  if (!funnet) throw new Error(`ingen rad ${id}`);
  return funnet;
}

type Kropp = {
  ok?: boolean;
  tileDate?: string;
  abonnenter?: number;
  sendt?: number;
  feilet?: number;
  avslag?: Record<string, number>;
  brobygdeRegioner?: number;
};

async function kjor(auth = 'Bearer hemmelig') {
  const svar = GET({
    headers: new Headers({ authorization: auth, 'x-request-id': 't' }),
    url: 'http://x/api/cron/soppvarsel',
    nextUrl: new URL('http://x/api/cron/soppvarsel')
  } as unknown as NextRequest);
  // Smeller den falske databasen, avvises svaret mens klokka spoles under. Merk
  // avvisningen som håndtert med en gang: feilen felles av await-en nederst, i
  // testen den hører til, og meldes ikke i tillegg som en uhåndtert avvisning.
  svar.catch(() => undefined);
  // Pausen etter hver utsending (Resend tillater 2 kall/s) er en ekte setTimeout.
  await vi.runAllTimersAsync();
  const res = await svar;
  return { status: res.status, kropp: (await res.json()) as Kropp };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  vi.setSystemTime(new Date(kl5(D)));
  vi.stubEnv('NEXT_PUBLIC_APP_URL', APP);
  vi.stubGlobal('fetch', nettkall);
  vi.clearAllMocks();
  lopenummer = 0;
  // Standarddagen: Oslo lå under terskelen i går og er over den i dag — et omslag.
  db.tileDato = D;
  db.fliser = [flis('Oslo', OVER)];
  db.scorer = [{ region: 'Oslo', tile_date: D_MINUS_1, score: UNDER }];
  db.lagreFeil = null;
  db.abonnementer = [];
  db.brukere = {};
  db.vedKrav = () => undefined;
  db.tabeller = [];
  db.hendelser = [];
  db.oppdateringer = [];
  db.varselhendelser = [];
  epost.svar = { ok: true, detalj: 'sendt' };
  epost.sendte = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  expect(nettkall).not.toHaveBeenCalled();
});

describe('soppvarsel-cronen — hvem som slipper inn', () => {
  it('uten cron-hemmeligheten: 401, og verken databasen eller e-posten røres', async () => {
    db.abonnementer = [abonnement('a')];
    const { status } = await kjor('Bearer feil');
    expect(status).toBe(401);
    expect(db.tabeller).toEqual([]);
    expect(epost.sendte).toEqual([]);
  });
});

describe('soppvarsel-cronen — dobbel opt-in', () => {
  it('en e-postpåmelding uten bekreftelse får aldri varselet; en bekreftet og en kontorad i samme region får det', async () => {
    db.brukere = { 'bruker-1': 'konto@example.com' };
    db.abonnementer = [
      abonnement('ubekreftet', { confirmed_at: null }),
      abonnement('bekreftet'),
      // En kontorad opprettet etter migrasjon 057 har confirmed_at null:
      // /api/me/soppvarsel upserter uten feltet, og 057 backfylte bare radene som
      // fantes da. Den slipper gjennom på user_id — et filter på confirmed_at
      // alene ville stilnet alle slike rader.
      abonnement('konto', { user_id: 'bruker-1', email: null, confirmed_at: null })
    ];
    const { status, kropp } = await kjor();
    expect(status).toBe(200);
    expect(kropp).toMatchObject({ ok: true, tileDate: D, abonnenter: 3, sendt: 2, feilet: 0, brobygdeRegioner: 0 });
    expect(kropp.avslag).toEqual({ ubekreftet: 1 });
    expect(epost.sendte.map((e) => e.til)).toEqual(['bekreftet@example.com', 'konto@example.com']);
    // Den ubekreftede raden er usynlig for utsendingen: intet krav, ingen e-post, intet stempel.
    expect(db.hendelser).toEqual(['krav:bekreftet', 'send:bekreftet', 'krav:konto', 'send:konto']);
    expect(rad('ubekreftet')).toMatchObject({ last_notified_at: null, last_notified_score: null });
    expect(rad('bekreftet')).toMatchObject({ last_notified_at: kl5(D), last_notified_score: OVER });
    // Nøkkelen er hendelsen, ikke klokka: en gjentatt kjøring samme dag får samme nøkkel.
    expect(epost.sendte.map((e) => e.idempotensNokkel)).toEqual([`soppvarsel/bekreftet/${D}`, `soppvarsel/konto/${D}`]);
    // Loggen får abonnement-id-er og tall, aldri adresser.
    const logg = JSON.stringify([logger.info.mock.calls, logger.warn.mock.calls, logger.error.mock.calls]);
    expect(logg).not.toContain('@example.com');
  });
});

describe('soppvarsel-cronen — historikken', () => {
  it('mangler gårsdagens rad, brobygges hullet gjennom ruta: omslaget D−2 → D går ut, og hullet logges', async () => {
    // Natta til D−1 ble ingenting lagret (flisene eller lagringen feilet).
    db.scorer = [{ region: 'Oslo', tile_date: D_MINUS_2, score: UNDER }];
    db.abonnementer = [abonnement('a')];
    const { kropp } = await kjor();
    expect(kropp).toMatchObject({ ok: true, sendt: 1, feilet: 0, brobygdeRegioner: 1 });
    expect(kropp.avslag).toEqual({});
    expect(epost.sendte[0].emne).toBe(`Soppforholdene i Oslo er på ${OVER} av 100`);
    expect(epost.sendte[0].tekst).toContain(`har gått fra ${UNDER} til ${OVER} av 100`);
    // Dagens tall lagres under regionNAVNET — samme nøkkel som historikken leses på
    // og som abonnementet bærer. En slug på én av sidene gir «ingen-gaardag» for alle.
    expect(db.scorer).toContainEqual({ region: 'Oslo', tile_date: D, score: OVER });
    // Fasitloggen får samme påstand som e-posten.
    expect(db.varselhendelser).toEqual([{ region: 'Oslo', dato: D, fra_score: UNDER, til_score: OVER }]);
    expect(logger.warn).toHaveBeenCalledWith('soppvarsel.hull_i_historikk', { tileDate: D, regioner: 1 });
  });
});

describe('soppvarsel-cronen — krev før sending', () => {
  it('en feilet sending gir kravet tilbake, så omslaget leveres neste morgen (regel 3) — én gang', async () => {
    const forrigeVarsel = '2026-08-20T05:00:00.000Z';
    db.abonnementer = [abonnement('a', { last_notified_at: forrigeVarsel, last_notified_score: OVER - 3 })];
    epost.svar = { ok: false, detalj: 'Resend 500' };

    const omslagsdagen = await kjor();
    expect(omslagsdagen.kropp).toMatchObject({ sendt: 0, feilet: 1 });
    expect(db.hendelser).toEqual(['krav:a', 'send:a', 'tilbake:a']);
    // Kravet stemplet raden, med karantenen som filter …
    const grense = new Date(Date.parse(kl5(D)) - VARSEL_KARANTENE_DAGER * 86_400_000).toISOString();
    expect(db.oppdateringer[0]).toEqual({
      id: 'a',
      verdier: { last_notified_at: kl5(D), last_notified_score: OVER },
      or: `last_notified_at.is.null,last_notified_at.lt.${grense}`
    });
    // … og tilbakeføringen skrev radens FORRIGE verdier — ikke null, og ikke dagens.
    expect(db.oppdateringer[1]).toEqual({
      id: 'a',
      verdier: { last_notified_at: forrigeVarsel, last_notified_score: OVER - 3 },
      or: null
    });
    expect(rad('a')).toMatchObject({ last_notified_at: forrigeVarsel, last_notified_score: OVER - 3 });

    // Neste morgen er gårsdagen over terskelen. Da slipper bare regel 3 varselet
    // gjennom — og bare fordi raden ikke står stemplet etter omslaget.
    vi.setSystemTime(new Date(kl5(D_PLUSS_1)));
    db.tileDato = D_PLUSS_1;
    db.fliser = [flis('Oslo', OVER + 1, D_PLUSS_1)];
    db.hendelser = [];
    epost.svar = { ok: true, detalj: 'sendt' };
    const dagenEtter = await kjor();
    expect(dagenEtter.kropp).toMatchObject({ sendt: 1, feilet: 0 });
    expect(db.hendelser).toEqual(['krav:a', 'send:a']);
    expect(epost.sendte.map((e) => e.idempotensNokkel)).toEqual([`soppvarsel/a/${D}`, `soppvarsel/a/${D_PLUSS_1}`]);
    expect(epost.sendte[1].tekst).toContain(`har gått fra ${UNDER} til ${OVER + 1} av 100`);
    expect(rad('a')).toMatchObject({ last_notified_at: kl5(D_PLUSS_1), last_notified_score: OVER + 1 });
  });

  it('et tapt krav sender ingenting, og skriver ikke over stempelet til kjøringen som vant', async () => {
    db.abonnementer = [abonnement('a'), abonnement('b')];
    // En overlappende kjøring stempler a mellom lesingen og kravet.
    db.vedKrav = (id) => {
      if (id === 'a') Object.assign(rad('a'), { last_notified_at: kl5(D), last_notified_score: OVER });
    };
    const { kropp } = await kjor();
    expect(kropp).toMatchObject({ ok: true, sendt: 1, feilet: 0 });
    expect(kropp.avslag).toEqual({ 'tatt-av-annen-kjoring': 1 });
    expect(epost.sendte.map((e) => e.til)).toEqual(['b@example.com']);
    // Verken e-post eller en «tilbakeføring» som ville visket ut den andres stempel.
    expect(db.hendelser).toEqual(['krav:a', 'krav:b', 'send:b']);
    expect(rad('a')).toMatchObject({ last_notified_at: kl5(D), last_notified_score: OVER });
  });
});

describe('soppvarsel-cronen — avmeldingslenkene', () => {
  it('brødteksten får lenka med &s= og &sprak= på abonnementets språk; List-Unsubscribe får den rene adressen', async () => {
    // Et halvt sekund over hel klokke: pausen etter første utsending skyver den
    // andre inn i neste sekund, så &s= må være tatt idet e-posten bygges.
    vi.setSystemTime(new Date(`${D}T05:00:00.500Z`));
    db.fliser = [flis('Oslo', OVER), flis('Göteborg', OVER)];
    db.scorer = [
      { region: 'Oslo', tile_date: D_MINUS_1, score: UNDER },
      { region: 'Göteborg', tile_date: D_MINUS_1, score: UNDER }
    ];
    const norsk = abonnement('norsk');
    const svensk = abonnement('svensk', { region: 'Göteborg', locale: 'sv' });
    db.abonnementer = [norsk, svensk];
    await kjor();
    expect(epost.sendte.map((e) => e.til)).toEqual(['norsk@example.com', 'svensk@example.com']);

    const sjekk = (e: SendtEpost, token: string, sprak: 'nb' | 'sv') => {
      const hode = `${APP}/api/soppvarsel/av?t=${token}`;
      const brodtekst = `${hode}&s=${e.sekund}&sprak=${sprak}`;
      expect(e.avmeldingsUrl).toBe(hode);
      expect(e.html).toContain(`href="${brodtekst}"`);
      expect(e.tekst).toContain(brodtekst);
      // Brødteksten har aldri den rene adressen alene.
      expect(e.html).not.toContain(`href="${hode}"`);
    };
    sjekk(epost.sendte[0], norsk.unsubscribe_token, 'nb');
    sjekk(epost.sendte[1], svensk.unsubscribe_token, 'sv');
    // Sekunder, ikke millisekunder.
    expect(epost.sendte[0].sekund).toBe(Math.floor(Date.parse(`${D}T05:00:00.500Z`) / 1000));
    expect(epost.sendte[1].sekund).toBeGreaterThan(epost.sendte[0].sekund);
    // Det svenske abonnementet får svensk e-post, og klikklenka peker på områdets slug.
    expect(epost.sendte[1].emne).toBe(`Svampförhållandena i Göteborg är på ${OVER} av 100`);
    expect(epost.sendte[1].html).toContain(
      `${APP}/api/soppvarsel/klikk?t=${svensk.unsubscribe_token}&r=goteborg&s=${epost.sendte[1].sekund}`
    );
  });
});

describe('soppvarsel-cronen — lagringen av dagens tall', () => {
  it('feiler lagringen, går alarmen til Sentry — og dagens varsel går likevel ut', async () => {
    db.lagreFeil = { message: 'connection reset' };
    db.abonnementer = [abonnement('a')];
    const { status, kropp } = await kjor();
    expect(status).toBe(200);
    expect(kropp).toMatchObject({ ok: true, sendt: 1, feilet: 0 });
    expect(epost.sendte[0].emne).toBe(`Soppforholdene i Oslo er på ${OVER} av 100`);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`ikke lagret dagens regionscorer \\(${D}\\): connection reset`)),
      'error'
    );
    expect(logger.error).toHaveBeenCalledWith('soppvarsel.lagring_feilet', undefined, { message: 'connection reset' });
    // Dagen står umålt i tabellen — det er hullet morgendagens kjøring må brobygge.
    expect(db.scorer.filter((r) => r.tile_date === D)).toEqual([]);
  });
});
