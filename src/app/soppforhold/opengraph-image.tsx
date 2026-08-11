import { ImageResponse } from 'next/og';
import { fargeHex, hentRegioner, norskDato } from './hent-regioner';

/**
 * Delingsbildet for samlesiden: dagens beste norske område + tallet. Samme
 * flate-tegning som områdebildene (se [omrade]/opengraph-image.tsx) — ingen
 * fonter eller eksterne ressurser å feile på, og URL-en versjoneres av sidens
 * generateMetadata (?d=rasterdato) så delinger alltid får dagens bilde.
 */

// Må være en bokstavelig verdi (Next leser segment-konfig statisk) — hold den
// lik SOPPFORHOLD_REVALIDATE i hent-regioner.ts.
export const revalidate = 3600;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Dagens soppforhold i Norge og Sverige, oppdatert daglig';

export default async function OgBilde() {
  const { tileDate, regions } = await hentRegioner();
  const beste = regions.filter((r) => r.country === 'NO')[0] ?? null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          backgroundColor: '#1A3409',
          color: '#ffffff',
          padding: 64,
          fontFamily: 'sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 56, height: 34, borderRadius: 28, backgroundColor: '#f5f1e6' }} />
            <div style={{ width: 18, height: 20, marginTop: -4, borderRadius: 6, backgroundColor: '#e9e2d0' }} />
          </div>
          <div style={{ display: 'flex', fontSize: 40 }}>Mycelet</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', fontSize: 72, lineHeight: 1.15 }}>
            Soppforhold i Norge i dag
          </div>
          {beste ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginTop: 6 }}>
              <div style={{ display: 'flex', fontSize: 40, color: '#cfe0c2' }}>Best akkurat nå:</div>
              <div style={{ display: 'flex', fontSize: 56 }}>{beste.name}</div>
              <div style={{ display: 'flex', fontSize: 56, color: fargeHex(beste.score) }}>
                {beste.score}
              </div>
              <div style={{ display: 'flex', fontSize: 36, color: '#cfe0c2' }}>av 100</div>
            </div>
          ) : (
            <div style={{ display: 'flex', fontSize: 40, color: '#cfe0c2' }}>22 områder, oppdatert hver morgen</div>
          )}
          <div style={{ display: 'flex', fontSize: 32, color: '#cfe0c2', marginTop: 4 }}>
            {regions.length > 0 ? `${regions.length} områder i Norge og Sverige` : ''}
            {tileDate ? ` · ${norskDato(tileDate)}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#cfe0c2' }}>
          <div style={{ display: 'flex' }}>Vær og sesong for området, ikke skogen der du står</div>
          <div style={{ display: 'flex' }}>mycelet.com/soppforhold</div>
        </div>
      </div>
    ),
    size
  );
}
