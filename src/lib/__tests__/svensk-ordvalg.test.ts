import { describe, expect, it } from 'vitest';
import { createTranslator } from 'next-intl';
import nb from '../../../messages/nb.json';
import sv from '../../../messages/sv.json';

/**
 * Svensk som er norsk i forkledning.
 *
 * De svenske tekstene blir ofte skrevet ut fra de norske, og noen ord ser like
 * ut uten å bety det samme. Setningene under er forståelige, men leses som
 * norsk — eller som noe annet enn det som var ment. messages.test.ts vokter at
 * nøklene finnes på begge språk; denne vokter mot de ordrette oversettelsene
 * vi alt har funnet og rettet, så de ikke kommer tilbake med neste tekst.
 *
 * Gjelder meldingskatalogen. Tekst som lages på serveren (COPY-tabellene i
 * src/lib) dekkes ikke her.
 */

type Catalog = { [nokkel: string]: string | Catalog };

/** Alle svenske strenger, som [sti, tekst]. */
function strenger(katalog: Catalog, prefiks = ''): Array<[string, string]> {
  return Object.entries(katalog).flatMap(([nokkel, verdi]) =>
    typeof verdi === 'string' ? [[`${prefiks}${nokkel}`, verdi] as [string, string]] : strenger(verdi, `${prefiks}${nokkel}.`)
  );
}

const SVENSK = strenger(sv as Catalog);

/**
 * Frasen som helt ord. `\b` i JavaScript regner bare a–z, 0–9 og _ som
 * bokstaver, så ordgrensen blir feil ved æ, ø, å, ä og ö: `/\bå/` treffer
 * aldri, og «lite» i «ålite» regnes som et helt ord. Derfor bokstavklassen
 * \p{L} i stedet.
 */
function frase(tekst: string): RegExp {
  return new RegExp(`(?<!\\p{L})${tekst}(?!\\p{L})`, 'iu');
}

const FALLGRUVER: Array<{ monster: RegExp; hvorfor: string; skrivHeller: string }> = [
  {
    monster: frase('kartan står'),
    hvorfor: 'et kart «står» ikke på svensk (norsk «der kartet står»)',
    skrivHeller: '«mitt på kartan», «kartans mittpunkt»'
  },
  {
    monster: frase('bäst till ligger'),
    hvorfor: '«ligga bra till» tåler ikke å snus som norsk «best an ligger»',
    skrivHeller: '«bäst är det kring …», «… ligger bäst till»'
  },
  {
    monster: frase('vad som står där du är'),
    hvorfor: '«vad som står där» leses som «hva det står skrevet der»',
    skrivHeller: '«vad som växer där du är»'
  },
  // Falsk venn: norsk «lite» betyr «ikke mye», svensk «lite» betyr «litt, noe».
  // «Lite svamp här nu» leses på svensk som at det finnes en del sopp — det
  // motsatte av det etiketten for de laveste tallene skal si.
  {
    monster: frase('lite svamp'),
    hvorfor: 'svensk «lite» betyr «litt», ikke «lite» (norsk: ikke mye)',
    skrivHeller: '«ont om svamp», «inte mycket svamp»'
  },
  {
    monster: frase('lite att hämta'),
    hvorfor: 'svensk «lite att hämta» betyr «litt å hente», ikke «lite å hente»',
    skrivHeller: '«inte mycket att hämta»'
  }
];

describe('svensken er svensk, ikke norsk ord for ord', () => {
  it('katalogen har innhold, så testen ikke består på en tom fil', () => {
    expect(SVENSK.length).toBeGreaterThan(500);
  });

  for (const { monster, hvorfor, skrivHeller } of FALLGRUVER) {
    it(`ingen tekst bruker ${monster} — ${hvorfor}`, () => {
      const treff = SVENSK.filter(([, tekst]) => monster.test(tekst)).map(([sti]) => sti);
      expect(treff, `skriv heller ${skrivHeller}`).toEqual([]);
    });
  }

  it('de laveste tallene sier «ikke mye» utvetydig på svensk, slik de gjør på norsk', () => {
    expect(nb.HotspotPanel.conditionPoor).toMatch(/^Lite sopp/);
    expect(sv.HotspotPanel.conditionPoor).toMatch(/^(Ont om|Inte mycket) svamp/);
    expect(nb.Soppforhold.leadQuiet).toMatch(/lite å hente/);
    expect(sv.Soppforhold.leadQuiet).toMatch(/inte mycket att hämta/);
  });

  /** Omskrivingene beholder argumentene og taggene — ellers kaster de først på skjermen. */
  it('de omskrevne tekstene formateres fortsatt, med område og lenke på plass', () => {
    for (const [locale, messages] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const soppforhold = createTranslator({ locale, messages, namespace: 'Soppforhold' });
      const ledetekst = soppforhold.markup('leadQuiet', {
        region: 'Umeå',
        count: 22,
        strong: (biter) => `<b>${biter}</b>`,
        varsel: (biter) => `<a>${biter}</a>`
      });
      expect(ledetekst).toContain('<b>Umeå</b>');
      expect(ledetekst).toContain('22');
      expect(ledetekst).toMatch(/<a>[^<]+<\/a>/);

      const skjema = createTranslator({ locale, messages, namespace: 'AddFindingSheet' });
      expect(skjema('positionChooseDifferent', { distance: '1,2 km' })).toContain('1,2 km');
    }
  });
});
