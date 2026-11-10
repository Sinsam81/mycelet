import { describe, expect, it } from 'vitest';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { byggGiftnummer } from '../giftnummer';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const les = (relativ: string) => fs.readFileSync(new URL(relativ, import.meta.url), 'utf8');

type SafetyKatalog = { Safety: Record<string, string> };
const fra = (katalog: SafetyKatalog) => (key: string) => katalog.Safety[key];

describe('byggGiftnummer', () => {
  it('norsk: ÉN lenke, til Giftinformasjonen med landskode', () => {
    expect(byggGiftnummer(fra(nb))).toEqual([{ tel: '+4722591300', label: '22 59 13 00' }]);
  });

  it('svensk: TO lenker — 112 akutt og Giftinformationscentralen direkte', () => {
    expect(byggGiftnummer(fra(sv))).toEqual([
      { tel: '112', label: '112 (akut)' },
      { tel: '+46104566700', label: '010-456 67 00' }
    ]);
  });

  it('teksten du trykker på er nummeret som ringes — på begge språk', () => {
    // Feilen komponenten ble skrevet for: 010-nummeret sto i lenketeksten,
    // men lenka gikk til 112.
    for (const katalog of [nb, sv]) {
      for (const { tel, label } of byggGiftnummer(fra(katalog))) {
        const sifreITel = tel.replace(/\D/g, '');
        const sifreIEtikett = label.replace(/\D/g, '').replace(/^0/, '');
        expect(sifreIEtikett.length).toBeGreaterThan(0);
        expect(sifreITel.endsWith(sifreIEtikett)).toBe(true);
      }
    }
  });

  it('gir aldri samme nummer to ganger', () => {
    const like = byggGiftnummer((key) => (key.startsWith('poisonTel') ? '113' : 'etikett'));
    expect(like).toHaveLength(1);
  });
});

describe('giftnummeret er en ringelenke der det trengs mest', () => {
  const utenKommentarer = (kilde: string) => kilde.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('fareboksen i AI-resultatet bruker ringelenkene, ikke ren tekst', () => {
    const kilde = utenKommentarer(les('../../identify/SafetyWarning.tsx'));
    const fare = kilde.slice(kilde.indexOf("t('dangerHeading')"), kilde.indexOf("t('cautionHeading')"));
    expect(fare).toContain('<PoisonHotlineLinksClient');
    expect(kilde).not.toContain("s('poisonDisplay')");
  });

  it('den faste advarselen på identify-siden bruker ringelenkene, ikke ren tekst', () => {
    const kilde = utenKommentarer(les('../../../app/identify/page.tsx'));
    expect(kilde).toContain('<PoisonHotlineLinksClient');
    expect(kilde).not.toContain("s('poisonNumber')");
  });

  it('server- og klientvarianten bygger numrene med samme funksjon og lenker med tel:', () => {
    for (const fil of ['../PoisonHotlineLinks.tsx', '../PoisonHotlineLinksClient.tsx']) {
      const kilde = les(fil);
      expect(kilde).toContain('byggGiftnummer(s)');
      expect(kilde).toContain('href={`tel:${number.tel}`}');
    }
  });
});
