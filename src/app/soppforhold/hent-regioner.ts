import { regionBand } from '@/lib/prediction/region-score';

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

export async function hentRegioner(
  locale: 'nb' | 'sv' = 'nb'
): Promise<{ tileDate: string | null; regions: SoppforholdRegion[] }> {
  try {
    // ?locale=sv gir svenske dommer og svenske artsnavn fra API-et, og gjør
    // samtidig locale til en del av cache-nøkkelen (egen URL → egen oppføring),
    // så svensk og norsk aldri kan servere hverandres tekst.
    const url = `${SOPPFORHOLD_BASE}/api/prediction/regions${locale === 'sv' ? '?locale=sv' : ''}`;
    const res = await fetch(url, { next: { revalidate: SOPPFORHOLD_REVALIDATE } });
    if (!res.ok) return { tileDate: null, regions: [] };
    const data = (await res.json()) as { tileDate?: string; regions?: SoppforholdRegion[] };
    return { tileDate: data.tileDate ?? null, regions: data.regions ?? [] };
  } catch {
    // Sidene skal vises selv om beregningen er nede — da uten tall, med en
    // ærlig beskjed i stedet for en tom skjerm eller en feilside.
    return { tileDate: null, regions: [] };
  }
}

/**
 * Tailwind-klassen for scorefargen.
 *
 * Båndet utledes av regionens egen dommestige, ikke av `forecastBand` — den er
 * kalibrert på punkt-dagscorer fra mushroom-day (median 86) og gav derfor gul
 * prikk til tall som samtidig fikk topp-dommen i tekst. Farge og tekst leser nå
 * samme stige, som er hele poenget med å ha én.
 */
export function farge(score: number): string {
  const band = regionBand(score);
  if (band === 'green') return 'bg-forest-600';
  if (band === 'amber') return 'bg-amber-500';
  return 'bg-gray-400';
}

/** Hex-utgaven til delingsbildene, der Tailwind ikke finnes. */
export function fargeHex(score: number): string {
  const band = regionBand(score);
  if (band === 'green') return '#4d7c3a';
  if (band === 'amber') return '#f59e0b';
  return '#9ca3af';
}

export function norskDato(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** Datoen på sidens eget språk: «12. august 2026» (NO) / «12 augusti 2026» (SE). */
export function datoTekst(iso: string | null, land: 'NO' | 'SE'): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(land === 'SE' ? 'sv-SE' : 'nb-NO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
