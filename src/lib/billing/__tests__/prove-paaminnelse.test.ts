import { describe, expect, it } from 'vitest';
import {
  beregnBelop,
  bestemProvePaaminnelse,
  byggProvePaaminnelseEpost,
  dagerTil,
  formaterBelop,
  lesRabatt,
  rabattStorrelseUkjent,
  sprakFraMetadata,
  type ProvePaaminnelseFakta
} from '../prove-paaminnelse';

/**
 * Tre dager før gratisuka på nett blir til et trekk, skal kunden få vite
 * når, hvor mye og hvor man sier opp — og ingenting annet. Beløpet kommer
 * fra Stripe-prisen, aldri fra koden, og med rabatten trukket fra når vi
 * kjenner den. Kjenner vi den ikke, sies det ikke noe tall.
 */
const NAA = Date.parse('2026-09-14T20:00:00Z');
const OM_TRE_DAGER = Math.floor(Date.parse('2026-09-17T20:00:00Z') / 1000);
const UKJENT_RABATT = { percentOff: null, amountOff: null, amountOffCurrency: null };

function fakta(overrides: Partial<ProvePaaminnelseFakta> = {}): ProvePaaminnelseFakta {
  return {
    status: 'trialing',
    trialEndSek: OM_TRE_DAGER,
    cancelAtPeriodEnd: false,
    unitAmount: 7900,
    currency: 'nok',
    rabatt: null,
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
      belop: { unitAmount: 7900, currency: 'nok' }
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

  it('en kjent rabatt trekkes fra beløpet', () => {
    const b = bestemProvePaaminnelse(fakta({ rabatt: { percentOff: 50, amountOff: null, amountOffCurrency: null } }));
    expect(b).toMatchObject({ send: true, belop: { unitAmount: 3950, currency: 'nok' } });
  });

  it('en rabatt vi ikke kan regne på gir e-post uten tall — ikke listeprisen', () => {
    const b = bestemProvePaaminnelse(fakta({ rabatt: UKJENT_RABATT }));
    expect(b).toMatchObject({ send: true, dagerIgjen: 3, belop: null });
  });

  it('dagerTil runder til hele dager (Stripe sender ~72 timer før)', () => {
    expect(dagerTil(OM_TRE_DAGER, NAA)).toBe(3);
    expect(dagerTil(OM_TRE_DAGER, NAA + 2 * 3600_000)).toBe(3);
    expect(dagerTil(Math.floor((NAA + 20 * 3600_000) / 1000), NAA)).toBe(1);
  });
});

describe('lesRabatt', () => {
  it('ingen rabatt → null', () => {
    expect(lesRabatt({})).toBeNull();
    expect(lesRabatt({ discount: null, discounts: [] })).toBeNull();
  });

  it('dagens rendring bærer bare id-er: rabatten finnes, størrelsen er ukjent', () => {
    const r = lesRabatt({ discounts: ['di_1Abc'] });
    expect(r).toEqual(UKJENT_RABATT);
    expect(rabattStorrelseUkjent(r!)).toBe(true);
  });

  it('utvidet rabatt gir prosent eller beløp fra kupongen', () => {
    expect(lesRabatt({ discounts: [{ coupon: { percent_off: 50, amount_off: null, currency: null } }] })).toEqual({
      percentOff: 50,
      amountOff: null,
      amountOffCurrency: null
    });
    expect(lesRabatt({ discount: { coupon: { percent_off: null, amount_off: 2000, currency: 'NOK' } } })).toEqual({
      percentOff: null,
      amountOff: 2000,
      amountOffCurrency: 'nok'
    });
  });

  it('gammel rendring: samme rabatt som objekt i discount og som id i discounts leses én gang', () => {
    expect(lesRabatt({ discount: { coupon: { percent_off: 25 } }, discounts: ['di_1Abc'] })).toMatchObject({ percentOff: 25 });
  });

  it('flere rabatter, eller en kupong uten tall, regnes ikke på', () => {
    expect(lesRabatt({ discounts: [{ coupon: { percent_off: 10 } }, { coupon: { percent_off: 20 } }] })).toEqual(UKJENT_RABATT);
    expect(lesRabatt({ discounts: [{ coupon: null }] })).toEqual(UKJENT_RABATT);
    expect(lesRabatt({ discounts: [{ coupon: { percent_off: 0, amount_off: 0 } }] })).toEqual(UKJENT_RABATT);
  });
});

