// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { lesGpx } from '../les-gpx';
import { lagGpx } from '../lag-gpx';
import { MAKS_VEIPUNKTER } from '@/lib/steder/veipunkt';

/**
 * Fila leses i NETTLESEREN (DOMParser), så testene kjører i jsdom. Det er ikke
 * en tilfeldig detalj: hele sikkerhetsbegrunnelsen i les-gpx.ts hviler på at
 * ingen XML-parser står på serveren.
 */

const gpx = (innhold: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Test" xmlns="http://www.topografix.com/GPX/1/1">
${innhold}
</gpx>`;

describe('lesGpx', () => {
  it('leser navn, notat, koordinat og tid fra vanlige veipunkter', () => {
    const lesing = lesGpx(
      gpx(`
  <wpt lat="59.911491" lon="10.757933">
    <time>2025-09-14T08:30:00Z</time>
    <name>Kantarellskogen</name>
    <desc>Bak den store steinen</desc>
  </wpt>
  <wpt lat="60.391263" lon="5.322054">
    <name>Steinsoppbakken</name>
  </wpt>`)
    );

    expect(lesing.feil).toBeNull();
    expect(lesing.funnet).toBe(2);
    expect(lesing.veipunkter).toEqual([
      {
        name: 'Kantarellskogen',
        note: 'Bak den store steinen',
        latitude: 59.911491,
        longitude: 10.757933,
        waypointTime: '2025-09-14T08:30:00.000Z'
      },
      {
        name: 'Steinsoppbakken',
        note: null,
        latitude: 60.391263,
        longitude: 5.322054,
        waypointTime: null
      }
    ]);
  });

  /**
   * Den viktigste enkeltsaken i hele importen: en tur-app eksporterer gjerne
   * sporloggen i samme fil. 4000 trkpt er ikke soppsteder, og en import som
   * lagde 4000 «steder» ville vært ubrukelig — men brukeren MÅ få vite at det
   * lå noe i fila som ikke ble med.
   */
  it('importerer ikke sporlogger, men teller punktene så det kan sies fra', () => {
    const lesing = lesGpx(
      gpx(`
  <wpt lat="59.9" lon="10.7"><name>Ett sted</name></wpt>
  <trk><trkseg>
    <trkpt lat="59.90" lon="10.70"/>
    <trkpt lat="59.91" lon="10.71"/>
    <trkpt lat="59.92" lon="10.72"/>
  </trkseg></trk>
  <rte><rtept lat="59.93" lon="10.73"/></rte>`)
    );

    expect(lesing.veipunkter).toHaveLength(1);
    expect(lesing.sporpunkter).toBe(4);
  });

  it('forkaster ugyldige koordinater og teller dem', () => {
    const lesing = lesGpx(
      gpx(`
  <wpt lat="59.9" lon="10.7"><name>Gyldig</name></wpt>
  <wpt lat="95.0" lon="10.7"><name>Utenfor kloden</name></wpt>
  <wpt lon="10.7"><name>Uten lat</name></wpt>
  <wpt lat="0" lon="0"><name>Null Island</name></wpt>`)
    );

    expect(lesing.funnet).toBe(4);
    expect(lesing.ugyldige).toBe(3);
    expect(lesing.veipunkter.map((v) => v.name)).toEqual(['Gyldig']);
  });

  /**
   * <extensions> er der andre apper legger sine egne felt, og de har ofte et
   * <name> selv. Et naivt getElementsByTagName ville gitt stedet navnet til
   * utvidelsen — «gpxx» — for hvert eneste punkt i fila.
   */
  it('lar ikke <extensions> stjele navnet', () => {
    const lesing = lesGpx(
      gpx(`
  <wpt lat="59.9" lon="10.7">
    <name>Ekte navn</name>
    <extensions><gpxx:WaypointExtension xmlns:gpxx="urn:x"><name>Feil navn</name></gpxx:WaypointExtension></extensions>
  </wpt>`)
    );

    expect(lesing.veipunkter[0].name).toBe('Ekte navn');
  });

  it('faller tilbake på <cmt> når <name> mangler', () => {
    const lesing = lesGpx(gpx('  <wpt lat="59.9" lon="10.7"><cmt>Fra kommentarfeltet</cmt></wpt>'));
    expect(lesing.veipunkter[0].name).toBe('Fra kommentarfeltet');
  });

  it('lar navnet være null når fila ikke ga stedet noe navn', () => {
    const lesing = lesGpx(gpx('  <wpt lat="59.9" lon="10.7"/>'));
    expect(lesing.veipunkter[0].name).toBeNull();
  });

  it('kutter ved taket og sier hvor mange som ble kuttet', () => {
    const mange = Array.from(
      { length: MAKS_VEIPUNKTER + 7 },
      (_, i) => `  <wpt lat="59.${100 + i}" lon="10.7"><name>Sted ${i}</name></wpt>`
    ).join('\n');
    const lesing = lesGpx(gpx(mange));

    expect(lesing.funnet).toBe(MAKS_VEIPUNKTER + 7);
    expect(lesing.veipunkter).toHaveLength(MAKS_VEIPUNKTER);
    expect(lesing.avkortet).toBe(7);
  });

  it('skiller ødelagt XML fra en fil uten veipunkter', () => {
    expect(lesGpx('<gpx><wpt lat="59.9"').feil).toBe('ugyldig-xml');
    expect(lesGpx(gpx('')).feil).toBeNull();
  });

  it('avviser XML som ikke er GPX', () => {
    expect(lesGpx('<?xml version="1.0"?><kml><Placemark/></kml>').feil).toBe('ikke-gpx');
  });

  /**
   * Rundturen: det vi eksporterer må vi kunne lese inn igjen. Uten denne
   * testen kan de to filene i src/lib/gpx/ gli fra hverandre uten at noe sier
   * fra — og da mister brukeren dataene sine på vei ut og inn.
   */
  it('leser vår egen eksport tilbake', () => {
    const ut = lagGpx([
      { latitude: 59.911491, longitude: 10.757933, name: 'Kantarell 14.09.2025', time: '2025-09-14T08:30:00Z', desc: 'Ved bekken' }
    ]);
    const inn = lesGpx(ut);

    expect(inn.feil).toBeNull();
    expect(inn.veipunkter).toEqual([
      {
        name: 'Kantarell 14.09.2025',
        note: 'Ved bekken',
        latitude: 59.911491,
        longitude: 10.757933,
        waypointTime: '2025-09-14T08:30:00.000Z'
      }
    ]);
  });
});
