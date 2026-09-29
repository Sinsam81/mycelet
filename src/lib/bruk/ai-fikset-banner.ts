/**
 * Banneret «AI-soppkjenneren er fikset» — regelen for når det vises.
 *
 * Bakgrunn: fra mai til 29. september 2026 fikk ALLE som prøvde
 * AI-identifiseringen «Identifikasjon feilet» (ruta sendte to parametre i
 * kroppen som Kindwise vil ha i URL-en, PR #280). Vi vet ikke hvem som
 * prøvde — feilede kall ble ikke lagret før migrasjon 073 — så beskjeden må
 * gå til alle som åpner appen, ikke til en liste. Et banner i appen krever
 * ingen samtykke; e-post til gratisbrukere ville vært markedsføring i
 * markedsføringslovens forstand.
 *
 * Ærlig tekst med vilje: det står at det ikke virket, ikke «ny og bedre».
 *
 * Vises på forsiden (innlogget) og på /identify, til og med BANNER_TIL, og
 * aldri igjen for den som har lukket det (localStorage per enhet). Datoen
 * er hard: etter tre uker har de som bruker appen sett det, og et banner
 * som står i månedsvis blir en del av tapetet.
 */

/** Siste dag banneret vises (Oslo-dato, inklusiv). */
export const AI_FIKSET_BANNER_TIL = '2026-10-20';

/** Nøkkelen i localStorage. Datoen i navnet gjør et senere banner til et nytt. */
export const AI_FIKSET_BANNER_KEY = 'mycelet:ai-fikset-2026-09-29';

/**
 * @param osloDag dagens dato som YYYY-MM-DD
 * @param lukket  verdien i localStorage, eller null når den ikke finnes / ikke kan leses
 */
export function skalViseAiFiksetBanner(osloDag: string, lukket: string | null): boolean {
  if (lukket === '1') return false;
  return osloDag <= AI_FIKSET_BANNER_TIL;
}
