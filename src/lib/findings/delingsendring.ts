import type { DelingsnivaValg } from './delingsniva';
import type { FindingPatch, Visibility } from './request';

/**
 * Hva en endring av et lagret funn skal skrive — og om den får lov.
 *
 * BAKGRUNNEN
 * `display_latitude/longitude` stemples av triggeren `set_display_location`.
 * For et omtrentlig funn er stempelet et TILFELDIG punkt inntil 500 m fra det
 * ekte stedet, og migrasjon 042 holder det frosset helt til synlighet, sone
 * eller sonepresisjon endres. Da trekkes et nytt punkt.
 *
 * Det var ufarlig så lenge funn ikke kunne endres. Med «Endre deling» kan
 * eieren gå privat → omtrentlig → privat → omtrentlig, og hver runde legger et
 * nytt punkt ut på kartet. Gjennomsnittet av N slike punkter ligger omtrent
 * 350/√N meter fra det ekte stedet: fire runder halverer vernet, tjuefem gjør
 * det til 70 meter. Den som følger med på kartet trenger ikke gjøre noe annet
 * enn å notere hvor prikken står. Det er nøyaktig angrepet 042 ble skrevet for
 * å stenge — les filhodet der før du rører noe her.
 *
 * REGELEN
 *  · Å gjøre et funn PRIVAT går alltid. Det nullstiller display_*.
 *  · Å gjøre det til SONE er stengt til migrasjon 075 er bekreftet kjørt
 *    (SONE_OMGJORING_AAPEN), og rutestørrelsen kan ikke endres herfra i det
 *    hele tatt. Begge deler er begrunnet under «SONERUTA». Når omgjøringen er
 *    åpen, går den alltid: ruta er regnet ut, ikke trukket, og med låst
 *    størrelse og låst posisjon gir samme funn samme rute hver gang.
 *    Gjentakelse forteller ingenting nytt.
 *  · Å gå fra eksakt punkt til omtrentlig går alltid. Det er en innstramming,
 *    og det eksakte punktet har allerede vært synlig.
 *  · Alt som legger ut NOE NYTT — et nytt tilfeldig punkt (fra privat eller
 *    sone til omtrentlig) eller det eksakte punktet (til offentlig) — må vente
 *    til funnet har stått urørt i DELING_KARANTENE_TIMER. Unntaket er et funn
 *    som aldri er endret: da er dette det første punktet som noen gang legges
 *    ut, og det avslører ingenting.
 *
 * Til sammen: høyst ett nytt punkt per funn per døgn, uansett hvilken vei
 * eieren går. Veien om offentlig (privat → offentlig → omtrentlig) er stengt
 * av at det første steget selv er karantenebelagt.
 *
 * SONERUTA
 * Et sone-funn vises som et punkt i et rutenett: triggeren runder posisjonen
 * av til nærmeste rutepunkt, og public_findings gir punktet og rutestørrelsen
 * til alle, med full presisjon. En tidligere utgave av denne fila kalte hver
 * endring til sone en innstramming som alltid var lov, og lovet at summen av
 * flere ruter aldri ble finere enn 500 × 500 meter. Begge deler var feil.
 *
 *  1. ÉN RAD RØPET BREDDEGRADEN. Fram til migrasjon 075 regnet triggeren
 *     lengdesteget av funnets EKSAKTE breddegrad:
 *     display_longitude = k · p / (111,32 · cos(ekte breddegrad)), der k er et
 *     heltall og p er rutestørrelsen. Den som leser raden, finner k ved å runde
 *     av display_lng · 111,32 · cos(display_lat) / p, og har da breddegraden —
 *     regnet gjennom for 20 000 nordiske punkter, riktig hver gang. Ruta
 *     skjulte bare øst–vest. 075 regner steget av den AVRUNDEDE breddegraden,
 *     så stempelet bare avhenger av hvilken rute funnet ligger i, og stempler
 *     eksisterende sone-funn på nytt.
 *     Migrasjonene limes inn for hånd, og koden kan ikke se om 075 er kjørt.
 *     Derfor SONE_OMGJORING_AAPEN: så lenge den er false, gjør ingen endring
 *     herfra et funn til sone-funn. (Funn lagret som sone fra kartet, går
 *     utenom denne fila — for dem er 075 selve rettingen.)
 *
 *  2. FLERE RUTER HAR INGEN BUNN ØST–VEST — heller ikke med 075. Nord–sør
 *     ligger rutekantene til alle størrelser på hele og halve kilometer, så
 *     flere ruter snevrer aldri inn til under 500 meter. Øst–vest regnes
 *     steget av rutas egen breddegrad, og den er forskjellig fra størrelse til
 *     størrelse, så kantene til to størrelser treffer ikke hverandre. Regnet
 *     gjennom for 20 000 nordiske punkter med utregningen i 075: to størrelser
 *     på samme funn (5 og 3 km) ga under 500 meter øst–vest for vel 1 % av
 *     funnene, alle femten på glidebryteren for over halvparten — og under
 *     100 meter for 2–3 %. Tallene regnes ut på nytt av
 *     __tests__/sonerute-migrasjon.test.ts.
 *     Derfor kan rutestørrelsen ikke endres etter at funnet er lagret:
 *     planleggeren avviser det uansett hva bryteren står på. Posisjonen kan
 *     heller ikke endres (parseFindingPatch), så et funn har nøyaktig ÉN rute
 *     hele livet — den det ble lagret med, eller den det får første gang det
 *     gjøres om til sone (da med størrelsen raden alt står med).
 *
 * Ruta og et tidligere tilfeldig punkt er fortsatt to opplysninger om samme
 * sted, og sier til sammen mer enn hver for seg. Det gjelder enhver endring av
 * et funn som alt har vært delt, og er grunnen til at arket sier at
 * innstrammingen virker framover.
 *
 * HVORFOR updated_at OG IKKE EN TELLER I MINNET
 * Angrepet er per FUNN, så bremsen må være det også — en grense per bruker
 * ville stoppet den som rydder tretti funn en vinterkveld, og likevel sluppet
 * gjennom syttito runder i døgnet på ett funn. Og den må overleve at
 * serverinstansen byttes: rate-limiteren i src/lib/rate-limit er per instans
 * og nullstilles ved kaldstart. `updated_at` settes av triggeren
 * `findings_updated_at` (001) ved HVER oppdatering og ligger i raden.
 *
 * Prisen er at også et rettet notat starter klokka: updated_at sier ikke hva
 * som ble endret. Det er med vilje den strenge veien — funnet blir i verste
 * fall stående privat et døgn lenger enn eieren ville.
 *
 * DET DETTE IKKE LØSER
 * Ett nytt punkt i døgnet er en brems, ikke en lås: den som deler omtrentlig
 * på nytt hver dag i en måned, har lagt ut tretti punkter. Den varige fiksen
 * er å lagre det første jitter-punktet på raden og bruke det om igjen — det
 * krever en migrasjon og er meldt til eieren som oppfølging.
 *
 * Breddegrader som alt er lest ut av sone-funn stemplet før 075, er ute. Verken
 * migrasjonen eller denne fila kan ta dem tilbake.
 *
 * Bremsen står dessuten i RUTA, ikke i databasen. RLS lar eieren oppdatere sin
 * egen rad direkte, og to forespørsler i samme øyeblikk leser samme
 * updated_at. Ingen av delene er en vei en observatør kan gå — bare eieren
 * selv, og bare med vilje — men det er enda en grunn til at den varige fiksen
 * hører hjemme i triggeren.
 *
 * Ren modul: klokka sendes inn, så både ruta og «Endre deling»-arket (som
 * viser regelen FØR brukeren trykker) regner likt og kan testes uten Date.
 */