describe('beregnBelop', () => {
  it('prosent og beløp trekkes fra; beløp bare i samme valuta', () => {
    expect(beregnBelop(7900, 'nok', null)).toBe(7900);
    expect(beregnBelop(7900, 'nok', { percentOff: 50, amountOff: null, amountOffCurrency: null })).toBe(3950);
    expect(beregnBelop(7900, 'nok', { percentOff: 33, amountOff: null, amountOffCurrency: null })).toBe(5293);
    expect(beregnBelop(7900, 'nok', { percentOff: null, amountOff: 2000, amountOffCurrency: 'nok' })).toBe(5900);
    expect(beregnBelop(7900, 'nok', { percentOff: null, amountOff: 2000, amountOffCurrency: 'sek' })).toBeNull();
  });

  it('ukjent størrelse og rabatt som går i null gir ikke noe tall', () => {
    expect(beregnBelop(7900, 'nok', UKJENT_RABATT)).toBeNull();
    expect(beregnBelop(7900, 'nok', { percentOff: 100, amountOff: null, amountOffCurrency: null })).toBeNull();
    expect(beregnBelop(7900, 'nok', { percentOff: null, amountOff: 9000, amountOffCurrency: 'nok' })).toBeNull();
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
  // Prissiden har knappen til Stripe-portalen. Profilsiden har ingen oppsigelse.
  const oppsigelseUrl = 'https://www.mycelet.com/pricing';
  const belop = { unitAmount: 7900, currency: 'nok' };

  it.each(['nb', 'sv'] as const)('%s: beløp, dato og oppsigelseslenke står i både html og ren tekst', (locale) => {
    const { emne, html, tekst } = byggProvePaaminnelseEpost({
      locale,
      plan: 'Premium',
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      belop,
      oppsigelseUrl
    });
    for (const del of [html, tekst]) {
      expect(del).toContain('79 kr');
      expect(del).toContain(oppsigelseUrl);
      expect(del).not.toContain('/profile');
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
      belop: { unitAmount: 7900, currency: 'sek' },
      oppsigelseUrl
    });
    expect(emne).toContain('provperiod');
    expect(tekst).toContain('säger upp');
    expect(tekst).toContain('17 september');
  });

  it('sier «i morgen» og «i dag» når det er så kort igjen', () => {
    const felles = { locale: 'nb' as const, plan: 'Premium', sluttIso: '2026-09-15', belop, oppsigelseUrl };
    expect(byggProvePaaminnelseEpost({ ...felles, dagerIgjen: 1 }).emne).toContain('i morgen');
    expect(byggProvePaaminnelseEpost({ ...felles, dagerIgjen: 0 }).emne).toContain('i dag');
  });

  it('rabattert beløp står som det trekkes', () => {
    const { tekst } = byggProvePaaminnelseEpost({
      locale: 'nb',
      plan: 'Premium',
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      belop: { unitAmount: 3950, currency: 'nok' },
      oppsigelseUrl
    });
    expect(tekst).toContain('Da trekkes 39,50 kr');
    expect(tekst).not.toContain('79 kr');
  });

  it.each(['nb', 'sv'] as const)('%s: uten kjent beløp nevnes rabatten, men ikke noe tall', (locale) => {
    const { html, tekst } = byggProvePaaminnelseEpost({
      locale,
      plan: 'Premium',
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      belop: null,
      oppsigelseUrl
    });
    for (const del of [html, tekst]) {
      expect(del).not.toMatch(/\d+(,\d\d)? kr/);
      expect(del).toMatch(/rabatt/i);
      expect(del).toContain(oppsigelseUrl);
    }
    expect(tekst).toContain(locale === 'sv' ? 'säger upp' : 'sier opp');
  });

  it('lover ikke mer enn det sier — bare når, hvor mye, og hvor man sier opp', () => {
    const { tekst } = byggProvePaaminnelseEpost({
      locale: 'nb',
      plan: 'Premium',
      dagerIgjen: 3,
      sluttIso: '2026-09-17',
      belop,
      oppsigelseUrl
    });
    expect(tekst).toContain('om du ikke sier opp');
    expect(tekst).not.toMatch(/tilbud|rabatt|håper/i);
  });
});
