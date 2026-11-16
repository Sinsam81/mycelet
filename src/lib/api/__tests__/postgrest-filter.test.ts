import { describe, expect, it } from 'vitest';
import { filterVerdi, inneholderMonster, likeBokstavelig } from '../postgrest-filter';

/**
 * `.or()` tar filteret som én streng. Tekst som settes rett inn der, slutter å
 * være tekst: komma skiller vilkår, punktum skiller kolonne fra operator.
 *
 * Testene leser verdien tilbake slik PostgREST gjør det (reglene står i
 * `lesSomPostgrest` under), og sjekker at det som kommer ut er NØYAKTIG det
 * som gikk inn — som én verdi.
 */

/**
 * PostgRESTs egen lesing av verdien i et logisk filter, skrevet av fra
 * parseren (pLogicSingleVal / pQuotedValue): står verdien i anførselstegn, er
 * alt fram til neste uescapede `"` verdi, og `\x` betyr `x`. Uten
 * anførselstegn slutter verdien ved første komma eller sluttparentes.
 *
 * Gir verdien og resten av strengen — resten er det PostgREST ville lest som
 * NESTE vilkår.
 */
function lesSomPostgrest(filter: string): { verdi: string; rest: string } {
  if (!filter.startsWith('"')) {
    const slutt = filter.search(/[,)]/);
    return slutt === -1 ? { verdi: filter, rest: '' } : { verdi: filter.slice(0, slutt), rest: filter.slice(slutt) };
  }
  let verdi = '';
  let i = 1;
  while (i < filter.length && filter[i] !== '"') {
    if (filter[i] === '\\') i += 1;
    verdi += filter[i] ?? '';
    i += 1;
  }
  return { verdi, rest: filter.slice(i + 1) };
}

/** Hva Postgres' LIKE gjør med et mønster: gjør det om til et regulært uttrykk. */
function likeTilRegex(monster: string): RegExp {
  let ut = '';
  for (let i = 0; i < monster.length; i += 1) {
    const c = monster[i];
    if (c === '\\') {
      i += 1;
      ut += (monster[i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    } else if (c === '%') ut += '[\\s\\S]*';
    else if (c === '_') ut += '[\\s\\S]';
    else ut += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${ut}$`, 'i');
}

const FARLIGE = [
  'Ola, Nordmann',
  'x%,id.not.is.null,username.ilike.%',
  'a),or(id.not.is.null',
  'sitat "midt" i',
  'bakstrek \\ her',
  'slutter på bakstrek\\',
  '\\"',
  '50%_rabatt',
  'punktum.og:kolon',
  '"'
];

describe('filterVerdi', () => {
  it('lar en vanlig verdi stå, i anførselstegn', () => {
    expect(filterVerdi('noen@example.com')).toBe('"noen@example.com"');
  });

  it('escaper bare de to tegnene som betyr noe inni anførselstegn', () => {
    expect(filterVerdi('a"b')).toBe('"a\\"b"');
    expect(filterVerdi('a\\b')).toBe('"a\\\\b"');
    expect(filterVerdi('a,b.c:(d)')).toBe('"a,b.c:(d)"');
  });

  it.each(FARLIGE)('«%s» kommer ut som én verdi, uendret, uten noe til overs', (tekst) => {
    const { verdi, rest } = lesSomPostgrest(filterVerdi(tekst));
    expect(verdi).toBe(tekst);
    // Alt som står igjen her, ville PostgREST lest som et NYTT vilkår.
    expect(rest).toBe('');
  });

  it('en adresse med anførselstegn kan ikke åpne et vilkår til', () => {
    // Formen dataeksporten bruker: user_id.eq.<id>,email.eq.<adresse>
    const adresse = 'x",user_id.not.is.null,email.eq."y@example.com';
    const { verdi, rest } = lesSomPostgrest(filterVerdi(adresse));
    expect(verdi).toBe(adresse);
    expect(rest).toBe('');
  });
});

describe('likeBokstavelig', () => {
  it('gjør jokertegnene og escape-tegnet om til vanlige tegn', () => {
    expect(likeBokstavelig('50%')).toBe('50\\%');
    expect(likeBokstavelig('ola_n')).toBe('ola\\_n');
    expect(likeBokstavelig('a\\b')).toBe('a\\\\b');
    expect(likeBokstavelig('Kantarell Kari')).toBe('Kantarell Kari');
  });
});

describe('inneholderMonster', () => {
  it('et vanlig søk blir %søk% i anførselstegn', () => {
    expect(inneholderMonster('ola')).toBe('"%ola%"');
  });

  it.each(FARLIGE)('«%s» blir ett mønster som matcher teksten selv, og ikke noe annet', (tekst) => {
    const { verdi: monster, rest } = lesSomPostgrest(inneholderMonster(tekst));
    expect(rest).toBe('');

    const like = likeTilRegex(monster);
    // Finner teksten midt i et navn …
    expect(like.test(`før ${tekst} etter`)).toBe(true);
    expect(like.test(tekst)).toBe(true);
    // … og bare den: jokertegn brukeren skrev, er ikke jokertegn lenger.
    expect(like.test('noe helt annet')).toBe(false);
  });

  it('understrek og prosent i søket matcher bare seg selv', () => {
    const like = likeTilRegex(lesSomPostgrest(inneholderMonster('ola_n')).verdi);
    expect(like.test('ola_nordmann')).toBe(true);
    // Uescapet ville `_` matchet et hvilket som helst tegn.
    expect(like.test('olaXnordmann')).toBe(false);

    const prosent = likeTilRegex(lesSomPostgrest(inneholderMonster('100%')).verdi);
    expect(prosent.test('100% sopp')).toBe(true);
    expect(prosent.test('1000 sopp')).toBe(false);
  });

  it('hele or-filteret har nøyaktig to vilkår, uansett hva det søkes på', () => {
    // Slik ruta setter det sammen. Teller vilkårene slik PostgREST ville delt dem.
    for (const tekst of FARLIGE) {
      const m = inneholderMonster(tekst);
      let rest = `username.ilike.${m},display_name.ilike.${m}`;
      const kolonner: string[] = [];
      while (rest.length > 0) {
        const treff = /^,?([a-z_]+)\.ilike\./.exec(rest);
        expect(treff, `uventet rest: ${rest}`).not.toBeNull();
        kolonner.push(treff![1]);
        rest = lesSomPostgrest(rest.slice(treff![0].length)).rest;
      }
      expect(kolonner, tekst).toEqual(['username', 'display_name']);
    }
  });
});
