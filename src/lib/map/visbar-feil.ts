/**
 * Feil som er TRYGGE Å VISE — og alt annet, som ikke er det.
 *
 * Kartets popup lever i en løsrevet React-rot. Kartet eier handlingene
 * (slette, melde, blokkere), og popupen viser det de kaster. Den viste
 * `error.message` rått, og avtalen om at kartet alltid kaster ferdig oversatt
 * tekst sto bare i en kommentar: et `fetch` som ryker uten dekning, kaster
 * nettleserens egen engelske «Load failed» eller «Failed to fetch», og den
 * havnet rett i popupen.
 *
 * Nå er avtalen en type. Kartet kaster `VisbarFeil` med tekst fra katalogen
 * eller fra vår egen servers lokaliserte `error`; popupen viser meldingen bare
 * når feilen er merket slik, og ellers sin egen katalogtekst.
 *
 * Merket leses som et felt, ikke med instanceof: popupen og kartet kan få
 * hver sin kopi av modulen (egen React-rot, Turbopack-deling), og da svarer
 * instanceof nei på en feil som er helt riktig merket.
 */
export class VisbarFeil extends Error {
  readonly visbar = true as const;

  constructor(melding: string) {
    super(melding);
    this.name = 'VisbarFeil';
  }
}

/** Meldingen hvis feilen er merket som trygg å vise og ikke er tom, ellers reserven. */
export function visbarTekst(feil: unknown, reserve: string): string {
  if (
    typeof feil === 'object' &&
    feil !== null &&
    (feil as { visbar?: unknown }).visbar === true &&
    typeof (feil as { message?: unknown }).message === 'string' &&
    (feil as { message: string }).message.trim() !== ''
  ) {
    return (feil as { message: string }).message;
  }
  return reserve;
}
