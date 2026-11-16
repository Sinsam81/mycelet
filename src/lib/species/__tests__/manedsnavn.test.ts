import { describe, expect, it } from 'vitest';
import { langeManedsnavn } from '../manedsnavn';

describe('langeManedsnavn', () => {
  it('gir tolv norske månedsnavn, januar først', () => {
    const navn = langeManedsnavn('nb');
    expect(navn).toHaveLength(12);
    expect(navn[0]).toBe('januar');
    expect(navn[4]).toBe('mai');
    expect(navn[8]).toBe('september');
    expect(navn[11]).toBe('desember');
  });

  it('gir svenske navn til svenske lesere', () => {
    const navn = langeManedsnavn('sv');
    expect(navn[0]).toBe('januari');
    expect(navn[4]).toBe('maj');
    expect(navn[7]).toBe('augusti');
    expect(navn[11]).toBe('december');
  });

  it('faller tilbake på norsk for et ukjent språk', () => {
    expect(langeManedsnavn('de')).toEqual(langeManedsnavn('nb'));
  });
});
