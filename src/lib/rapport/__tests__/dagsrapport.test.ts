import { describe, expect, it } from 'vitest';
import { byggDagsrapport, type AbonnementRad, type BrukerRad, type RapportInn } from '../dagsrapport';

/**
 * Testene her er skrevet mot ÉN feil: at rapporten oppgir flere kunder enn
 * Mycelet har. Det er den eneste feilen som gjør rapporten skadelig — et for
 * lavt tall får deg til å jobbe hardere, et for høyt får deg til å slutte.
 *
 * Produksjonstallet 2026-08-13 er referansen: seks rader med status «active»,
 * der én utløp 2. juli og fire er gavepass eller sandbox-kjøp fra testingen.
 */

const NAA = new Date('2026-08-13T06:00:00Z');

function dagerSiden(n: number): string {
  return new Date(NAA.getTime() - n * 86_400_000).toISOString();
}

function ab(over: Partial<AbonnementRad> = {}): AbonnementRad {
  return {
    user_id: 'u-uten-profil',
    tier: 'premium',
    status: 'active',
    current_period_end: dagerSiden(-30),
    created_at: dagerSiden(60),
    metadata: { provider: 'stripe' },
    ...over
  };
}

function br(over: Partial<BrukerRad> = {}): BrukerRad {
  return {
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    created_at: dagerSiden(30),
    last_sign_in_at: null,
    kilde: null,
    ...over
  };
}

function inn(over: Partial<RapportInn> = {}): RapportInn {
  return {
    brukere: [],
    abonnement: [],
    varselabonnement: 0,
    regionerIDag: [],
    regionerIGar: [],
    naa: NAA,
    ...over
  };
}

describe('betalende — den tellingen som kan lyve', () => {
  it('teller ikke et abonnement der perioden er utløpt, selv om status sier aktiv', () => {
    // Den ekte raden fra produksjon: status «active», sluttdato 2. juli.
    const r = byggDagsrapport(
      inn({ abonnement: [ab({ current_period_end: '2026-07-02T00:00:00Z' })] })
    );
    expect(r.betalende.totalt).toBe(0);
    expect(r.utloptMenMarkertAktiv).toBe(1);
  });

  it('teller et abonnement uten sluttdato som løpende', () => {
    expect(byggDagsrapport(inn({ abonnement: [ab({ current_period_end: null })] })).betalende.totalt).toBe(1);
  });

  it('teller ikke oppsagte eller ubetalte', () => {
    const r = byggDagsrapport(
      inn({ abonnement: [ab({ status: 'canceled' }), ab({ status: 'past_due' })] })
    );
    expect(r.betalende.totalt).toBe(0);
  });

  it('skiller gavepass fra ekte kjøp', () => {
    const r = byggDagsrapport(
      inn({
        abonnement: [
          ab({ metadata: { provider: 'stripe' } }),
          ab({ metadata: { provider: 'revenuecat' } }),
          ab({ metadata: null }), // grunnleggerpasset
          ab({ metadata: {} }) // demokontoen til Apple
        ]
      })
    );
    expect(r.betalende.totalt).toBe(4);
    expect(r.betalende.perKilde).toEqual({ stripe: 1, revenuecat: 1, manuell: 2 });
  });

  it('regner ikke et nytt gavepass som et salg', () => {
    const r = byggDagsrapport(
      inn({
        abonnement: [
          ab({ created_at: dagerSiden(2), metadata: null }),
          ab({ created_at: dagerSiden(2), metadata: { provider: 'revenuecat' } })
        ]
      })
    );
    expect(r.betalende.nyeSiste7d).toBe(1);
  });

  it('gjengir hele produksjonsbildet riktig', () => {
    // Seks rader, alle med status «active». Fasit: fem løper, én er utløpt,
    // og bare to av de fem representerer penger som har flyttet seg.
    const r = byggDagsrapport(
      inn({
        abonnement: [
          ab({ current_period_end: '2026-07-02T00:00:00Z', metadata: null }),
          ab({ current_period_end: '2027-06-04T00:00:00Z', metadata: null }),
          ab({ current_period_end: '2036-06-12T00:00:00Z', metadata: null }),
          ab({ current_period_end: '2028-01-01T00:00:00Z', metadata: null }),
          ab({ current_period_end: '2026-08-14T00:00:00Z', metadata: { provider: 'revenuecat' } }),
          ab({ current_period_end: '2026-08-15T00:00:00Z', metadata: { provider: 'revenuecat' } })
        ]
      })
    );
    expect(r.betalende.totalt).toBe(5);
    expect(r.utloptMenMarkertAktiv).toBe(1);
    expect(r.betalende.perKilde.manuell).toBe(3);
    expect(r.betalende.perKilde.revenuecat).toBe(2);
  });
});

