/**
 * Sone-ruta, regnet slik databasen regner den — før og etter migrasjon 075.
 *
 * Et sone-funn («hemmeligsted-vennlig») vises på midtpunktet av ruta det ligger
 * i. Triggeren set_display_location regnet lengdesteget av funnets EKSAKTE
 * breddegrad fram til 075, og da kan breddegraden regnes rett ut av punktet
 * alle ser (filhodet i supabase/migrations/075_sonerute_uten_breddegradslekkasje.sql).
 * 075 regner lengdesteget av den AVRUNDEDE breddegraden i stedet.
 *
 * Begge utregningene står her linje for linje som i SQL-en, fordi:
 *  - sonevakta i POST /api/findings sammenligner punktet databasen stemplet
 *    med det 075 ville gitt (se sonevakt.ts), og
 *  - sonerute-migrasjon.test.ts krever at linjene under står i migrasjonsfila,
 *    så modellen og SQL-en ikke kan gli fra hverandre.
 *
 * Postgres og JavaScript regner ikke bit for bit likt. Forskjellene, og hvorfor
 * de er ufarlige for vakta, står ved SONERUTE_TOLERANSE_GRADER.
 */

export interface Sonestempel {
  lat: number;
  lng: number;
  /** Rutas høyde i grader. */
  stegLat: number;
  /** Rutas bredde i grader. */
  stegLng: number;
}

/**
 * Postgres' round(double precision) er rint(): en halv rundes til nærmeste
 * PARTALL (2,5 → 2, −3,5 → −4). Math.round runder en halv opp mot +∞
 * (2,5 → 3, −3,5 → −3). For et GPS-punkt treffer kvotienten aldri en eksakt
 * halv, men det koster ingenting å regne likt — og da er det ingen forskjell
 * mellom halvkulene å lure på.
 */
export function rundAvSomPostgres(x: number): number {
  const r = Math.round(x);
  // Math.round(x) − x er 0,5 nøyaktig bare når x lå midt mellom to heltall.
  if (r - x === 0.5 && Math.abs(r % 2) === 1) return r - 1;
  return r;
}

/** radians() i Postgres: x * (π/180). */
function radianer(grader: number): number {
  return grader * (Math.PI / 180);
}

/**
 * GREATEST(precision_km, 1) / 111.32. I Postgres er dette heltall delt på en
 * numeric-literal, regnet i numeric og så gjort om til double; her er 111.32
 * en double fra start. Svarene kan skille i siste bit — se toleransen.
 */
function stegBredde(km: number): number {
  return Math.max(km, 1) / 111.32;
}

/**
 * zone_grid_location i migrasjon 075. Linjene står i samme rekkefølge som i
 * SQL-en:
 *
 *   step_lat := GREATEST(precision_km, 1) / 111.32;
 *   zone_lat := round(lat / step_lat) * step_lat;
 *   step_lng := GREATEST(precision_km, 1) / (111.32 * GREATEST(cos(radians(zone_lat)), 0.2));
 *   zone_lng := round(lng / step_lng) * step_lng;
 */
export function sonerute075(lat: number, lng: number, km: number): Sonestempel {
  const stegLat = stegBredde(km);
  const soneLat = rundAvSomPostgres(lat / stegLat) * stegLat;
  const stegLng = Math.max(km, 1) / (111.32 * Math.max(Math.cos(radianer(soneLat)), 0.2));
  return { lat: soneLat, lng: rundAvSomPostgres(lng / stegLng) * stegLng, stegLat, stegLng };
}

/**
 * Sone-grenen i set_display_location slik den sto i 005, 024 og 042 — den som
 * røper breddegraden. Bare til tester og forklaring; ingen kode skal stemple
 * med denne.
 *
 *   grid_lat := GREATEST(NEW.zone_precision_km, 1) / 111.32;
 *   grid_lng := GREATEST(NEW.zone_precision_km, 1) / (111.32 * GREATEST(cos(radians(NEW.latitude)), 0.2));
 */
export function sonerute042(lat: number, lng: number, km: number): Sonestempel {
  const stegLat = stegBredde(km);
  const stegLng = Math.max(km, 1) / (111.32 * Math.max(Math.cos(radianer(lat)), 0.2));
  return {
    lat: rundAvSomPostgres(lat / stegLat) * stegLat,
    lng: rundAvSomPostgres(lng / stegLng) * stegLng,
    stegLat,
    stegLng
  };
}

