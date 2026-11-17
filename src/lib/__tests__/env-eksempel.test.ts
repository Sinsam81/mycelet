import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoFiler } from './repo-filer';

/**
 * .env.example holdt opp mot det koden faktisk leser.
 *
 * Fila manglet CRON_SECRET, RESEND_API_KEY, RESEND_FROM, alle REVENUECAT_*,
 * alle X_*, MET_FROST_CLIENT_ID og PRESSE_VARSEL_TIL. Den som satte opp fra
 * den, fikk 401 fra hver cron-rute og aldri vår egen e-post for glemt passord,
 * uten at noe sa hvorfor. Samtidig sto to variabler der som ingen kode leste.
 *
 * Reglene:
 *   1. Hver variabel koden i src/ og next.config.js leser, er nevnt i fila —
 *      som en linje, eller i en kommentar når en linje ville gjort skade.
 *   2. Fra scripts/ kreves bare navn som gir tilgang til noe (nøkler,
 *      hemmeligheter, tjenesteadresser). Analyseskriptenes kjørevalg (CUTOFF,
 *      LIMIT, REGION …) skal IKKE inn: skriptene kjøres med
 *      `node --env-file=.env.local`, og en tom linje kopiert dit gir dem ""
 *      i stedet for standarden.
 *   3. Hver variabel fila setter, også de kommenterte, leses av koden.
 */

const ROT = process.cwd();
const EKSEMPEL = readFileSync(join(ROT, '.env.example'), 'utf8');

const KODE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
/** Tester setter miljøet for seg selv (TZ, NEXT_PUBLIC_APP_URL …); det er ikke oppsett. */
const erTest = (sti: string) => /(?:^|\/)__tests__\//.test(sti) || /\.(?:test|spec|e2e)\.[cm]?[jt]sx?$/.test(sti);

/** process.env.X, process.env?.X, process.env['X'] og process.env?.['X']. */
const LESING = /process\.env(?:\?\.|\.)([A-Z][A-Z0-9_]*)|process\.env(?:\?\.)?\[\s*['"`]([A-Z][A-Z0-9_]*)['"`]\s*\]/g;

/** Navn → første fil som leser det. */
function lesteNavn(filer: readonly string[]): Map<string, string> {
  const navn = new Map<string, string>();
  for (const sti of filer) {
    for (const m of readFileSync(join(ROT, sti), 'utf8').matchAll(LESING)) {
      const n = m[1] ?? m[2];
      if (!navn.has(n)) navn.set(n, sti);
    }
  }
  return navn;
}

/** Settes av Next, Vercel, CI eller skallet. Ingen fyller dem inn selv. */
const KJOREMILJO = new Set(['NODE_ENV', 'NEXT_RUNTIME', 'VERCEL_ENV', 'CI', 'PORT', 'TZ']);

/** Navn fra scripts/ som gir tilgang til noe. Kjørevalgene treffer ikke. */
const TILGANG = /(?:KEY|SECRET|TOKEN|PASSWORD|AUTH|CLIENT_ID|DSN)$|^(?:NEXT_PUBLIC|SUPABASE|STRIPE|RESEND|REVENUECAT|SENTRY|X|MET)_/;

const kodefiler = repoFiler(ROT).filter((sti) => KODE.test(sti) && !erTest(sti));
const appen = lesteNavn(kodefiler.filter((sti) => sti.startsWith('src/') || sti === 'next.config.js'));
const skriptene = lesteNavn(kodefiler.filter((sti) => sti.startsWith('scripts/')));
const allKode = lesteNavn(kodefiler);

/** Står navnet i fila, som linje eller i en kommentar? `\b` skiller SENTRY_DSN fra NEXT_PUBLIC_SENTRY_DSN. */
const nevnt = (navn: string) => new RegExp(`\\b${navn}\\b`).test(EKSEMPEL);
/** Navnene fila setter: «NAVN=…», også bak #. */
const satt = [...EKSEMPEL.matchAll(/^#?[ \t]*([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);

const RAD = '\n\nLegg navnet inn i .env.example med en plassholder og en kommentar på én linje — aldri en ekte verdi.\n';

describe('.env.example', () => {
  it('finner faktisk koden og fila — ellers tester vi ingenting', () => {
    expect(appen.size).toBeGreaterThan(20);
    expect(appen.get('CRON_SECRET')).toMatch(/^src\/app\/api\/cron\//);
    expect(skriptene.has('SUPABASE_SERVICE_ROLE_KEY')).toBe(true);
    expect(satt.length).toBeGreaterThan(20);
  });

  it('nevner hver variabel appen leser', () => {
    const mangler = [...appen]
      .filter(([navn]) => !KJOREMILJO.has(navn) && !nevnt(navn))
      .map(([navn, sti]) => `${navn} (leses i ${sti})`);
    expect(mangler, `\nMangler i .env.example:\n${mangler.join('\n')}${RAD}`).toEqual([]);
  });

  it('nevner hver nøkkel, hemmelighet og tjenesteadresse skriptene leser', () => {
    const mangler = [...skriptene]
      .filter(([navn]) => TILGANG.test(navn) && !nevnt(navn))
      .map(([navn, sti]) => `${navn} (leses i ${sti})`);
    expect(mangler, `\nMangler i .env.example:\n${mangler.join('\n')}${RAD}`).toEqual([]);
  });

  it('setter ingen variabel som ingen kode leser lenger', () => {
    const dode = satt.filter((navn) => !allKode.has(navn));
    expect(dode, `\nIngen kode leser disse — fjern dem fra .env.example: ${dode.join(', ')}\n`).toEqual([]);
  });

  it('setter verken analyseskriptenes kjørevalg eller QA-brukeren — tomme linjer ville slått ut standardene', () => {
    // Kjørevalg: leses bare av scripts/, og gir ikke tilgang til noe.
    const kjorevalg = satt.filter((navn) => skriptene.has(navn) && !appen.has(navn) && !TILGANG.test(navn));
    expect(kjorevalg).toEqual([]);
    // `npm run qa:setup` legger QA_TEST_EMAIL og QA_TEST_PASSWORD inn i .env.local
    // bare når navnet mangler der. En tom linje derfra fikk skriptet til å la
    // være å lagre passordet det nettopp hadde satt på QA-brukeren.
    expect(EKSEMPEL).not.toMatch(/^[ \t]*QA_TEST_\w+[ \t]*=/m);
  });
});
