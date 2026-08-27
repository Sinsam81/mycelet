import { describe, expect, it } from 'vitest';
import { parseMapViewParams } from '../map-view-params';

/**
 * Feilen dette kom av: «Best i landet i dag» lenker til
 * /map?lat=…&lng=…&zoom=10 for alle 22 områder, men /map leste bare `mine`.
 * Trykte du på Bodø, åpnet kartet på din egen posisjon.
 */
describe('parseMapViewParams', () => {
  it('leser lenka «Best i landet i dag» faktisk sender', () => {
    // Bodø, slik BestRegionsCard bygger den.
    expect(parseMapViewParams({ lat: '67.385', lng: '14.775', zoom: '10', sted: 'Bodø' })).toEqual({
      lat: 67.385,
      lng: 14.775,
      zoom: 10,
      name: 'Bodø'
    });
  });

  it('faller tilbake på kartets egen standardzoom når zoom mangler', () => {
    expect(parseMapViewParams({ lat: '59.91', lng: '10.75' })?.zoom).toBe(11);
  });

  it('krever BEGGE koordinatene — en halv lenke er en ødelagt lenke', () => {
    // Å sentrere på lat alene ville flyttet kartet til et vilkårlig sted
    // i stedet for å la det åpne der det pleier.
    expect(parseMapViewParams({ lat: '67.385' })).toBeNull();
    expect(parseMapViewParams({ lng: '14.775' })).toBeNull();
    expect(parseMapViewParams({})).toBeNull();
  });

  it('avviser søppel i stedet for å sende NaN inn i Leaflet', () => {
    // Et NaN-senter gir et kart som ikke tegner seg i det hele tatt, og
    // verdiene kommer fra en URL hvem som helst kan skrive.
    expect(parseMapViewParams({ lat: 'abc', lng: '14.775' })).toBeNull();
    expect(parseMapViewParams({ lat: '', lng: '' })).toBeNull();
    expect(parseMapViewParams({ lat: 'Infinity', lng: '14.775' })).toBeNull();
    expect(parseMapViewParams({ lat: ['67.385'], lng: '14.775' })).toBeNull();
  });

  it('avviser koordinater utenfor kloden', () => {
    expect(parseMapViewParams({ lat: '91', lng: '14' })).toBeNull();
    expect(parseMapViewParams({ lat: '67', lng: '181' })).toBeNull();
  });

  it('klemmer zoom til det kartet faktisk støtter', () => {
    // Kartet er satt opp med maxZoom: 20. En zoom på 99 ga tidligere en
    // tom skjerm uten fliser.
    expect(parseMapViewParams({ lat: '67', lng: '14', zoom: '99' })?.zoom).toBe(20);
    expect(parseMapViewParams({ lat: '67', lng: '14', zoom: '-5' })?.zoom).toBe(3);
    expect(parseMapViewParams({ lat: '67', lng: '14', zoom: '10.6' })?.zoom).toBe(11);
  });
});

describe('stedsnavnet i dyplenken', () => {
  it('er valgfritt — en lenke uten navn er fortsatt gyldig', () => {
    expect(parseMapViewParams({ lat: '67.385', lng: '14.775' })?.name).toBeNull();
    expect(parseMapViewParams({ lat: '67.385', lng: '14.775', sted: '   ' })?.name).toBeNull();
  });

  it('kappes, så et absurd navn fra URL-en ikke sprenger værstripa', () => {
    const navn = parseMapViewParams({ lat: '67', lng: '14', sted: 'A'.repeat(500) })?.name;
    expect(navn).toHaveLength(60);
  });

  it('stripper kontrolltegn', () => {
    expect(parseMapViewParams({ lat: '67', lng: '14', sted: 'Bo\u0000d\u001bø' })?.name).toBe('Bodø');
  });

  it('beholder norske og svenske tegn', () => {
    expect(parseMapViewParams({ lat: '67', lng: '14', sted: 'Östersund' })?.name).toBe('Östersund');
    expect(parseMapViewParams({ lat: '67', lng: '14', sted: 'Ålesund' })?.name).toBe('Ålesund');
  });
});