/**
 * Hvor nær det lagrede punktet må ligge det 075 gir, for å regnes som likt.
 * 1e-9 grader er rundt en tidels millimeter.
 *
 * NEDRE GRENSE — støyen mellom Postgres og JavaScript:
 *  · stegLat: numeric-divisjon gjort om til double mot double-divisjon. Høyst
 *    en bit eller to i siste siffer, relativt ~2e-16.
 *  · cos(): Postgres bruker plattformens libm, V8 sin egen. Begge er nøyaktige
 *    til innenfor én enhet i siste siffer.
 *  · Lesingen tilbake: PostgREST skriver double precision med korteste
 *    tilbakeførbare form (Postgres 12+), så tallet som kommer fram, er det
 *    som ligger i kolonnen.
 *  Til sammen blir punktet feil med høyst noen få ganger 1e-16 relativt — for
 *  en lengdegrad på 180 under 1e-13 grader. Toleransen ligger over fire
 *  tierpotenser høyere.
 *
 * ØVRE GRENSE — hvor langt fra hverandre de to utregningene havner:
 *  Breddegraden er den samme i begge (sonerute-migrasjon.test.ts viser det).
 *  Lengdegraden skiller med omtrent |lengdegrad| · tan(breddegrad) · Δ, der
 *  Δ er avstanden fra funnet til radens midtlinje i radianer — typisk
 *  hundredeler av en grad, langt over toleransen.
 *
 * Når avrundingen i Postgres og her havner på hver sin side av en halv (lat
 * eller lng ligger innenfor støyen av en rutekant), skiller svarene med et
 * helt rutesteg. Det er den TRYGGE feilen: vakta gjør funnet privat uten grunn.
 * Den andre veien — et gammelt stempel som ser ut som et nytt — står i
 * stempletMed075.
 */
export const SONERUTE_TOLERANSE_GRADER = 1e-9;

/** Det vakta trenger fra raden slik databasen lagret den. */
export interface LagretSonefunn {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
  zone_precision_km: number | null | undefined;
  display_latitude: number | null | undefined;
  display_longitude: number | null | undefined;
}

function erTall(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Er punktet databasen stemplet, det 075 gir for dette funnet?
 *
 * true  → 075 er kjørt (eller de to utregningene faller sammen — se under).
 * false → den gamle triggeren står, eller raden kom ikke tilbake lesbar.
 *         Begge behandles likt av vakta: et punkt vi ikke kan stå inne for,
 *         blir ikke stående offentlig.
 *
 * SAMMENFALL — når gammel og ny utregning gir samme punkt, kan vakta ikke se
 * forskjell. Det skjer i tre tilfeller, og ingen av dem røper noe:
 *  1. Både funnet og radens midtlinje ligger nord for ~78,46° (eller sør for
 *     −78,46°): cos er under 0,2 i begge, GREATEST(…, 0,2) slår inn, og
 *     lengdesteget avhenger ikke av breddegraden i det hele tatt. Det gamle
 *     stempelet har da ingenting å regne tilbake fra.
 *  2. Lengdegraden ligger innenfor en halv rute fra 0-meridianen, så begge
 *     runder til k = 0 og punktet blir 0 uansett steg. Angrepet trenger k ≠ 0.
 *  3. Ellers bare når funnet ligger innenfor toleransen / (|lengdegrad| ·
 *     tan(breddegrad)) radianer av radens midtlinje — rundt en millimeter
 *     nord–sør i Norden. Den som regner det gamle stempelet baklengs, får da
 *     radens egen breddegrad ut, den som alt står på kartet, pluss beskjeden
 *     «innenfor en millimeter av den». Sjansen er rundt to millimeter delt på
 *     radens høyde: høyst et par per million funn i en 1 km-rute, færre i
 *     større ruter.
 */
export function stempletMed075(rad: LagretSonefunn): boolean {
  const { latitude, longitude, zone_precision_km: km, display_latitude, display_longitude } = rad;
  if (!erTall(latitude) || !erTall(longitude) || !erTall(km)) return false;
  if (!erTall(display_latitude) || !erTall(display_longitude)) return false;
  const ventet = sonerute075(latitude, longitude, km);
  return (
    Math.abs(display_latitude - ventet.lat) <= SONERUTE_TOLERANSE_GRADER &&
    Math.abs(display_longitude - ventet.lng) <= SONERUTE_TOLERANSE_GRADER
  );
}
