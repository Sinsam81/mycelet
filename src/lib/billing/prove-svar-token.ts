import { createHmac, timingSafeEqual } from 'crypto';
import type { ProveSvarValg } from './prove-paaminnelse';

/**
 * Tokenet i svarlenkene nederst i App Store-påminnelsen
 * («Hva var viktigst for deg i uka?» → GET /api/prove/svar?t=…&valg=…).
 *
 * ── HVA DET SKAL KLARE ──────────────────────────────────────────────────────
 *
 * Ett trykk fra en e-post på en telefon der brukeren kanskje ikke er logget
 * inn, uten at lenka røper noe: ingen adresse, ingen innlogging, og ingen
 * mulighet til å skrive et svar for noen andre. Tokenet bærer derfor
 * bruker-ID og prøveslutt (det ruta trenger for å skrive raden) pluss en
 * HMAC over de to, laget med en hemmelighet bare serveren har. Endres én
 * byte, stemmer ikke signaturen, og ruta svarer «lenken virker ikke».
 *
 * ── HVILKEN HEMMELIGHET, OG HVORFOR ─────────────────────────────────────────
 *
 * Nøkkelen AVLEDES av SUPABASE_SERVICE_ROLE_KEY: HMAC-SHA256 med et fast
 * domenenavn («mycelet/prove-svar/v1») som melding. Tre grunner:
 *
 *   · Den finnes alt overalt der cronen kjører — createAdminClient kaster
 *     uten den. En ny variabel i Vercel kunne blitt lagt inn som «Secret»
 *     og aldri nådd appen (soppvarselet gikk 19 dager stille slik), og
 *     denne påminnelsen skal virke fra første morgen.
 *   · CRON_SECRET er IKKE egnet: den sammenlignes rett mot en header i hver
 *     cron-rute, så et token laget av den ville vært ett steg fra å være
 *     cron-adgang. Avledningen her går bare én vei og gir aldri nøkkelen
 *     tilbake.
 *   · Selve tjenestenøkkelen signerer aldri noe direkte; det er den avledede
 *     nøkkelen som brukes, og domenenavnet gjør at et token herfra ikke kan
 *     gjenbrukes mot noe annet som en dag måtte avlede av samme kilde.
 *
 * Roteres tjenestenøkkelen, slutter gamle lenker å virke. Det er greit —
 * svaret er bare meningsfullt i ukene rundt prøveslutt (ruta avviser
 * lenker mer enn 30 dager etter prøveslutt uansett).
 *
 * Format: `<user_id>.<prove_slutt>.<hex-signatur>` — ren ASCII, ingen
 * URL-koding nødvendig, og bruker-ID-en er en intern UUID (den passerer
 * loggen umaskert i resten av kodebasen også).
 */

const DOMENE = 'mycelet/prove-svar/v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATO = /^\d{4}-\d{2}-\d{2}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export const PROVE_SVAR_VALG: ReadonlyArray<ProveSvarValg> = ['omrader', 'offline', 'ai'];

export function erProveSvarValg(v: unknown): v is ProveSvarValg {
  return typeof v === 'string' && (PROVE_SVAR_VALG as readonly string[]).includes(v);
}

/** Hemmeligheten tokens lages av. Null når tjenestenøkkelen mangler (da kan ingen lenke lages eller leses). */
export function proveSvarHemmelighet(): string | null {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return k && k.length > 0 ? k : null;
}

function avledetNokkel(hemmelighet: string): Buffer {
  return createHmac('sha256', hemmelighet).update(DOMENE).digest();
}

function signatur(userId: string, proveSlutt: string, hemmelighet: string): Buffer {
  return createHmac('sha256', avledetNokkel(hemmelighet)).update(`${userId.toLowerCase()}|${proveSlutt}`).digest();
}

export function lagProveSvarToken(userId: string, proveSlutt: string, hemmelighet: string): string {
  if (!UUID.test(userId)) throw new Error('lagProveSvarToken: user_id er ikke en UUID');
  if (!DATO.test(proveSlutt)) throw new Error('lagProveSvarToken: prove_slutt er ikke en dato');
  return `${userId.toLowerCase()}.${proveSlutt}.${signatur(userId, proveSlutt, hemmelighet).toString('hex')}`;
}

/** Gyldig token → bruker og prøveslutt; alt annet → null. Signaturen sammenlignes i konstant tid. */
export function lesProveSvarToken(token: string | null | undefined, hemmelighet: string): { userId: string; proveSlutt: string } | null {
  if (typeof token !== 'string' || token.length > 200) return null;
  const deler = token.split('.');
  if (deler.length !== 3) return null;
  const [userId, proveSlutt, sig] = deler;
  if (!UUID.test(userId) || !DATO.test(proveSlutt) || !HEX64.test(sig)) return null;
  // Datoen må være en ekte kalenderdag, ikke bare se ut som en («2026-13-45»).
  if (!Number.isFinite(Date.parse(`${proveSlutt}T00:00:00Z`)) || new Date(`${proveSlutt}T00:00:00Z`).toISOString().slice(0, 10) !== proveSlutt) {
    return null;
  }
  const forventet = signatur(userId, proveSlutt, hemmelighet);
  const mottatt = Buffer.from(sig, 'hex');
  if (mottatt.length !== forventet.length || !timingSafeEqual(mottatt, forventet)) return null;
  return { userId: userId.toLowerCase(), proveSlutt };
}

/** Full lenke til svar-ruta for ett valg. Språket følger med så «Takk»-siden kan vises riktig uten oppslag. */
export function proveSvarUrl(appUrl: string, token: string, valg: ProveSvarValg, locale: 'nb' | 'sv'): string {
  return `${appUrl}/api/prove/svar?t=${encodeURIComponent(token)}&valg=${valg}&sprak=${locale}`;
}
