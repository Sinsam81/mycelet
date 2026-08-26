import { describe, expect, it } from 'vitest';
import { escapeXml, lagGpx } from '../lag-gpx';

describe('lagGpx', () => {
  it('lager gyldig GPX 1.1 med veipunkt i riktig elementrekkefølge (time før name før desc)', () => {
    const gpx = lagGpx([
      {
        latitude: 59.913868,
        longitude: 10.752245,
        name: 'Kantarell 26.08.2026',
        time: '2026-08-26T10:30:00Z',
        desc: 'Nordvendt li'
      }
    ]);
    expect(gpx).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(gpx).toContain('xmlns="http://www.topografix.com/GPX/1/1"');
    expect(gpx).toContain('<wpt lat="59.913868" lon="10.752245">');
    const iTid = gpx.indexOf('<time>');
    const iNavn = gpx.indexOf('<name>');
    const iDesc = gpx.indexOf('<desc>');
    expect(iTid).toBeGreaterThan(-1);
    expect(iTid).toBeLessThan(iNavn);
    expect(iNavn).toBeLessThan(iDesc);
  });

  it('escaper brukertekst — notater med < & " ville ellers knekt XML-en', () => {
    const gpx = lagGpx([
      {
        latitude: 60,
        longitude: 10,
        name: 'Steinsopp <stor & fin>',
        desc: 'Ved "bekken" & stien'
      }
    ]);
    expect(gpx).toContain('<name>Steinsopp &lt;stor &amp; fin&gt;</name>');
    expect(gpx).toContain('<desc>Ved &quot;bekken&quot; &amp; stien</desc>');
  });

  it('bruker alltid punktum i koordinater — locale-komma leser ingen GPS-enhet', () => {
    const gpx = lagGpx([{ latitude: 59.5, longitude: 10.25, name: 'x' }]);
    expect(gpx).toContain('lat="59.500000"');
    expect(gpx).toContain('lon="10.250000"');
    expect(gpx).not.toContain('59,5');
  });

  it('utelater ugyldig tid og tom desc i stedet for å skrive søppel', () => {
    const gpx = lagGpx([{ latitude: 60, longitude: 10, name: 'x', time: 'ukjent', desc: '  ' }]);
    expect(gpx).not.toContain('<time>');
    expect(gpx).not.toContain('<desc>');
  });

  it('hopper over rader uten gyldige koordinater og tåler tom liste', () => {
    const gpx = lagGpx([{ latitude: Number.NaN, longitude: 10, name: 'x' }]);
    expect(gpx).not.toContain('<wpt');
    expect(gpx).toContain('</gpx>');
    expect(lagGpx([])).toContain('</gpx>');
  });
});

describe('escapeXml', () => {
  it('dekker alle fem XML-spesialtegnene', () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;');
  });

  it('fjerner XML-ulovlige kontrolltegn — de kan ikke escapes, bare strykes', () => {
    // Ett innlimt Word-tegn (U+000B) i ett notat ville ellers gjort HELE
    // fila uleselig for strenge lesere (xmllint: «invalid Char value 11»).
    const skittent = `før${String.fromCharCode(8)}midt${String.fromCharCode(11)}etter`;
    expect(escapeXml(skittent)).toBe('førmidtetter');
    // Tab, linjeskift og CR er lovlige og skal overleve.
    expect(escapeXml('a\tb\nc\rd')).toBe('a\tb\nc\rd');
  });

  it('kontrolltegn i veipunktdata knekker ikke fila', () => {
    const gpx = lagGpx([
      { latitude: 60, longitude: 10, name: `Sopp${String.fromCharCode(11)}en`, desc: `notat${String.fromCharCode(8)}` }
    ]);
    expect(gpx).toContain('<name>Soppen</name>');
    expect(gpx).toContain('<desc>notat</desc>');
    expect(gpx).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
  });
});
