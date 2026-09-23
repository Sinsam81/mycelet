import { describe, expect, it } from 'vitest';
import {
  PAAMINNELSE_DAGER,
  avslutningsfrist,
  bestemAppProvePaaminnelse,
  dagerMellom,
  erGratisuke,
  proveSluttDag,
  sendtNokkel,
  type AppProveRad
} from '../prove-paaminnelse-app';

/**
 * Apple sender ingen påminnelse før gratisuka blir til et trekk, så dagen
 * regnes her. Reglene: bare RevenueCat-eide, løpende prøver som ikke er
 * sandkasse og ikke alt er avsluttet; e-post ved 3 dager igjen (2 som
 * innhenting), aldri 1 eller 0, og aldri to ganger for samme prøveslutt.
 */
const BRUKER = '11111111-2222-4333-8444-555555555555';
const I_DAG = '2026-09-24';
const SLUTT = '2026-09-27T05:12:00.000Z';

function rad(over: Partial<AppProveRad> = {}): AppProveRad {
  return {
    user_id: BRUKER,
    tier: 'premium',
    status: 'trialing',
    // Kjøpt 20. september, 7 dager: 27. september 05:12 UTC = 07:12 Oslo → prøveslutt 2026-09-27, 3 dager fra i dag.
    current_period_start: '2026-09-20T05:12:00.000Z',
    current_period_end: SLUTT,
    cancel_at_period_end: false,
    metadata: { provider: 'revenuecat', rc_environment: 'PRODUCTION', rc_event_type: 'INITIAL_PURCHASE', prove_start: '2026-09-20T05:12:00.000Z' },
    ...over
  };
}

const INGEN_SENDT = new Set<string>();

