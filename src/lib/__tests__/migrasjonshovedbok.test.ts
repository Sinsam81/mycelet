import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hovedboka over migrasjoner (docs/migrasjoner-a-kjore.md) holdt opp mot
 * filene i supabase/migrations.
 *
 * Migrasjonene limes inn for hånd, og hovedboka er det eneste stedet som sier
 * hva som er kjørt. Den hadde en regel («hver PR legger til raden sin») og én
 * spørring eieren kan lime inn for å få svaret. Spørringen manglet 17 av 36
 * migrasjoner, og teksten sendte leseren til «kontrollspørringen nederst i
 * fila» for filer som ikke har noen. Ni rader kunne dermed aldri bekreftes —
 * blant dem sikkerhetsrettingene av spiselighet.
 *
 * En regel som bare står i et dokument holder ikke. Derfor er den en test:
 * en ny migrasjon som mangler raden sin i tabellen eller i spørringen, feiler
 * her.
 *
 * Kan en framtidig migrasjon ikke bekreftes med en lesende spørring, skal den
 * likevel ha en rad — `('NNN', NULL::boolean)` — så tomrommet er synlig for
 * den som leser svaret.
 */

const ROT = process.cwd();
const MIGRASJONER = join(ROT, 'supabase', 'migrations');
const HOVEDBOK = join(ROT, 'docs', 'migrasjoner-a-kjore.md');

/** Alt til og med 038 var bekreftet kjørt da hovedboka ble opprettet. */
const FORSTE_I_HOVEDBOKA = 39;

const alleFiler = readdirSync(MIGRASJONER)
  .filter((f) => /^\d{3}_.+\.sql$/.test(f))
  .sort();
const filer = alleFiler.filter((f) => Number(f.slice(0, 3)) >= FORSTE_I_HOVEDBOKA);
const numre = filer.map((f) => f.slice(0, 3));
const hovedbok = readFileSync(HOVEDBOK, 'utf8');

/** Spørringen eieren limer inn: den første sql-blokka som åpner med VALUES-lista. */
function sporring(): string {
  const m = hovedbok.match(/```sql\n(SELECT \* FROM \(VALUES[\s\S]*?)\n```/);
  if (!m) throw new Error('Fant ikke spørringen i docs/migrasjoner-a-kjore.md');
  return m[1];
}

/** Uten strenger: det som står igjen er nøkkelord, navn og funksjonskall. */
function utenStrenger(sql: string): string {
  return sql.replace(/'(?:[^']|'')*'/g, "''");
}

/** Numrene fra en linje i hovedboka som åpner med en uthevet ledetekst. */
function numreEtter(ledetekst: RegExp): string[] {
  const m = hovedbok.match(ledetekst);
  if (!m) throw new Error(`Fant ikke linja ${ledetekst} i docs/migrasjoner-a-kjore.md`);
  return (m[1].match(/\d{3}/g) ?? []).sort();
}

/**
 * Hvor kontrollspørringen står i en migrasjonsfil. De er skrevet som
 * utkommentert SQL, så vi leter etter «-- select …» / «-- explain …».
 * «-- SELECT-policyen er …» i 058 er prosa og skal ikke telle.
 */
function kontrollplass(fil: string): 'nederst' | 'hode' | 'begge' | null {
  const linjer = readFileSync(join(MIGRASJONER, fil), 'utf8').split('\n');
  const erSql = (l: string) => l.trim() !== '' && !l.trim().startsWith('--');
  const forsteSql = linjer.findIndex(erSql);
  const sisteSql = linjer.length - 1 - [...linjer].reverse().findIndex(erSql);
  const kontroller = linjer.flatMap((l, i) => (/^--\s*(select|explain)\s/i.test(l) ? [i] : []));
  if (kontroller.length === 0) return null;
  if (kontroller.every((i) => i > sisteSql)) return 'nederst';
  if (kontroller.every((i) => i < forsteSql)) return 'hode';
  return 'begge';
}

