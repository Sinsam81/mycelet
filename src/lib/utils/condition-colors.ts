import { scoreToCondition } from '@/lib/utils/prediction';
import { DISTINCT_SCORE_DELTA } from '@/lib/prediction/area-report';

/**
 * One colour table for everything on the map that is coloured by score.
 *
 * Before this existed the map used two contradictory scales at once. The pills
 * and rings ran green-for-good, while `getHeatColor` ran dark red at 80+ and
 * lime green below 40 — a heat ramp, borrowed from temperature maps, where the
 * hottest colour means the highest value. On a mushroom map that reads as
 * "green = go here", so the best ground was painted with the colour users take
 * to mean "nothing here", right next to green pills meaning the opposite.
 *
 * Keyed to the same buckets as scoreToCondition, so a green pin, a green ring
 * and a green circle always mean the same thing.
 *
 * `hex` is for Leaflet, which cannot take Tailwind classes. `dot` and `text` are
 * for React. `ink` is the readable foreground on top of `hex`.
 */
export const CONDITION_COLORS = {
  poor: { hex: '#9CA3AF', dot: 'bg-gray-400', text: 'text-gray-700', ink: '#1F2937' },
  moderate: { hex: '#FBBF24', dot: 'bg-amber-400', text: 'text-amber-700', ink: '#1F2937' },
  good: { hex: '#5E9440', dot: 'bg-forest-500', text: 'text-forest-800', ink: '#FFFFFF' },
  excellent: { hex: '#4A7C2E', dot: 'bg-forest-600', text: 'text-forest-900', ink: '#FFFFFF' }
} as const;

export type ConditionKey = keyof typeof CONDITION_COLORS;

export function colorForScore(score: number) {
  return CONDITION_COLORS[scoreToCondition(score)];
}

/** Dekkevnen den svakest scorende ruta i utsnittet tegnes med. Aldri 0 — se under. */
const MIN_FILL_OPACITY = 0.12;
/** Dekkevnen den best scorende ruta i utsnittet tegnes med. */
const MAX_FILL_OPACITY = 0.55;
/** Brukes når alle rutene i utsnittet har samme score, og det ikke finnes noe å gradere. */
const FLAT_FILL_OPACITY = 0.22;

