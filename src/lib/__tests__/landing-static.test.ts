import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';

/**
 * De to statiske landingssidene i public/landing/ er det FØRSTE en utlogget
 * besøkende ser — middleware rewriter «/» dit. De bygges ikke fra
 * meldingskatalogen, så ingenting annet enn denne testen holder dem i sync
 * med koden.
 */
const FILES = ['public/landing/index.html', 'public/landing/index.sv.html'] as const;

function landing(file: string): string {
  return readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
}

describe('statiske landingssider', () => {
  /**
   * Skriftene er selvhostet (public/landing/f1..f8.woff2). En preconnect mot
   * fonts.googleapis.com hentet derfor ingenting — den åpnet bare DNS + TCP +
   * TLS mot Google for hver eneste utloggede besøkende, før personvern-
   * erklæringen er lest og uten at noe i erklæringen omtaler forbindelsen.
   */
  it('åpner ingen forbindelse til tredjepart før besøkende har sett noe', () => {
    for (const file of FILES) {
      const html = landing(file);
      expect(html, file).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
      expect(html, file).not.toMatch(/rel="(preconnect|dns-prefetch)"/);
    }
  });

  it('har fortsatt de selvhostede skriftene — så testen over ikke består på en tom side', () => {
    for (const file of FILES) {
      expect(landing(file), file).toContain('/landing/f1.woff2');
    }
  });

  /**
   * Gratiskvoten står i klartekst her (statisk HTML kan ikke lese konstanten).
   * Endres FREE_DAILY_AI_LIMIT uten at teksten følger med, lover forsiden noe
   * annet enn API-et håndhever — og da skal denne bli rød.
   */
  it('oppgir samme gratis AI-kvote som FREE_DAILY_AI_LIMIT håndhever', () => {
    for (const file of FILES) {
      const html = landing(file);
      const quotas = [...html.matchAll(/(\d+) AI-identif\w+/g)].map((m) => Number(m[1]));
      expect(quotas.length, `${file}: fant ingen kvotepåstand å sjekke`).toBeGreaterThan(0);
      for (const quota of quotas) {
        expect(quota, file).toBe(FREE_DAILY_AI_LIMIT);
      }
    }
  });
});
