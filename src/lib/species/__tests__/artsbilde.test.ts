import { describe, expect, it } from 'vitest';
import * as artsbilde from '../artsbilde';
import { HOVEDBILDE_SIZES, type SmaleOriginaler } from '../artsbilde';
import { COMMONS_BREDDER_META, COMMONS_SMALE_ORIGINALER } from '../commons-smale-originaler.generated';
import { COMMONS_TRINN, commonsFilnavn } from '../commons-thumb';

/**
 * URL-ene er slik de står i basen 16. november 2026. Breddene i kommentarene
 * er originalens bredde på Commons samme dag.
 *
 * Lista over smale originaler regenereres når artsbilder byttes ut
 * (scripts/generate-commons-widths.mjs). Reglene testes derfor mot en FAST
 * kopi av de fem oppføringene testene trenger — ellers ville et nytt og
 * bedre bilde av grønn fluesopp veltet testene uten at noe var galt. Den
 * genererte lista selv testes nederst, på formen og ikke på innholdet.
 */
const SMALE: SmaleOriginaler = {
  'Birkenpilz01.jpg': 400,
  'Lactarius torminosus (cropped).jpg': 427,
  'Amanita phalloides 1.JPG': 1200,
  '2010-08-11 Russula claroflava Grove. ss. Melz, & Zv., J. Schff 98988.jpg': 1024,
  'Hedgehog fungi2.jpg': 800
};

const hovedbildeSrcSet = (url: string | null | undefined) => artsbilde.hovedbildeSrcSet(url, SMALE);
const bredesteUtgave = <T extends string | null | undefined>(url: T) => artsbilde.bredesteUtgave(url, SMALE);
const kortbilde = <T extends string | null | undefined>(url: T) => artsbilde.kortbilde(url, SMALE);

// 1342 piksler bred: ikke i lista over smale originaler.
const KANTARELL =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Chanterelle_Cantharellus_cibarius.jpg/330px-Chanterelle_Cantharellus_cibarius.jpg';
// 400 piksler bred — smalere enn 500-trinnet.
const BRUNSKRUBB = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Birkenpilz01.jpg/330px-Birkenpilz01.jpg';
// 427 piksler bred, og parenteser i filnavnet.
const SKJEGGRISKE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Lactarius_torminosus_%28cropped%29.jpg/330px-Lactarius_torminosus_%28cropped%29.jpg';
// 1200 piksler bred, lagret som 500.
const GRONN_FLUESOPP =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/Amanita_phalloides_1.JPG/500px-Amanita_phalloides_1.JPG';
// 1024 piksler bred, med komma og & i filnavnet.
const GULKREMLE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/2010-08-11_Russula_claroflava_Grove._ss._Melz%2C_%26_Zv.%2C_J._Schff_98988.jpg/500px-2010-08-11_Russula_claroflava_Grove._ss._Melz%2C_%26_Zv.%2C_J._Schff_98988.jpg';
// 800 piksler bred, lagret som 330.
const PIGGSOPP = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b9/Hedgehog_fungi2.jpg/330px-Hedgehog_fungi2.jpg';

function bredder(srcSet: string | undefined): string[] {
  return (srcSet ?? '').split(', ').filter(Boolean).map((kandidat) => kandidat.split(' ').pop() ?? '');
}

