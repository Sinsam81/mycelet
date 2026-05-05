import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { _resetAllBuckets, checkRateLimit } from '../index';

describe('checkRateLimit', () => {
  beforeEach(() => {
    _resetAllBuckets();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit', () => {
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit('test:client1', 5, 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(5 - i - 1);
    }
  });

  it('blocks requests beyond the limit', () => {
    for (let i = 0; i < 3; i++) {
      checkRateLimit('test:client2', 3, 60);
    }
    const result = checkRateLimit('test:client2', 3, 60);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('isolates buckets by key', () => {
    checkRateLimit('test:clientA', 1, 60);
    const blockedA = checkRateLimit('test:clientA', 1, 60);
    expect(blockedA.allowed).toBe(false);

    const fineForB = checkRateLimit('test:clientB', 1, 60);
    expect(fineForB.allowed).toBe(true);
  });

  it('resets the bucket after window elapses', () => {
    checkRateLimit('test:client3', 2, 30);
    checkRateLimit('test:client3', 2, 30);
    expect(checkRateLimit('test:client3', 2, 30).allowed).toBe(false);

    // Advance just before window end — still blocked
    vi.advanceTimersByTime(29_000);
    expect(checkRateLimit('test:client3', 2, 30).allowed).toBe(false);

    // Advance past window — fresh bucket
    vi.advanceTimersByTime(2_000);
    const fresh = checkRateLimit('test:client3', 2, 30);
    expect(fresh.allowed).toBe(true);
    expect(fresh.remaining).toBe(1);
  });

  it('returns retryAfter at least 1s when blocked (never zero)', () => {
    checkRateLimit('test:client4', 1, 60);
    // Advance to nearly the end of the window
    vi.advanceTimersByTime(59_900);
    const result = checkRateLimit('test:client4', 1, 60);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('throws on invalid limit or window', () => {
    expect(() => checkRateLimit('x', 0, 60)).toThrow();
    expect(() => checkRateLimit('x', 5, 0)).toThrow();
    expect(() => checkRateLimit('x', -1, 60)).toThrow();
  });

  it('exposes resetAt as wall-clock ms', () => {
    const before = Date.now();
    const result = checkRateLimit('test:client5', 5, 60);
    expect(result.resetAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(result.resetAt).toBeLessThanOrEqual(before + 60_001);
  });
});
