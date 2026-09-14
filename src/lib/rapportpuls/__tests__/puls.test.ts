import { describe, expect, it } from 'vitest';
import { beregnPuls, pulsKortLinje, pulsLinje, pulsPeriode, pulsVindu, type PulsInn } from '../puls';

function inn(over: Partial<PulsInn> = {}): PulsInn {
  return { fra: '2026-09-01', til: '2026-09-07', siste7: 84, tidligereAar: [50, 55, 52], ...over };
}

describe('beregnPuls', () => {
  it('over vanlig når uka ligger 30 % eller mer over snittet av tidligere år', () => {
    expect(beregnPuls(inn())).toMatchObject({ siste7: 84, baseline: 52.3, avvikPst: 61, aarBrukt: 3, nivaa: 'over' });
  });

  it('«under» krever mer enn «over» — sen-opplastinger trekker sammenligningen med tidligere år litt ned', () => {
    expect(beregnPuls(inn({ siste7: 55 })).nivaa).toBe('vanlig');
    expect(beregnPuls(inn({ siste7: 34 })).nivaa).toBe('vanlig'); // −35 %
    expect(beregnPuls(inn({ siste7: 30 })).nivaa).toBe('under'); // −43 %
  });

  it('tynt grunnlag: baseline under 10 gir ingen prosent — tre funn mot to er ikke «+50 %»', () => {
    const p = beregnPuls(inn({ siste7: 3, tidligereAar: [2, 1, 3] }));
    expect(p.nivaa).toBe('tynt');
    expect(p.avvikPst).toBeNull();
  });

  it('år som ikke kunne hentes hoppes over; ingen år = tynt', () => {
    expect(beregnPuls(inn({ siste7: 60, tidligereAar: [null, 40, null] }))).toMatchObject({ baseline: 40, avvikPst: 50, aarBrukt: 1 });
    expect(beregnPuls(inn({ tidligereAar: [null, null, null] })).nivaa).toBe('tynt');
  });

  it('trend mot uka før (samme alder) er uavhengig av årsbaselinen, og tynn uke gir ingen trend', () => {
    expect(beregnPuls(inn({ forrigeUke: 60 })).trendPst).toBe(40);
    expect(beregnPuls(inn({ forrigeUke: 5 })).trendPst).toBeNull();
    expect(beregnPuls(inn({ tidligereAar: [], forrigeUke: 60 })).trendPst).toBe(40);
    expect(beregnPuls(inn()).trendPst).toBeNull();
  });
});

describe('pulsVindu', () => {
  it('slutter sju dager tilbake (etterslepet) og dekker sju dager', () => {
    expect(pulsVindu('2026-09-14')).toEqual({ fra: '2026-09-01', til: '2026-09-07' });
    expect(pulsVindu('2026-09-14', 2)).toEqual({ fra: '2024-09-01', til: '2024-09-07' });
    expect(pulsVindu('2026-09-14', 0, 0)).toEqual({ fra: '2026-09-08', til: '2026-09-14' });
  });

  it('tåler skuddår og årsskifte', () => {
    expect(pulsVindu('2024-03-07', 1)).toEqual({ fra: '2023-02-22', til: '2023-02-28' });
    expect(pulsVindu('2026-01-08')).toEqual({ fra: '2025-12-26', til: '2026-01-01' });
  });
});

describe('pulsPeriode', () => {
  it('norsk og svensk, innen og over månedsskifte', () => {
    expect(pulsPeriode('2026-09-01', '2026-09-07')).toBe('1.–7. september');
    expect(pulsPeriode('2026-08-29', '2026-09-04')).toBe('29. august–4. september');
    expect(pulsPeriode('2026-09-01', '2026-09-07', 'sv')).toBe('1–7 september');
  });
});

describe('pulsLinje / pulsKortLinje', () => {
  it('sier fra bare når grunnlaget holder, og tar med trenden når den er tydelig', () => {
    expect(pulsLinje(beregnPuls(inn()))).toBe(
      'Uka 1.–7. september: 84 soppfunn registrert i Artsobservasjoner her, 61 % over det vanlige for uka.'
    );
    expect(pulsLinje(beregnPuls(inn({ forrigeUke: 60 })))).toContain('og 40 % flere enn uka før');
    expect(pulsLinje(beregnPuls(inn({ forrigeUke: 200 })))).toContain('men 58 % færre enn uka før');
    expect(pulsLinje(beregnPuls(inn({ forrigeUke: 80 })))).not.toContain('uka før');
    expect(pulsLinje(beregnPuls(inn({ siste7: 3, tidligereAar: [2, 1, 3] })))).toBeNull();
    expect(pulsLinje(null)).toBeNull();
  });

  it('svensk variant finnes, og X-linja bare ved «over»', () => {
    expect(pulsLinje(beregnPuls(inn()), 'sv')).toContain('svampfynd');
    expect(pulsKortLinje('Innlandet', beregnPuls(inn()))).toBe(
      'Artsobservasjoner uka 1.–7. september: 84 soppfunn i Innlandet, 61 % over vanlig.'
    );
    expect(pulsKortLinje('Innlandet', beregnPuls(inn({ siste7: 55 })))).toBeNull();
  });
});
