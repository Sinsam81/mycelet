import { describe, expect, it, vi } from 'vitest';
import { byggDagsrapport, type BrukerRad, type RapportInn } from '@/lib/rapport/dagsrapport';
import { REGISTRERING_FORBEHOLD, type SoppregistreringRad } from '@/lib/rapport/soppregistreringer';

/**
 * Fotnoten i rapporten skal forklare radene som faktisk står i den. Da
 * «web:direkte» fikk egen rad (14. september 2026) ble radene omdøpt til
 * «ukjent (før måling)» og «nettet, direkte», men fotnoten fortsatte å
 * beskrive «direkte / ukjent» som direkte besøk pluss alt fra før målingen —
 * en rad som ikke fantes, og en definisjon som var feil for hver ny konto.
 * Testen binder fotnoten til navnene radene får, i begge varianter.
 */

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/email/send', () => ({ sendEpost: vi.fn() }));
vi.mock('@/lib/security/secret-compare', () => ({ bearerSecretMatches: () => false }));
vi.mock('@/lib/log/request', () => {
  const logger = { info: vi.fn(), debug: vi.fn(), trace: vi.fn(), error: vi.fn(), warn: vi.fn(), child: () => logger };
  return { createRequestLogger: () => logger };
});

const { byggRapportEpost } = await import('../route');

const NAA = new Date('2026-09-15T04:00:00Z');

function bruker(over: Partial<BrukerRad> = {}): BrukerRad {
  return { id: `u-${Math.random().toString(36).slice(2, 8)}`, created_at: '2026-09-14T10:00:00Z', last_sign_in_at: null, kilde: null, ...over };
}

function epost(brukere: BrukerRad[] = []) {
  const inn: RapportInn = { brukere, abonnement: [], varselabonnement: 0, regionerIDag: [], regionerIGar: [], naa: NAA };
  return byggRapportEpost(byggDagsrapport(inn), NAA);
}

describe('fotnoten om kilde per registrering', () => {
  it('navngir radene slik de står i rapporten, i både HTML- og tekstvarianten', () => {
    const { html, tekst } = epost([bruker({ kilde: 'web:direkte' }), bruker({ kilde: null })]);
    for (const variant of [html, tekst]) {
      // Radene som faktisk skrives …
      expect(variant).toContain('nettet, direkte');
      expect(variant).toContain('ukjent (før måling)');
      // … og fotnoten skal bruke de samme navnene, ikke den gamle samleraden.
      expect(variant).not.toContain('direkte / ukjent');
      // Linjeskiftene faller ulikt i HTML og tekst, så mellomrom matcher løst.
      expect(variant).toMatch(/«ukjent \(før måling\)»\s+er\s+kontoer\s+fra\s+før\s+det/);
      expect(variant).toMatch(/«nettet, direkte»\s+er\s+nettregistreringer\s+uten\s+cookie\s+fra\s+14\.\s+september\s+2026/);
    }
  });

  it('sier ikke at direkte besøk ligger i «ukjent» — fra 14. september har de egen rad', () => {
    const { html, tekst } = epost();
    for (const variant of [html, tekst]) {
      expect(variant).not.toMatch(/ukjent[^.]*er direkte besøk/);
    }
  });
});

/**
 * Blokken som erstattet rapportpulsen: «er det mindre sopp i år, og hvor?»
 * Tallet uten forbeholdet er det farlige — det leses som soppmengde.
 */
