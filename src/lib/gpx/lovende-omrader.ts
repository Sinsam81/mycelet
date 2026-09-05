import { lagGpx, type GpxVeipunkt } from './lag-gpx';

/**
 * «Lovende områder» som GPX-veipunkter — for UT.no, Garmin og Organic Maps.
 *
 * Ærlig arbeidsdeling (docs/strategi-2026-2027.md, september 2026): Mycelet
 * sier HVOR det er verdt å lete; turappene folk alt bruker lager ruten dit
 * langs stier, bedre enn vi kommer til å gjøre på lenge. Ett veipunkt per
 * område, med begrunnelsen i beskrivelsen, så den er med ut i skogen.
 *
 * Ingen personlige data: områdene er modellens, ikke brukerens funn.
 */

export interface LovendeOmrade {
  lat: number;
  lng: number;
  score: number;
  verdict?: string;
  /** Begrunnelsen slik den vises i popupen (allerede på leserens språk). */
  reasons?: string[];
}

export interface LovendeOmraderGpxValg {
  /** Valgt art (visningsnavn), eller null for «alle arter». */
  artsnavn?: string | null;
  /** Dagens dato som YYYY-MM-DD — prognosen gjelder i dag, ikke for alltid. */
  dato: string;
  locale?: 'nb' | 'sv';
}

const COPY = {
  nb: { omrade: 'Lovende område', avHundre: 'av 100', dato: 'Mycelet-vurdering' },
  sv: { omrade: 'Lovande område', avHundre: 'av 100', dato: 'Mycelet-bedömning' }
} as const;

export function byggLovendeOmraderGpx(omrader: LovendeOmrade[], valg: LovendeOmraderGpxValg): string {
  const c = COPY[valg.locale ?? 'nb'];
  const art = valg.artsnavn?.trim();
  const veipunkter: GpxVeipunkt[] = omrader.map((o, i) => ({
    latitude: o.lat,
    longitude: o.lng,
    name: `${art ? `${art} – ` : ''}${c.omrade} ${i + 1} (${Math.round(o.score)} ${c.avHundre})`,
    desc: [
      o.verdict?.trim() || null,
      // Skogtypen fra ruta er en kode («gran», «lauv», «apent»), ikke en etikett —
      // begrunnelsen over sier det samme på leserens språk.
      ...(o.reasons ?? []).map((r) => r.trim()).filter(Boolean),
      `${c.dato} ${valg.dato}`
    ]
      .filter((d): d is string => Boolean(d))
      .join(' · ')
  }));
  return lagGpx(veipunkter);
}
