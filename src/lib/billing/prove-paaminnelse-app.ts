import { osloDag } from '@/lib/bruk/bruksdag';

/**
 * Påminnelsen før første belastning for prøver kjøpt i App Store — ren
 * beslutning, uten I/O. Cronen /api/cron/prove-paaminnelse-app leser radene
 * og sender; teksten ligger i prove-paaminnelse.ts (byggAppProvePaaminnelseEpost).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR EN CRON OG IKKE EN WEBHOOK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * På nett sender Stripe `trial_will_end` tre dager før, og webhooken svarer
 * med e-posten. Apple sender ingenting før et introduksjonstilbud
 * konverterer, og RevenueCat videresender bare det Apple sender. Det første
 * kunden merker er belastningen — og en refusjonsforespørsel er dyrere for
 * alle enn en kunde som avsluttet i tide. Så dagen må regnes ut her, hver
 * morgen, fra `current_period_end` på raden (= prøveslutt så lenge status
 * er trialing; RevenueCat-webhooken skriver `expiration_at_ms` dit).
 *
 * ── VINDUET: 3 DAGER, OG 2 SOM INNHENTING ───────────────────────────────────
 *
 * Sendes når det er 3 dager igjen — samme avstand som Stripe. Går den
 * morgenen tapt (cronen feilet, e-posten ble avvist, migrasjonen kom en dag
 * for sent), sendes den ved 2 dager igjen i stedet. Aldri ved 1 eller 0:
 * da er «vil du ikke fortsette, avslutter du …» et råd kunden ikke rekker å
 * følge før trekket, og en påminnelse som kommer etter belastningen er en
 * regning, ikke en påminnelse. Sendt-tabellen (prove_paaminnelser) sørger
 * for at samme prøveslutt aldri får to e-poster, uansett hvor mange morgener
 * raden står i vinduet.
 *
 * Dagene regnes i Oslo-datoer (Norge og Sverige har samme sone), som
 * bruksdagene: «3 dager igjen» er tre kalenderdager fra i dag til
 * prøveslutt-datoen, ikke 72 timer. En prøve som slutter 26. september
 * kl. 07 og en som slutter kl. 23 får e-posten samme morgen.
 *
 * ── HVA SOM HOPPES OVER, OG HVORFOR ─────────────────────────────────────────
 *
 *   · ikke-revenuecat: Stripe-prøver får sin e-post fra webhooken; gavepass
 *     med status trialing er ikke en prøve som ender i et trekk.
 *   · ikke-prove: bare status trialing med en prøveslutt-dato.
 *   · sandkasse: rc_environment SANDBOX er testkjøp (TestFlight, App Review)
 *     — Apple belaster aldri, og en e-post om et trekk som ikke kommer er
 *     usann.
 *   · allerede-sagt-opp: cancel_at_period_end betyr at kunden alt avsluttet
 *     i App Store. Da kommer ingen belastning, og «belastes Apple-ID-en din»
 *     ville vært feil. (RevenueCats CANCELLATION under TRIAL holder status
 *     trialing og setter flagget — se revenuecat.ts.)
 *   · allerede-sendt: samme bruker, kanal og prøveslutt-dato finnes i
 *     prove_paaminnelser. Flytter prøveslutt seg (ny prøve etter en gammel,
 *     forlenget periode), er nøkkelen ny og e-posten sendes for den.
 */

export const PAAMINNELSE_KANAL = 'revenuecat' as const;

/** Dager igjen som utløser sending: 3 er planen, 2 er innhenting. Aldri 1 eller 0. */
export const PAAMINNELSE_DAGER: ReadonlyArray<number> = [3, 2];

/** Feltene fra billing_subscriptions beslutningen leser — samme navn som kolonnene. */
export interface AppProveRad {
  user_id: string;
  tier?: string | null;
  status: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  metadata: Record<string, unknown> | null;
}

export type AppProveBeslutning =
  | {
      send: false;
      grunn: 'ikke-revenuecat' | 'ikke-prove' | 'sandkasse' | 'allerede-sagt-opp' | 'prove-slutt-passert' | 'utenfor-vinduet' | 'allerede-sendt';
    }
  | { send: true; dagerIgjen: number; proveSlutt: string };

export const ALLE_GRUNNER: ReadonlyArray<Exclude<AppProveBeslutning, { send: true }>['grunn']> = [
  'ikke-revenuecat',
  'ikke-prove',
  'sandkasse',
  'allerede-sagt-opp',
  'prove-slutt-passert',
  'utenfor-vinduet',
  'allerede-sendt'
];

/** Prøveslutt som Oslo-dato («2026-09-26»), eller null når tidsstempelet ikke er en dato. */
export function proveSluttDag(currentPeriodEnd: string | null | undefined): string | null {
  if (!currentPeriodEnd) return null;
  const ms = new Date(currentPeriodEnd).getTime();
  if (!Number.isFinite(ms)) return null;
  return osloDag(new Date(ms));
}

/** Hele kalenderdager fra `fraDag` til `tilDag` (begge YYYY-MM-DD). Negativt når `tilDag` er passert. */
export function dagerMellom(fraDag: string, tilDag: string): number {
  const fra = Date.parse(`${fraDag}T00:00:00Z`);
  const til = Date.parse(`${tilDag}T00:00:00Z`);
  return Math.round((til - fra) / 86_400_000);
}

/** Nøkkelen i sendt-settet: bruker + prøveslutt-dato. Kanalen er alltid revenuecat her. */
export function sendtNokkel(userId: string, proveSlutt: string): string {
  return `${userId}|${proveSlutt}`;
}

export function bestemAppProvePaaminnelse(rad: AppProveRad, iDag: string, sendt: ReadonlySet<string>): AppProveBeslutning {
  const meta = rad.metadata ?? {};
  if (meta.provider !== 'revenuecat') return { send: false, grunn: 'ikke-revenuecat' };
  const proveSlutt = proveSluttDag(rad.current_period_end);
  if (rad.status !== 'trialing' || proveSlutt === null) return { send: false, grunn: 'ikke-prove' };
  if (typeof meta.rc_environment === 'string' && meta.rc_environment.toUpperCase() === 'SANDBOX') {
    return { send: false, grunn: 'sandkasse' };
  }
  if (rad.cancel_at_period_end === true) return { send: false, grunn: 'allerede-sagt-opp' };

  const dagerIgjen = dagerMellom(iDag, proveSlutt);
  if (dagerIgjen < 0) return { send: false, grunn: 'prove-slutt-passert' };
  if (!PAAMINNELSE_DAGER.includes(dagerIgjen)) return { send: false, grunn: 'utenfor-vinduet' };
  if (sendt.has(sendtNokkel(rad.user_id, proveSlutt))) return { send: false, grunn: 'allerede-sendt' };

  return { send: true, dagerIgjen, proveSlutt };
}
