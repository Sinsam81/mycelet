/**
 * Reglene for automatisk sletting av inaktive kontoer, skilt ut fra
 * Edge-funksjonen så de kan testes uten Deno.
 *
 * Personvernerklæringen (Personvern.retentionInactiveDesc) lover:
 *
 *   «hvis du ikke logger inn på 3 år, sender vi en e-post-advarsel og
 *    sletter kontoen automatisk 90 dager senere hvis du ikke svarer.»
 *
 * Setningen har to ledd, og rekkefølgen er hele poenget: FØRST varselet,
 * SÅ de 90 dagene. Funksjonen slettet tidligere på `scheduled_deletion_at`
 * alene. Er RESEND_API_KEY ikke satt — eller feiler ett enkelt send —
 * returnerer sendEmail bare {ok:false}, varselraden blir stående med
 * warning_email_sent = false, og kontoen ble likevel slettet 90 dager
 * senere. Da hadde vi slettet en konto uten å varsle den, stikk i strid
 * med det brukeren har fått vite.
 *
 * Vaktene her er skrevet slik at den utrygge feilen ikke kan skje: uten
 * bekreftet e-post slettes ingenting. Feilmodusen blir «ingenting slettes,
 * og kvitteringen viser hvorfor» — som er synlig og reparerbar.
 */

export const INACTIVE_THRESHOLD_DAYS = 365 * 3;
export const GRACE_PERIOD_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DeletionWarning {
  user_id: string;
  warned_at: string;
  scheduled_deletion_at: string;
  warning_email_sent: boolean;
}

/** Når 90-dagersfristen løper ut, målt fra det tidspunktet varselet faktisk gikk ut. */
export function graceDeadline(warnedAt: Date): Date {
  return new Date(warnedAt.getTime() + GRACE_PERIOD_DAYS * DAY_MS);
}

/** Grensen for «har ikke logget inn på tre år». */
export function inactiveCutoff(now: Date): Date {
  return new Date(now.getTime() - INACTIVE_THRESHOLD_DAYS * DAY_MS);
}

/** Har brukeren vært innom etter at varselet ble sendt? Da skal klokka stoppes. */
export function hasSignedInSince(
  lastSignInAt: string | null | undefined,
  warnedAt: string
): boolean {
  if (!lastSignInAt) return false;
  return new Date(lastSignInAt) > new Date(warnedAt);
}

/**
 * Varslene som venter på at e-posten skal ut. Nye rader havner her fordi
 * de settes inn med warning_email_sent = false, og gamle rader blir her til
 * e-post faktisk er satt opp — så oppsettet reparerer seg selv når nøkkelen
 * kommer på plass.
 */
export function selectAwaitingEmail(warnings: DeletionWarning[]): DeletionWarning[] {
  return warnings.filter((warning) => !warning.warning_email_sent);
}

/**
 * Kontoene som faktisk skal slettes nå: varselet MÅ være sendt, og fristen
 * MÅ ha løpt ut. Er e-posten ikke sendt, er ikke løftet innfridd, og da
 * venter vi — uansett hvor gammel raden er.
 */
export function selectDueForDeletion(warnings: DeletionWarning[], now: Date): DeletionWarning[] {
  return warnings.filter(
    (warning) =>
      warning.warning_email_sent && new Date(warning.scheduled_deletion_at).getTime() < now.getTime()
  );
}
