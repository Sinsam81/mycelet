/**
 * Taket for bekreftelses-e-poster per adresse i den kontoløse påmeldingen
 * (/api/soppvarsel/pamelding). Reglene bor her, rene og testet; ruta gjør
 * oppslagene. Hele begrunnelsen står under «TAK PER ADRESSE» i ruta.
 *
 * Alt regnes ut fra radens egne tidsstempler — `created_at` og `updated_at`
 * (trigger fra migrasjon 051). For en rad som venter på bekreftelse er
 * `updated_at` i praksis tidspunktet for siste utsending: påmeldingen er det
 * eneste som skriver til en slik rad. (Unntaket er klikk-ruta, for en rad som
 * har fått varsler før og meldt seg på igjen — et klikk på en gammel e-post
 * forskyver da ventetiden, aldri mer.) Ingen ny kolonne, ingen migrasjon.
 *
 * ── ÉN INNBOKS, MANGE SKRIVEMÅTER ───────────────────────────────────────────
 *
 * Taket telte den bokstavelige strengen. Men «ola+1», «o.la» og «ola» på
 * Gmail — og «ola» på googlemail.com — havner alle i den samme innboksen, så
 * et skript som byttet IP fikk sende tre bekreftelser i timen per SKRIVEMÅTE,
 * uten grense på hvor mange skrivemåter det fant på. Lag 1 og 3 teller derfor
 * innboksen:
 *
 *   · kanoniskAdresse — nøkkelen i minnet (lag 1): lowercase, uten
 *     +merkelapp, og for Gmail uten punktum og med googlemail.com = gmail.com.
 *   · adresseMonster — tellingen i databasen (lag 3): et forankret regulært
 *     uttrykk som treffer hver lagret skrivemåte av den samme innboksen, og
 *     ingen andres. Ikke ilike: «ola%» på et domene treffer også «olav» der,
 *     og da kunne hvem som helst fylt taket til en annen adresse og fått
 *     bekreftelsene dens svelget i stillhet (svaret er jo «sendt» uansett).
 *
 * Raden lagrer fortsatt adressen slik den ble skrevet (lowercase), og
 * e-posten går dit; lag 2 (raden selv) slår opp nøyaktig den. Bare +merkelapper
 * og Gmail-punktum slås sammen — det er det de store leverandørene leverer til
 * samme innboks. Et eget domene som tar imot alt, kan vi ikke se fra adressen.
 *
 * (Testene setter Gmail-adressene sammen av biter: repoet er offentlig, og en
 * vakt stopper adresser hos private leverandører i innsjekkede filer.)
 */

/** Høyst så mange bekreftelses-e-poster til én innboks per time. */
export const MAKS_BEKREFTELSER_PER_TIME = 3;

/** En rad som venter på bekreftelse får tidligst e-posten på nytt etter dette … */
export const FORSTE_PURRING_ETTER_MS = 10 * 60_000;

/**
 * … og etter den første gjentakelsen ikke oftere enn dette.
 *
 * Ti minutter alene ga seks e-poster i timen per rad til den som bare fortsatte
 * å sende inn — og telleren i minnet nullstilles ved hver kaldstart. Den første
 * gjentakelsen er den som hjelper et menneske («jeg fant ikke e-posten»); den
 * fjerde på en halvtime gjør det ikke.
 */
export const NESTE_PURRING_ETTER_MS = 60 * 60_000;

/** Vinduet tellingen på tvers av områder gjelder. */
export const BEKREFTELSESVINDU_MS = 60 * 60_000;