describe('bestemAppProvePaaminnelse', () => {
  it('sender ved 3 dager igjen for en løpende App Store-prøve — med tidspunkt og prøvelengde til teksten', () => {
    expect(bestemAppProvePaaminnelse(rad(), I_DAG, INGEN_SENDT)).toEqual({
      send: true,
      dagerIgjen: 3,
      proveSlutt: '2026-09-27',
      proveSluttMs: Date.parse(SLUTT),
      proveLengdeDager: 7
    });
  });

  it('sender også ved 2 dager igjen — innhenting når dag 3 gikk tapt', () => {
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-09-26T20:00:00.000Z' }), I_DAG, INGEN_SENDT)).toEqual({
      send: true,
      dagerIgjen: 2,
      proveSlutt: '2026-09-26',
      proveSluttMs: Date.parse('2026-09-26T20:00:00.000Z'),
      proveLengdeDager: 6
    });
  });

  it('aldri ved 1 eller 0 dager igjen, aldri etter prøveslutt, og ikke før vinduet', () => {
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-09-25T10:00:00.000Z' }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'utenfor-vinduet' });
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-09-24T23:00:00.000Z' }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'utenfor-vinduet' });
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-09-23T10:00:00.000Z' }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'prove-slutt-passert' });
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-09-28T10:00:00.000Z' }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'utenfor-vinduet' });
    expect(PAAMINNELSE_DAGER).toEqual([3, 2]);
  });

  it('dagene er Oslo-kalenderdager, ikke 72 timer: samme morgen for prøver som slutter kl. 07 og kl. 23', () => {
    // 26. sep 22:30 UTC = 27. sep 00:30 Oslo → prøveslutt 27. september.
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-09-26T22:30:00.000Z' }), I_DAG, INGEN_SENDT)).toMatchObject({ send: true, proveSlutt: '2026-09-27' });
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-09-27T21:59:00.000Z' }), I_DAG, INGEN_SENDT)).toMatchObject({ send: true, proveSlutt: '2026-09-27' });
  });

  it('prøvelengden leses fra startdatoen: en måneds tilbudskode er ikke en gratisuke, og mangler starten er lengden ukjent', () => {
    const maaned = bestemAppProvePaaminnelse(rad({ current_period_start: '2026-08-28T05:12:00.000Z' }), I_DAG, INGEN_SENDT);
    expect(maaned).toMatchObject({ send: true, proveLengdeDager: 30 });
    expect(bestemAppProvePaaminnelse(rad({ current_period_start: '2026-09-24T05:12:00.000Z' }), I_DAG, INGEN_SENDT)).toMatchObject({ send: true, proveLengdeDager: 3 });
    expect(bestemAppProvePaaminnelse(rad({ current_period_start: null }), I_DAG, INGEN_SENDT)).toMatchObject({ send: true, proveLengdeDager: null });
    expect(bestemAppProvePaaminnelse(rad({ current_period_start: undefined }), I_DAG, INGEN_SENDT)).toMatchObject({ send: true, proveLengdeDager: null });
    expect(bestemAppProvePaaminnelse(rad({ current_period_start: 'tull' }), I_DAG, INGEN_SENDT)).toMatchObject({ send: true, proveLengdeDager: null });
  });

  it('bare RevenueCat-eide rader — Stripe-prøver får sin e-post fra webhooken, gavepass har intet trekk', () => {
    expect(bestemAppProvePaaminnelse(rad({ metadata: { provider: 'stripe', prove_start: '2026-09-20' } }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'ikke-revenuecat' });
    expect(bestemAppProvePaaminnelse(rad({ metadata: { source: 'manual_grant' } }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'ikke-revenuecat' });
    expect(bestemAppProvePaaminnelse(rad({ metadata: null }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'ikke-revenuecat' });
  });

  it('bare status trialing med en prøveslutt-dato', () => {
    expect(bestemAppProvePaaminnelse(rad({ status: 'active' }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'ikke-prove' });
    expect(bestemAppProvePaaminnelse(rad({ status: 'canceled' }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'ikke-prove' });
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: null }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'ikke-prove' });
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: 'ikke en dato' }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'ikke-prove' });
  });

  it('sandkassekjøp belastes aldri — ingen e-post om et trekk som ikke kommer', () => {
    expect(bestemAppProvePaaminnelse(rad({ metadata: { provider: 'revenuecat', rc_environment: 'SANDBOX' } }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'sandkasse' });
    expect(bestemAppProvePaaminnelse(rad({ metadata: { provider: 'revenuecat', rc_environment: 'sandbox' } }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'sandkasse' });
    // Uten miljøfelt (eldre rader) regnes raden som produksjon.
    expect(bestemAppProvePaaminnelse(rad({ metadata: { provider: 'revenuecat' } }), I_DAG, INGEN_SENDT)).toMatchObject({ send: true });
  });

  it('har kunden alt avsluttet i App Store, kommer ingen belastning — og ingen e-post', () => {
    expect(bestemAppProvePaaminnelse(rad({ cancel_at_period_end: true }), I_DAG, INGEN_SENDT)).toEqual({ send: false, grunn: 'allerede-sagt-opp' });
  });

  it('samme prøveslutt sendes aldri to ganger, uansett hvor mange morgener raden står i vinduet', () => {
    const sendt = new Set([sendtNokkel(BRUKER, '2026-09-27')]);
    expect(bestemAppProvePaaminnelse(rad(), I_DAG, sendt)).toEqual({ send: false, grunn: 'allerede-sendt' });
    // Dagen etter, 2 dager igjen: fortsatt sendt.
    expect(bestemAppProvePaaminnelse(rad(), '2026-09-25', sendt)).toEqual({ send: false, grunn: 'allerede-sendt' });
  });

  it('flytter prøveslutt seg (ny prøve, forlenget periode), er det en ny påminnelse', () => {
    const sendt = new Set([sendtNokkel(BRUKER, '2026-09-27')]);
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-10-05T05:12:00.000Z' }), '2026-10-02', sendt)).toEqual({
      send: true,
      dagerIgjen: 3,
      proveSlutt: '2026-10-05',
      proveSluttMs: Date.parse('2026-10-05T05:12:00.000Z'),
      proveLengdeDager: 15
    });
    // En annen bruker med samme dato er heller ikke «sendt».
    expect(bestemAppProvePaaminnelse(rad({ user_id: '22222222-2222-4333-8444-555555555555' }), I_DAG, sendt)).toMatchObject({ send: true });
  });

  it('rekkefølgen på vaktene: leverandør og status før vindu, vindu før sendt', () => {
    const sendt = new Set([sendtNokkel(BRUKER, '2026-09-27')]);
    expect(bestemAppProvePaaminnelse(rad({ status: 'active' }), I_DAG, sendt)).toEqual({ send: false, grunn: 'ikke-prove' });
    expect(bestemAppProvePaaminnelse(rad({ current_period_end: '2026-09-30T05:12:00.000Z' }), I_DAG, sendt)).toEqual({ send: false, grunn: 'utenfor-vinduet' });
  });
});

