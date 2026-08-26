import { describe, expect, it } from 'vitest';

/**
 * Tallkanonen på åpenhetssiden.
 *
 * Hele siden hviler på at hvert tall er sporbart til et målt artefakt. De to
 * feilene som ville undergravd den:
 *
 *  · «0,89» — tallet fra den løse hash-splitten (tilfeldig 80/20). Runbooken
 *    (docs/prediction-validation-runbook.md) forbyr å omtale det som temporal
 *    validering; det publiserte, ærlige tallet er 0,88 (0,882, tren <2021 /
 *    test ≥2021). Sanketips-artiklene publiserer allerede 0,88 — én offentlig
 *    kanon, aldri to.
 *
 *  · Kindwise-tall uten leverandør-merking — å presentere deres egenmålte
 *    88 % som vårt tall ville vært nøyaktig mønsteret siden finnes for å
 *    motvirke.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs') as typeof import('node:fs');

const catalogs = (['nb', 'sv'] as const).map((locale) => ({
  locale,
  ns: JSON.parse(
    fs.readFileSync(new URL(`../../../../messages/${locale}.json`, import.meta.url), 'utf8')
  ).Apenhet as Record<string, string>
}));

const pageSource = fs.readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

describe('åpenhetssidens tallkanon', () => {
  it('siterer 0,88 — aldri hash-splittens 0,89', () => {
    for (const { ns } of catalogs) {
      const alt = Object.values(ns).join(' ');
      expect(alt).toContain('0,88');
      expect(alt).not.toContain('0,89');
    }
  });

  it('publiserer de romlige tallene som ikke smigrer oss', () => {
    // Signaturgrepet: svakheten er beviset på ærligheten. Fjernes den, er
    // siden bare enda en skrytebrosjyre.
    for (const { ns } of catalogs) {
      const alt = Object.values(ns).join(' ');
      expect(alt).toContain('0,50');
      expect(alt).toContain('0,47');
    }
  });

  it('merker Kindwise-tallene som leverandørens, ikke våre', () => {
    for (const { locale, ns } of catalogs) {
      expect(ns.aiP1).toContain('88 %');
      expect(ns.aiP1).toContain('59,1');
      expect(ns.aiP1).toContain(locale === 'nb' ? 'ikke våre' : 'inte våra');
    }
  });

  it('innrømmer at nordisk AI-treffsikkerhet er umålt', () => {
    for (const { ns } of catalogs) {
      expect(ns.aiP2.length).toBeGreaterThan(40);
      expect(ns.unknown1.length).toBeGreaterThan(20);
    }
  });

  it('daterer tallene', () => {
    for (const { ns } of catalogs) {
      expect(ns.datesNote).toContain('2026');
    }
  });

  it('rendrer aldri juridisk enhet — siden snakker som «vi»', () => {
    // Den juridiske enheten hører hjemme på vilkårssidene og bare der.
    expect(pageSource).not.toContain('lib/legal/entity');
    expect(pageSource).not.toContain('entityMessageValues');
  });
});
