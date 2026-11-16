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

  it('daterer omslaget til «i natt» bare når det er målt mot gårsdagen — brobygd over et hull sier «har snudd»', () => {
    // X-posteren brobygger nå en natt uten lagrede scorer, som e-postvarselet.
    // Da vet vi at det har snudd, ikke hvilken natt — og pitchen går til en
    // redaksjon. Tallet og «i dag» i emnefeltet er dagens egne uansett.
    const vanligNb = byggPresseVarsel([{ region: 'Oslo', fra: 62, til: 88 }], '2026-09-08');
    expect(vanligNb.tekst).toContain('Soppvarselet slo ut i natt — presse-vinduet er åpent');
    expect(vanligNb.html).toContain('Soppvarselet slo ut i natt — presse-vinduet er åpent');
    expect(vanligNb.tekst).toContain('forholdene i Oslo snudde i natt — fra 62 til 88 av 100 den siste uka');
    const vanligSv = byggPresseVarsel([{ region: 'Göteborg', fra: 60, til: 86 }], '2026-09-08');
    expect(vanligSv.tekst).toContain('förhållandena i Göteborg vände i natt — från 60 till 86 av 100 den senaste veckan');

    const nb = byggPresseVarsel([{ region: 'Oslo', fra: 62, til: 88, brobygd: true }], '2026-09-08');
    expect(nb.tekst).toContain('Soppvarselet slo ut — presse-vinduet er åpent');
    expect(nb.tekst).toContain('forholdene i Oslo har snudd — fra 62 til 88 av 100 den siste uka');
    expect(nb.tekst).toContain('Soppforholdene i Oslo er 88 av 100 i dag');
    const sv = byggPresseVarsel([{ region: 'Göteborg', fra: 60, til: 86, brobygd: true }], '2026-09-08');
    expect(sv.tekst).toContain('förhållandena i Göteborg har vänt — från 60 till 86 av 100 den senaste veckan');
    // Ingenting som bygges av et brobygd omslag sier «i natt» — verken overskriften eller pitchen.
    for (const varsel of [nb, sv]) {
      expect(varsel.tekst).not.toContain('i natt');
      expect(varsel.html).not.toContain('i natt');
    }
  });

  it('flere regioner: pitchen er per region, overskriften følger hele varselet', () => {
    const { tekst } = byggPresseVarsel(
      [
        { region: 'Bergen', fra: 68, til: 92 },
        { region: 'Oslo', fra: 70, til: 89, brobygd: true }
      ],
      '2026-09-08'
    );
    expect(tekst).toContain('Soppvarselet slo ut — presse-vinduet er åpent');
    expect(tekst).toContain('forholdene i Bergen snudde i natt');
    expect(tekst).toContain('forholdene i Oslo har snudd');
  });

  it('nevner aldri et personnavn — avsender er Mycelet', () => {
    const { tekst } = byggPresseVarsel([{ region: 'Bergen', fra: 60, til: 88 }], '2026-09-08');
    expect(tekst).toContain('Vennlig hilsen\nMycelet');
  });
});
