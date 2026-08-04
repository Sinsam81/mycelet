/**
 * Reglene for tekst som skal leses av noen som står i skogen med en sopp i hånda.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ EN FELTTEST KAN DØMME ET FUNN UTE. DEN KAN ALDRI FRIKJENNE DET.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dette er den dyrest kjøpte lærdommen i artsarbeidet. Forvekslingsdataene i
 * migrasjon 048 og 049 tok TRE motprøverunder, og feilen var den samme hver gang
 * — den flyttet seg bare til et nytt kjennetegn:
 *
 *   runde 1:  «mild smak = gråmusserong»
 *             Galt. Den GIFTIGE pantermusserongen smaker også mildt og lukter mel.
 *
 *   runde 2:  «bare hatt, skiver og voksested kan frikjenne»
 *             «hvitt betyr hulriske, vannklart betyr lakrisriske»
 *             «gir ingen forgiftning hvis du holder deg unna alkohol»
 *             hvitt sporeavtrykk lest som BEKREFTELSE på blå ridderhatt
 *             Alle fire leses av en nybegynner som «da er jeg trygg».
 *
 *   runde 3:  hver test gjort ensrettet.
 *
 * Grunnen til at frikjennelse er farligere enn utelatelse: utelater vi en
 * advarsel, står brukeren igjen med sin egen usikkerhet — som er en trygg
 * tilstand, for da lar folk soppen stå. Frikjenner vi feil, har vi ERSTATTET
 * usikkerheten med falsk trygghet, og da havner soppen i kurven.
 *
 * Skriver du ny forvekslingstekst:
 *   ALLTID  «ser du X, er funnet ute»
 *   ALDRI   «ser du Y, er du trygg»
 */

/**
 * Formuleringer som gjør en felttest frikjennende.
 *
 * Listen er bevisst konservativ — den skal fange den FARLIGE konstruksjonen, ikke
 * enhver setning som nevner trygghet. «Mild smak frikjenner ingen musserong» skal
 * gå gjennom; «er smaken mild, er du trygg» skal ikke.
 */
export const FRIKJENNENDE_MØNSTRE: ReadonlyArray<{ mønster: RegExp; hvorfor: string }> = [
  {
    mønster: /\b(er|blir|har)\s+du\s+trygg\b/i,
    hvorfor: 'lover brukeren trygghet basert på ett kjennetegn'
  },
  {
    mønster: /\b(er|så er)\s+(den|soppen|funnet)\s+trygg\b/i,
    hvorfor: 'erklærer funnet trygt — ingen felttest kan det'
  },
  {
    mønster: /\bkan\s+du\s+(trygt\s+)?spise\b/i,
    hvorfor: 'oppfordrer til å spise på grunnlag av et kjennetegn'
  },
  {
    mønster: /\bgir\s+ingen\s+forgiftning\b(?![^.]*\buansett\b)/i,
    hvorfor: 'friskmelder arten på en betingelse brukeren selv skal oppfylle'
  },
  {
    mønster: /\bbare\s+[^.]{0,60}\bkan\s+(det|frikjenne)\b/i,
    hvorfor: 'peker ut ett trekk som kan frikjenne — ingen kan det'
  },
  {
    mønster: /\bda\s+(vet|kan)\s+du\s+at\s+(den|du)\s+er\s+(trygg|spiselig)\b/i,
    hvorfor: 'positiv identifikasjon presentert som avgjort'
  }
];

/** Finner frikjennende formuleringer i en forvekslingstekst. Tom liste = i orden. */
export function finnFrikjennendeFormuleringer(
  tekst: string
): Array<{ treff: string; hvorfor: string }> {
  const funn: Array<{ treff: string; hvorfor: string }> = [];
  for (const { mønster, hvorfor } of FRIKJENNENDE_MØNSTRE) {
    const m = tekst.match(mønster);
    if (m) funn.push({ treff: m[0], hvorfor });
  }
  return funn;
}

/**
 * Faregrader der teksten MÅ ende i en handling brukeren kan utføre.
 *
 * En advarsel som beskriver faren men ikke sier hva man skal gjøre, etterlater
 * valget hos noen som nettopp har fått vite at de er usikre. «La den stå» er det
 * eneste rådet som alltid er trygt.
 */
export const KREVER_HANDLING: ReadonlyArray<string> = ['critical', 'high'];

const HANDLINGSFRASER = [/la\s+(den\s+)?stå/i, /kast\b/i, /la\s+stå/i, /ikke\s+spis/i];

/** True når teksten avsluttes med et handlingsråd. */
export function harHandlingsråd(tekst: string): boolean {
  return HANDLINGSFRASER.some((f) => f.test(tekst));
}