/**
 * FARGEN ER ABSOLUTT, DEKKEVNEN ER RELATIV TIL UTSNITTET.
 *
 * To forsøk før dette bommet, begge fordi de brukte samme absolutte skala til
 * begge deler:
 *
 *  1. Flate 0,13 for alt. Ingen kontrast i det hele tatt.
 *  2. Fast dekkevne per bøtte (0,05/0,15/0,38/0,52). Verre: dekkevnen ble slått
 *     opp med scoreToCondition, altså NØYAKTIG SAMME fire bøtter som fargen.
 *     Er fargen konstant, er dekkevnen konstant — den andre kanalen kan per
 *     konstruksjon ikke gi oppløsning der den første mangler den.
 *
 * Og fargen ER konstant, fordi bøttene er bredere enn variasjonen på én skjerm.
 * Målt mot ekte fliser 2026-08-02, med den kollapsen kartet faktisk tegner
 * (beste art per rute, top-80): score-spennet INNE i ett utsnitt har median
 * 7 poeng, mens den smaleste bøtta er 10 poeng bred. Følgen er at 68 % av
 * dagens utsnitt er ensfargede ved standard zoom, og 85 % ved den zoomen kartet
 * lander på etter posisjonsbestemmelse — altså mobilbruk. All variasjonen ligger
 * MELLOM dager og regioner, som brukeren aldri ser side om side.
 *
 * Forsøk 2 hadde i tillegg en egen feil: med terskel 50 er 78 % av de tegnede
 * rutene «poor», og de ble malt på 0,05. I 64 % av utsnittene var HVER rute
 * poor, så hele laget forsvant — fra «alt ser likt ut» til «det er ingenting
 * der». (Kommentaren her påsto 47/42/7/4 %; det var målt på alle artsrader, ikke
 * på beste-art-per-rute som kartet tegner. Riktig er 78/15/5/2 %.)
 *
 * Derfor: normaliser mot rutene som faktisk er på skjermen. Da finnes det alltid
 * kontrast å se, uansett hvor smalt spennet er — og ingenting forsvinner, fordi
 * bunnen er 0,12 og ikke 0.
 *
 * Ærligheten ligger i FARGEN, som fortsatt er absolutt: et utsnitt der alt er
 * svakt blir helgrått med de minst dårlige rutene tydeligst. Vi sier ikke at de
 * er gode — dommen over ruta sier «Lite kantarell i skogen nå» — vi sier bare
 * hvilke av dem som er minst dårlige. Det er en rangering, ikke en spådom, og
 * det er den eneste romlige påstanden valideringen bærer (AUC ~0,52).
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TREDJE FORSØK: ABSOLUTT GULV, RELATIV KONTRAST OPPÅ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Forsøk 3 (ren normalisering mot utsnittet, bunn 0,12) løste synligheten, men
 * skapte en ny feil: SAMME RUTE SKIFTET UTSEENDE NÅR BRUKEREN PANORERTE.
 * Dekkevnen ble regnet mot min og maks blant rutene som tilfeldigvis var på
 * skjermen, og rutene lastes på nytt ved hver `moveend`.
 *
 * Målt på et typisk utsnitt: en rute på 52 tegnes 0,12 når utsnittet spenner
 * 52-58, og 0,35 så snart brukeren drar kartet så en rute på 45 kommer med —
 * nesten tre ganger så synlig, uten at noe er beregnet på nytt. Samme skog,
 * samme dag, samme score.
 *
 * Forsvaret var at «ærligheten ligger i FARGEN, som er absolutt». Men målingen
 * rett over sier at 68 % av utsnittene er ENSFARGEDE ved standard zoom og 85 %
 * ved mobil-zoom. I nettopp de tilfellene bærer fargen null informasjon, og det
 * eneste brukeren ser er den relative dekkevnen. Da er forsvaret tomt.
 *
 * Løsningen er ikke å velge én av dem, men å dele oppgaven:
 *
 *   gulv per bøtte  →  hvor bra ruta er I SEG SELV (kan ikke endres av panorering)
 *   relativt påslag →  hvilke ruter i utsnittet som er best (maks 0,16)
 *
 * En «good»-rute kan dermed aldri tegnes svakere enn 0,32 uansett hva annet som
 * er på skjermen, og panorering kan flytte den med høyst 0,16. Gulvene ligger
 * høyt nok til at ingenting forsvinner — det var feilen i forsøk 2, der «poor»
 * fikk 0,05 og hele laget ble borte i de 64 % av utsnittene der alt var poor.
 *
 * Er spennet under støyterskelen appen selv bruker (DISTINCT_SCORE_DELTA = 8),
 * gis INGEN relativ gradering. Da sa kartet før at én av tolv «lovende områder»
 * var fire ganger mer lovende enn en annen — mens popupen på den svakeste sa
 * «Området skiller seg lite fra nabolaget». Tegningen påsto en rangering teksten
 * i samme popup nektet for.
 */
/**
 * Gulvene er valgt så to eksisterende krav fortsatt holder:
 * ingen rute under 0,12 (under det forsvinner den over et detaljert topokart),
 * og ingen over 0,55 (over det blir bakgrunnskartet uleselig).
 * 0,40 + 0,15 = 0,55 er derfor taket.
 */
const BUCKET_FLOOR: Record<ConditionKey, number> = {
  poor: 0.12,
  moderate: 0.22,
  good: 0.32,
  excellent: 0.4
};
/** Hvor mye den relative plasseringen i utsnittet får flytte en rute. */
const RELATIVE_SPAN = 0.15;

export function fillOpacitiesForScores(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const spread = max - min;
  const floor = (s: number) => BUCKET_FLOOR[scoreToCondition(s)];

  // Under støyterskelen finnes det ingen rangering å tegne. Bare gulvet.
  if (spread < DISTINCT_SCORE_DELTA) return scores.map(floor);

  return scores.map((s) => floor(s) + ((s - min) / spread) * RELATIVE_SPAN);
}

/**
 * Dekkevnen for ÉN score, uten et utsnitt å måle mot. Brukes av kodeveier som
 * tegner et enkelt punkt (reservesirkelen), der det ikke finnes noe sett å
 * normalisere i. Kartlaget skal bruke fillOpacitiesForScores i stedet — en
 * absolutt skala per rute var nettopp feilen som gjorde laget usynlig.
 */
export function fillOpacityForScore(score: number): number {
  const condition = scoreToCondition(score);
  if (condition === 'excellent') return MAX_FILL_OPACITY;
  if (condition === 'good') return 0.4;
  if (condition === 'moderate') return 0.26;
  return MIN_FILL_OPACITY;
}