describe('hovedbildet', () => {
  it('tilbys opp til 1280 piksler når originalen er stor', () => {
    expect(bredder(hovedbildeSrcSet(KANTARELL))).toEqual(['330w', '500w', '960w', '1280w']);
  });

  it('stopper på trinnet under originalens bredde', () => {
    // Uten taket skalerer Commons opp: 393 kB for 1280-utgaven av en original
    // på 400 piksler, mot 71 kB for 330-utgaven — og ikke én ny detalj.
    expect(bredder(hovedbildeSrcSet(GRONN_FLUESOPP))).toEqual(['500w', '960w']);
    expect(bredder(hovedbildeSrcSet(GULKREMLE))).toEqual(['500w', '960w']);
    expect(bredder(hovedbildeSrcSet(PIGGSOPP))).toEqual(['330w', '500w']);
  });

  it('får ingen srcset når den lagrede utgaven er det beste originalen har', () => {
    expect(hovedbildeSrcSet(BRUNSKRUBB)).toBeUndefined();
    expect(hovedbildeSrcSet(SKJEGGRISKE)).toBeUndefined();
  });

  it('behandler et bilde som ikke står i lista som stort', () => {
    // Et bilde lagt til etter at lista ble bygget. Komponenten har reserven
    // (den lagrede utgaven) hvis et trinn ikke lar seg laste.
    const nytt = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Nytt_bilde_2027.jpg/500px-Nytt_bilde_2027.jpg';
    expect(bredder(hovedbildeSrcSet(nytt))).toEqual(['500w', '960w', '1280w']);
  });

  it('lar seg ikke lure av et filnavn som ligner en innebygd egenskap', () => {
    const rar = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/constructor/330px-constructor';
    expect(bredder(hovedbildeSrcSet(rar))).toEqual(['330w', '500w', '960w', '1280w']);
  });

  it('gir ingenting for bilder som ikke er Commons-miniatyrer', () => {
    expect(hovedbildeSrcSet('https://abc.supabase.co/storage/v1/object/public/arter/1.jpg')).toBeUndefined();
    expect(hovedbildeSrcSet(null)).toBeUndefined();
    expect(hovedbildeSrcSet(undefined)).toBeUndefined();
    expect(hovedbildeSrcSet('')).toBeUndefined();
  });

  it('sier hvor bredt bildet vises, med 960-trinnet som tak på telefon', () => {
    // Bredest først; siste ledd er telefon i høydeformat og har ingen
    // betingelse. 320 px × 3 piksler per punkt = 960.
    expect(HOVEDBILDE_SIZES.split(', ')).toEqual([
      '(min-width: 1280px) 604px',
      '(min-width: 768px) calc(50vw - 28px)',
      '(min-width: 480px) calc(100vw - 32px)',
      '320px'
    ]);
  });

  it('gir nettleseren det den trenger for å velge riktig trinn', () => {
    // Regnestykket nettleseren gjør: plassen i CSS-piksler × pikseltetthet,
    // og så det minste trinnet som dekker det (ellers det bredeste).
    const trinn = [330, 500, 960, 1280];
    const velg = (plass: number, tetthet: number) => trinn.find((b) => b >= plass * tetthet) ?? trinn[trinn.length - 1];
    // Plassen leses ut av selve HOVEDBILDE_SIZES, slik nettleseren gjør det:
    // første ledd der betingelsen holder, og lengden regnet ut for vinduet.
    const lengde = (uttrykk: string, vindu: number) => {
      const fast = /^(\d+)px$/.exec(uttrykk);
      if (fast) return Number(fast[1]);
      const regnet = /^calc\((\d+)vw - (\d+)px\)$/.exec(uttrykk);
      if (regnet) return (Number(regnet[1]) / 100) * vindu - Number(regnet[2]);
      throw new Error(`ukjent lengde i sizes: ${uttrykk}`);
    };
    const plass = (vindu: number) => {
      for (const ledd of HOVEDBILDE_SIZES.split(', ')) {
        const medBetingelse = /^\(min-width: (\d+)px\) (.+)$/.exec(ledd);
        if (!medBetingelse) return lengde(ledd, vindu);
        if (vindu >= Number(medBetingelse[1])) return lengde(medBetingelse[2], vindu);
      }
      throw new Error('sizes mangler et ledd uten betingelse');
    };
    // Telefoner i høydeformat: 960, uansett om de har to eller tre piksler per punkt.
    for (const vindu of [360, 390, 430]) {
      expect(velg(plass(vindu), 2), `${vindu}@2x`).toBe(960);
      expect(velg(plass(vindu), 3), `${vindu}@3x`).toBe(960);
    }
    // Et smalt nettleservindu på en vanlig skjerm skal ikke få 330-bildet strukket ut.
    expect(velg(plass(700), 1)).toBe(960);
    expect(velg(plass(500), 1)).toBe(500);
    // Skrivebord: 960 på vanlig skjerm, 1280 på en med dobbel tetthet.
    expect(velg(plass(1440), 1)).toBe(960);
    expect(velg(plass(1440), 2)).toBe(1280);
  });
});

describe('bildet på et forvekslingskort', () => {
  it('er 500 piksler bredt når originalen har det', () => {
    expect(kortbilde(KANTARELL)).toBe(
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Chanterelle_Cantharellus_cibarius.jpg/500px-Chanterelle_Cantharellus_cibarius.jpg'
    );
    expect(kortbilde(PIGGSOPP)).toContain('/500px-Hedgehog_fungi2.jpg');
  });

  it('er den lagrede utgaven når originalen er smalere enn 500', () => {
    expect(kortbilde(BRUNSKRUBB)).toBe(BRUNSKRUBB);
    expect(kortbilde(SKJEGGRISKE)).toBe(SKJEGGRISKE);
  });

  it('gjøres aldri smalere enn det som er lagret', () => {
    expect(kortbilde(GRONN_FLUESOPP)).toBe(GRONN_FLUESOPP);
    const bred = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Stort.jpg/960px-Stort.jpg';
    expect(kortbilde(bred)).toBe(bred);
  });

  it('rører ikke bilder som ikke er Commons-miniatyrer', () => {
    const eget = 'https://abc.supabase.co/storage/v1/object/public/arter/1.jpg';
    expect(kortbilde(eget)).toBe(eget);
    expect(kortbilde(null)).toBeNull();
    expect(kortbilde(undefined)).toBeUndefined();
  });
});

