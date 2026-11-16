import { describe, expect, it } from 'vitest';
import { forumDato, forumTidspunkt } from '@/components/forum/forumDato';

describe('forumDato', () => {
  it('viser dag, måned og år på norsk', () => {
    const tekst = forumDato('2025-08-14T10:00:00Z', 'nb');
    expect(tekst).toMatch(/14/);
    expect(tekst).toMatch(/aug/);
    expect(tekst).toMatch(/2025/);
  });

  it('svensk leser får svensk måned', () => {
    expect(forumDato('2025-05-14T10:00:00Z', 'sv')).toMatch(/maj/);
    expect(forumDato('2025-05-14T10:00:00Z', 'nb')).toMatch(/mai/);
  });

  it('regner dagen i norsk tid, ikke i UTC — 23:30 UTC 31. des er nyttårsdag i Oslo', () => {
    const tekst = forumDato('2025-12-31T23:30:00Z', 'nb');
    expect(tekst).toMatch(/^1\./);
    expect(tekst).toMatch(/2026/);
  });

  it('… også om sommeren (UTC+2)', () => {
    expect(forumDato('2026-07-31T22:30:00Z', 'nb')).toMatch(/^1\. aug/);
  });

  it('ugyldig eller manglende dato gir tom streng, ikke «Invalid Date»', () => {
    expect(forumDato('tull', 'nb')).toBe('');
    expect(forumDato(null, 'nb')).toBe('');
    expect(forumDato(undefined, 'sv')).toBe('');
  });

  it('samme tidspunkt gir samme tekst uansett kjøremiljøets sone', () => {
    const a = forumDato('2026-03-01T00:15:00Z', 'nb');
    const opprinnelig = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      expect(forumDato('2026-03-01T00:15:00Z', 'nb')).toBe(a);
    } finally {
      process.env.TZ = opprinnelig;
    }
  });
});

describe('forumTidspunkt', () => {
  it('tar med klokkeslett i norsk tid', () => {
    const tekst = forumTidspunkt('2026-09-01T10:05:00Z', 'nb');
    expect(tekst).toMatch(/2026/);
    expect(tekst).toMatch(/12[.:]05/);
  });

  it('ugyldig dato gir tom streng', () => {
    expect(forumTidspunkt('', 'sv')).toBe('');
  });
});
