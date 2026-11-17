import { describe, expect, it } from 'vitest';
import { APPLE_ABONNEMENTER_URL, abonnementKanal, faq2Nokkel, periodelinje, periodelinjeVerdier } from '../kanal';
import { betalingskilde } from '@/lib/rapport/abonnement';
import { APPLE_ABONNEMENT_URL } from '../prove-paaminnelse';
import { avslutningsfrist } from '../prove-paaminnelse-app';
import { mapRevenueCatEvent } from '../revenuecat';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

const NAA = new Date('2026-09-20T10:00:00Z');
const FRAMTID = '2026-10-20T10:00:00Z';
const FORTID = '2026-09-01T10:00:00Z';

describe('abonnementKanal', () => {
  it('ingen rad, eller gratisrad uten butikk: ingen kanal', () => {
    expect(abonnementKanal(null)).toBeNull();
    expect(abonnementKanal(undefined)).toBeNull();
    expect(abonnementKanal({ tier: 'free', metadata: null })).toBeNull();
    expect(abonnementKanal({ tier: 'free', metadata: { checkout_session_id: 'cs_1' } })).toBeNull();
  });

  it('leser butikken av raden', () => {
    expect(abonnementKanal({ tier: 'premium', metadata: { provider: 'revenuecat' } })).toBe('apple');
    expect(abonnementKanal({ tier: 'premium', metadata: { provider: 'stripe' } })).toBe('stripe');
    expect(abonnementKanal({ tier: 'season_pass', stripe_subscription_id: 'sub_1', metadata: {} })).toBe('stripe');
  });

  it('gavepass vinner over butikken — også over en gammel Stripe-rad', () => {
    expect(
      abonnementKanal({ tier: 'season_pass', stripe_subscription_id: 'sub_gammel', metadata: { source: 'manual_grant', provider: 'stripe' } })
    ).toBe('tildelt');
    expect(abonnementKanal({ tier: 'season_pass', metadata: { provider: 'manual_grant' } })).toBe('tildelt');
  });

  it('betalt plan uten butikk er satt inn for hånd', () => {
    expect(abonnementKanal({ tier: 'season_pass', metadata: null })).toBe('tildelt');
  });

  it('er enig med dagsrapportens betalingskilde om hva som er et kjøp', () => {
    const rader = [
      { tier: 'premium', metadata: { provider: 'stripe' } },
      { tier: 'premium', metadata: { provider: 'revenuecat' } },
      { tier: 'season_pass', metadata: { source: 'manual_grant', provider: 'stripe' } },
      { tier: 'season_pass', metadata: null }
    ] as const;
    for (const rad of rader) {
      const kilde = betalingskilde({ user_id: 'u', tier: rad.tier, status: 'active', current_period_end: null, metadata: rad.metadata } as never);
      const kanal = abonnementKanal(rad);
      expect(kanal === 'tildelt').toBe(kilde === 'manuell');
      if (kilde === 'stripe') expect(kanal).toBe('stripe');
      if (kilde === 'revenuecat') expect(kanal).toBe('apple');
    }
  });
});