describe('erGratisuke', () => {
  it('bare 6–8 dager er en uke; 3 dager, to uker, en måned og ukjent er det ikke', () => {
    expect(erGratisuke(7)).toBe(true);
    expect(erGratisuke(6)).toBe(true);
    expect(erGratisuke(8)).toBe(true);
    expect(erGratisuke(3)).toBe(false);
    expect(erGratisuke(14)).toBe(false);
    expect(erGratisuke(30)).toBe(false);
    expect(erGratisuke(null)).toBe(false);
  });
});

describe('avslutningsfrist', () => {
  it('er prøveslutt minus ett døgn, som Oslo-dag og hel time rundet ned', () => {
    // 27. sep 05:12 UTC = 07:12 Oslo → fristen 26. september kl. 07 (ikke 07:12: «senest kl. 07» skal aldri være for sent).
    expect(avslutningsfrist(Date.parse('2026-09-27T05:12:00.000Z'))).toEqual({ dag: '2026-09-26', time: 7 });
    // 23:59 Oslo → kl. 23 dagen før.
    expect(avslutningsfrist(Date.parse('2026-09-27T21:59:00.000Z'))).toEqual({ dag: '2026-09-26', time: 23 });
    // 00:30 Oslo den 27. → kl. 00 den 26.
    expect(avslutningsfrist(Date.parse('2026-09-26T22:30:00.000Z'))).toEqual({ dag: '2026-09-26', time: 0 });
  });

  it('regner 24 klokketimer også over sommertidsskiftet (25. oktober 2026)', () => {
    // 25. okt 06:00 UTC = 07:00 CET; 24 timer før er 24. okt 06:00 UTC = 08:00 CEST.
    expect(avslutningsfrist(Date.parse('2026-10-25T06:00:00.000Z'))).toEqual({ dag: '2026-10-24', time: 8 });
  });
});

describe('proveSluttDag og dagerMellom', () => {
  it('prøveslutt er Oslo-datoen for tidsstempelet', () => {
    expect(proveSluttDag('2026-09-26T22:30:00.000Z')).toBe('2026-09-27'); // 00:30 Oslo
    expect(proveSluttDag('2026-09-27T21:59:59.000Z')).toBe('2026-09-27'); // 23:59 Oslo
    expect(proveSluttDag(null)).toBeNull();
    expect(proveSluttDag('')).toBeNull();
    expect(proveSluttDag('tull')).toBeNull();
  });

  it('dagerMellom teller hele kalenderdager, negativt bakover', () => {
    expect(dagerMellom('2026-09-24', '2026-09-27')).toBe(3);
    expect(dagerMellom('2026-09-24', '2026-09-24')).toBe(0);
    expect(dagerMellom('2026-09-24', '2026-09-23')).toBe(-1);
    expect(dagerMellom('2026-12-30', '2027-01-02')).toBe(3);
  });
});
