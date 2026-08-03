/**
 * Overskriften på forsiden — den første setningen en innlogget bruker leser.
 *
 * Den hadde fem varianter, og tre av dem endte på «… i skogen»: «Sommer i
 * skogen» (jun–jul), «Høysesong i skogen» (aug–okt) og «Stille i skogen»
 * (nov–mar). Til sammen **10 av 12 måneder** med samme setning der bare ett ord
 * er byttet.
 *
 * Årets viktigste overgang for en soppapp — 31. juli til 1. august — endret
 * «Sommer i skogen» til «Høysesong i skogen». Ni av femten tegn står stille. En
 * bruker som åpner appen 1. august ser i praksis det samme som i går.
 *
 * `headlineFewInSeason` krevde dessuten `edibleCount === 0`. Målt mot ekte
 * `mushroom_species` i produksjon (n = 72), matsopp i sesong per måned jan→des:
 *
 *     2 · 2 · 2 · 4 · 5 · 8 · 20 · 39 · 46 · 46 · 16 · 4
 *
 * Minimum over året er 2, og `baseSeasonMask` kan bare LEGGE TIL måneder. Bøtta
 * var altså uoppnåelig — samme feilklasse som tersklene på kartet og i stripen.
 *
 * Løsningen: la TALLET bære variasjonen. Det endrer seg hver måned, det er sant,
 * og det er den ene opplysningen som faktisk svarer på «er det noe å hente nå?».
 * Båndene under er lagt der tallene faktisk skifter karakter, ikke på
 * kalendergrenser.
 */

export type SeasonHeadlineKey =
  | 'headlineQuiet'
  | 'headlineSpring'
  | 'headlineStarting'
  | 'headlineSummer'
  | 'headlineHighSeason'
  | 'headlineLateAutumn';

export interface SeasonHeadline {
  key: SeasonHeadlineKey;
  /** Antall matsopp i sesong — settes når overskriften navngir det. */
  count?: number;
}

/**
 * Under dette er utvalget så tynt at det er ærligere å si det enn å ønske
 * velkommen til skogen. Målt: jan–mai ligger på 2–5, juni på 8.
 */
const SPARSE_MAX = 5;
/** Fra dette punktet er det høysesong i praksis — august treffer 39. */
const HIGH_SEASON_MIN = 30;

export function seasonHeadline(month: number, edibleCount: number): SeasonHeadline {
  const m = Math.round(month);

  // Høysesong avgjøres av utvalget, ikke av kalenderen. Et sent år flytter seg,
  // og da skal overskriften flytte seg med.
  if (edibleCount >= HIGH_SEASON_MIN) return { key: 'headlineHighSeason', count: edibleCount };

  // Våren er sin egen historie: få arter, men de er ettertraktede (morkler).
  // Derfor ikke «få sopp i sesong» selv om tallet er lavt.
  if (m >= 4 && m <= 5) return { key: 'headlineSpring' };

  if (edibleCount <= SPARSE_MAX) return { key: 'headlineQuiet', count: edibleCount };

  // Etter høysesongen faller tallet igjen, men november har fortsatt 16 arter —
  // det er ikke «stille», og det er ikke sommer.
  if (m >= 10) return { key: 'headlineLateAutumn', count: edibleCount };

  // Juni på 8 er i gang, juli på 20 er sommer for fullt.
  if (edibleCount < 15) return { key: 'headlineStarting', count: edibleCount };
  return { key: 'headlineSummer', count: edibleCount };
}