describe('periodelinje', () => {
  // Slik RevenueCat-webhooken merker raden etter kundens egen oppsigelse.
  const SAGT_OPP = { provider: 'revenuecat', rc_event_type: 'CANCELLATION' };
  const linje = (
    status: string,
    cancel: boolean,
    kanal: 'stripe' | 'apple' | 'tildelt' | null,
    slutt: string | null = FRAMTID,
    metadata: Record<string, unknown> | null = null
  ) => periodelinje({ status, cancelAtPeriodEnd: cancel, periodeSlutt: slutt, kanal, metadata, naa: NAA });

  it('aktivt abonnement: fornyes, eller sagt opp uten ny belastning', () => {
    expect(linje('active', false, 'stripe')).toBe('periodRenews');
    expect(linje('active', false, 'apple')).toBe('periodRenews');
    expect(linje('active', true, 'stripe')).toBe('periodEndsNoCharge');
    expect(linje('active', true, 'apple', FRAMTID, SAGT_OPP)).toBe('periodEndsNoCharge');
  });

  it('App Store-betalingsproblem med frist er ikke en oppsigelse — lover aldri «belastes ikke igjen»', () => {
    // Raden slik webhooken faktisk skriver den for BILLING_ISSUE med frist.
    const beslutning = mapRevenueCatEvent({
      type: 'BILLING_ISSUE',
      product_id: 'no.mycelet.premium.monthly',
      purchased_at_ms: Date.parse('2026-08-20T10:00:00Z'),
      expiration_at_ms: Date.parse('2026-09-20T09:00:00Z'),
      grace_period_expiration_at_ms: Date.parse('2026-10-06T09:00:00Z')
    });
    if (beslutning.action !== 'apply') throw new Error('BILLING_ISSUE skal gi en oppdatering');
    expect(beslutning.update.status).toBe('active');
    expect(beslutning.update.cancelAtPeriodEnd).toBe(true);
    const rad = {
      status: beslutning.update.status,
      cancelAtPeriodEnd: beslutning.update.cancelAtPeriodEnd,
      periodeSlutt: beslutning.update.currentPeriodEnd,
      kanal: 'apple' as const,
      naa: NAA
    };

    expect(periodelinje({ ...rad, metadata: { provider: 'revenuecat', rc_event_type: 'BILLING_ISSUE' } })).toBe('periodAccessUntil');
    // Bare en CANCELLATION er kundens egen oppsigelse. Alt annet er ukjent.
    expect(periodelinje({ ...rad, metadata: { provider: 'revenuecat', rc_event_type: 'TRANSFER' } })).toBe('periodAccessUntil');
    expect(periodelinje({ ...rad, metadata: { provider: 'revenuecat' } })).toBe('periodAccessUntil');
    expect(periodelinje({ ...rad, metadata: null })).toBe('periodAccessUntil');
    expect(periodelinje({ ...rad })).toBe('periodAccessUntil');
    expect(periodelinje({ ...rad, metadata: SAGT_OPP })).toBe('periodEndsNoCharge');
    // Samme regel for en prøve som ikke lenger fornyes.
    expect(linje('trialing', true, 'apple', FRAMTID, { provider: 'revenuecat', rc_event_type: 'TRANSFER' })).toBe('periodAccessUntil');
  });

  it('en Stripe-rad leses aldri gjennom RevenueCat-merket', () => {
    // cancel_at_period_end hos Stripe ER oppsigelsen; et gammelt rc-merke på raden endrer ikke det.
    expect(linje('active', true, 'stripe', FRAMTID, { provider: 'stripe', rc_event_type: 'BILLING_ISSUE' })).toBe('periodEndsNoCharge');
  });

  it('prøveperiode: første belastning, eller avbrutt uten belastning', () => {
    expect(linje('trialing', false, 'stripe')).toBe('periodTrialFirstCharge');
    expect(linje('trialing', true, 'stripe')).toBe('periodTrialEndsNoCharge');
    expect(linje('trialing', true, 'apple', FRAMTID, SAGT_OPP)).toBe('periodTrialEndsNoCharge');
  });

  it('App Store-prøve: fristen ett døgn før, så lenge den ligger foran', () => {
    // Prøveslutt 27. september 05:12 UTC (07:12 i Oslo) → fristen er 26. september kl. 07 (05:00 UTC).
    const SLUTT = '2026-09-27T05:12:00.000Z';
    const apple = (naa: string, kanal: 'apple' | 'stripe' = 'apple') =>
      periodelinje({ status: 'trialing', cancelAtPeriodEnd: false, periodeSlutt: SLUTT, kanal, naa: new Date(naa) });

    expect(apple('2026-09-20T10:00:00Z')).toBe('periodTrialCancelBy');
    expect(apple('2026-09-26T04:59:59Z')).toBe('periodTrialCancelBy');
    // Fra fristen av er rådet for sent å følge: belastningen kommer SENEST ved prøveslutt.
    expect(apple('2026-09-26T05:00:00Z')).toBe('periodTrialChargeBy');
    expect(apple('2026-09-27T05:00:00Z')).toBe('periodTrialChargeBy');
    expect(apple('2026-09-27T05:12:00Z')).toBe('periodAccessEnded');
    // Stripe belaster ved prøveslutt, ikke før — hele veien.
    expect(apple('2026-09-20T10:00:00Z', 'stripe')).toBe('periodTrialFirstCharge');
    expect(apple('2026-09-27T05:00:00Z', 'stripe')).toBe('periodTrialFirstCharge');
  });

  it('App Store-prøve nevner aldri prøveslutt som selve belastningsdatoen', () => {
    // «Første belastning {prøveslutt}» er Stripes linje; Apple kan trekke inntil ett døgn før.
    for (const naa of ['2026-09-20T10:00:00Z', '2026-09-26T05:00:00Z', '2026-09-27T05:11:00Z']) {
      expect(
        periodelinje({
          status: 'trialing',
          cancelAtPeriodEnd: false,
          periodeSlutt: '2026-09-27T05:12:00.000Z',
          kanal: 'apple',
          naa: new Date(naa)
        })
      ).not.toBe('periodTrialFirstCharge');
    }
  });

  it('sandkasseprøve på tre minutter får aldri en frist i går', () => {
    expect(
      periodelinje({
        status: 'trialing',
        cancelAtPeriodEnd: false,
        periodeSlutt: '2026-09-20T10:03:00Z',
        kanal: 'apple',
        metadata: { provider: 'revenuecat', rc_environment: 'SANDBOX', rc_event_type: 'INITIAL_PURCHASE' },
        naa: NAA
      })
    ).toBe('periodTrialChargeBy');
  });

  it('gavepass fornyes aldri', () => {
    expect(linje('active', false, 'tildelt')).toBe('periodAccessUntil');
    expect(linje('active', false, 'tildelt', FORTID)).toBe('periodAccessEnded');
  });

  it('avsluttet: tilgang til datoen, eller sluttet', () => {
    expect(linje('canceled', true, 'stripe')).toBe('periodAccessUntil');
    expect(linje('canceled', true, 'stripe', FORTID)).toBe('periodAccessEnded');
    expect(linje('active', false, 'stripe', FORTID)).toBe('periodAccessEnded');
  });

  it('ingen linje uten dato, med ugyldig dato eller ved betalingsproblem', () => {
    expect(linje('active', false, 'stripe', null)).toBeNull();
    expect(linje('active', false, 'stripe', 'tull')).toBeNull();
    expect(linje('past_due', false, 'stripe')).toBeNull();
    expect(linje('inactive', false, null)).toBeNull();
  });

  it('hver nøkkel finnes på norsk og svensk, med datoplass', () => {
    const nokler = [
      'periodRenews',
      'periodEndsNoCharge',
      'periodTrialFirstCharge',
      'periodTrialCancelBy',
      'periodTrialChargeBy',
      'periodTrialEndsNoCharge',
      'periodAccessUntil',
      'periodAccessEnded'
    ] as const;
    for (const katalog of [nb, sv]) {
      const pricing = (katalog as Record<string, Record<string, string>>).Pricing;
      for (const n of nokler) expect(pricing[n]).toContain('{date}');
      // Fristen står bare i App Store-prøvelinja — og den må stå der.
      for (const n of nokler) {
        if (n === 'periodTrialCancelBy') expect(pricing[n]).toContain('{deadline}');
        else expect(pricing[n]).not.toContain('{deadline}');
      }
    }
  });

  it('den nøytrale linja lover ingenting om belastning', () => {
    const nbPricing = (nb as Record<string, Record<string, string>>).Pricing;
    const svPricing = (sv as Record<string, Record<string, string>>).Pricing;
    expect(nbPricing.periodAccessUntil).not.toMatch(/belast/i);
    expect(svPricing.periodAccessUntil).not.toMatch(/debiter/i);
  });
});

