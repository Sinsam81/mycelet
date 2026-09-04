import { describe, expect, it } from 'vitest';
import { byggPresseVarsel } from '../presse';

describe('byggPresseVarsel', () => {
  it('fyller inn tall, lenke og mottakere for en norsk region', () => {
    const { emne, tekst, html } = byggPresseVarsel([{ region: 'Trondheim', fra: 62, til: 88 }], '2026-09-08');
    expect(emne).toBe('Omslag i dag: Trondheim — send pitchen');
    expect(tekst).toContain('Soppforholdene i Trondheim er 88 av 100 i dag');
    expect(tekst).toContain('fra 62 til 88 av 100');
    expect(tekst).toContain('https://www.mycelet.com/soppforhold/trondheim');
    expect(tekst).toContain('Adresseavisen');
    expect(html).toContain('NRK Trøndelag');
  });

  it('bruker svensk pitch for svenske regioner, med riktig slug', () => {
    const { tekst } = byggPresseVarsel([{ region: 'Göteborg', fra: 60, til: 86 }], '2026-09-08');
    expect(tekst).toContain('Svampförhållandena i Göteborg är 86 av 100');
    expect(tekst).toContain('/soppforhold/goteborg');
    expect(tekst).toContain('Göteborgs-Posten');
    expect(tekst).not.toContain('Soppforholdene');
  });

  it('råder til å sende på tirsdag–torsdag', () => {
    // 2026-09-08 er en tirsdag, 2026-09-12 en lørdag
    expect(byggPresseVarsel([{ region: 'Oslo', fra: 60, til: 88 }], '2026-09-08').tekst).toContain('send før kl. 10');
    expect(byggPresseVarsel([{ region: 'Oslo', fra: 60, til: 88 }], '2026-09-12').tekst).toContain('vurder å vente');
  });

  it('lister alle regioner i emnet og gir fallback-mottaker for ukjent region', () => {
    const { emne, tekst } = byggPresseVarsel(
      [
        { region: 'Oslo', fra: 60, til: 88 },
        { region: 'Kalmar', fra: 55, til: 85 }
      ],
      '2026-09-08'
    );
    expect(emne).toContain('Oslo, Kalmar');
    expect(tekst).toContain('se docs/presse-pitch-soppvarsel.md');
  });

  it('nevner aldri et personnavn — avsender er Mycelet', () => {
    const { tekst } = byggPresseVarsel([{ region: 'Bergen', fra: 60, til: 88 }], '2026-09-08');
    expect(tekst).toContain('Vennlig hilsen\nMycelet');
  });
});
