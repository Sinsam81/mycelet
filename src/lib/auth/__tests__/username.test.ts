import { describe, it, expect } from 'vitest';
import { looksLikeEmail, stripEmailDomain, toPublicUsername } from '../username';

/**
 * Formen speiler en ekte hendelse: to brukere skrev hele e-postadressen sin i
 * brukernavn-feltet, med store bokstaver i lokaldelen. Verdiene under er
 * oppdiktet — ekte adresser hører ikke hjemme i et offentlig repo.
 */
const EKSEMPEL = {
  kari: 'Kari.Nordmann@example.com',
  ola: 'Olasopp@example.org'
};

describe('feilen dette ble skrevet for', () => {
  it('en e-postadresse blir aldri et offentlig brukernavn', () => {
    expect(toPublicUsername(EKSEMPEL.kari)).toBe('Kari.Nordmann');
    expect(toPublicUsername(EKSEMPEL.ola)).toBe('Olasopp');
  });

  it('domenedelen forsvinner helt — den er det som identifiserer personen', () => {
    for (const v of Object.values(EKSEMPEL)) {
      expect(toPublicUsername(v)).not.toContain('@');
      expect(toPublicUsername(v)).not.toContain('example');
    }
  });
});

describe('toPublicUsername', () => {
  it('lar et vanlig brukernavn stå urørt', () => {
    expect(toPublicUsername('Soppjeger81')).toBe('Soppjeger81');
    expect(toPublicUsername('sopp-jeger')).toBe('sopp-jeger');
    expect(toPublicUsername('Kris')).toBe('Kris');
  });

  it('trimmer mellomrom', () => {
    expect(toPublicUsername('  Bella  ')).toBe('Bella');
    expect(toPublicUsername('  ola@example.com ')).toBe('ola');
  });

  it('returnerer tom streng når det ikke er noe brukbart igjen', () => {
    // Kallstedet skal da falle tilbake på sin egen regel.
    expect(toPublicUsername(null)).toBe('');
    expect(toPublicUsername(undefined)).toBe('');
    expect(toPublicUsername('   ')).toBe('');
  });

  it('«@gmail.com» er ikke en adresse — det er et rart håndtak, og det lekker ingenting', () => {
    // Ingen lokaldel foran krøllalfaen, altså ingen person å identifisere.
    // Vi lar det stå heller enn å finne på en regel for noe som ikke er et problem.
    expect(toPublicUsername('@gmail.com')).toBe('@gmail.com');
  });

  it('rører ikke et navn som bare inneholder krøllalfa uten domene', () => {
    // «@sopp» er et håndtak, ikke en adresse.
    expect(toPublicUsername('@sopp')).toBe('@sopp');
  });
});

describe('looksLikeEmail', () => {
  it('kjenner igjen ekte adresser', () => {
    expect(looksLikeEmail(EKSEMPEL.kari)).toBe(true);
    expect(looksLikeEmail('a@b.no')).toBe(true);
  });

  it('lar vanlige navn være i fred', () => {
    expect(looksLikeEmail('Soppjeger81')).toBe(false);
    expect(looksLikeEmail('sopp.jeger')).toBe(false); // punktum, men ingen @
    expect(looksLikeEmail('@sopp')).toBe(false); // @ først, ingen domene
    expect(looksLikeEmail('kris@')).toBe(false); // ingenting etter @
    expect(looksLikeEmail('kris@no')).toBe(false); // domene uten punktum
  });
});

describe('stripEmailDomain', () => {
  it('kutter fra første krøllalfa', () => {
    expect(stripEmailDomain('a@b@c.no')).toBe('a');
  });

  it('rører ikke en streng uten krøllalfa', () => {
    expect(stripEmailDomain('Soppjeger81')).toBe('Soppjeger81');
  });

  it('lar en ledende krøllalfa stå — den er ikke en domeneskiller', () => {
    expect(stripEmailDomain('@sopp')).toBe('@sopp');
  });
});