describe('periodelinjeVerdier', () => {
  // Gratisuke som slutter 27. september 05:12 UTC = 07:12 i Oslo.
  const SLUTT = '2026-09-27T05:12:00.000Z';

  it('gir dato og Apple-frist på språkets format', () => {
    expect(periodelinjeVerdier(SLUTT, 'nb')).toEqual({ date: '27.9.2026', deadline: '26.9.2026 kl. 07' });
    expect(periodelinjeVerdier(SLUTT, 'sv')).toEqual({ date: '2026-09-27', deadline: '2026-09-26 kl. 07' });
  });

  it('fristen er den samme som påminnelsen på e-post oppgir', () => {
    const frist = avslutningsfrist(Date.parse(SLUTT));
    expect(frist).toEqual({ dag: '2026-09-26', time: 7 });
    expect(periodelinjeVerdier(SLUTT, 'sv').deadline).toBe(`${frist.dag} kl. 0${frist.time}`);
  });

  it('regner dagen i Oslo-tid, ikke i serverens UTC', () => {
    // 26. september 22:30 UTC er 27. september 00:30 i Oslo.
    expect(periodelinjeVerdier('2026-09-26T22:30:00.000Z', 'nb')).toEqual({ date: '27.9.2026', deadline: '26.9.2026 kl. 00' });
    // Vintertid: 15. januar 23:30 UTC er 16. januar 00:30 i Oslo.
    expect(periodelinjeVerdier('2027-01-15T23:30:00.000Z', 'nb')).toEqual({ date: '16.1.2027', deadline: '15.1.2027 kl. 00' });
  });

  it('ugyldig dato gir tomme verdier i stedet for å kaste', () => {
    expect(periodelinjeVerdier('tull', 'nb')).toEqual({ date: '', deadline: '' });
  });
});

