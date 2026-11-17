import { ImageResponse } from 'next/og';
import { sesongtilstand } from '@/lib/sesong/sesongtilstand';
import { hentRegioner } from './hent-regioner';
import { samlebilde } from './samlebilde';

/**
 * Delingsbildet for samlesiden: det beste området i Norge og i Sverige, med
 * tallet. Tegningen og begrunnelsen for at bildet er likt for begge språk står
 * i samlebilde.tsx — skrapere sender ingen språkcookie, så bildet kan ikke
 * følge leseren slik siden gjør.
 *
 * Samme flate-tegning som områdebildene (se [omrade]/opengraph-image.tsx) —
 * ingen fonter eller eksterne ressurser å feile på, og URL-en versjoneres av
 * sidens generateMetadata (?d=rasterdato) så delinger alltid får dagens bilde.
 *
 * Ingen `export const alt` her: siden setter openGraph.images selv (for
 * versjoneringen), og da sender Next aldri ut filas egen alt-tekst. Den
 * settes der bildet lenkes — openGraph.images[].alt i page.tsx, på leserens
 * språk.
 */

// Må være en bokstavelig verdi (Next leser segment-konfig statisk) — hold den
// lik SOPPFORHOLD_REVALIDATE i hent-regioner.ts.
export const revalidate = 3600;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OgBilde() {
  // Dommene og artsnavnene i svaret er på norsk, men bildet bruker ingen av
  // dem — bare områdenavn og tall. Derfor ett kall, uten språk.
  const { tileDate, regions } = await hentRegioner();
  return new ImageResponse(
    samlebilde({ tileDate, regions, iHovedsesong: sesongtilstand(new Date()).iHovedsesong }),
    size
  );
}