describe('migrasjonshovedboka dekker hver migrasjon fra 039', () => {
  it('finner filene og spørringen — ellers tester vi ingenting', () => {
    expect(filer.length).toBeGreaterThanOrEqual(36);
    expect(sporring()).toContain('AS t(migrasjon, kjort)');
  });

  it('ingen to migrasjoner deler nummer', () => {
    const sett = new Set<string>();
    const dubletter = alleFiler.filter((f) => {
      const nr = f.slice(0, 3);
      if (sett.has(nr)) return true;
      sett.add(nr);
      return false;
    });
    expect(dubletter, 'To filer med samme nummer: gi den nyeste neste ledige.').toEqual([]);
  });

  it('har en rad i tabellen for hver fil, med riktig filnavn', () => {
    const mangler = filer.filter((f) => !hovedbok.includes(`| ${f.slice(0, 3)} | \`${f}\` |`));
    expect(
      mangler,
      `\nMigrasjoner uten rad i docs/migrasjoner-a-kjore.md:\n  ${mangler.join('\n  ')}\n\n` +
        `Legg til raden med status «ikke kjørt».\n`
    ).toEqual([]);
  });

  it('har ingen rad i tabellen som peker på en fil som ikke finnes', () => {
    const rader = [...hovedbok.matchAll(/^\| (\d{3}) \| `([^`]+)` \|/gm)].map((m) => ({ nr: m[1], fil: m[2] }));
    expect(rader.length).toBe(filer.length);
    expect(rader.filter((r) => !filer.includes(r.fil) || !r.fil.startsWith(`${r.nr}_`))).toEqual([]);
  });

  it('har nøyaktig én rad i spørringen for hver fil', () => {
    const iSporringen = [...sporring().matchAll(/^\s*\('(\d{3})',/gm)].map((m) => m[1]);
    expect(
      iSporringen,
      `\nSpørringen i docs/migrasjoner-a-kjore.md skal ha én rad per migrasjon fra 039.\n` +
        `Mangler: ${numre.filter((n) => !iSporringen.includes(n)).join(', ') || '(ingen)'}\n` +
        `Uten fil: ${iSporringen.filter((n) => !numre.includes(n)).join(', ') || '(ingen)'}\n`
    ).toEqual(numre);
  });
});

describe('spørringen i hovedboka leser bare', () => {
  // Den limes inn i produksjon av en som stoler på setningen «ingenting endres».
  const sql = utenStrenger(sporring());

  it('er én SELECT-setning', () => {
    expect(sql.startsWith('SELECT * FROM (VALUES')).toBe(true);
    expect(sql.match(/;/g) ?? []).toHaveLength(1);
    expect(sql.trimEnd().endsWith(';')).toBe(true);
  });

  it('inneholder ingen skrivende nøkkelord', () => {
    const skrivende =
      sql.match(
        /\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|comment|notify|call|do|copy|set|lock|vacuum|refresh|reindex|into)\b/gi
      ) ?? [];
    expect(skrivende).toEqual([]);
  });

  it('kaller bare funksjoner som slår opp, aldri noen som gjør noe', () => {
    // Alt som står rett foran en parentes: SQL-ord og funksjonskall. En ny
    // funksjon i spørringen må inn her med vilje — set_config(), nextval() og
    // pg_terminate_backend() er også «bare en SELECT».
    const tillatt = new Set([
      'from',
      'values',
      'exists',
      'where',
      'and',
      'in',
      't',
      'count',
      'concat_ws',
      'to_regclass',
      'to_regproc',
      'has_table_privilege',
      'has_column_privilege',
      'pg_get_constraintdef'
    ]);
    const foranParentes = [...sql.matchAll(/([a-z_][a-z0-9_.]*)\s*\(/gi)].map((m) => m[1].toLowerCase());
    // «FROM (VALUES (» står alltid der — finner vi ikke det, leter mønsteret feil.
    expect(foranParentes).toContain('values');
    expect([...new Set(foranParentes.filter((navn) => !tillatt.has(navn)))]).toEqual([]);
  });
});

describe('hovedboka sier riktig hvor kontrollspørringene står', () => {
  // Den forrige teksten sendte leseren til «kontrollspørringen nederst i fila»
  // for 046, 047, 048, 049 og 065, som ikke har noen, og kalte hodet «nederst».
  const medKontroll = (plass: 'nederst' | 'hode') => filer.filter((f) => kontrollplass(f) === plass).map((f) => f.slice(0, 3));

  it('ingen fil har kontroller både i hodet og nederst (da må hovedboka si det)', () => {
    expect(filer.filter((f) => kontrollplass(f) === 'begge')).toEqual([]);
  });

  const hjelp =
    '\nLinja i docs/migrasjoner-a-kjore.md stemmer ikke med filene. Kontrollspørringer er ' +
    'utkommentert SQL («-- select …»); oppdater linja når en fil får eller mister en.\n';

  it('«Nederst i fila» lister nøyaktig filene som har en kontrollspørring etter SQL-en', () => {
    expect(numreEtter(/\*\*Nederst i fila:\*\*([^\n]*)/), hjelp).toEqual(medKontroll('nederst'));
  });

  it('«I filhodet» lister nøyaktig filene som har den før SQL-en', () => {
    expect(numreEtter(/\*\*I filhodet[^*\n]*:\*\*([^\n]*)/), hjelp).toEqual(medKontroll('hode'));
  });
});
