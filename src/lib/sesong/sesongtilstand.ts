/**
 * Sesongtilstand — den ENE kilden for «hvor i soppåret er vi?».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * API (stabilt — andre flater importerer herfra)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   sesongtilstand(naa?: Date): Sesongtilstand
 *     .fase                   'forsesong' | 'hoysesong' | 'ettersesong' | 'vinter' | 'var'
 *     .maaned                 1–12, Oslo-tid
 *     .osloDato               'ÅÅÅÅ-MM-DD', Oslo-tid
 *     .iHovedsesong           juni–november (den generelle soppsesongen)
 *     .erHoysesong            august–oktober
 *     .manederTilHovedsesong  0 i hovedsesongen, ellers hele måneder til juni
 *     .dagerTilHovedsesong    0 i hovedsesongen, ellers dager til neste 1. juni
 *
 *   sesongfaseForManed(maaned: number): Sesongfase   — ren månedsoppslag
 *   erUtenomHovedsesong(naa?: Date): boolean         — snarvei for !iHovedsesong
 *   HOVEDSESONG_STARTMANED / HOVEDSESONG_SLUTTMANED  — 6 / 11
 *
 * Fasene:
 *   forsesong    jun–jul   sesongen er i gang, men ikke på topp
 *   hoysesong    aug–okt   årets beste måneder
 *   ettersesong  nov       siste skulder
 *   vinter       des–mar   utenom hovedsesongen
 *   var          apr–mai   utenom hovedsesongen, men vårsoppene har sin egen
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DEN FINNES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prissiden sa «Høysesongen er i gang» hele året, prøvearket solgte «resten av
 * høsten nå» i januar, forsidekortet ba folk «komme tilbake fra sensommeren» to
 * ganger i samme kort, og /soppforhold skrev at en art «er i sesong her nå» ved
 * 3 av 100. Ingen av flatene visste hvilken måned det var.
 *
 * ⚠️ DETTE ER KALENDEREN, IKKE FORHOLDENE. En tørr august er fortsatt
 * 'hoysesong', og en mild november med gode tall er fortsatt 'ettersesong'.
 * Flater som påstår noe om forholdene («stille i alle områdene») må lese
 * TALLENE — se innledningsTilstand i src/app/soppforhold/hent-regioner.ts, som
 * krever både lave tall og !iHovedsesong før den sier «utenom sesongen».
 *
 * ⚠️ «HOVEDSESONG» ER KODENS ORD, IKKE TEKSTENS. Her betyr det juni–november
 * (sesongvekt over null). Til brukeren betyr «hovedsesong» / «högsäsong»
 * august–oktober: haken «Hovedsesong for sopp i Norge» / «Högsäsong för svamp»
 * i prediction-explanation.ts kommer først 1. august. Skriv derfor aldri
 * «hovedsesongen starter i juni» i en tekst — si «soppsesongen starter i juni»,
 * og bruk `erHoysesong` for det brukeren kaller hovedsesong. «Utenom
 * hovedsesongen» om desember–mai er sant i begge betydninger. Se
 * utenom-sesong-tekst.ts, der dette gikk galt.
 *
 * ⚠️ MÅ FØLGE VEKTTABELLEN. Månedene under er de samme som
 * SEASON_WEIGHT_BY_MONTH i src/lib/prediction/mushroom-day.ts (vekt > 0 =
 * hovedsesong, vekt 35 = høysesong). Tabellen er skrevet ned her — ikke
 * importert — fordi denne filen brukes i klientkomponenter (prissiden,
 * prøvearket) og ikke skal dra hele prediksjonskoden inn i bunten. Testen
 * __tests__/sesongtilstand.test.ts låser de to sammen for alle tolv måneder,
 * så en tredje usynkronisert sesongport ikke kan oppstå (se historien om
 * isInMushroomSeason i mushroom-day.ts).
 *
 * Tidssone: Europe/Oslo for både Norge og Sverige (samme sone). En kjøper
 * 31. oktober 23:30 UTC er i november i Oslo.
 *
 * Ren og uten avhengigheter: datoen sendes inn, så tester aldri avhenger av
 * dagens dato.
 */

export type Sesongfase = 'forsesong' | 'hoysesong' | 'ettersesong' | 'vinter' | 'var';

export interface Sesongtilstand {
  fase: Sesongfase;
  /** 1–12, Oslo-tid. */
  maaned: number;
  /** ÅÅÅÅ-MM-DD, Oslo-tid. */
  osloDato: string;
  /** Juni–november: den generelle soppsesongen. */
  iHovedsesong: boolean;
  /** August–oktober. */
  erHoysesong: boolean;
  /** 0 i hovedsesongen, ellers antall hele månedsskifter fram til juni. */
  manederTilHovedsesong: number;
  /** 0 i hovedsesongen, ellers dager til neste 1. juni. */
  dagerTilHovedsesong: number;
}

/** Første og siste måned i den generelle soppsesongen (vekt > 0 i mushroom-day.ts). */
export const HOVEDSESONG_STARTMANED = 6;
export const HOVEDSESONG_SLUTTMANED = 11;

/** Indeks 0 = januar. Se ⚠️ MÅ FØLGE VEKTTABELLEN over. */
const FASE_PER_MANED: readonly Sesongfase[] = [
  'vinter', // jan
  'vinter', // feb
  'vinter', // mar
  'var', // apr
  'var', // mai
  'forsesong', // jun
  'forsesong', // jul
  'hoysesong', // aug
  'hoysesong', // sep
  'hoysesong', // okt
  'ettersesong', // nov
  'vinter' // des
];

/** Fasen for en måned (1–12). Verdier utenfor klemmes inn, så et ugyldig tall aldri kaster. */
export function sesongfaseForManed(maaned: number): Sesongfase {
  const m = Math.max(1, Math.min(12, Math.round(maaned)));
  return FASE_PER_MANED[m - 1];
}

const OSLO = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});

export function sesongtilstand(naa: Date = new Date()): Sesongtilstand {
  // sv-SE gir ISO-rekkefølge rett fra formatteren (samme grep som osloDag i bruksdag.ts).
  const osloDato = OSLO.format(naa);
  const [aar, maaned, dag] = osloDato.split('-').map(Number);
  const fase = sesongfaseForManed(maaned);
  const iHovedsesong = fase === 'forsesong' || fase === 'hoysesong' || fase === 'ettersesong';

  let manederTilHovedsesong = 0;
  let dagerTilHovedsesong = 0;
  if (!iHovedsesong) {
    // Desember teller mot neste års juni; januar–mai mot årets.
    const startAar = maaned > HOVEDSESONG_SLUTTMANED ? aar + 1 : aar;
    manederTilHovedsesong = (startAar - aar) * 12 + HOVEDSESONG_STARTMANED - maaned;
    // Ren datoregning i UTC på Oslo-datoen selv — ingen sommertid å snuble i.
    dagerTilHovedsesong = Math.round(
      (Date.UTC(startAar, HOVEDSESONG_STARTMANED - 1, 1) - Date.UTC(aar, maaned - 1, dag)) / 86_400_000
    );
  }

  return {
    fase,
    maaned,
    osloDato,
    iHovedsesong,
    erHoysesong: fase === 'hoysesong',
    manederTilHovedsesong,
    dagerTilHovedsesong
  };
}

/** Snarvei: er vi utenfor den generelle soppsesongen (desember–mai)? */
export function erUtenomHovedsesong(naa: Date = new Date()): boolean {
  return !sesongtilstand(naa).iHovedsesong;
}
