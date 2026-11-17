import { baseSeasonMask, isMonthInMask, type SeasonSpecies } from '@/lib/utils/season-region';

/**
 * Er arten i sesong i en gitt måned?
 *
 * Svarer med SAMME vindu som årstabellen i kalenderen, artssidene, forsidens
 * «matsopp i sesong» og «i sesong nå»-filteret (`baseSeasonMask`):
 * katalogmånedene utvidet med det empiriske vinduet fra de daterte funnene.
 * Ikke en regel til — bare den ene, med et ærlig «vet ikke».
 *
 * HVORFOR DEN FINNES. /api/prediction/regions regnet `leadingInSeason` på
 * katalogmånedene alene (`season_start`/`season_end`). De er dokumentert for
 * smale (season-region.ts: 9 % av de daterte funnene ligger utenfor dem,
 * piggsopp 37,5 %), og rasteret bruker dem heller ikke: fra april til november
 * scorer cell-score.ts på fenologikurven. Feltet sa derfor «utenfor sesong» om
 * arten rasteret selv satte øverst — piggsopp i august (katalog sep–nov), svart
 * trompetsopp i august (sep–okt), kantarell i juni og oktober (jul–sep) — og
 * /soppforhold droppet artssetningen midt i høysesongen, rett over dommen «Nå
 * er det piggsopp 🍄», mens kalenderen i samme app viste arten som i sesong.
 *
 * `null` betyr UKJENT, ikke «utenfor»: arten finnes ikke, katalogen har ingen
 * måneder for den, eller måneden er ikke 1–12. Sidene skjuler artssetningen bare
 * på et uttrykkelig `false` (visArtslinje i src/app/soppforhold/hent-regioner.ts).
 *
 * Vinduet er hele Nordens, ikke breddegradsbåndets. Det er det artssiden og
 * årstabellen viser, så områdesiden og sidene den peker videre til sier det
 * samme. Båndet kan bare legge til måneder (sperre A i season-region.ts), så
 * dette valget kan utelate setningen en måned for mye, aldri skrive en usann.
 *
 * Ren: ingen klokke leses her. Kalleren sender måneden — for regionsendepunktet
 * rasterdatoens måned, så feltet følger tallene det står ved siden av.
 */

/** Feltene `baseSeasonMask` trenger, men med måneder som kan mangle. */
export type ArtMedSesong = Pick<SeasonSpecies, 'id' | 'edibility'> & {
  season_start: number | null | undefined;
  season_end: number | null | undefined;
};

/** `true`/`false` etter kalenderens vindu for måneden (1–12); `null` når det ikke kan avgjøres. */
export function erArtISesong(art: ArtMedSesong | null | undefined, maaned: number): boolean | null {
  if (!art) return null;
  const { id, edibility, season_start, season_end } = art;
  if (season_start == null || season_end == null) return null;
  // isMonthInMask klemmer 0 → januar og 13 → desember. Et ugyldig tall skal
  // ikke bli til et svar om en annen måned.
  if (!Number.isInteger(maaned) || maaned < 1 || maaned > 12) return null;
  return isMonthInMask(baseSeasonMask({ id, edibility, season_start, season_end }), maaned);
}
