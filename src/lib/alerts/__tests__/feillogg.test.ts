import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { _createTestLogger } from '@/lib/log';

/**
 * Feillinjene i varselkoden skal si HVA som feilet.
 *
 * Logger.error tar feilen som ANDRE argument og konteksten som TREDJE:
 *
 *     log.error('soppvarsel.lagring_feilet', undefined, { message: error.message })
 *
 * Femten kall i varselrutene sendte konteksten som andre argument
 * (`log.error('…', { message })`). Da tolkes objektet som selve feilen, og
 * siden det ikke er en Error, blir det skrevet ut med String() — linja i
 * loggen sa `{"err":{"name":"NonError","message":"[object Object]"}}`. Akkurat
 * de linjene noen leter etter når varselet har vært stille: «fikk ikke lagret
 * dagens regionscorer», «kravet ble ikke tilbakestilt», «utsendingen feilet».
 *
 * (`log.warn` og `log.info` tar konteksten som andre argument, så feilen er
 * lett å gjøre — og usynlig, for kallet er gyldig TypeScript.)
 *
 * Regelen holdes her for varselkoden. Roten er signaturen i src/lib/log, som
 * brukes likt i resten av appen.
 */

const ROT = process.cwd();
const KATALOGER = [
  'src/app/api/soppvarsel',
  'src/app/api/cron/soppvarsel',
  'src/app/api/cron/purre-bekreftelse',
  'src/app/soppvarsel',
  'src/app/soppforhold',
  'src/components/soppforhold',
  'src/lib/alerts',
  'src/lib/email',
  'src/lib/onboarding'
];

function kildefiler(katalog: string): string[] {
  return readdirSync(katalog).flatMap((navn) => {
    if (navn === '__tests__') return [];
    const sti = join(katalog, navn);
    if (statSync(sti).isDirectory()) return kildefiler(sti);
    return /\.tsx?$/.test(navn) ? [sti] : [];
  });
}

/** `.error('hendelse', {` — også når argumentene står på hver sin linje. */
const KONTEKST_SOM_FEIL = /\.error\(\s*(['"`])[^'"`]+\1\s*,\s*\{/g;

describe('feillogging i varselkoden', () => {
  it('premisset: et kontekstobjekt som andre argument blir «[object Object]»', () => {
    const linjer: string[] = [];
    const log = _createTestLogger({ level: 'debug', writer: { write: (linje) => linjer.push(linje) } });

    log.error('feil.bruk', { message: 'duplicate key value' });
    expect(linjer[0]).toContain('[object Object]');
    expect(linjer[0]).not.toContain('duplicate key value');

    log.error('riktig.bruk', undefined, { message: 'duplicate key value' });
    expect(linjer[1]).toContain('duplicate key value');
    expect(linjer[1]).not.toContain('[object Object]');

    // Ryker denne testen, har loggeren begynt å ta imot kontekst som andre
    // argument. Da kan regelen under fjernes.
  });

  it('mønsteret treffer feilbruken og slipper riktig bruk gjennom', () => {
    const treffer = (kode: string) => {
      KONTEKST_SOM_FEIL.lastIndex = 0;
      return KONTEKST_SOM_FEIL.test(kode);
    };
    expect(treffer("log.error('a.b', { message: e.message });")).toBe(true);
    expect(treffer("logger.error(\n  'a.b',\n  { message }\n);")).toBe(true);
    expect(treffer("log.error('a.b', undefined, { message: e.message });")).toBe(false);
    expect(treffer("log.error('a.b', err, { tidsavbrudd: true });")).toBe(false);
    expect(treffer("log.error('a.b', err);")).toBe(false);
    expect(treffer("log.warn('a.b', { message: e.message });")).toBe(false);
  });

  it('ingen feillinje i varselkoden sender konteksten som feil', () => {
    const filer = KATALOGER.flatMap((k) => kildefiler(join(ROT, k)));
    expect(filer.length).toBeGreaterThan(20);

    const funn: string[] = [];
    for (const sti of filer) {
      const kilde = readFileSync(sti, 'utf8');
      KONTEKST_SOM_FEIL.lastIndex = 0;
      for (let treff = KONTEKST_SOM_FEIL.exec(kilde); treff; treff = KONTEKST_SOM_FEIL.exec(kilde)) {
        const linje = kilde.slice(0, treff.index).split('\n').length;
        funn.push(`${sti.slice(ROT.length + 1)}:${linje}`);
      }
    }
    expect(
      funn,
      `\nKontekst sendt som feil — linja i loggen blir «[object Object]»:\n\n${funn.join('\n')}\n\n` +
        `Skriv log.error('hendelse', undefined, { … }) eller log.error('hendelse', feil, { … }).\n`
    ).toEqual([]);
  });
});
