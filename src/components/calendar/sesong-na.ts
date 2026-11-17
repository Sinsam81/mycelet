import { sesongfaseForManed } from '@/lib/sesong/sesongtilstand';
import { isDangerousEdibility } from '@/lib/utils/edibility';
import {
  comparePeakFirst,
  isMonthInMask,
  nextArrivalMonth,
  seasonMask,
  type LatitudeBand,
  type SeasonSpecies
} from '@/lib/utils/season-region';

/**
 * Hva kalenderens øverste del viser en gitt måned — regnet ut her, tegnet i
 * SeasonNow.tsx.
 *
 * TO FEIL DETTE RETTER
 *
 * 1. Matsopp og dødelige arter sto i samme alfabetiske liste, som like hvite
 *    kort. I november: Ametystsopp først, og flatklokkehatt (dødelig) mellom
 *    falsk kantarell og frostvokssopp, bare skilt ut av merket. Årstabellen
 *    under nekter bevisst farlige arter den grønne fargen; lista over den
 *    gjorde ikke forskjell. Nå deles den i to:
 *
 *      `iSesong`         alt som IKKE er farlig, med artene i toppsesong først
 *      `farligeISesong`  giftig, dødelig eller ukjent spiselighet — egen blokk
 *
 *    Skillet er `isDangerousEdibility`, så ukjent spiselighet havner på den
 *    farlige siden. De farlige sorteres aldri på toppsesong og får aldri
 *    «Topp-sesong»-merket: «topp» leses som en anbefaling.
 *
 * 2. «Kommer snart» så bare én måned fram og var derfor borte fra september
 *    til februar. `nesteUt` ser så langt fram som det trengs (desember →
 *    april), med de samme maskene som lista over, så de to aldri kan si imot
 *    hverandre. Unntaket er høysesongen (august–oktober): da er over 70 arter
 *    ute, og «neste ut: april» er sant, men støy. Kommer det noe allerede neste
 *    måned, vises det uansett, som før.
 *
 * Maskene går gjennom `seasonMask`, så sperrene i season-region.ts gjelder
 * også framover: en posisjon kan bare legge til måneder, og en farlig art får
 * aldri regionjustering — sandmorkelen kan ikke bli «neste ut» en måned
 * tidligere fordi brukeren står i sør.
 *
 * Alt er månedsgrovt fordi datagrunnlaget er det. Ingen datoer, og ingenting
 * her sier at en art faktisk står der brukeren er.
 *
 * Rent: måneden sendes inn (Oslo-tid, fra sesongtilstand på serveren).
 */

/** Det utregningen trenger av en art. */
export interface SesongNaArt extends SeasonSpecies {
  peak_season_start: number | null;
  peak_season_end: number | null;
}

export interface NesteUt<T> {
  /** Måneden (1–12) artene kommer i sesong. */
  maaned: number;
  /** 1 = neste måned, opptil 11. */
  manederFram: number;
  /** Ufarlige arter først, så de farlige — hver gruppe i rekkefølgen den kom inn. */
  arter: T[];
}

export interface SesongNa<T> {
  /** I sesong og ikke farlige. Toppsesong først, ellers rekkefølgen de kom inn i. */
  iSesong: T[];
  /** I sesong, og giftige, dødelige eller av ukjent spiselighet. */
  farligeISesong: T[];
  /** Det neste som kommer i sesong, eller `null` når det ikke er noe å vise. */
  nesteUt: NesteUt<T> | null;
}

const erFarlig = (art: SesongNaArt) => isDangerousEdibility(art.edibility);

/**
 * @param arter  sortert slik de skal vises (navnet leseren ser) — rekkefølgen beholdes
 * @param maaned 1–12
 * @param band   breddegradsbåndet til brukeren, eller `null` uten posisjon
 */
export function sesongNa<T extends SesongNaArt>(
  arter: readonly T[],
  maanedInn: number,
  band: LatitudeBand | null
): SesongNa<T> {
  // Maskene klemmer selv 0 → januar og 13 → desember. Avstanden til neste
  // ankomst regnes med vanlig aritmetikk, så måneden klemmes likt her.
  const maaned = Number.isFinite(maanedInn) ? Math.max(1, Math.min(12, Math.round(maanedInn))) : maanedInn;
  const masker = new Map(arter.map((art) => [art.id, seasonMask(art, band)]));
  const erUte = (art: T, iManed: number) => isMonthInMask(masker.get(art.id) ?? 0, iManed);

  const ute = arter.filter((art) => erUte(art, maaned));
  const iSesong = ute.filter((art) => !erFarlig(art)).sort(comparePeakFirst(maaned));
  const farligeISesong = ute.filter(erFarlig);

  return { iSesong, farligeISesong, nesteUt: finnNesteUt(arter, maaned, masker.values(), erUte) };
}

function finnNesteUt<T extends SesongNaArt>(
  arter: readonly T[],
  maaned: number,
  masker: Iterable<number>,
  erUte: (art: T, iManed: number) => boolean
): NesteUt<T> | null {
  const ankomst = nextArrivalMonth(masker, maaned);
  if (ankomst == null) return null;

  const manederFram = (ankomst - maaned + 12) % 12;
  if (manederFram > 1 && sesongfaseForManed(maaned) === 'hoysesong') return null;

  // Ankomsten er den NÆRMESTE måneden noe kommer i sesong, så en art som ikke
  // er ute nå, men er det da, har ikke vært innom sesong i mellomtiden.
  const kommer = arter.filter((art) => !erUte(art, maaned) && erUte(art, ankomst));
  return {
    maaned: ankomst,
    manederFram,
    arter: [...kommer.filter((art) => !erFarlig(art)), ...kommer.filter(erFarlig)]
  };
}