export const DELING_KARANTENE_TIMER = 24;
const KARANTENE_MS = DELING_KARANTENE_TIMER * 60 * 60 * 1000;

/**
 * Kan et lagret funn gjøres om til sone-funn herfra?
 *
 * FALSE til migrasjon 075 er bekreftet kjørt i produksjon. Før den røper
 * sone-stempelet funnets eksakte breddegrad (se «SONERUTA» over), og å gjøre
 * et funn om til sone ville lagt ut mer enn den omtrentlige prikken det
 * erstatter.
 *
 * Slås på slik, i denne rekkefølgen:
 *  1. Eieren limer inn supabase/migrations/075_sonerute_uten_breddegradslekkasje.sql.
 *  2. Raden 075 i spørringen i docs/migrasjoner-a-kjore.md svarer `true`, og
 *     statusen i tabellen der skrives om til «kjørt» med dato.
 *  3. Denne settes til true. Testen i __tests__/delingsendring.test.ts leser
 *     hovedboka og feiler hvis steg 2 mangler.
 *
 * Rutestørrelsen kan ikke endres uansett hva denne står på.
 */
export const SONE_OMGJORING_AAPEN = false;

/** Kolonnene planleggeren leser. Ruta henter nøyaktig disse. */
export interface FunnForEndring {
  visibility: string;
  is_zone_finding: boolean | null;
  zone_label: string | null;
  zone_precision_km: number | null;
  species_id: number | null;
  species_name_override: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * Det som faktisk skrives. Bare kolonner som endrer verdi er med.
 * zone_precision_km mangler med vilje: rutestørrelsen skrives aldri herfra.
 */
export interface FunnOppdatering {
  visibility?: Visibility;
  is_zone_finding?: boolean;
  zone_label?: string | null;
  species_id?: number | null;
  species_name_override?: string | null;
  notes?: string | null;
}

/** Hvorfor en sone-endring ble avvist — se «SONERUTA» i filhodet. */
export type SoneStengtGrunn =
  /** Funnet er ikke sone, og omgjøring til sone er ikke åpnet (SONE_OMGJORING_AAPEN). */
  | 'omgjoring'
  /** Patchen ber om en annen rutestørrelse enn raden står med. Aldri lov. */
  | 'storrelse';

export type Endringsplan =
  /** Ingenting er forskjellig fra raden. Skal ikke nå databasen. */
  | { type: 'uendret' }
  /** Endringen legger ut noe nytt, og funnet er endret for nylig. */
  | { type: 'karantene'; tidligstMs: number }
  /** Endringen ville lagt ut en sone-rute som ikke er trygg å legge ut. Ingenting skrives. */
  | { type: 'sone-stengt'; grunn: SoneStengtGrunn }
  | {
      type: 'skriv';
      verdier: FunnOppdatering;
      fra: DelingsnivaValg;
      til: DelingsnivaValg;
      /** En av kolonnene triggeren vokter endres, så display_* stemples på nytt. */
      restempler: boolean;
      /** Stemplingen trekker et nytt tilfeldig punkt. */
      nyttJitter: boolean;
    };

/**
 * Delingsnivået slik brukeren kjenner det. Samme grener som `public_findings`:
 * privat (eller en ukjent verdi, som viewet heller ikke slipper ut) vises ikke
 * for noen; et sone-funn vises som rute; ellers eksakt eller omtrentlig.
 */
export function delingsnivaFor(row: Pick<FunnForEndring, 'visibility' | 'is_zone_finding'>): DelingsnivaValg {
  if (row.visibility !== 'public' && row.visibility !== 'approximate') return 'private';
  if (row.is_zone_finding === true) return 'zone';
  return row.visibility;
}

/** Bruker funnet et tilfeldig punkt nå? Bare da kan gjentatt stempling lekke. */
export function brukerJitter(row: Pick<FunnForEndring, 'visibility' | 'is_zone_finding'>): boolean {
  return delingsnivaFor(row) === 'approximate';
}

/**
 * Når kan funnet tidligst deles åpnere? `null` = nå.
 *
 * Et funn som aldri er oppdatert (updated_at mangler eller er lik created_at —
 * begge settes av samme NOW() ved innsetting) har ingen karantene.
 */
export function tidligstNyAapning(
  row: Pick<FunnForEndring, 'created_at' | 'updated_at'>,
  naaMs: number
): number | null {
  if (!row.updated_at) return null;
  const endret = Date.parse(row.updated_at);
  if (Number.isNaN(endret)) return null;
  if (row.created_at && Date.parse(row.created_at) === endret) return null;
  const tidligst = endret + KARANTENE_MS;
  return tidligst > naaMs ? tidligst : null;
}

/**
 * Må en overgang fra `fra` til `til` vente på karantenen?
 *
 * Delt med «Endre deling»-arket, som gråer ut valget i stedet for å la
 * brukeren trykke og få nei.
 *
 * Svarer bare for karantenen. Om et funn i det hele tatt kan bli sone, avgjør
 * kanBliSone.
 */
export function kreverKarantene(fra: DelingsnivaValg, til: DelingsnivaValg): boolean {
  if (fra === til) return false;
  // Det eksakte punktet legges ut.
  if (til === 'public') return true;
  // Et nytt tilfeldig punkt legges ut. Fra offentlig er det en innstramming.
  if (til === 'approximate') return fra !== 'public';
  // Privat legger ikke ut noe. Sone legger ut funnets ene rute — den samme
  // hver gang, så det er ingenting å bremse (se «SONERUTA» i filhodet).
  return false;
}

/**
 * Kan et funn som står på nivået `fra`, stå som sone-funn etter endringen?
 *
 * Et funn som alt ER sone, kan bli stående (og få nytt navn): det legger ikke
 * ut noe som ikke alt ligger ute. Alle andre må vente på bryteren.
 *
 * Delt med «Endre deling»-arket, som ikke viser sone som et valg når svaret er
 * nei.
 */
export function kanBliSone(fra: DelingsnivaValg, omgjoringAapen: boolean): boolean {
  return fra === 'zone' || omgjoringAapen;
}

/**
 * `soneOmgjoringAapen` sendes inn av samme grunn som klokka: funksjonen er ren,
 * og begge utfall kan testes. Ruta sender SONE_OMGJORING_AAPEN.
 */
export function planleggFunnEndring(
  row: FunnForEndring,
  patch: FindingPatch,
  naaMs: number,
  soneOmgjoringAapen: boolean
): Endringsplan {
  const verdier: FunnOppdatering = {};
  const fra = delingsnivaFor(row);
  let til = fra;
  let restempler = false;

  if (patch.deling) {
    const { visibility, isZoneFinding, zoneLabel, zonePrecisionKm } = patch.deling;
    til = delingsnivaFor({ visibility, is_zone_finding: isZoneFinding });

    if (til === 'zone') {
      // Sjekkes FØR noe annet: en sone-endring som ikke er trygg, skal stoppe
      // hele patchen — også notatet som fulgte med — slik karantenen gjør.
      if (!kanBliSone(fra, soneOmgjoringAapen)) {
        return { type: 'sone-stengt', grunn: 'omgjoring' };
      }
      // En utelatt størrelse betyr «den raden står med», og det er den eneste
      // som er lov. Å sende den samme er ingen endring.
      if (zonePrecisionKm !== undefined && zonePrecisionKm !== row.zone_precision_km) {
        return { type: 'sone-stengt', grunn: 'storrelse' };
      }
    }

    if (visibility !== row.visibility) {
      verdier.visibility = visibility;
      restempler = true;
    }
    if (isZoneFinding !== (row.is_zone_finding === true)) {
      verdier.is_zone_finding = isZoneFinding;
      restempler = true;
    }
    if (isZoneFinding) {
      if (zoneLabel !== row.zone_label) verdier.zone_label = zoneLabel;
    } else if (row.zone_label != null) {
      // Et sonenavn som blir stående ville fortsatt gått ut: public_findings
      // viser zone_label for ALLE delte funn, ikke bare sonene.
      verdier.zone_label = null;
    }
    // zone_precision_km skrives aldri — verken uten sone (se parseFindingPatch)
    // eller med (se «SONERUTA» i filhodet).
  }

  if (patch.speciesId !== undefined && patch.speciesId !== row.species_id) {
    verdier.species_id = patch.speciesId;
  }
  if (patch.speciesNameOverride !== undefined && patch.speciesNameOverride !== row.species_name_override) {
    verdier.species_name_override = patch.speciesNameOverride;
  }
  if (patch.notes !== undefined && patch.notes !== row.notes) {
    verdier.notes = patch.notes;
  }

  if (Object.keys(verdier).length === 0) return { type: 'uendret' };

  if (kreverKarantene(fra, til)) {
    const tidligstMs = tidligstNyAapning(row, naaMs);
    if (tidligstMs !== null) return { type: 'karantene', tidligstMs };
  }

  return { type: 'skriv', verdier, fra, til, restempler, nyttJitter: restempler && til === 'approximate' };
}
