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
 * ── FRISTEN I E-POSTEN ER ETT DØGN FØR, MED KLOKKESLETT ─────────────────────
 *
 * Apple forsøker fornyelsen i løpet av de siste 24 timene FØR
 * `expiration_at_ms` (kjøpsvilkårene sier det samme: slå av fornyelse
 * senest 24 timer før). En e-post som bare nevner prøveslutt-datoen ville
 * sendt kunden til innstillingene kvelden før — etter at trekket alt var
 * forsøkt. Derfor regner avslutningsfrist() ut prøveslutt minus ett døgn og
 * gir Oslo-dag og hel time (rundet NED, så «senest kl. 07» aldri er senere
 * enn Apples tidligste forsøk). Teksten sier fristen først, datoen etterpå.
 *
 * ── «GRATISUKA» BARE NÅR DET VAR EN UKE ─────────────────────────────────────
 *
 * Apples introduksjonstilbud og tilbudskoder kan være 3 dager, 2 uker eller
 * en måned, og RevenueCat leverer dem alle som TRIAL → trialing. Lengden
 * leses fra `current_period_start` (webhooken skriver purchased_at_ms dit);
 * er den 6–8 dager, sier e-posten «gratisuka», ellers den nøytrale
 * «prøveperioden» — og mangler startdatoen, det nøytrale. Aldri et tall
 * raden motsier.
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
 *     Cronen RESERVERER raden før den sender og sletter den om sendingen
 *     feiler — så en rad som står der, betyr sendt (eller en feilet sending
 *     som ikke fikk frigitt reservasjonen, og det logges som feil).
 */

export const PAAMINNELSE_KANAL = 'revenuecat' as const;

/** Dager igjen som utløser sending: 3 er planen, 2 er innhenting. Aldri 1 eller 0. */
export const PAAMINNELSE_DAGER: ReadonlyArray<number> = [3, 2];

/** Feltene fra billing_subscriptions beslutningen leser — samme navn som kolonnene. */
export interface AppProveRad {
  user_id: string;
  tier?: string | null;
  status: string | null;
  /** Prøvestart (RevenueCats purchased_at_ms). Valgfri: eldre kall og rader uten den gir «prøveperioden», ikke «gratisuka». */
  current_period_start?: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  metadata: Record<string, unknown> | null;
}

export type AppProveBeslutning =
  | {
      send: false;
      grunn: 'ikke-revenuecat' | 'ikke-prove' | 'sandkasse' | 'allerede-sagt-opp' | 'prove-slutt-passert' | 'utenfor-vinduet' | 'allerede-sendt';
    }
  | {
      send: true;
      dagerIgjen: number;
      /** Prøveslutt som Oslo-dato — nøkkelen i sendt-tabellen og i svartokenet. */
      proveSlutt: string;
      /** Selve tidspunktet (current_period_end), for fristen i teksten. */
      proveSluttMs: number;
      /** Hele dager fra prøvestart til prøveslutt; null når startdatoen mangler. */
      proveLengdeDager: number | null;
    };

/** «Gratisuka» bare når prøven faktisk var en uke (6–8 dager tåler klokkeslett og sommertid). Ukjent lengde = ikke en uke. */
export function erGratisuke(proveLengdeDager: number | null): boolean {
  return proveLengdeDager !== null && proveLengdeDager >= 6 && proveLengdeDager <= 8;
}

const OSLO_DAG_OG_TIME = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Oslo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23'
});

/**
 * Siste sjanse til å avslutte uten trekk: prøveslutt minus 24 timer, som
 * Oslo-dag og hel time rundet ned. Apple kan forsøke fornyelsen når som
 * helst i det siste døgnet, så fristen må ligge FØR det døgnet begynner.
 */
export function avslutningsfrist(proveSluttMs: number): { dag: string; time: number } {
  const deler = OSLO_DAG_OG_TIME.formatToParts(new Date(proveSluttMs - 24 * 3600_000));
  const del = (type: string) => deler.find((p) => p.type === type)?.value ?? '';
  return { dag: `${del('year')}-${del('month')}-${del('day')}`, time: Number(del('hour')) };
}

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

  const proveStart = proveSluttDag(rad.current_period_start);
  return {
    send: true,
    dagerIgjen,
    proveSlutt,
    proveSluttMs: new Date(rad.current_period_end as string).getTime(),
    proveLengdeDager: proveStart === null ? null : dagerMellom(proveStart, proveSlutt)
  };
}
