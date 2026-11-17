import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { repoFiler } from './repo-filer';

/**
 * Ingen hemmeligheter i klartekst i noe som sjekkes inn.
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
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVILKE FILER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vakta leste før docs/ med de strengeste reglene og en fast liste kataloger
 * med resten. Utenfor sto rotfilene (CLAUDE.md, README.md, AGENTS.md,
 * .env.example), public/ utenom landing, ios/, android/ og .github/, og
 * filtypene .plist, .xml, .gradle og .properties. CLAUDE.md er fila agentene
 * skriver mest i, og den beskriver QA-kontoen: en linje i formatet til den
 * tredje lekkasjen der hadde latt alle testene stå grønne. gitleaks er ikke
 * noe nett for slikt — den slapp passordet til Apple-kontoen gjennom.
 *
 * Nå kommer fillista fra git (repo-filer.ts): alt som er sjekket inn, pluss nye
 * filer som ikke er ignorert. Hver tekstfil leses; binærfiler kjennes på en
 * NUL-byte tidlig i fila, samme kjennetegn som git bruker. Markdown-reglene
 * gjelder hver .md, også i roten.
 */

const ROT = process.cwd();

/** Hver tekstfil git ville tatt med i neste commit, med innholdet. */
const TEKSTER: ReadonlyMap<string, string> = new Map(
  repoFiler(ROT).flatMap((sti) => {
    const innhold = readFileSync(join(ROT, sti));
    return innhold.subarray(0, 8000).includes(0) ? [] : [[sti, innhold.toString('utf8')] as const];
  })
);
const tekstfiler = [...TEKSTER.keys()];

/** Linjene i en fil, med linjenummer fra 1. */
function linjer(sti: string): Array<[nr: number, linje: string]> {
  return (TEKSTER.get(sti) ?? '').split('\n').map((linje, i) => [i + 1, linje]);
}

