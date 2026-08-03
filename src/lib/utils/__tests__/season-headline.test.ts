import { describe, expect, it } from 'vitest';
import { seasonHeadline } from '../season-headline';

/**
 * Ekte tall fra produksjon: matsopp i sesong per måned (n = 72 arter).
 * Det er dette overskriften faktisk får se.
 */
const I_SESONG_PER_MÅNED = [2, 2, 2, 4, 5, 8, 20, 39, 46, 46, 16, 4];
const forMåned = (m: number) => seasonHeadline(m, I_SESONG_PER_MÅNED[m - 1]);

describe('seasonHeadline', () => {
  it('gir langt flere distinkte overskrifter enn de gamle fire', () => {
    // Gamle: 5 varianter, men headlineFewInSeason var uoppnåelig (krevde 0, og
    // minimum året rundt er 2), og tre av de fire som gjensto endte på
    // «… i skogen» — 10 av 12 måneder med samme setning.
    const varianter = new Set(
      Array.from({ length: 12 }, (_, i) => {
        const h = forMåned(i + 1);
        return `${h.key}:${h.count ?? ''}`;
      })
    );
    expect(varianter.size).toBeGreaterThanOrEqual(8);
  });

  it('markerer overgangen til høysesong 31. juli → 1. august', () => {
    // Årets viktigste skifte for en soppapp. Før gikk det fra «Sommer i skogen»
    // til «Høysesong i skogen» — 9 av 15 tegn sto stille.
    const juli = forMåned(7);
    const august = forMåned(8);
    expect(juli.key).not.toBe(august.key);
    expect(august.key).toBe('headlineHighSeason');
    expect(august.count).toBe(39);
  });

  it('har ingen uoppnåelig bøtte', () => {
    // Hver nøkkel funksjonen kan returnere må faktisk kunne treffes av et tall
    // som forekommer. Det var nettopp det headlineFewInSeason ikke kunne.
    const brukte = new Set(Array.from({ length: 12 }, (_, i) => forMåned(i + 1).key));
    expect(brukte).toEqual(
      new Set([
        'headlineQuiet',
        'headlineSpring',
        'headlineStarting',
        'headlineSummer',
        'headlineHighSeason',
        'headlineLateAutumn'
      ])
    );
  });

  it('lar utvalget avgjøre høysesongen, ikke kalenderen', () => {
    // Et sent år skal flytte overskriften med seg.
    expect(seasonHeadline(7, 42).key).toBe('headlineHighSeason');
    expect(seasonHeadline(9, 12).key).not.toBe('headlineHighSeason');
  });

  it('kaller ikke våren stille, selv med få arter', () => {
    // Morkler er få, men de er grunnen til at folk går ut i april.
    expect(forMåned(4).key).toBe('headlineSpring');
    expect(forMåned(5).key).toBe('headlineSpring');
  });

  it('navngir tallet overalt der det betyr noe', () => {
    for (const m of [1, 6, 7, 8, 9, 10, 11, 12]) {
      expect(forMåned(m).count, `måned ${m}`).toBe(I_SESONG_PER_MÅNED[m - 1]);
    }
  });
});
