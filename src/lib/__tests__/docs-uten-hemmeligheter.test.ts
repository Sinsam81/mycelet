import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ingen hemmeligheter i klartekst under docs/.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRE LEKKASJER, SAMME ÅRSAK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Repoet er OFFENTLIG. Likevel har tre hemmeligheter havnet i docs/ i klartekst:
 *
 *   1. Passordet til `applereview@mycelet.com` — kontoen Apples reviewer bruker
 *   2. Bankkontonummeret (IBAN) til foretaket
 *   3. Passordet til `qa-autotest@mycelet.com` — en EKTE konto på den live appen,
 *      og samtidig til Apple sandbox-testeren
 *
 * Alle tre ble skrevet av samme grunn: noen skrev en oppskrift som skulle være
 * lett å følge, og limte inn den ekte verdien «bare for nå». Og alle tre står
 * fortsatt i git-historikken — å slette dem fra fila stopper bare blødningen.
 *
 * En formaning i et dokument stopper ikke dette, for det er nettopp dokumentene
 * som er åstedet. Derfor er regelen en test.
 *
 * REGELEN: en oppskrift skal si HVOR hemmeligheten ligger, aldri hva den er.
 *   ✅  «logg inn som qa-autotest@mycelet.com (passord i passordbehandleren)»
 *   ❌  «logg inn: qa-autotest@mycelet.com / Kantarell2026!»
 */

const DOCS = join(process.cwd(), 'docs');

function markdownfiler(katalog: string): string[] {
  return readdirSync(katalog).flatMap((navn) => {
    const sti = join(katalog, navn);
    if (statSync(sti).isDirectory()) return markdownfiler(sti);
    return navn.endsWith('.md') ? [sti] : [];
  });
}

/**
 * Verdier som er lov å stå etter «passord:» — de peker videre i stedet for å
 * røpe noe. Holdes bevisst kort: alt annet skal utløse testen.
 */
const PEKER_VIDERE =
  /(passordbehandler|password manager|se app store connect|se \.env|i passordbehandleren|1password|bitwarden|\.env\.local|<[^>]+>|\*{3,}|xxx|…|\.\.\.)/i;

