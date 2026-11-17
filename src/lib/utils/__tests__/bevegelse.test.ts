import { afterEach, describe, expect, it, vi } from 'vitest';
import { rulleAtferd } from '../bevegelse';

afterEach(() => vi.unstubAllGlobals());

describe('rulleAtferd', () => {
  it('ruller mykt når brukeren ikke har bedt om mindre bevegelse', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });
    expect(rulleAtferd()).toBe('smooth');
  });

  it('hopper rett dit med «Reduser bevegelse» på', () => {
    const matchMedia = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('window', { matchMedia });
    expect(rulleAtferd()).toBe('auto');
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  });

  it('tåler miljøer uten matchMedia (server, gamle WebView-er)', () => {
    vi.stubGlobal('window', {});
    expect(rulleAtferd()).toBe('smooth');
  });
});
