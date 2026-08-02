/**
 * Hvordan `edibility_notes` skal presenteres på artssiden.
 *
 * BAKGRUNNEN. Artssiden rendret feltet KUN når arten var `conditionally_edible`.
 * 45 arter merket `edible` har skrevet, kvalitetssikret og deployet
 * `edibility_notes` i produksjonsdatabasen, og ingen av dem har noen gang vært
 * synlig. Blant det som var skjult:
 *
 *   Grønnkremle        «OBS: hold den klart adskilt fra grønn fluesopp»
 *   Vintersopp         «VIKTIG: forveksles med dødelig flatklokkehatt»
 *   Snøballsjampinjong «må holdes klart adskilt fra dødelig grønn/hvit fluesopp»
 *
 * Noen hadde tenkt gjennom nettopp disse forvekslingene, formulert dem og lagt
 * dem i basen. Én betingelse i en JSX-blokk skjulte alt sammen.
 *
 * DERFOR: notatet vises ALLTID når det finnes. Denne funksjonen avgjør bare
 * hvor kraftig det skal se ut.
 *
 * HVORFOR IKKE BARE GJØRE ALT GULT. Fordi «Stek på lav varme» i en
 * advarselsboks lærer brukeren å overse advarselsbokser. Den dagen det står noe
 * som faktisk betyr noe, er farven allerede brukt opp. Alarmtretthet er en reell
 * sikkerhetsrisiko, ikke en estetisk innvending.
 *
 * HVORFOR IKKE LETE ETTER FARLIGE ORD I TEKSTEN. Fordi det slår feil begge
 * veier. Rødgul piggsopp har notatet «Kan ikke lett forveksles med giftige
 * arter» — det inneholder både «forveksles» og «giftige», og betyr det
 * motsatte. Vi bruker derfor STRUKTUR (spiselighetsklassen og om arten faktisk
 * har en kritisk forvekslingsart i basen) pluss forfatterens EGNE eksplisitte
 * markører «OBS:» og «VIKTIG:», som er utvetydige.
 *
 * Merk at feil tone aldri er en sikkerhetsfeil her: teksten rendres uansett.
 * Det verste utfallet er at et notat ser roligere ut enn det fortjener — ikke at
 * det forsvinner. Det er en bevisst egenskap ved designet.
 */

export type EdibilityNoteTone = 'warning' | 'info';

/** Forfatterens egne markører. Utvetydige, i motsetning til å lete etter «giftig». */
const AUTHOR_MARKERS = ['obs:', 'viktig:', 'viktigt:'];

export interface EdibilityNoteInput {
  edibility?: string | null;
  notes?: string | null;
  /** Har arten en forvekslingsrad med danger_level 'critical'? */
  hasCriticalLookAlike?: boolean;
}

/**
 * `null` betyr «ingen boks» — det er bare tilfelle når det ikke finnes noe
 * notat i det hele tatt. Finnes teksten, vises den.
 */
export function edibilityNoteTone({
  edibility,
  notes,
  hasCriticalLookAlike = false
}: EdibilityNoteInput): EdibilityNoteTone | null {
  const text = notes?.trim() ?? '';
  if (!text) return null;

  if (edibility === 'conditionally_edible') return 'warning';
  if (hasCriticalLookAlike) return 'warning';

  const lower = text.toLowerCase();
  if (AUTHOR_MARKERS.some((marker) => lower.includes(marker))) return 'warning';

  return 'info';
}