const MØNSTRE: ReadonlyArray<{ navn: string; regex: RegExp; hvorfor: string }> = [
  {
    navn: 'passord i klartekst',
    // «Passord: hemmelig», «password = hemmelig», og — som i den tredje
    // lekkasjen — «Ett passord til alt: hemmelig», der det står noen ord mellom
    // ordet og kolonet. Inntil fire ord tillates i mellomrommet.
    regex: /(?:passord|password)\w*(?:\s+\S+){0,4}\s*[:=]\s*[`*"']*([^\s`*"'|<>]{8,})/gi,
    hvorfor: 'en oppskrift skal si hvor passordet ligger, ikke hva det er'
  },
  {
    navn: 'norsk kontonummer/IBAN',
    regex: /\bNO\s?\d{2}\s?\d{4}\s?\d{2}\s?\d{5}\b|\bNO\d{13}\b/g,
    hvorfor: 'kontonummer hører hjemme i regnskapssystemet, ikke i et offentlig repo'
  },
  {
    navn: 'e-post med passord på samme linje',
    // Backticks rundt e-posten brøt den første versjonen av dette mønsteret, og
    // det var nettopp slik den tredje lekkasjen var skrevet:
    //   `qa-autotest@mycelet.com` / `Kantarell2026!`
    regex: /[\w.+-]+@[\w.-]+\.\w+[`*"']*\s*\/\s*[`*"']*([^\s`*"'|<>]{8,})/g,
    hvorfor: 'formatet «bruker / passord» er nettopp slik alle tre lekkasjene så ut'
  }
];

describe('docs/ inneholder ingen hemmeligheter i klartekst', () => {
  const filer = markdownfiler(DOCS);

  it('finner faktisk dokumentene — ellers tester vi ingenting', () => {
    expect(filer.length).toBeGreaterThan(5);
  });

  it('har ingen passord, nøkler eller kontonummer skrevet ut', () => {
    const funn: string[] = [];
    for (const sti of filer) {
      const linjer = readFileSync(sti, 'utf8').split('\n');
      linjer.forEach((linje, i) => {
        // Linjer som beskriver selve hendelsen skal ikke felle testen.
        if (/kompromittert|lekket|byttet|sto i klartekst|aldri i en fil|BYTT DET/i.test(linje)) return;
        for (const { navn, regex, hvorfor } of MØNSTRE) {
          regex.lastIndex = 0;
          const m = regex.exec(linje);
          if (!m) continue;
          const verdi = m[1] ?? m[0];
          if (PEKER_VIDERE.test(verdi) || PEKER_VIDERE.test(linje)) continue;
          const fil = sti.slice(process.cwd().length + 1);
          funn.push(`${fil}:${i + 1} — ${navn}: ${hvorfor}\n    ${linje.trim().slice(0, 100)}`);
        }
      });
    }
    expect(
      funn,
      `\nHemmelighet i klartekst i et OFFENTLIG repo:\n\n${funn.join('\n\n')}\n\n` +
        `Skriv hvor verdien ligger, ikke hva den er.\n`
    ).toEqual([]);
  });
});

/**
 * Samme regel, bredere nett.
 *
 * Testen over leser bare markdown under docs/. Et skript med et passord i en
 * konstant, eller en privat e-postadresse i en kommentar, en testfil eller en
 * migrasjon, gikk derfor rett forbi. Denne delen leser tekstfilene i alle
 * katalogene som sjekkes inn.
 *
 * To regler:
 *   1. Ingen hemmelighet som strengkonstant i skript, tester og migrasjoner
 *      (`const PASSWORD = '…'`). Les verdien fra miljøet.
 *   2. Ingen adresser hos private e-postleverandører. Eksempler og testdata
 *      skal bruke example.com / example.org — private e-postadresser hører
 *      ikke hjemme i et offentlig repo, uansett hvem de tilhører.
 */

const ROT = process.cwd();
const TEKSTFIL = /\.(md|mdx|mjs|cjs|js|jsx|ts|tsx|sql|json|html|txt|ya?ml)$/;
const HOPP_OVER = new Set(['node_modules', '.next', 'worktrees', '.auth', '.temp', '.vercel']);

function tekstfiler(katalog: string): string[] {
  let navnene: string[];
  try {
    navnene = readdirSync(katalog);
  } catch {
    return [];
  }
  return navnene.flatMap((navn) => {
    if (HOPP_OVER.has(navn)) return [];
    const sti = join(katalog, navn);
    if (statSync(sti).isDirectory()) return tekstfiler(sti);
    return TEKSTFIL.test(navn) ? [sti] : [];
  });
}

/** Skript, tester og migrasjoner — ikke src/ og messages/, der «passord» er UI-tekst. */
const KODEKATALOGER = ['docs', 'scripts', '.claude', 'e2e', 'supabase', 'content'];
/** E-postregelen gjelder også kildekoden. */
const ALLE_KATALOGER = [...KODEKATALOGER, 'src', 'messages', 'public/landing'];

const HEMMELIG_KONSTANT =
  /(?:PASSWORD|PASSORD|PASSWD|SECRET|TOKEN)\w*\s*[:=]\s*['"`]([^'"`\s]{8,})['"`]/i;
/** Verdier som ikke er en hemmelighet: de leses fra miljøet eller er en plassholder. */
const IKKE_EN_VERDI = /process\.env|\$\{|<[^>]+>|^x{3,}|^\*{3,}|\.\.\.|…/i;

// Bare domenenavn her — ingen hele adresser, så fila feller ikke seg selv.
const PRIVATE_LEVERANDORER = [
  'gmail', 'googlemail', 'yahoo', 'ymail', 'hotmail', 'outlook', 'live', 'msn',
  'icloud', 'me', 'mac', 'online', 'telia', 'proton', 'protonmail', 'pm', 'aol', 'gmx'
];
const PRIVAT_ADRESSE = new RegExp(
  `[A-Za-z0-9._%+-]+@(?:${PRIVATE_LEVERANDORER.join('|')})\\.[a-z]{2,}(?:\\.[a-z]{2,})?\\b`,
  'i'
);

function relativ(sti: string): string {
  return sti.slice(ROT.length + 1);
}

describe('innsjekkede filer inneholder verken hemmeligheter eller private e-postadresser', () => {
  const kodefiler = KODEKATALOGER.flatMap((k) => tekstfiler(join(ROT, k)));
  const allefiler = ALLE_KATALOGER.flatMap((k) => tekstfiler(join(ROT, k)));

  it('finner faktisk filene — ellers tester vi ingenting', () => {
    expect(kodefiler.length).toBeGreaterThan(50);
    expect(allefiler.length).toBeGreaterThan(kodefiler.length);
  });

  it('mønstrene treffer det de skal, og ikke det de ikke skal', () => {
    const konstant = (linje: string) => {
      const m = HEMMELIG_KONSTANT.exec(linje);
      return Boolean(m && !IKKE_EN_VERDI.test(m[1]));
    };
    // Satt sammen av biter, så denne fila ikke feller seg selv.
    expect(konstant(['const PASSWORD = ', "'Eksempelverdi99'", ';'].join(''))).toBe(true);
    expect(konstant('const PASSWORD = process.env.QA_TEST_PASSWORD;')).toBe(false);
    expect(konstant("const TOKEN = '<lim inn her>';")).toBe(false);

    const privat = ['navn.etternavn', 'gmail.com'].join('@');
    expect(PRIVAT_ADRESSE.test(privat)).toBe(true);
    expect(PRIVAT_ADRESSE.test('kari@example.com')).toBe(false);
    expect(PRIVAT_ADRESSE.test('post@mycelet.com')).toBe(false);
    // Et håndtak uten lokaldel er ikke en adresse.
    expect(PRIVAT_ADRESSE.test(['', 'gmail.com'].join('@'))).toBe(false);
  });

  it('har ingen hemmelighet som strengkonstant', () => {
    const funn: string[] = [];
    for (const sti of kodefiler) {
      readFileSync(sti, 'utf8')
        .split('\n')
        .forEach((linje, i) => {
          const m = HEMMELIG_KONSTANT.exec(linje);
          if (!m || IKKE_EN_VERDI.test(m[1])) return;
          // Verdien skrives ikke ut — feilmeldingen havner i CI-logger.
          funn.push(`${relativ(sti)}:${i + 1}`);
        });
    }
    expect(
      funn,
      `\nHemmelighet som strengkonstant i et OFFENTLIG repo:\n\n${funn.join('\n')}\n\n` +
        `Les verdien fra miljøet (process.env / .env.local), aldri fra fila.\n`
    ).toEqual([]);
  });

  it('har ingen adresser hos private e-postleverandører', () => {
    const funn: string[] = [];
    for (const sti of allefiler) {
      readFileSync(sti, 'utf8')
        .split('\n')
        .forEach((linje, i) => {
          // Ingen unntak for «hendelseslinjer» her: en adresse er like synlig
          // uansett hva resten av linja sier.
          if (PRIVAT_ADRESSE.test(linje)) funn.push(`${relativ(sti)}:${i + 1}`);
        });
    }
    expect(
      funn,
      `\nPrivat e-postadresse i et OFFENTLIG repo:\n\n${funn.join('\n')}\n\n` +
        `Bruk en oppdiktet adresse på example.com / example.org, eller si hvor adressen står.\n`
    ).toEqual([]);
  });
});