describe('bildet i delingskortet og de strukturerte dataene', () => {
  it('er den bredeste utgaven originalen har piksler til', () => {
    expect(bredesteUtgave(KANTARELL)).toContain('/1280px-Chanterelle_Cantharellus_cibarius.jpg');
    expect(bredesteUtgave(GRONN_FLUESOPP)).toContain('/960px-Amanita_phalloides_1.JPG');
    expect(bredesteUtgave(PIGGSOPP)).toContain('/500px-Hedgehog_fungi2.jpg');
  });

  it('er den lagrede utgaven når originalen ikke har mer', () => {
    expect(bredesteUtgave(BRUNSKRUBB)).toBe(BRUNSKRUBB);
  });

  it('rører ikke bilder som ikke er Commons-miniatyrer', () => {
    const eget = 'https://abc.supabase.co/storage/v1/object/public/arter/1.jpg';
    expect(bredesteUtgave(eget)).toBe(eget);
    expect(bredesteUtgave(null)).toBeNull();
    expect(bredesteUtgave(undefined)).toBeUndefined();
  });
});

describe('lista over smale originaler', () => {
  const oppforinger = Object.entries(COMMONS_SMALE_ORIGINALER);

  it('har bare bilder som er smalere enn det bredeste trinnet', () => {
    expect(COMMONS_BREDDER_META.storsteTrinn).toBe(COMMONS_TRINN[COMMONS_TRINN.length - 1]);
    expect(oppforinger.length).toBe(COMMONS_BREDDER_META.smale);
    expect(COMMONS_BREDDER_META.smale).toBeLessThanOrEqual(COMMONS_BREDDER_META.filer);
    for (const [filnavn, bredde] of oppforinger) {
      expect(Number.isInteger(bredde), filnavn).toBe(true);
      expect(bredde, filnavn).toBeGreaterThan(0);
      expect(bredde, filnavn).toBeLessThan(COMMONS_BREDDER_META.storsteTrinn);
    }
  });

  it('er nøklet slik commonsFilnavn leser en URL', () => {
    // Skriptet (commonsFileNameFromUrl) og siden (commonsFilnavn) må lese
    // filnavnet likt, ellers slår oppslaget aldri til og taket forsvinner
    // uten at noe feiler.
    for (const [filnavn] of oppforinger) {
      expect(filnavn, filnavn).toBe(filnavn.trim());
      expect(filnavn, filnavn).not.toContain('_');
      expect(filnavn, filnavn).not.toMatch(/%[0-9A-Fa-f]{2}/);
      const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${encodeURIComponent(
        filnavn.replace(/ /g, '_')
      )}/330px-${encodeURIComponent(filnavn.replace(/ /g, '_'))}`;
      expect(commonsFilnavn(url), filnavn).toBe(filnavn);
    }
    // Og de vanskelige navnene fra basen leses som nøklene er skrevet: komma,
    // «&» og parenteser er prosentkodet i URL-en og ikke i lista.
    expect(Object.hasOwn(SMALE, commonsFilnavn(GULKREMLE) ?? '')).toBe(true);
    expect(Object.hasOwn(SMALE, commonsFilnavn(SKJEGGRISKE) ?? '')).toBe(true);
  });

  it('brukes når funksjonene ikke får en annen liste', () => {
    // Uten andre argument slår de opp i den genererte lista. Sjekket mot en
    // oppføring som faktisk står der nå, hvilken det enn er.
    const [filnavn, bredde] = oppforinger[0] ?? [];
    if (!filnavn || !bredde) return;
    const ledd = encodeURIComponent(filnavn.replace(/ /g, '_'));
    const url = `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${ledd}/330px-${ledd}`;
    const tilbudt = (artsbilde.hovedbildeSrcSet(url) ?? '330w').split(', ').map((k) => Number(k.split(' ').pop()?.slice(0, -1)));
    expect(Math.max(...tilbudt)).toBeLessThanOrEqual(Math.max(330, bredde));
    // Samme URL uten oppføring i lista behandles som stor.
    expect(artsbilde.hovedbildeSrcSet(url, {})).toContain('1280w');
  });

  it('lar seg ikke lure av en oppføring som ikke er en bredde', () => {
    const rare = { 'Birkenpilz01.jpg': Number.NaN, 'Hedgehog fungi2.jpg': -5 } as SmaleOriginaler;
    expect(artsbilde.hovedbildeSrcSet(BRUNSKRUBB, rare)).toContain('1280w');
    expect(artsbilde.kortbilde(PIGGSOPP, rare)).toContain('/500px-');
  });
});
