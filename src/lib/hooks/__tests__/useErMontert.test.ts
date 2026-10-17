// @vitest-environment jsdom
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
});
