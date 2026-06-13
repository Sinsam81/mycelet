import { describe, expect, it } from 'vitest';
import { jordartToDrainage } from '@/lib/slu/jordart';

describe('jordartToDrainage', () => {
  it('maps mesic till (morän) to the top suitability', () => {
    expect(jordartToDrainage('Sandig morän').factor).toBe(1.15);
    expect(jordartToDrainage('Morän').klass).toMatch(/morene/i);
    // moränlera → still till (mesic), not clay
    expect(jordartToDrainage('Moränlera').factor).toBe(1.15);
  });

  it('maps peat / bog to waterlogged (penalty)', () => {
    expect(jordartToDrainage('Torv').factor).toBe(0.7);
    expect(jordartToDrainage('Kärrtorv').factor).toBe(0.7);
  });

  it('maps glaciofluvial / sand / gravel to well-drained', () => {
    expect(jordartToDrainage('Isälvssediment').factor).toBe(1.05);
    expect(jordartToDrainage('Svallsediment, grus').factor).toBe(1.05);
  });

  it('maps clay / silt to moisture-retentive', () => {
    expect(jordartToDrainage('Postglacial lera').factor).toBe(0.9);
    expect(jordartToDrainage('Glacial silt').factor).toBe(0.9);
  });

  it('maps thin soil over bedrock to dry/thin', () => {
    expect(jordartToDrainage('Urberg').factor).toBe(0.8);
  });

  it('returns neutral for fill / water / empty / unknown', () => {
    expect(jordartToDrainage('Fyllning').factor).toBe(1.0);
    expect(jordartToDrainage('').factor).toBe(1.0);
    expect(jordartToDrainage(null).factor).toBe(1.0);
  });
});