describe('brukere', () => {
  it('teller nye i to vinduer og de som aldri kom tilbake', () => {
    const r = byggDagsrapport(
      inn({
        brukere: [
          br({ created_at: dagerSiden(0.5), last_sign_in_at: dagerSiden(0.4) }),
          br({ created_at: dagerSiden(3) }),
          br({ created_at: dagerSiden(6) }),
          br({ created_at: dagerSiden(30), last_sign_in_at: dagerSiden(2) })
        ]
      })
    );
    expect(r.nyeBrukere).toEqual({ siste24t: 1, siste7d: 3, totalt: 4 });
    expect(r.aldriInnloggetIgjen).toBe(2);
  });
});

describe('kilder — det annonsetesten skal leses av', () => {
  it('teller registrerte og ekte betalende per kilde', () => {
    const r = byggDagsrapport(
      inn({
        brukere: [
          br({ id: 'a1', kilde: 'google/soppkart-test', created_at: dagerSiden(2) }),
          br({ id: 'a2', kilde: 'google/soppkart-test', created_at: dagerSiden(20) }),
          br({ id: 'f1', kilde: 'sosialt:facebook.com', created_at: dagerSiden(1) }),
          br({ id: 'd1', created_at: dagerSiden(1) })
        ],
        abonnement: [
          ab({ user_id: 'a2', metadata: { provider: 'stripe' } }),
          ab({ user_id: 'f1', metadata: null }) // gavepass — teller ikke som kanalens fortjeneste
        ]
      })
    );
    expect(r.kilder).toEqual([
      { kilde: 'google/soppkart-test', totalt: 2, siste7d: 1, betalende: 1 },
      { kilde: 'sosialt:facebook.com', totalt: 1, siste7d: 1, betalende: 0 },
      { kilde: 'ukjent', totalt: 1, siste7d: 1, betalende: 0 }
    ]);
  });

  it('legger «ukjent» sist selv når den er størst', () => {
    // Alle fra før målingen startet er «ukjent». Den raden vil være størst i
    // lang tid, og skal ikke skyve annonsetesten ut av synsfeltet.
    const r = byggDagsrapport(
      inn({
        brukere: [br(), br(), br(), br({ kilde: 'google/soppkart-test' })]
      })
    );
    expect(r.kilder.map((k) => k.kilde)).toEqual(['google/soppkart-test', 'ukjent']);
  });

  it('teller et utløpt abonnement som ikke-betalende for kilden', () => {
    const r = byggDagsrapport(
      inn({
        brukere: [br({ id: 'a1', kilde: 'google/soppkart-test' })],
        abonnement: [ab({ user_id: 'a1', current_period_end: '2026-07-02T00:00:00Z' })]
      })
    );
    expect(r.kilder[0].betalende).toBe(0);
  });
});

describe('flanker — samme regel som varselet', () => {
  it('finner regionen som krysset terskelen i natt', () => {
    // Den ekte hendelsen: Ålesund 70 → 87 natt til 13. august.
    const r = byggDagsrapport(
      inn({
        regionerIGar: [{ region: 'Ålesund', score: 70 }, { region: 'Bergen', score: 84 }],
        regionerIDag: [{ region: 'Ålesund', score: 87 }, { region: 'Bergen', score: 84 }]
      })
    );
    expect(r.flanker).toEqual([{ region: 'Ålesund', fra: 70, til: 87 }]);
  });

  it('melder ikke en region som var over terskelen i går også', () => {
    const r = byggDagsrapport(
      inn({
        regionerIGar: [{ region: 'Bergen', score: 88 }],
        regionerIDag: [{ region: 'Bergen', score: 91 }]
      })
    );
    expect(r.flanker).toEqual([]);
  });

  it('tier når gårsdagen mangler for regionen', () => {
    const r = byggDagsrapport(inn({ regionerIGar: [], regionerIDag: [{ region: 'Oslo', score: 90 }] }));
    expect(r.flanker).toEqual([]);
  });
});
