import { describe, expect, it } from 'vitest';
import {
  bestemProvePaaminnelse,
  byggProvePaaminnelseEpost,
  dagerTil,
  formaterBelop,
  sprakFraMetadata,
  type ProvePaaminnelseFakta
} from '../prove-paaminnelse';

/**
 * Tre dager før gratisuka på nett blir til et trekk, skal kunden få vite
 * når, hvor mye og hvor man sier opp — og ingenting annet. Beløpet kommer
 * fra Stripe-prisen, aldri fra koden.
 */
const NAA = Date.parse('2026-09-14T20:00:00Z');
const OM_TRE_DAGER = Math.floor(Date.parse('2026-09-17T20:00:00Z') / 1000);

function fakta(overrides: Partial<ProvePaaminnelseFakta> = {}): ProvePaaminnelseFakta {
  return {
    status: 'trialing',
    trialEndSek: OM_TRE_DAGER,
    cancelAtPeriodEnd: false,
    unitAmount: 7900,
    currency: 'nok',
    naaMs: NAA,
    ...overrides
  };
}

describe('bestemProvePaaminnelse', () => {
  it('sender for en løpende prøveperiode med kjent pris', () => {
    expect(bestemProvePaaminnelse(fakta())).toEqual({
      send: true,
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      unitAmount: 7900,
      currency: 'nok'
    });
  });

  it('ikke uten prøveperiode, ikke når kunden alt har sagt opp, ikke etter prøveslutt', () => {
    expect(bestemProvePaaminnelse(fakta({ status: 'active' }))).toEqual({ send: false, grunn: 'ikke-prove' });
    expect(bestemProvePaaminnelse(fakta({ trialEndSek: null }))).toEqual({ send: false, grunn: 'ikke-prove' });
    expect(bestemProvePaaminnelse(fakta({ cancelAtPeriodEnd: true }))).toEqual({ send: false, grunn: 'allerede-sagt-opp' });
    expect(bestemProvePaaminnelse(fakta({ trialEndSek: Math.floor(NAA / 1000) - 60 }))).toEqual({ send: false, grunn: 'prove-slutt-passert' });
  });

  it('sender aldri et beløp vi ikke kjenner', () => {
    expect(bestemProvePaaminnelse(fakta({ unitAmount: null }))).toEqual({ send: false, grunn: 'pris-ukjent' });
    expect(bestemProvePaaminnelse(fakta({ unitAmount: 0 }))).toEqual({ send: false, grunn: 'pris-ukjent' });
    expect(bestemProvePaaminnelse(fakta({ currency: null }))).toEqual({ send: false, grunn: 'pris-ukjent' });
  });

  it('dagerTil runder til hele dager (Stripe sender ~72 timer før)', () => {
    expect(dagerTil(OM_TRE_DAGER, NAA)).toBe(3);
    expect(dagerTil(OM_TRE_DAGER, NAA + 2 * 3600_000)).toBe(3);
    expect(dagerTil(Math.floor((NAA + 20 * 3600_000) / 1000), NAA)).toBe(1);
  });
});

describe('formaterBelop', () => {
  it('kroner uten desimaler når beløpet er helt, med når det ikke er det', () => {
    expect(formaterBelop(7900, 'nok', 'nb')).toBe('79 kr');
    expect(formaterBelop(7950, 'sek', 'sv')).toBe('79,50 kr');
    expect(formaterBelop(24900, 'NOK', 'nb')).toBe('249 kr');
  });

  it('andre valutaer får Intl-formatering', () => {
    expect(formaterBelop(790, 'eur', 'nb')).toMatch(/7,90/);
    expect(formaterBelop(790, 'eur', 'nb')).toMatch(/€|EUR/);
  });
});

describe('sprakFraMetadata', () => {
  it('leser sprak fra user_metadata og faller tilbake på nb', () => {
    expect(sprakFraMetadata({ sprak: 'sv' })).toBe('sv');
    expect(sprakFraMetadata({ sprak: 'nb' })).toBe('nb');
    expect(sprakFraMetadata({ sprak: 'en' })).toBe('nb');
    expect(sprakFraMetadata({})).toBe('nb');
    expect(sprakFraMetadata(null)).toBe('nb');
  });
});

describe('byggProvePaaminnelseEpost', () => {
  const profilUrl = 'https://www.mycelet.com/profile';

  it.each(['nb', 'sv'] as const)('%s: beløp, dato og oppsigelseslenke står i både html og ren tekst', (locale) => {
    const { emne, html, tekst } = byggProvePaaminnelseEpost({
      locale,
      plan: 'Premium',
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      unitAmount: 7900,
      currency: 'nok',
      profilUrl
    });
    for (const del of [html, tekst]) {
      expect(del).toContain('79 kr');
      expect(del).toContain(profilUrl);
      expect(del).toContain('17');
      expect(del).toContain('Premium');
    }
    expect(emne).toMatch(/3 dag/);
  });

  it('sv er faktisk svensk, ikke norsk fallback', () => {
    const { emne, tekst } = byggProvePaaminnelseEpost({
      locale: 'sv',
      plan: 'Premium',
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      unitAmount: 7900,
      currency: 'sek',
      profilUrl
    });
    expect(emne).toContain('provperiod');
    expect(tekst).toContain('säger upp');
    expect(tekst).toContain('17 september');
  });

  it('sier «i morgen» og «i dag» når det er så kort igjen', () => {
    const felles = { locale: 'nb' as const, plan: 'Premium', sluttIso: '2026-09-15', unitAmount: 7900, currency: 'nok', profilUrl };
    expect(byggProvePaaminnelseEpost({ ...felles, dagerIgjen: 1 }).emne).toContain('i morgen');
    expect(byggProvePaaminnelseEpost({ ...felles, dagerIgjen: 0 }).emne).toContain('i dag');
  });

  it('lover ikke mer enn det sier — bare når, hvor mye, og hvor man sier opp', () => {
    const { tekst } = byggProvePaaminnelseEpost({
      locale: 'nb',
      plan: 'Premium',
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      unitAmount: 7900,
      currency: 'nok',
      profilUrl
    });
    expect(tekst).toContain('om du ikke sier opp');
    expect(tekst).not.toMatch(/tilbud|rabatt|håper/i);
  });
});
