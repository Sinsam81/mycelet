import { describe, expect, it } from 'vitest';
import { byggLovendeOmraderGpx } from '../lovende-omrader';

const omrader = [
  { lat: 60.39, lng: 5.32, score: 87.4, verdict: 'Gode forhold', reasons: ['Fuktig nok', 'Granskog'], forestType: 'granskog' },
  { lat: 60.41, lng: 5.35, score: 72, reasons: [] }
];

describe('byggLovendeOmraderGpx', () => {
  it('ett veipunkt per område, nummerert, med art og score i navnet og begrunnelsen i beskrivelsen', () => {
    const gpx = byggLovendeOmraderGpx(omrader, { artsnavn: 'Kantarell', dato: '2026-09-06' });
    expect(gpx).toContain('<name>Kantarell – Lovende område 1 (87 av 100)</name>');
    expect(gpx).toContain('<desc>Gode forhold · Fuktig nok · Granskog · Skog: granskog · Mycelet-vurdering 2026-09-06</desc>');
    expect(gpx).toContain('<name>Kantarell – Lovende område 2 (72 av 100)</name>');
    expect(gpx).toContain('lat="60.390000" lon="5.320000"');
    expect((gpx.match(/<wpt /g) ?? []).length).toBe(2);
  });

  it('svensk tekst når leseren er svensk', () => {
    const gpx = byggLovendeOmraderGpx(omrader.slice(0, 1), { dato: '2026-09-06', locale: 'sv' });
    expect(gpx).toContain('Lovande område 1');
    expect(gpx).toContain('Mycelet-bedömning 2026-09-06');
  });

  it('modellens tekst escapes som XML — «&» og «<» skal ikke knekke fila', () => {
    const gpx = byggLovendeOmraderGpx([{ lat: 1, lng: 2, score: 50, reasons: ['gran & furu <10 m'] }], { dato: '2026-09-06' });
    expect(gpx).toContain('gran &amp; furu &lt;10 m');
  });
});