export interface VentendeRad {
  active: boolean;
  confirmed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function tid(iso: string | null | undefined): number | null {
  if (typeof iso !== 'string') return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Skal vi la være å sende bekreftelsen på nytt fordi den nettopp gikk?
 *
 * Gjelder BARE en rad som er aktiv og ubekreftet. En avmeldt rad har fersk
 * `updated_at` fra selve avmeldingen og skal kunne melde seg på igjen med én
 * gang; en bekreftet rad håndteres av ruta før dette («stille suksess»).
 *
 * Kan ikke tidsstempelet leses, svarer vi nei: da vet vi ikke når den forrige
 * gikk, og et menneske som venter på e-posten sin skal ikke tape på det.
 */
export function nyligBekreftelseSendt(rad: VentendeRad, naaMs: number): boolean {
  if (!rad.active || rad.confirmed_at) return false;
  const sist = tid(rad.updated_at);
  if (sist === null) return false;
  // Aldri rørt siden den ble opprettet → neste utsending er den første
  // gjentakelsen. Ellers har den alt vært sendt på nytt (eller reaktivert).
  const purretFor = tid(rad.created_at) !== sist;
  return naaMs - sist < (purretFor ? NESTE_PURRING_ETTER_MS : FORSTE_PURRING_ETTER_MS);
}

/** Starten på vinduet tellingen på tvers av områder leser, som ISO for databasen. */
export function bekreftelsesvinduFra(naaMs: number): string {
  return new Date(naaMs - BEKREFTELSESVINDU_MS).toISOString();
}

/** Domenene der Gmail leverer uten å se på punktum i navnet. */
const GMAIL = new Set(['gmail.com', 'googlemail.com']);

interface Innboks {
  /** Navnet på innboksen: uten +merkelapp, og for Gmail uten punktum. Aldri tomt. */
  navn: string;
  /** Domenet uten punktum på slutten; googlemail.com er gmail.com. */
  domene: string;
  gmail: boolean;
}

/**
 * Innboksen en adresse leveres til — eller null når adressen ikke har noe
 * navn igjen å kjenne den på. Det gjelder en + FØRST i lokaldelen (en
 * merkelapp trenger et navn foran seg; ellers ville «+ola@x.no» og
 * «+kari@x.no» blitt samme innboks), et Gmail-navn av bare punktum, og alt
 * som ikke har nøyaktig én @. Slike adresser er ikke ekte innbokser, og
 * telles bare som seg selv.
 */
function innboks(adresse: string): Innboks | null {
  const a = adresse.trim().toLowerCase();
  const at = a.indexOf('@');
  if (at < 0 || a.lastIndexOf('@') !== at) return null;
  const lokal = a.slice(0, at);
  const domene = a.slice(at + 1).replace(/\.+$/, '');
  const pluss = lokal.indexOf('+');
  if (pluss === 0) return null;
  const utenMerkelapp = pluss > 0 ? lokal.slice(0, pluss) : lokal;
  const gmail = GMAIL.has(domene);
  const navn = gmail ? utenMerkelapp.replace(/\./g, '') : utenMerkelapp;
  if (navn === '') return null;
  return { navn, domene: gmail ? 'gmail.com' : domene, gmail };
}

/**
 * Nøkkelen for taket i minnet (lag 1): lik for alle skrivemåter av samme
 * innboks. Bare en nøkkel — e-posten går alltid til adressen slik den ble
 * skrevet.
 */
export function kanoniskAdresse(adresse: string): string {
  const i = innboks(adresse);
  return i ? `${i.navn}@${i.domene}` : adresse.trim().toLowerCase();
}

/**
 * Metategnene i et regulært uttrykk, i Postgres (`~`/`~*`) som i JavaScript.
 * Alt annet i en adresse står for seg selv. En backslash settes bare foran
 * tegnsetting, aldri foran en bokstav eller et siffer (i Postgres er `\d`,
 * `\m` og `\y` noe annet enn tegnet).
 */
const METATEGN = /[\\^$.|?*+()[\]{}]/g;
const bokstavelig = (tekst: string) => tekst.replace(METATEGN, '\\$&');

/** En valgfri +merkelapp: alt fram til @. */
const MERKELAPP = '(\\+[^@]*)?';

/**
 * Tellingen i databasen (lag 3): et forankret mønster som treffer en lagret
 * adresse NØYAKTIG når den har samme kanoniskAdresse som denne — alle
 * skrivemåter av innboksen, og ingen andre adresser. Mønsteret låser hele
 * strengen (^…$), og alt fra brukeren er escapet, så «ola» aldri treffer
 * «olav», og «o.la» aldri «oxla».
 *
 *   ola@firma.example → ^ola(\+[^@]*)?@firma\.example\.*$
 *   o.la på Gmail     → ^\.*o\.*l\.*a\.*(\+[^@]*)?@(gmail|googlemail)\.com\.*$
 *
 * Lagrede adresser er lowercase; ruta matcher likevel uten hensyn til store og
 * små bokstaver (`~*`), så en rad med store bokstaver aldri faller utenfor.
 */
export function adresseMonster(adresse: string): string {
  const i = innboks(adresse);
  if (!i) return `^${bokstavelig(adresse.trim().toLowerCase())}$`;
  if (i.gmail) {
    const navn = [...i.navn].map(bokstavelig).join('\\.*');
    return `^\\.*${navn}\\.*${MERKELAPP}@(gmail|googlemail)\\.com\\.*$`;
  }
  return `^${bokstavelig(i.navn)}${MERKELAPP}@${bokstavelig(i.domene)}\\.*$`;
}
