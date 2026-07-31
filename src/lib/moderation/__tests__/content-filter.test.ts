import { describe, expect, it } from 'vitest';
import { checkContent, isProhibitedContentError } from '../content-filter';

describe('content filter — blocks supply and demand', () => {
  it.each([
    'Selger fleinsopp, dm meg',
    'Noen som vet hvor jeg kan kjøpe fleinsopp?',
    'Säljer psilocybe cubensis, skickar mot betalning',
    'Bytter sporesprøyte med cubensis mot kontanter',
    'Voksested for fleinsopp i Nordmarka, koordinater i DM',
    'Dyrker cubensis hjemme, spore syringe til salgs',
    'Växtplats för toppslätskivling nära Göteborg'
  ])('rejects %j', (text) => {
    expect(checkContent(text).ok).toBe(false);
    expect(checkContent(text).reason).toBe('controlled_substance_trade');
  });
});

describe('content filter — lets legitimate talk through', () => {
  // The point of requiring BOTH a substance and an intent word: a warning that
  // something is illegal must not be censored by the rule against selling it.
  it.each([
    'Husk at fleinsopp er ulovlig i Norge',
    'Fleinsopp står på narkotikalisten — ikke plukk den',
    'Psilocybin är klassat som narkotika i Sverige, så låt den stå',
    'Jeg fant noe som lignet liberty cap, men lot den stå',
    'Er dette en fleinsopp? Vil bare vite hva jeg ser på'
  ])('allows %j', (text) => {
    expect(checkContent(text).ok).toBe(true);
  });

  it.each([
    'Selger kantareller fra egen hage',
    'Kjøpte ny sopp-kniv, veldig fornøyd',
    'Dyrker østerssopp på kaffegrut',
    'Koordinater til en fin kantarellskog, send DM',
    // A spore syringe on its own is not evidence of anything — they are sold
    // for perfectly legal gourmet species. It needs a named substance too.
    'Selger sporesprøyte til østerssopp'
  ])('does not trip on ordinary mushroom talk: %j', (text) => {
    expect(checkContent(text).ok).toBe(true);
  });

  it('is a no-op on empty input', () => {
    expect(checkContent().ok).toBe(true);
    expect(checkContent('', null, undefined).ok).toBe(true);
  });

  it('checks all supplied fields together, not just the first', () => {
    // Title innocuous, body not — the pair still has to be caught.
    expect(checkContent('Fin tur i skogen', 'forresten, selger fleinsopp').ok).toBe(false);
  });
});

describe('database-side rejection is recognised', () => {
  it('maps the trigger error to the same friendly path', () => {
    expect(isProhibitedContentError({ message: 'MYCELET_PROHIBITED_CONTENT' })).toBe(true);
    expect(isProhibitedContentError('… MYCELET_PROHIBITED_CONTENT …')).toBe(true);
  });

  it('ignores unrelated errors', () => {
    expect(isProhibitedContentError({ message: 'duplicate key value' })).toBe(false);
    expect(isProhibitedContentError(null)).toBe(false);
    expect(isProhibitedContentError(undefined)).toBe(false);
  });
});

describe('the SQL trigger and the TS filter must not drift apart', () => {
  // The pattern list exists twice on purpose — TS for immediate feedback, SQL so
  // it cannot be bypassed. Duplication is only safe if drift is caught.
  const readFile = (rel: string) =>
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    (require('node:fs') as typeof import('node:fs')).readFileSync(
      new URL(rel, import.meta.url),
      'utf8'
    );

  /** Normalise Postgres and JS character-class spellings to one form. */
  const tokens = (pattern: string) =>
    pattern
      .replace(/\((a\|ä)\)|\[aä\]/g, 'ä')
      .replace(/\((o\|ö)\)|\[oö\]/g, 'ö')
      .replace(/\((o\|ø)\)|\[oø\]/g, 'ø')
      .replace(/\\\\s/g, '\\s')
      .split('|')
      .map((t) => t.trim())
      .filter(Boolean)
      .sort();

  it('has the same substance and intent lists in both places', () => {
    const sql = readFile('../../../../supabase/migrations/032_block_users_and_content_filter.sql');
    const ts = readFile('../content-filter.ts');

    const sqlSubstance = /substance text := '\((.+?)\)';/.exec(sql)?.[1];
    const sqlIntent = /intent text := '\((.+?)\)';/.exec(sql)?.[1];
    const tsSubstance = /const SUBSTANCE =\s*\/\((.+?)\)\/i;/s.exec(ts)?.[1];
    const tsIntent = /const INTENT =\s*\/\((.+?)\)\/i;/s.exec(ts)?.[1];

    // If these are null the regexes above need updating, not the assertion.
    expect(sqlSubstance, 'could not find substance list in the migration').toBeTruthy();
    expect(tsSubstance, 'could not find SUBSTANCE in content-filter.ts').toBeTruthy();
    expect(sqlIntent, 'could not find intent list in the migration').toBeTruthy();
    expect(tsIntent, 'could not find INTENT in content-filter.ts').toBeTruthy();

    expect(tokens(sqlSubstance!)).toEqual(tokens(tsSubstance!));
    expect(tokens(sqlIntent!)).toEqual(tokens(tsIntent!));
  });
});
