import type { Circle, CircleMarker, CircleMarkerOptions, LatLngExpression } from 'leaflet';

/**
 * ET SØKEOMRÅDE, IKKE ET MÅL.
 *
 * Toppstedene ble tegnet som en nummerert nål: 28 px sirkel, hvit kant, tall
 * inni. Det er den mest presise formen et kart har — den sier «gå NØYAKTIG hit,
 * og dette er det beste av dem». Ingen av de to påstandene bæres av dataene:
 * koordinaten er senteret i en rute som er 1,4–10 km bred (se spot-area.ts), og
 * mellom to skogspunkter få kilometer fra hverandre skiller ikke modellen
 * signifikant (AUC 0,654, p = 0,44). Sindre gikk til punktene i felten og fant
 * ingenting — nettopp fordi nålen lovet et punkt.
 *
 * Her tegnes i stedet ruta slik den faktisk er samplet: en sirkel med radius =
 * halve cellebredden, uten rangeringstall.
 *
 * Formvalgene har hver sin grunn:
 * - Fyll uten hard kant. En tydelig strek lager en blink, og blinken har et
 *   midtpunkt å sikte på. Kanten er derfor stiplet og nesten gjennomsiktig —
 *   nok til å se hvor området slutter på et satellittbilde, ikke nok til å bli
 *   en grense.
 * - Midtpunktet er en liten prikk uten tall. Den finnes fordi popupen og
 *   «naviger til området» trenger et anker, ikke fordi soppen står der.
 */

/**
 * Bare det Leaflet-API-et vi bruker. Den ekte `leaflet`-default-eksporten
 * oppfyller dette, og en test kan sende inn en dobbel uten å laste Leaflet.
 * Merk at `divIcon` og `marker` med vilje IKKE er med: den nummererte nålen
 * skal ikke kunne komme tilbake gjennom denne inngangen.
 */
export interface TopSpotShapeFactory {
  circle(latlng: LatLngExpression, options?: CircleMarkerOptions): Circle;
  circleMarker(latlng: LatLngExpression, options?: CircleMarkerOptions): CircleMarker;
}

export type TopSpotAreaShapes = {
  /** Selve søkeområdet, i rutenettets oppløsning. */
  area: Circle;
  /** Diskret ankerpunkt for popup og navigasjon. */
  center: CircleMarker;
};

export function createTopSpotArea(
  leaflet: TopSpotShapeFactory,
  spot: { lat: number; lng: number },
  radiusM: number,
  color: string
): TopSpotAreaShapes {
  const area = leaflet.circle([spot.lat, spot.lng], {
    radius: radiusM,
    color,
    // Myk fyllfarge + stiplet, svak kant: området skal leses som «let her
    // omkring», ikke som en ring med et fasitpunkt i midten.
    fillColor: color,
    fillOpacity: 0.16,
    weight: 1,
    opacity: 0.3,
    dashArray: '3 7'
  });

  const center = leaflet.circleMarker([spot.lat, spot.lng], {
    radius: 3,
    color: '#ffffff',
    weight: 1,
    opacity: 0.9,
    fillColor: color,
    fillOpacity: 0.9
  });

  return { area, center };
}
