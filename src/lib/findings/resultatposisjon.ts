/**
 * Hvor et funn fra AI-resultatet lagres — og når posisjonen må spørres om.
 *
 * HVORFOR
 * Resultatsiden lagret funnet på posisjonen identifiseringssiden målte da
 * brukeren trykket «Identifiser». Den målingen kan alt være opptil to minutter
 * gammel (maximumAge i useGeolocation.ts), og resultatet overlever i
 * sessionStorage: den som identifiserte i skogen og trykket «Lagre» hjemme
 * kvelden etter, fikk funnet lagret der det var identifisert — greit — men den
 * som tok bildet med i går og identifiserte det fra sofaen, fikk det lagret på
 * sofaen. Ingen av dem fikk se hvilken posisjon som ble brukt. Et funn hjemme
 * som deles, viser hvor brukeren bor.
 *
 * REGELEN
 *  · Posisjonen fra identifiseringen brukes uten spørsmål bare når den er
 *    fersk (FERSK_IDENTIFISERING_MS) — normalt tilfelle: bildet tatt og
 *    identifisert på stedet. Siden viser likevel alltid hvilken posisjon som
 *    lagres og omtrent hvor gammel den er, og en vei til kartet.
 *  · Ellers (gammel, eller ukjent alder) må brukeren velge: «der jeg var da
 *    jeg identifiserte» eller «der jeg står nå» (målt på nytt med
 *    finnFerskPosisjon) — eller plassere funnet på kartet.
 *  · Mangler posisjonen helt, kan bare «der jeg står nå» eller kartet gi en.
 *
 * Bildets egen posisjon (EXIF) leses ikke: den strippes med vilje før
 * opplasting. Derfor kan ikke siden vite om bildet kom fra kamerarullen; den
 * kan bare si fra om hvilken posisjon som brukes, og gjøre det lett å velge en
 * annen.
 */

/**
 * Så gammel kan posisjonen fra identifiseringen være og likevel brukes uten
 * spørsmål. Ti minutter dekker å lese resultatet, forvekslingssjekken og
 * bekreftelsen på stedet. Lenger enn det kan brukeren ha gått rundt en
 * kilometer, eller dratt hjem — da skal ikke funnet flytte seg dit uten at
 * brukeren har sagt ja.
 */
export const FERSK_IDENTIFISERING_MS = 10 * 60 * 1000;

/** Klokkeslingring mellom serverens created_at og enhetens klokke. */
const FREMTID_TOLERANSE_MS = 5 * 60 * 1000;

export interface Punkt {
  lat: number;
  lng: number;
}

export interface Identifiseringsposisjon extends Punkt {
  /** Når posisjonen ble målt (ms siden epoke); null = vet ikke. */
  maaltMs: number | null;
}

export interface NaaMaaling extends Punkt {
  /** Nøyaktighet i meter. */
  accuracy: number;
}

export type Posisjonsvalg = 'identifisering' | 'naa';

export type Resultatposisjon =
  | { status: 'klar'; punkt: Punkt; kilde: Posisjonsvalg }
  /** Posisjonen fra identifiseringen er gammel eller av ukjent alder: brukeren må velge. */
  | { status: 'maa_velge' }
  /** Brukeren valgte «der jeg står nå», og målingen pågår. */
  | { status: 'maaler' }
  /** Ingen posisjon å lagre. */
  | { status: 'mangler' };

/** Er posisjonen fra identifiseringen fersk nok til å brukes uten spørsmål? */
export function erFerskIdentifisering(maaltMs: number | null, naaMs: number): boolean {
  if (maaltMs == null || !Number.isFinite(maaltMs)) return false;
  const alder = naaMs - maaltMs;
  return alder >= -FREMTID_TOLERANSE_MS && alder <= FERSK_IDENTIFISERING_MS;
}

