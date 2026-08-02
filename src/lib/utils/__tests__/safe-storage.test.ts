import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLocal, readLocalJson, removeLocal, writeLocal } from '../safe-storage';

/**
 * Nettleseren KASTER på selve `window.localStorage`-oppslaget når lagring er
 * blokkert (Chrome «Blokker alle informasjonskapsler», iOS Safari med lagring
 * av). /map leste storage på hver mount uten try/catch, så de brukerne fikk
 * ingen kart — bare Next sin engelske «Application error» på en norsk app.
 */

function withStorage(impl: Partial<Storage> | (() => never)) {
  const win: Record<string, unknown> = {};
  Object.defineProperty(win, 'localStorage', {
    get: typeof impl === 'function' ? (impl as () => never) : () => impl as Storage,
    configurable: true
  });
  vi.stubGlobal('window', win);
}

afterEach(() => vi.unstubAllGlobals());

describe('safe-storage når lagring er blokkert', () => {
  it('kaster ikke når selve localStorage-oppslaget kaster', () => {
    withStorage(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    expect(() => readLocal('mycelet:map-intro-v1')).not.toThrow();
    expect(readLocal('mycelet:map-intro-v1')).toBeNull();
    expect(() => writeLocal('mycelet:map-intro-v1', '1')).not.toThrow();
    expect(() => removeLocal('mycelet:trip-v1')).not.toThrow();
    expect(readLocalJson('mycelet:trip-v1')).toBeNull();
  });

  it('kaster ikke når getItem/setItem selv kaster', () => {
    withStorage({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      }
    });

    expect(readLocal('x')).toBeNull();
    expect(() => writeLocal('x', 'y')).not.toThrow();
    expect(() => removeLocal('x')).not.toThrow();
  });

  it('gir null på server-siden (ingen window)', () => {
    vi.stubGlobal('window', undefined);
    expect(readLocal('x')).toBeNull();
    expect(() => writeLocal('x', 'y')).not.toThrow();
  });
});

describe('safe-storage når lagring virker', () => {
  it('leser og skriver som vanlig', () => {
    const store = new Map<string, string>();
    withStorage({
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    });

    writeLocal('mycelet:map-intro-v1', '1');
    expect(readLocal('mycelet:map-intro-v1')).toBe('1');
    removeLocal('mycelet:map-intro-v1');
    expect(readLocal('mycelet:map-intro-v1')).toBeNull();
  });

  it('parser JSON og rydder opp i skadet innhold', () => {
    const store = new Map<string, string>([['mycelet:trip-v1', '{ikke json']]);
    withStorage({
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k)
    });

    expect(readLocalJson('mycelet:trip-v1')).toBeNull();
    expect(store.has('mycelet:trip-v1')).toBe(false);

    writeLocal('mycelet:trip-v1', JSON.stringify({ finds: ['Kantarell'] }));
    expect(readLocalJson<{ finds: string[] }>('mycelet:trip-v1')).toEqual({ finds: ['Kantarell'] });
  });
});
