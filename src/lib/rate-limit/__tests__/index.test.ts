import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { _peekBucket, _resetAllBuckets, checkRateLimit, refundRateLimit } from '../index';

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

describe('refundRateLimit', () => {
  beforeEach(() => {
    _resetAllBuckets();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the slot back, so a reserved-but-unused request is not charged', () => {
    const first = checkRateLimit('refund:a', 2, 60);
    const second = checkRateLimit('refund:a', 2, 60);
    expect(checkRateLimit('refund:a', 2, 60).allowed).toBe(false);

    refundRateLimit('refund:a', second);
    expect(_peekBucket('refund:a')?.count).toBe(1);
    const again = checkRateLimit('refund:a', 2, 60);
    expect(again.allowed).toBe(true);
    // The window is the original one: a refund does not extend or restart it.
    expect(again.resetAt).toBe(first.resetAt);
    expect(checkRateLimit('refund:a', 2, 60).allowed).toBe(false);
  });

  it('a slot that was used still counts: only the refunded one is free', () => {
    checkRateLimit('refund:b', 3, 60); // used
    const unused = checkRateLimit('refund:b', 3, 60);
    checkRateLimit('refund:b', 3, 60); // used
    refundRateLimit('refund:b', unused);
    expect(checkRateLimit('refund:b', 3, 60).allowed).toBe(true);
    expect(checkRateLimit('refund:b', 3, 60).allowed).toBe(false);
  });

  it('is a no-op for a call that was not allowed', () => {
    checkRateLimit('refund:c', 1, 60);
    const blocked = checkRateLimit('refund:c', 1, 60);
    expect(blocked.allowed).toBe(false);
    refundRateLimit('refund:c', blocked);
    expect(_peekBucket('refund:c')?.count).toBe(1);
    expect(checkRateLimit('refund:c', 1, 60).allowed).toBe(false);
  });

  it('never frees a slot in a later window', () => {
    const old = checkRateLimit('refund:d', 1, 30);
    vi.advanceTimersByTime(31_000);
    // A new window, taken by someone else.
    expect(checkRateLimit('refund:d', 1, 30).allowed).toBe(true);
    refundRateLimit('refund:d', old);
    expect(_peekBucket('refund:d')?.count).toBe(1);
    expect(checkRateLimit('refund:d', 1, 30).allowed).toBe(false);
  });

  it('never takes the count below zero, and ignores unknown keys', () => {
    const taken = checkRateLimit('refund:e', 2, 60);
    refundRateLimit('refund:e', taken);
    refundRateLimit('refund:e', taken);
    expect(_peekBucket('refund:e')?.count).toBe(0);
    expect(checkRateLimit('refund:e', 2, 60).remaining).toBe(1);

    expect(() => refundRateLimit('refund:unknown', taken)).not.toThrow();
    expect(_peekBucket('refund:unknown')).toBeUndefined();
  });

  it('touches only its own key', () => {
    const a = checkRateLimit('refund:f1', 1, 60);
    checkRateLimit('refund:f2', 1, 60);
    refundRateLimit('refund:f1', a);
    expect(checkRateLimit('refund:f1', 1, 60).allowed).toBe(true);
    expect(checkRateLimit('refund:f2', 1, 60).allowed).toBe(false);
  });
});
