// @vitest-environment jsdom
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useErMontert } from '../useErMontert';

describe('useErMontert', () => {
  it('er sann mens komponenten står, og usann etter avmontering', () => {
    const { result, unmount } = renderHook(() => useErMontert());
    expect(result.current.current).toBe(true);
    const ref = result.current;
    unmount();
    expect(ref.current).toBe(false);
  });

  it('er sann etter StrictMode sin monter–avmonter–monter (next.config har reactStrictMode)', () => {
    // En «forenklet» variant med useRef(true) og bare false i oppryddingen
    // ender på false her — og /identify ville aldri navigert videre i utvikling.
    const { result, unmount } = renderHook(() => useErMontert(), { wrapper: StrictMode });
    expect(result.current.current).toBe(true);
    const ref = result.current;
    unmount();
    expect(ref.current).toBe(false);
  });
});
