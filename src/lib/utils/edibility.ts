import type { Edibility } from '@/types/species';

const KNOWN: Edibility[] = ['edible', 'conditionally_edible', 'inedible', 'toxic', 'deadly'];

/**
 * Normalize a raw edibility string (from the species catalog or the AI
 * identifier) to a known Edibility. ANYTHING unrecognized or missing becomes
 * 'unknown' — never silently 'inedible' — so an uncertain result is treated as
 * potentially dangerous rather than as harmless "don't eat but safe". This is
 * the safety-critical default for the AI identify flow, where Kindwise can
 * return species outside our curated catalog with no mapped edibility.
 */
export function normalizeEdibility(value: string | null | undefined): Edibility {
  return value && (KNOWN as string[]).includes(value) ? (value as Edibility) : 'unknown';
}

/**
 * True when an edibility must trigger the red danger warning (+ Giftinformasjonen):
 * toxic, deadly, OR unknown/missing. Unproven edibility is treated as dangerous.
 * 'inedible' and 'conditionally_edible' are NOT dangerous (known, not poisonous).
 */
export function isDangerousEdibility(value: string | null | undefined): boolean {
  const e = normalizeEdibility(value);
  return e === 'toxic' || e === 'deadly' || e === 'unknown';
}
