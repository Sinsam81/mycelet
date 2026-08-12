import { ImageResponse } from 'next/og';
import { regionFromSlug } from '@/lib/prediction/region-slug';
import { fargeHex, hentRegioner, norskDato } from '../hent-regioner';

/**
 * Delingsbildet for områdesidene: det som vises når lenka limes inn i en
 * gruppetråd, en melding eller en e-post. Uten dette er delingen ren tekst;
 * med dette er hver deling en liten plakat med dagens tall.
 *
 * Tegnes med enkle flater (ingen fonter å laste, ingen eksterne bilder) så den
 * genereres raskt og aldri feiler på manglende ressurser. (Satori bunter kun
 * én fontvekt — fet skrift finnes ikke her, hierarkiet bæres av størrelse.)
 *
 * Bildet og siden er to UAVHENGIGE cache-oppføringer. Koblingen som gjør at en
 * deling viser samme dag som siden, er at sidens generateMetadata versjonerer
 * bilde-URL-en med rasterdatoen (?d=ÅÅÅÅ-MM-DD) — ny dag gir ny URL, og både
 * vår cache og delings-skraperne henter da ferskt bilde. Ikke fjern den
 * versjoneringen uten å løse koblingen på en annen måte.
 */

// Må være en bokstavelig verdi (Next leser segment-konfig statisk) — hold den
// lik SOPPFORHOLD_REVALIDATE i hent-regioner.ts.
export const revalidate = 3600;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Dagens soppforhold for området, som tall fra 0 til 100';

export default async function OgBilde({ params }: { params: Promise<{ omrade: string }> }) {
  const { omrade } = await params;
  const regionDef = regionFromSlug(omrade);
  // Samme regel som siden: bare norske områder foreløpig (se page.tsx).
  if (!regionDef || regionDef.country !== 'NO') {
    return new Response('Ikke funnet', { status: 404 });
  }
  const { tileDate, regions } = await hentRegioner();
  const region = regions.find((r) => r.name === regionDef.name) ?? null;

  const navn = regionDef.name;
  const scoreTekst = region ? String(region.score) : '–';
  const bandFarge = region ? fargeHex(region.score) : '#9ca3af';

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
          {/* Soppmerket, tegnet med flater: lys hatt over kort stilk. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 56, height: 34, borderRadius: 28, backgroundColor: '#f5f1e6' }} />
            <div style={{ width: 18, height: 20, marginTop: -4, borderRadius: 6, backgroundColor: '#e9e2d0' }} />
          </div>
          <div style={{ display: 'flex', fontSize: 40 }}>Mycelet</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', fontSize: 34, color: '#cfe0c2' }}>
            Soppforhold i dag{tileDate ? ` · ${norskDato(tileDate)}` : ''}
          </div>
          <div style={{ display: 'flex', fontSize: 84, lineHeight: 1.1 }}>{navn}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 8 }}>
            <div style={{ display: 'flex', fontSize: 150, color: '#ffffff' }}>{scoreTekst}</div>
            <div style={{ display: 'flex', fontSize: 44, color: '#cfe0c2' }}>av 100</div>
          </div>
          <div style={{ display: 'flex', width: 480, height: 18, borderRadius: 9, backgroundColor: '#2c4a1a' }}>
            <div
              style={{
                display: 'flex',
                width: region ? Math.max(24, (region.score / 100) * 480) : 24,
                height: 18,
                borderRadius: 9,
                backgroundColor: bandFarge
              }}
            />
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
