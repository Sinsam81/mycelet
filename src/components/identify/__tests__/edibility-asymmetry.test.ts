import { describe, it, expect } from 'vitest';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';

/**
 * Sikkerhetsinvariant: AI-resultatlista skal aldri gi et grønt «spiselig»-
 * stempel til et forslag.
 *
 * Kodebasen har ikke oppsett for komponenttester (ingen testing-library,
 * ingen jsdom), så vi låser regelen slik entity.test.ts og
 * content-filter.test.ts allerede gjør det: ved å lese kilden. Det er mindre
 * elegant enn å rendre komponenten, men det fanger nøyaktig det vi er redde
 * for — at noen senere «forenkler» kortet tilbake til et rått EdibilityBadge.
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const source = (require('node:fs') as typeof import('node:fs')).readFileSync(
  new URL('../IdentifyResult.tsx', import.meta.url),
  'utf8'
);

describe('spiselighet i AI-resultatet', () => {
  it('viser EdibilityBadge bare når arten IKKE er en spiseinvitasjon', () => {
    // Merket skal stå bak en negert isRecommendableSpecies-sjekk.
    expect(source).toMatch(/!isRecommendableSpecies\(\s*suggestion\.edibility\s*\)\s*\?[\s\S]{0,200}<EdibilityBadge/);
  });

  it('har en nøytral «ikke matvurdert»-merking for de spiselige klassene', () => {
    expect(source).toContain("t('notFoodAssessed')");
  });

  it('bruker ikke isHazardSpecies her — det ville sluppet ukjente arter gjennom', () => {
    // isHazardSpecies dekker bare toxic/deadly. Brukt her ville 'unknown' fått
    // «ikke matvurdert», mens SafetyWarning behandler nettopp unknown som farlig.
    const withoutComments = source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(withoutComments).not.toContain('isHazardSpecies');
  });

  it('merker treffet som bildelikhet, ikke som en vurdering', () => {
    expect(source).toContain("t('matchLabel')");
  });
});

describe('predikatet regelen hviler på', () => {
  // Hvis disse noen gang endrer seg, endrer betydningen av kortet seg med dem.
  it.each([
    ['edible', true],
    ['conditionally_edible', true],
    ['inedible', false],
    ['toxic', false],
    ['deadly', false],
    ['unknown', false],
    [null, false],
    ['noe-tull', false]
  ] as const)('%s er spiseinvitasjon: %s', (edibility, expected) => {
    expect(isRecommendableSpecies(edibility)).toBe(expected);
  });

  it('alt som ikke er spiselig beholder et tydelig merke', () => {
    // Selve asymmetrien, uttrykt som en påstand: ingen farlig klasse kan havne
    // i «ikke matvurdert»-grenen.
    for (const hazard of ['toxic', 'deadly', 'unknown', 'inedible']) {
      expect(isRecommendableSpecies(hazard)).toBe(false);
    }
  });
});
