/**
 * Ligger prøvetilbudsarket over skjermen akkurat nå?
 *
 * Arket (ProvGratisArk) er en portal til <body> med z-1100 og dekker hele
 * flata. Andre flater som vil si noe til brukeren må vite om det — ellers
 * stiller vi to spørsmål oppå hverandre i samme sekund. «Følg området ditt»-
 * stripa i forsidekortet er den første som trenger det, og dag null er nettopp
 * dagen begge vil snakke: arket kommer 600 ms etter at kortet har data.
 *
 * En teller, ikke et flagg: React kan i teorien ha to ark montert i samme
 * bilde (forsiden og kartet), og StrictMode monterer alt to ganger i utvikling.
 * Hendelsen lar den som lytter oppdatere seg når arket åpnes eller lukkes.
 */

export const TILBUDSARK_ENDRET_EVENT = 'mycelet:tilbudsark-endret';

let apne = 0;

function varsle() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(TILBUDSARK_ENDRET_EVENT));
}

/** Kalles av arket ved mount. Returnerer opprydningen (bruk den som useEffect-retur). */
export function meldTilbudsarkApent(): () => void {
  apne += 1;
  varsle();
  return () => {
    apne = Math.max(0, apne - 1);
    varsle();
  };
}

export function erTilbudsarkApent(): boolean {
  return apne > 0;
}

/** Bare for tester: nullstill telleren mellom kjøringer. */
export function nullstillTilbudsark(): void {
  apne = 0;
}
