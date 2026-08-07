import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FLAGS } from '../flags';

/**
 * App Store-beskrivelsen må matche det appen FAKTISK gjør.
 *
 * Apples regel 2.3 handler om nøyaktig metadata. En reviewer som leser
 * beskrivelsen, leter etter en lovet funksjon og ikke finner den, avviser — og
 * det er en av de vanligste avvisningsgrunnene som finnes, fordi den er så lett
 * å pådra seg ved et uhell.
 *
 * Og det skjedde her: beskrivelsen solgte «Del funn og bilder i forumet» og
 * «Sopptur-modus: logg turen», mens begge sto bak feature-flagg satt til `false`
 * og forumfanen var fjernet fra bunnmenyen. Teksten var skrevet 2026-06-12, og
 * flaggene ble skrudd av senere. Ingen la merke til at de hadde kommet i utakt.
 *
 * Testen binder de to sammen. Skrur noen på et flagg igjen — eller av — feiler
 * den til teksten er oppdatert.
 */

const METADATA = join(process.cwd(), 'docs', 'app-store-metadata.md');

/** Uttrekk av den norske beskrivelsen slik den limes inn i App Store Connect. */
function beskrivelsen(): string {
  const md = readFileSync(METADATA, 'utf8');
  const start = md.indexOf('## Beskrivelse (norsk)');
  expect(start, 'fant ikke overskriften «## Beskrivelse (norsk)»').toBeGreaterThan(-1);
  const blokk = md.slice(start).split('```');
  expect(blokk.length, 'fant ingen kodeblokk under beskrivelsen').toBeGreaterThan(2);
  return blokk[1];
}

/**
 * Ord i beskrivelsen som bare kan stå der hvis flagget er PÅ.
 *
 * Hold denne listen bred nok til å fange en omskrevet setning. «forum» alene er
 * nok — står ordet der mens fanen er skjult, har vi et problem uansett hvordan
 * setningen er formulert.
 */
const LOVER_FUNKSJON: Record<keyof typeof FLAGS, RegExp[]> = {
  forumInNav: [/\bforum\w*/i, /fellesskap/i],
  tripMode: [/sopptur-modus/i, /logg turen/i]
};

describe('App Store-beskrivelsen mot feature-flaggene', () => {
  const tekst = beskrivelsen();

  it('finner faktisk beskrivelsen — ellers tester vi ingenting', () => {
    expect(tekst.length).toBeGreaterThan(400);
    expect(tekst).toMatch(/Mycelet/);
  });

  for (const [flagg, mønstre] of Object.entries(LOVER_FUNKSJON) as Array<
    [keyof typeof FLAGS, RegExp[]]
  >) {
    it(`lover ikke ${flagg} når flagget er av`, () => {
      if (FLAGS[flagg]) return; // funksjonen er på — da SKAL den gjerne nevnes
      const treff = mønstre.filter((m) => m.test(tekst)).map((m) => String(m));
      expect(
        treff,
        `Beskrivelsen nevner ${flagg}, men flagget er false i src/lib/flags.ts. ` +
          `Enten skru på funksjonen, eller stryk den fra docs/app-store-metadata.md — ` +
          `Apples regel 2.3 avviser metadata som lover noe appen ikke gjør.`
      ).toEqual([]);
    });
  }
});

describe('tegn App Store Connect nekter', () => {
  it('inneholder ingen emoji i beskrivelsen', () => {
    // App Store Connect avviste beskrivelsen med «This field contains one or
    // more invalid characters». Årsaken var én enkelt 🍄 på siste linje.
    //
    // Feilen er dyr fordi den ikke oppdages før noen limer teksten inn i
    // skjemaet — altså helt til slutt, når man tror man er ferdig.
    //
    // Kulepunkt (•), tankestrek (—), «hermetegn» og é er derimot GREIE. Det er
    // bare tegn over U+2500, altså emoji og symboler, som ryker.
    const emoji = [...beskrivelsen()].filter((c) => (c.codePointAt(0) ?? 0) > 0x2500);
    expect(
      emoji,
      `Beskrivelsen inneholder ${emoji.join(' ')} — App Store Connect avviser feltet. ` +
        `Kulepunkt, tankestrek og «» er greie; emoji er det ikke.`
    ).toEqual([]);
  });

  it('holder seg innenfor Apples 4000 tegn', () => {
    expect(beskrivelsen().length).toBeLessThan(4000);
  });
});

describe('metadata-tall som eldes', () => {
  it('lover ikke flere arter enn katalogen har', () => {
    // Beskrivelsen sier «over N arter». N må være lavere enn det katalogen
    // faktisk inneholder, ellers er den en overdrivelse. Vi kan ikke spørre
    // databasen herfra, så vi vokter bare at tallet er formulert som et
    // MINIMUM («over N») og ikke som et eksakt tall som garantert eldes.
    const m = beskrivelsen().match(/Artsbibliotek med (\S+) (\d+) arter/);
    expect(m, 'fant ikke artstallet i beskrivelsen').not.toBeNull();
    expect(m?.[1], 'artstallet må være et minimum («over N»), ikke et eksakt tall').toBe('over');
  });

  it('oppgir funntallet som et minimum, ikke et eksakt tall', () => {
    // Sto lenge på «185 000» mens basen hadde passert 400 000. Et eksakt tall i
    // butikkteksten blir feil i det øyeblikket importen kjører igjen.
    const m = beskrivelsen().match(/Soppkart med (\S+) ([\d\s ]+) registrerte funn/);
    expect(m, 'fant ikke funntallet i beskrivelsen').not.toBeNull();
    expect(m?.[1], 'funntallet må være et minimum («over N»)').toBe('over');
  });
});