/** Verdien som traff, byttet ut — feilmeldingen havner i CI-logger, og repoet er offentlig. */
function skjul(linje: string, verdi: string): string {
  return linje.split(verdi).join('<skjult>').trim().slice(0, 100);
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

describe('markdown i repoet inneholder ingen hemmeligheter i klartekst', () => {
  const filer = tekstfiler.filter((sti) => /\.mdx?$/.test(sti));

  it('finner faktisk dokumentene, også dem i roten — ellers tester vi ingenting', () => {
    expect(filer.length).toBeGreaterThan(5);
    expect(filer.some((sti) => sti.startsWith('docs/'))).toBe(true);
    expect(filer).toContain('CLAUDE.md');
    expect(filer).toContain('README.md');
  });

  it('har ingen passord, nøkler eller kontonummer skrevet ut', () => {
    const funn: string[] = [];
    for (const sti of filer) {
      for (const [nr, linje] of linjer(sti)) {
        // Linjer som beskriver selve hendelsen skal ikke felle testen.
        if (/kompromittert|lekket|byttet|sto i klartekst|aldri i en fil|BYTT DET/i.test(linje)) continue;
        for (const { navn, regex, hvorfor } of MØNSTRE) {
          regex.lastIndex = 0;
          const m = regex.exec(linje);
          if (!m) continue;
          const verdi = m[1] ?? m[0];
          if (PEKER_VIDERE.test(verdi) || PEKER_VIDERE.test(linje)) continue;
          funn.push(`${sti}:${nr} — ${navn}: ${hvorfor}\n    ${skjul(linje, verdi)}`);
        }
      }
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
 * Testen over leser bare markdown. Et skript med et passord i en konstant,
 * en privat e-postadresse i en kommentar, en testfil eller en migrasjon, eller
 * en ekte nøkkel i .env.example gikk derfor rett forbi. Denne delen leser hver
 * tekstfil.
 *
 * Tre regler:
 *   1. Ingen hemmelighet som strengkonstant (`const PASSWORD = '…'`). Les
 *      verdien fra miljøet. Gjelder ikke src/ og messages/, der «passord» og
 *      «token» er UI-tekst og navn i koden.
 *   2. Ingen adresser hos private e-postleverandører. Eksempler og testdata
 *      skal bruke example.com / example.org — private e-postadresser hører
 *      ikke hjemme i et offentlig repo, uansett hvem de tilhører.
 *   3. I en .env-fil står en nøkkel, en hemmelighet eller et passord tomt
 *      eller som plassholder (`sk_test_xxxxx`, `your-api-key-here`, `eyJ…...`)
 *      — også på kommenterte linjer.
 */

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

/** «NAVN=verdi» i en .env-fil, også bak #. */
const ENV_LINJE = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=(.*)$/;
/** Navn som peker på noe hemmelig. En DSN er det ikke — den ligger i klientkoden. */
const ENV_HEMMELIG_NAVN = /(?:KEY|SECRET|TOKEN|PASSWORD|PASSORD|PASSWD|AUTH|CLIENT_ID)$/;
/** Tom, eller tydelig en plassholder. */
const ENV_PLASSHOLDER = /^$|x{3,}|\.\.\.|…|<[^>]+>|^your-/i;

/** Verdien i en .env-linje uten anførselstegn og halekommentar — eller null når den er lov. */
function ekteEnvVerdi(linje: string): string | null {
  const m = ENV_LINJE.exec(linje);
  if (!m || !ENV_HEMMELIG_NAVN.test(m[1])) return null;
  const verdi = m[2]
    .replace(/\s+#.*$/, '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
  return ENV_PLASSHOLDER.test(verdi) ? null : verdi;
}

describe('innsjekkede filer inneholder verken hemmeligheter eller private e-postadresser', () => {
  /** Alt utenom src/ og messages/, der «passord» og «token» er UI-tekst og navn i koden. */
  const kodefiler = tekstfiler.filter((sti) => !/^(?:src|messages)\//.test(sti));
  const envfiler = tekstfiler.filter((sti) => basename(sti).startsWith('.env'));

  it('finner faktisk filene — ellers tester vi ingenting', () => {
    expect(kodefiler.length).toBeGreaterThan(50);
    expect(tekstfiler.length).toBeGreaterThan(kodefiler.length);
    expect(envfiler).toContain('.env.example');
  });

  it('leser også det den gamle kataloglista gikk forbi', () => {
    const forbigatt: ReadonlyArray<[hva: string, sti: RegExp]> = [
      ['rotfilene', /^[^/]+\.md$/],
      ['public/ utenom landing', /^public\/(?!landing\/)/],
      ['ios/', /^ios\//],
      ['.github/', /^\.github\//],
      ['.plist', /\.plist$/],
      ['.xml', /\.xml$/],
      ['.gradle', /\.gradle$/],
      ['.properties', /\.properties$/]
    ];
    // Er en av dem borte fra repoet med vilje, fjernes linja her.
    const mangler = forbigatt.filter(([, sti]) => !kodefiler.some((f) => sti.test(f))).map(([hva]) => hva);
    expect(mangler).toEqual([]);
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

    // .env: en ekte verdi feller, også bak # og i anførselstegn …
    const ekte = ['re_', 'Eksempel', 'verdi99'].join('');
    expect(ekteEnvVerdi(`RESEND_API_KEY=${ekte}`)).toBe(ekte);
    expect(ekteEnvVerdi(`# CRON_SECRET="${ekte}"`)).toBe(ekte);
    expect(ekteEnvVerdi(`QA_TEST_PASSWORD=${ekte} # bare for nå`)).toBe(ekte);
    // … men ikke en tom linje, en plassholder eller et navn som ikke er hemmelig.
    expect(ekteEnvVerdi('RESEND_API_KEY=')).toBe(null);
    expect(ekteEnvVerdi('STRIPE_SECRET_KEY=sk_test_xxxxx')).toBe(null);
    expect(ekteEnvVerdi('PLANTID_API_KEY=your-api-key-here')).toBe(null);
    expect(ekteEnvVerdi('SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...')).toBe(null);
    expect(ekteEnvVerdi('# REVENUECAT_WEBHOOK_AUTH=<lim inn her>')).toBe(null);
    expect(ekteEnvVerdi('NEXT_PUBLIC_APP_URL=http://localhost:3000')).toBe(null);
    expect(ekteEnvVerdi('# Tom: alle cron-ruter svarer 401.')).toBe(null);
  });

  it('har ingen hemmelighet som strengkonstant', () => {
    const funn: string[] = [];
    for (const sti of kodefiler) {
      for (const [nr, linje] of linjer(sti)) {
        const m = HEMMELIG_KONSTANT.exec(linje);
        if (!m || IKKE_EN_VERDI.test(m[1])) continue;
        // Verdien skrives ikke ut — feilmeldingen havner i CI-logger.
        funn.push(`${sti}:${nr}`);
      }
    }
    expect(
      funn,
      `\nHemmelighet som strengkonstant i et OFFENTLIG repo:\n\n${funn.join('\n')}\n\n` +
        `Les verdien fra miljøet (process.env / .env.local), aldri fra fila.\n`
    ).toEqual([]);
  });

  it('har ingen adresser hos private e-postleverandører', () => {
    const funn: string[] = [];
    for (const sti of tekstfiler) {
      for (const [nr, linje] of linjer(sti)) {
        // Ingen unntak for «hendelseslinjer» her: en adresse er like synlig
        // uansett hva resten av linja sier.
        if (PRIVAT_ADRESSE.test(linje)) funn.push(`${sti}:${nr}`);
      }
    }
    expect(
      funn,
      `\nPrivat e-postadresse i et OFFENTLIG repo:\n\n${funn.join('\n')}\n\n` +
        `Bruk en oppdiktet adresse på example.com / example.org, eller si hvor adressen står.\n`
    ).toEqual([]);
  });

  it('har ingen ekte nøkkel, hemmelighet eller passord i en .env-fil', () => {
    const funn: string[] = [];
    for (const sti of envfiler) {
      for (const [nr, linje] of linjer(sti)) {
        // Bare navnet skrives ut, aldri verdien.
        if (ekteEnvVerdi(linje) !== null) funn.push(`${sti}:${nr} (${ENV_LINJE.exec(linje)?.[1]})`);
      }
    }
    expect(
      funn,
      `\nEkte verdi i en .env-fil i et OFFENTLIG repo:\n\n${funn.join('\n')}\n\n` +
        `La den stå tom eller som plassholder (xxxxx, your-api-key-here). Den ekte hører hjemme i .env.local.\n`
    ).toEqual([]);
  });
});
