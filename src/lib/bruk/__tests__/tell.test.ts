import { describe, expect, it } from 'vitest';
import { erTellbarFlate, summerTellinger, tellNokkel, tomTellinger } from '../tell';

describe('erTellbarFlate', () => {
  it('godtar bare de to flatene før konto', () => {
    expect(erTellbarFlate('soppforhold')).toBe(true);
    expect(erTellbarFlate('register')).toBe(true);
    expect(erTellbarFlate('hjem')).toBe(false);
    expect(erTellbarFlate(null)).toBe(false);
  });
});

describe('summerTellinger', () => {
  it('summerer per flate og språk fra og med grensedagen', () => {
    const sum = summerTellinger(
      [
        { dag: '2026-09-08', flate: 'soppforhold', sprak: 'nb', antall: 10 },
        { dag: '2026-09-09', flate: 'soppforhold', sprak: 'nb', antall: 5 },
        { dag: '2026-09-09', flate: 'soppforhold', sprak: 'sv', antall: 3 },
        { dag: '2026-09-09', flate: 'register', sprak: 'sv', antall: 1 },
        { dag: '2026-09-07', flate: 'register', sprak: 'nb', antall: 99 } // før grensen
      ],
      '2026-09-08'
    );
    expect(sum).toEqual({ soppforhold: { nb: 15, sv: 3 }, register: { nb: 0, sv: 1 } });
  });

  it('hopper over ukjente flater, språk og ugyldige tall', () => {
    const sum = summerTellinger(
      [
        { dag: '2026-09-09', flate: 'profil', sprak: 'nb', antall: 4 },
        { dag: '2026-09-09', flate: 'register', sprak: 'de', antall: 4 },
        { dag: '2026-09-09', flate: 'register', sprak: 'nb', antall: Number.NaN },
        { dag: '2026-09-09', flate: 'register', sprak: 'nb', antall: -2 }
      ],
      '2026-09-01'
    );
    expect(sum).toEqual(tomTellinger());
  });

  it('nøkkelen er per flate', () => {
    expect(tellNokkel('register')).toBe('mycelet:tell:register');
  });
});
