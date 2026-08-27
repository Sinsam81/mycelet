import { regionBand, regionBandHex } from '@/lib/prediction/region-score';

/**
 * Delt datagrunnlag for /soppforhold-sidene (samlesiden, områdesidene og
 * delingsbildene). Alle leser samme svar fra /api/prediction/regions, men
 * sidene og bildene er UAVHENGIGE cache-oppføringer — det som holder en deling
 * i takt med siden sin, er at sidenes generateMetadata versjonerer
 * bilde-URL-ene med rasterdatoen (?d=ÅÅÅÅ-MM-DD). Se opengraph-image-filene.
 */

/**
 * Sidene er server-rendret og henter sitt eget API, så URL-en må være absolutt
 * — en relativ sti har ingen base på serversiden.
 *
 * ⚠️ I LOKAL DEV MÅ DEN PEKE PÅ LOKAL SERVER. Sto tidligere hardkodet til
 * produksjon, og da viste /soppforhold prod-data uansett hva du endret lokalt:
 * en endring i dommene ga et API-svar med ny tekst og en side med gammel, på
 * samme maskin. Feilen så ut som at endringen ikke virket.
 *
 * Bare `development` skiller seg ut. Preview-deployer henter fortsatt fra
 * produksjon — det er med vilje: et bygg som henter sin egen ennå ikke
 * ferdigdeployede URL har et høna-og-egget-problem, og innholdet er uansett
 * det samme rasteret.
 */
export const SOPPFORHOLD_BASE =
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : 'https://www.mycelet.com';

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
  return regionBandHex(score);
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
