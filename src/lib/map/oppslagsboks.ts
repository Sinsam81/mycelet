/**
 * Boksen et rutenett regnes ut fra, festet til presisjonen eksterne
 * stedsoppslag faktisk trenger.
 *
 * HVORFOR
 * «⭐ Lovende» legger en boks rundt et utgangspunkt og ber /api/prediction/grid
 * om et rutenett over den. Utgangspunktet er som regel enhetens GPS-posisjon —
 * ofte der brukeren står i sitt eget soppsted — og ruta slår opp vær, skog og
 * høyde hos eksterne tjenester for punkter regnet ut fra boksen. Midtpunktet i
 * boksen ER utgangspunktet: det gikk med full presisjon til værleverandøren
 * (prøven midt i boksen) og til skog- og høydeoppslaget (midtruta).
 * Produktløftet er at hemmelige soppsteder ikke forlater appen; se
 * src/lib/privacy/provider-precision.ts for regelen de andre rutene alt følger.
 *
 * HVORFOR MIDTPUNKTET, OG IKKE HVERT OPPSLAGSPUNKT
 * Skogen prøves i rutas midtpunkt og, når det ikke er skog der, i fire
 * kvadrantpunkter ±¼ rute unna (src/lib/prediction/skogprover.ts). Rundes
 * hvert punkt for seg til tre desimaler, klapper kvadrantpunktene sammen når
 * rutene er små, og prøvetakingen blir en annen. Flyttes hele boksen som én
 * enhet, ligger hvert punkt nøyaktig like langt fra de andre som før, og det
 * eneste punktet som VAR enhetens posisjon — midtpunktet — har tre desimaler.
 *
 * Kartet runder dessuten utgangspunktet FØR det regner ut boksen
 * (generateTopSpots i MushroomMap.tsx), så det eksakte punktet står heller ikke
 * i URL-en. Denne funksjonen er serverens egen sikring: den gjelder uansett
 * hvem som kaller ruta.
 *
 * Forskyvningen er høyst en halv tusendels grad (~55 m nord–sør, ~28 m
 * øst–vest i Norden). Rutene i «Lovende» er minst 1,4 km brede.
 */

import { roundForProviderLookup } from '@/lib/privacy/provider-precision';

export interface Oppslagsboks {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** Samme boks, samme størrelse — med midtpunktet rundet til oppslagspresisjonen. */
export function festBoksTilOppslagspresisjon(boks: Oppslagsboks): Oppslagsboks {
  const midt = roundForProviderLookup((boks.minLat + boks.maxLat) / 2, (boks.minLng + boks.maxLng) / 2);
  const halvLat = (boks.maxLat - boks.minLat) / 2;
  const halvLng = (boks.maxLng - boks.minLng) / 2;
  return {
    minLat: midt.lat - halvLat,
    minLng: midt.lon - halvLng,
    maxLat: midt.lat + halvLat,
    maxLng: midt.lon + halvLng
  };
}