describe('soppregistreringer, samme dato som før', () => {
  const rad = (over: Partial<SoppregistreringRad>): SoppregistreringRad => ({
    snapshot: '2026-09-12',
    vindu: 'sesong',
    fra: '2026-08-01',
    til: '2026-09-05',
    omrade: 'Norge',
    gruppe: 'storsopp',
    antall: 100,
    normal: 100,
    prosent: 100,
    tynt: false,
    perAar: {},
    grenser: {},
    ...over
  });
  const rader: SoppregistreringRad[] = [
    rad({ gruppe: 'alle', prosent: 92 }),
    rad({ gruppe: 'storsopp', prosent: 86 }),
    rad({ vindu: 'uke', fra: '2026-08-30', gruppe: 'alle', prosent: 91 }),
    rad({ vindu: 'uke', fra: '2026-08-30', gruppe: 'storsopp', prosent: 95 }),
    rad({ omrade: 'Vestfold', prosent: 8 }),
    rad({ omrade: 'Agder', prosent: 13 }),
    rad({ omrade: 'Østfold', prosent: 30 }),
    rad({ omrade: 'Oslo', prosent: 138 }),
    rad({ omrade: 'Nordland', prosent: 186, tynt: true }),
    rad({ omrade: 'Troms', prosent: 194 })
  ];
  const lag = (over: Partial<RapportInn>) =>
    byggRapportEpost(byggDagsrapport({ brukere: [], abonnement: [], varselabonnement: 0, regionerIDag: [], regionerIGar: [], naa: NAA, ...over }), NAA);

  it('viser Norge, uka, lavest og høyest med stjerne, og forbeholdet ordrett — i begge varianter', () => {
    const { html, tekst } = lag({ soppregistreringer: rader });
    for (const variant of [html, tekst]) {
      expect(variant).toMatch(/Soppregistreringer, samme dato som før/i);
      expect(variant).toContain('alle 92 % · storsopp 86 %');
      expect(variant).toContain('alle 91 % · storsopp 95 %');
      expect(variant).toContain('1.8.–5.9.');
      expect(variant).toContain('30.8.–5.9.');
      expect(variant).toMatch(/Vestfold 8 %.*Agder 13 %.*Østfold 30 %/);
      expect(variant).toMatch(/Troms 194 %.*Nordland 186 %\*.*Oslo 138 %/);
      expect(variant).toContain(REGISTRERING_FORBEHOLD);
      expect(variant).toContain('GBIF-utgave 12.9.');
      expect(variant).not.toContain('12.9..');
      expect(variant).not.toMatch(/rapportpuls/i);
    }
  });

  it('«ikke målt ennå» før første utgave, uten forbehold uten tall', () => {
    const { html, tekst } = lag({ soppregistreringer: [] });
    for (const variant of [html, tekst]) {
      expect(variant).toContain('ikke målt ennå');
      expect(variant).not.toContain(REGISTRERING_FORBEHOLD);
    }
  });

  it('sier fra når tabellen ikke svarte', () => {
    const { tekst } = lag({});
    expect(tekst).toContain('ikke målt — tabellen soppregistreringer svarte ikke');
  });
});

/** Én rad under Prøver: hva prøvestarterne svarte på spørsmålet i App Store-påminnelsen (migrasjon 072). */
describe('svar fra prøvestartere', () => {
  const lag = (over: Partial<RapportInn>) =>
    byggRapportEpost(byggDagsrapport({ brukere: [], abonnement: [], varselabonnement: 0, regionerIDag: [], regionerIGar: [], naa: NAA, ...over }), NAA);
  const nylig = new Date(NAA.getTime() - 2 * 86_400_000).toISOString();

  it('tre tall i fast rekkefølge, i begge varianter', () => {
    const { html, tekst } = lag({
      proveSvar: [
        { valg: 'omrader', svart_at: nylig },
        { valg: 'omrader', svart_at: nylig },
        { valg: 'ai', svart_at: nylig }
      ]
    });
    for (const variant of [html, tekst]) {
      expect(variant).toMatch(/[Ss]var fra prøvestartere \(7 d\)/);
      expect(variant).toContain('2 områdene · 0 offline · 1 AI');
    }
  });

  it('sier fra når tabellen ikke svarte', () => {
    const { tekst } = lag({});
    expect(tekst).toContain('ikke målt — tabellen prove_svar svarte ikke');
  });
});

describe('nye kontoer (14 d) som følger et område', () => {
  it('én rad: X av N, delt på iOS og web', () => {
    const naa = NAA.getTime();
    const ny = (id: string, plattform: string | null) => bruker({ id, plattform, created_at: new Date(naa - 2 * 86_400_000).toISOString() });
    const inn: RapportInn = {
      brukere: [ny('i1', 'ios'), ny('i2', 'ios'), ny('w1', null), ny('w2', null), ny('w3', null)],
      abonnement: [],
      varselabonnement: 0,
      kontoerSomFolger: new Set(['i1', 'w3']),
      regionerIDag: [],
      regionerIGar: [],
      naa: NAA
    };
    const { html, tekst } = byggRapportEpost(byggDagsrapport(inn), NAA);
    for (const variant of [html, tekst]) {
      expect(variant).toMatch(/Nye kontoer \(14 d\) som følger et område/i);
      expect(variant).toContain('2 av 5 (iOS 1 av 2 · web 1 av 3)');
      expect(variant).not.toContain('Android');
    }
  });
});

