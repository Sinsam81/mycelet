import { forecastBand } from '@/lib/utils/forecast-scale';

/**
 * Delt datagrunnlag for /soppforhold-sidene (samlesiden, områdesidene og
 * delingsbildene). Alle leser samme svar fra /api/prediction/regions, men
 * sidene og bildene er UAVHENGIGE cache-oppføringer — det som holder en deling
 * i takt med siden sin, er at sidenes generateMetadata versjonerer
 * bilde-URL-ene med rasterdatoen (?d=ÅÅÅÅ-MM-DD). Se opengraph-image-filene.
 */

export const SOPPFORHOLD_BASE = 'https://www.mycelet.com';

/** Ny beregning kommer daglig; en time er rikelig og sparer oppslag. */
export const SOPPFORHOLD_REVALIDATE = 3600;

export interface SoppforholdRegion {
  name: string;
  country: 'NO' | 'SE';
  score: number;
  cells: number;
  leadingSpecies: string | null;
  verdict: string | null;
}

export async function hentRegioner(): Promise<{ tileDate: string | null; regions: SoppforholdRegion[] }> {
  try {
    const res = await fetch(`${SOPPFORHOLD_BASE}/api/prediction/regions`, {
      next: { revalidate: SOPPFORHOLD_REVALIDATE }
    });
    if (!res.ok) return { tileDate: null, regions: [] };
    const data = (await res.json()) as { tileDate?: string; regions?: SoppforholdRegion[] };
    return { tileDate: data.tileDate ?? null, regions: data.regions ?? [] };
  } catch {
    // Sidene skal vises selv om beregningen er nede — da uten tall, med en
    // ærlig beskjed i stedet for en tom skjerm eller en feilside.
    return { tileDate: null, regions: [] };
  }
}

/** Tailwind-klassen for scorefargen (grønn/gul/grå — samme bånd som stripa). */
export function farge(score: number): string {
  const band = forecastBand(score, score >= 85);
  if (band === 'green') return 'bg-forest-600';
  if (band === 'amber') return 'bg-amber-500';
  return 'bg-gray-400';
}

/** Hex-utgaven til delingsbildene, der Tailwind ikke finnes. */
export function fargeHex(score: number): string {
  const band = forecastBand(score, score >= 85);
  if (band === 'green') return '#4d7c3a';
  if (band === 'amber') return '#f59e0b';
  return '#9ca3af';
}

export function norskDato(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}
