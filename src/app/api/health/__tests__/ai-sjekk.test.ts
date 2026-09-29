import { describe, expect, it } from 'vitest';

/**
 * Helsesjekken må si fra om AI-identifiseringen kan kalle Kindwise.
 *
 * Fra mai til 29. september 2026 feilet hvert Kindwise-kall uten at noe i
 * appen sa fra (se src/lib/identifications/kindwise-status.ts). Denne fila
 * låser at sjekken finnes, at den ikke spør Kindwise i ?fast=1 (nettkall),
 * at den ikke feller appen (nøkkelen er aldri satt lokalt), at den logges,
 * og at den er bremset — ruta er offentlig.
 *
 * Leser ruta som tekst, som epost-sjekk.test.ts.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');
const kilde = fs.readFileSync(new URL('../route.ts', import.meta.url), 'utf8');

describe('helsesjekkens AI-sjekk', () => {
  it('finnes og bruker den delte statusmodulen', () => {
    expect(kilde).toContain('async function checkAi');
    expect(kilde).toContain("from '@/lib/identifications/kindwise-status'");
    expect(kilde).toContain('hentKindwiseStatus(apiKey)');
  });

  it('kjører BARE uten ?fast=1 — den gjør et nettkall', () => {
    // Kallet, ikke definisjonen: «async function checkAi()» står øverst i fila.
    const foerFastGrenen = kilde.slice(0, kilde.indexOf('if (!fast)'));
    expect(foerFastGrenen).not.toContain(', checkAi()');
    expect(foerFastGrenen).not.toContain('ai: checkAi()');
    const iFastGrenen = kilde.slice(kilde.indexOf('if (!fast)'));
    expect(iFastGrenen).toContain(', checkAi()]');
  });

  it('spør Kindwise høyst hvert femte minutt', () => {
    expect(kilde).toContain('const AI_CACHE_MS = 5 * 60 * 1000');
    expect(kilde).toMatch(/if \(aiCache && Date\.now\(\) - aiCache\.ts < AI_CACHE_MS\) return aiCache\.resultat/);
  });

  it('teller IKKE mot 503, men logges', () => {
    expect(kilde).toContain('const { epost, ai, ...oppetidssjekker } = checks');
    expect(kilde).toContain('health.ai_utilgjengelig');
  });

  it('sier aldri hva nøkkelen er', () => {
    const funksjon = kilde.slice(kilde.indexOf('async function checkAi'), kilde.indexOf('async function checkDatabase'));
    expect(funksjon).not.toMatch(/\$\{apiKey/);
    expect(funksjon).not.toMatch(/\$\{process\.env\.PLANTID/);
  });
});