describe('faq2Nokkel', () => {
  it('nett: Stripe-kunden får knappen, Apple-kunden iPhone-veien, andre begge', () => {
    expect(faq2Nokkel('stripe', false)).toBe('faq2AStripe');
    expect(faq2Nokkel('apple', false)).toBe('faq2AApple');
    expect(faq2Nokkel(null, false)).toBe('faq2A');
    expect(faq2Nokkel('tildelt', false)).toBe('faq2A');
  });

  it('appen: aldri knappen som ikke finnes der', () => {
    expect(faq2Nokkel('apple', true)).toBe('faq2AApple');
    expect(faq2Nokkel(null, true)).toBe('faq2AApple');
    expect(faq2Nokkel('stripe', true)).toBe('faq2A');
    for (const kanal of ['stripe', 'apple', 'tildelt', null] as const) {
      expect(faq2Nokkel(kanal, true)).not.toBe('faq2AStripe');
    }
  });

  it('Apple-veien heter «navnet ditt», aldri «Apple-ID»', () => {
    for (const katalog of [nb, sv]) {
      const pricing = (katalog as Record<string, Record<string, string>>).Pricing;
      for (const n of ['faq2A', 'faq2AApple', 'manageAppleNote']) {
        expect(pricing[n]).not.toMatch(/Apple-ID/i);
      }
    }
    const nbPricing = (nb as Record<string, Record<string, string>>).Pricing;
    expect(nbPricing.faq2AApple).toContain('Innstillinger → navnet ditt øverst → Abonnementer');
  });
});

describe('Apple-adressen', () => {
  it('er den samme som prøvepåminnelsen bruker', () => {
    expect(APPLE_ABONNEMENTER_URL).toBe(APPLE_ABONNEMENT_URL);
  });
});
