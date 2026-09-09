/**
 * Prøvetilbudet i kartet: når skal arket «Start gratis uke» vises?
 *
 * Bakgrunn (9. september 2026): 76 brukere, 21 hadde brukt kartet siden
 * lørdag, null hadde startet gratisuka — og i appen var nesten alle Premium-
 * lenker skjult bak NonNativeOnly fra tiden før kjøp i app fantes. Arket er
 * det ene stedet tilbudet blir vist til en som nettopp har fått verdi.
 *
 * Reglene er bevisst strenge, fordi et tilbud som maser koster mer enn det
 * gir: vises bare til gratisbrukere, bare når en av to ting har skjedd
 * («viser 3 av 12» i lovende områder, eller kartet brukt på to ulike dager),
 * aldri to ganger samme døgn, og aldri mer enn to ganger totalt.
 */

export const PROVETILBUD_NOKKEL = 'mycelet:provetilbud-v1';
export const KARTDAGER_NOKKEL = 'mycelet:kartdager-v1';
export const PROVETILBUD_MAKS_VISNINGER = 2;
export const PROVETILBUD_MIN_MELLOMROM_MS = 24 * 3600_000;

export interface ProvetilbudTilstand {
  visninger: number;
  sistVistMs: number | null;
}

export type ProvetilbudUtloser = 'begrenset' | 'andre-dag';

export function tolkProvetilbud(raw: string | null | undefined): ProvetilbudTilstand {
  if (!raw) return { visninger: 0, sistVistMs: null };
  try {
    const j = JSON.parse(raw) as Partial<ProvetilbudTilstand>;
    const visninger = typeof j.visninger === 'number' && j.visninger >= 0 ? Math.floor(j.visninger) : 0;
    const sistVistMs = typeof j.sistVistMs === 'number' && Number.isFinite(j.sistVistMs) ? j.sistVistMs : null;
    return { visninger, sistVistMs };
  } catch {
    return { visninger: 0, sistVistMs: null };
  }
}

/** Kartdager (Oslo-datoer) lagret lokalt — bare for «andre dag»-utløseren. */
export function leggTilKartdag(raw: string | null | undefined, dag: string): string[] {
  let dager: string[] = [];
  try {
    const j = raw ? JSON.parse(raw) : [];
    if (Array.isArray(j)) dager = j.filter((d): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  } catch {
    dager = [];
  }
  if (!dager.includes(dag)) dager.push(dag);
  return dager.slice(-60);
}

export function skalViseProvetilbud(args: {
  betaler: boolean;
  betalingKjent: boolean;
  tilstand: ProvetilbudTilstand;
  utloser: ProvetilbudUtloser | null;
  naaMs: number;
}): boolean {
  if (!args.betalingKjent || args.betaler) return false;
  if (!args.utloser) return false;
  if (args.tilstand.visninger >= PROVETILBUD_MAKS_VISNINGER) return false;
  if (args.tilstand.sistVistMs !== null && args.naaMs - args.tilstand.sistVistMs < PROVETILBUD_MIN_MELLOMROM_MS) return false;
  return true;
}

export function registrerVisning(tilstand: ProvetilbudTilstand, naaMs: number): ProvetilbudTilstand {
  return { visninger: tilstand.visninger + 1, sistVistMs: naaMs };
}
