import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Flislaget tegner én rute per celle, kant i kant. Får rutene en synlig strek,
 * blir hele kartet et rutenett — det skjedde i produksjon 2. august, og det var
 * uleselig.
 *
 * Ærligheten ligger i STØRRELSEN (rasteret har 0,06–0,07° mellom målepunktene),
 * ikke i streken. Streken la til en grense der ingen grense går.
 *
 * MushroomMap.tsx lastes ikke av noen test (Leaflet + DOM), så dette er en
 * kildevakt — samme grep som findingPopupElement- og topSpotArea-testene.
 */
const KILDE = readFileSync(new URL('../MushroomMap.tsx', import.meta.url), 'utf8');

/**
 * KUN rectangle-kallet i updateHeatLayer.
 *
 * Første versjon av denne vakten leste hele `const shape = …`-blokka, som
 * inneholder BEGGE grenene. Da traff `toContain('stroke: false')` sirkel-grenen
 * selv når rektangelet hadde fått kanten tilbake, og vakten slapp igjennom
 * nettopp det den var satt til å stoppe. Verifisert ved å sette kanten tilbake:
 * bare én av tre tester ble rød.
 */
function heatLayerRectangleOptions(): string {
  const start = KILDE.indexOf('const shape = cellDeg');
  expect(start, 'fant ikke flis-tegningen i updateHeatLayer').toBeGreaterThan(-1);
  const rect = KILDE.indexOf('leaflet.rectangle(', start);
  expect(rect, 'flislaget tegner ikke lenger rektangler').toBeGreaterThan(-1);
  const slutt = KILDE.indexOf(')', KILDE.indexOf('{ color', rect));
  return KILDE.slice(rect, slutt);
}

describe('flislaget skal ikke bli et rutenett', () => {
  it('tegner rutene uten kant', () => {
    const block = heatLayerRectangleOptions();
    expect(block).toContain('stroke: false');
    expect(block, 'weight må være 0 — en strek per celle gir rutenett').toContain('weight: 0');
  });

  it('har ingen synlig strektykkelse igjen i blokka', () => {
    expect(heatLayerRectangleOptions()).not.toMatch(/weight:\s*[1-9]/);
  });

  it('beholder den ekte cellestørrelsen — det er DER ærligheten ligger', () => {
    // Rutene skal fortsatt tegnes i rasterets oppløsning. Fikser man rutenettet
    // ved å krympe rutene i stedet for å fjerne kanten, er man tilbake til å
    // love en presisjon modellen ikke har.
    expect(KILDE.slice(KILDE.indexOf('const shape = cellDeg'), KILDE.indexOf('const shape = cellDeg') + 900)).toContain('cellDeg / 2');
  });
});