export function velgResultatposisjon(args: {
  identifisering: Identifiseringsposisjon | null;
  naa: NaaMaaling | null;
  maalerNaa: boolean;
  valg: Posisjonsvalg | null;
  naaMs: number;
}): Resultatposisjon {
  const { identifisering, naa, maalerNaa, valg, naaMs } = args;

  if (valg === 'naa') {
    if (naa) return { status: 'klar', punkt: { lat: naa.lat, lng: naa.lng }, kilde: 'naa' };
    if (maalerNaa) return { status: 'maaler' };
    return identifisering ? { status: 'maa_velge' } : { status: 'mangler' };
  }

  if (!identifisering) return { status: 'mangler' };

  // Et uttrykkelig valg står, også for en gammel posisjon: brukeren har sett
  // alderen og sagt at det var der.
  if (valg === 'identifisering' || erFerskIdentifisering(identifisering.maaltMs, naaMs)) {
    return { status: 'klar', punkt: { lat: identifisering.lat, lng: identifisering.lng }, kilde: 'identifisering' };
  }
  return { status: 'maa_velge' };
}

/** Alderen i den enheten siden skriver den i. null = ukjent. */
export type Posisjonsalder =
  | { enhet: 'naa' }
  | { enhet: 'minutter' | 'timer' | 'dager'; antall: number }
  | null;

export function posisjonsalder(maaltMs: number | null, naaMs: number): Posisjonsalder {
  if (maaltMs == null || !Number.isFinite(maaltMs)) return null;
  const alder = Math.max(0, naaMs - maaltMs);
  const minutter = Math.floor(alder / 60_000);
  if (minutter < 1) return { enhet: 'naa' };
  if (minutter < 60) return { enhet: 'minutter', antall: minutter };
  const timer = Math.floor(minutter / 60);
  if (timer < 48) return { enhet: 'timer', antall: timer };
  return { enhet: 'dager', antall: Math.floor(timer / 24) };
}

/** Det resultatet som trengs for å vite når posisjonen ble målt. */
export interface Maaletidskilde {
  /** `location.timestamp`: tiden fixet selv bærer (ms siden epoke), når den er med. */
  location?: unknown;
  createdAt?: unknown;
  posisjonSettMs?: unknown;
}

function fixTidspunkt(location: unknown): number | null {
  if (!location || typeof location !== 'object') return null;
  const ts = (location as { timestamp?: unknown }).timestamp;
  return typeof ts === 'number' && Number.isFinite(ts) && ts > 0 ? ts : null;
}

/**
 * Når ble posisjonen i et resultat målt?
 *
 *  · `location.timestamp`, når identifiseringssiden har tatt med tiden selve
 *    fixet bærer (medPosisjonstid i src/lib/identifications/okt-resultat.ts,
 *    når plattformen oppgir en). Det er den eneste presise kilden:
 *    iOS-pluginen kan svare med en lagret posisjon som er langt eldre enn
 *    trykket på «Identifiser» (den overser maximumAge, se useGeolocation.ts).
 *  · Fra en fersk identifisering: `posisjonSettMs`, satt av resultatsiden
 *    første gang den leste resultatet.
 *  · Fra historikken (?id=): `createdAt` på raden.
 *  · Ellers ukjent.
 *
 * De to siste er bare en NEDRE grense for alderen — se erOmtrentligMaaletid.
 */
export function maaltTidspunkt(payload: Maaletidskilde): number | null {
  const fix = fixTidspunkt(payload.location);
  if (fix !== null) return fix;
  if (typeof payload.posisjonSettMs === 'number' && Number.isFinite(payload.posisjonSettMs)) {
    return payload.posisjonSettMs;
  }
  if (typeof payload.createdAt === 'string') {
    const ms = Date.parse(payload.createdAt);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

/**
 * Er tidspunktet fra maaltTidspunkt bare omtrentlig — tiden siden så
 * resultatet, ikke tiden fixet ble målt? Da kan posisjonen være eldre enn
 * alderen siden regner ut (telefonen kan ha gitt en lagret posisjon), og
 * teksten må si det i stedet for å love «for under ett minutt siden».
 *
 * Er det IKKE omtrentlig, er alderen fixets egen, og den kan være langt eldre
 * enn trykket på «Identifiser». Da beskriver teksten målingen («Posisjonen
 * telefonen målte …»), aldri trykket eller «der jeg var da jeg identifiserte».
 */
export function erOmtrentligMaaletid(payload: Maaletidskilde): boolean {
  return fixTidspunkt(payload.location) === null;
}
