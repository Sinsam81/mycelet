import { describe, expect, it, vi } from 'vitest';
import { byggDagsrapport, type BrukerRad, type RapportInn } from '@/lib/rapport/dagsrapport';

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