describe('AI-identifisering i e-posten', () => {
  const frisk = { aktiv: true, kanBruke: true, grunn: null, igjen: 2099, bruktUke: 3, bruktMaaned: 3, bruktTotalt: 3 };
  function medAi(over: Partial<RapportInn>) {
    const inn: RapportInn = { brukere: [], abonnement: [], varselabonnement: 0, regionerIDag: [], regionerIGar: [], naa: NAA, ...over };
    return byggRapportEpost(byggDagsrapport(inn), NAA);
  }

  it('viser kall, feil og Kindwise-kvote i begge varianter', () => {
    const { html, tekst } = medAi({ aiKall: { siste24t: 1, siste7d: 5 }, aiFeil: { siste24t: 0, siste7d: 1 }, kindwise: frisk });
    for (const variant of [html, tekst]) {
      expect(variant).toMatch(/AI-identifisering/i);
      expect(variant).toContain('1 / 5');
      expect(variant).toContain('0 / 1');
      expect(variant).toContain('2099 kreditter igjen · 3 brukt siste uke');
      expect(variant).not.toContain('⚠️ AI');
    }
  });

  it('varselet står øverst i blokka når alle kall feiler', () => {
    const { html, tekst } = medAi({ aiKall: { siste24t: 0, siste7d: 0 }, aiFeil: { siste24t: 3, siste7d: 12 }, kindwise: frisk });
    for (const variant of [html, tekst]) {
      expect(variant).toContain('alle 12 AI-kall siste 7 dager feilet — ingen fikk svar');
      expect(variant.indexOf('⚠️ AI')).toBeLessThan(variant.indexOf('Identifiseringer (24 t / 7 d)'));
    }
  });

  it('sier fra når tabellene og usage_info ikke svarte — og nevner tabellen', () => {
    const { html, tekst } = medAi({});
    for (const variant of [html, tekst]) {
      expect(variant).toContain('ikke målt — tabellen ai_identifications svarte ikke');
      expect(variant).toContain('ikke målt — tabellen ai_identifiseringsfeil svarte ikke');
      expect(variant).toContain('ikke målt — usage_info svarte ikke');
    }
  });
});

describe('abonnement — gavepass er ikke betalende', () => {
  it('«Betalende» teller bare ekte kjøp; gavepass og testkontoer står på egen rad', () => {
    const inn: RapportInn = {
      brukere: [],
      abonnement: [
        // Ekte App Store-kunde, sagt opp, betalt ut september.
        { user_id: 'kunde', tier: 'premium', status: 'active', current_period_end: '2026-09-30T00:00:00Z', created_at: '2026-08-01T00:00:00Z', metadata: { provider: 'revenuecat' }, cancel_at_period_end: true },
        { user_id: 'gave', tier: 'season_pass', status: 'active', current_period_end: '2036-06-12T00:00:00Z', created_at: '2026-06-12T00:00:00Z', metadata: { source: 'manual_grant' } },
        { user_id: 'qa', tier: 'premium', status: 'active', current_period_end: '2026-10-01T00:00:00Z', created_at: '2026-09-01T00:00:00Z', metadata: { provider: 'revenuecat' } }
      ],
      interneBrukere: new Set(['qa']),
      varselabonnement: 0,
      regionerIDag: [],
      regionerIGar: [],
      naa: NAA
    };
    const { html, tekst } = byggRapportEpost(byggDagsrapport(inn), NAA);
    expect(html).toMatch(/Betalende \(ekte kjøp, løpende, uten prøver\)<\/td><td[^>]*>1<\/td>/);
    expect(html).toMatch(/Gratis tildelt \(gavepass og testkontoer\)<\/td><td[^>]*>2<\/td>/);
    expect(tekst).toMatch(/betalende \(uten prøver\) \.+ 1\n/);
    expect(tekst).toMatch(/gratis tildelt \.+ 2\n/);
  });
});
