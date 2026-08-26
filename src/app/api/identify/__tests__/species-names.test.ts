import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Artsnavn kommer fra databasen, ikke fra meldingskatalogen. Ramme-teksten i
 * identify-flyten ER oversatt — sv.json har «Kan förväxlas med {names} —
 * kontrollera noga innan du äter» — men navnene som ble satt inn i {names} kom
 * rått fra norwegian_name.
 *
 * En svensk bruker fikk altså advarselen «Kan förväxlas med grønn fluesopp».
 * Arten heter Lömsk flugsvamp på svensk. Det er navnet på den dødeligste
 * soppen vi har, skrevet slik at leseren ikke kjenner det igjen.
 *
 * Testene her går gjennom hele ruta, ikke bare hjelperen, fordi feilen lå i
 * koblingen: hjelperen fantes og var testet, men ruta kalte den ikke.
 */

let mockLocale: 'nb' | 'sv' = 'nb';

const KANTARELL = {
  id: 1,
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  edibility: 'edible',
  primary_image_url: null,
  season_start: 7,
  season_end: 10,
  peak_season_start: 8,
  peak_season_end: 9
};

/** Den dødelige. Navnene avviker mest mulig mellom språkene. */
const HVIT_FLUESOPP = {
  id: 99,
  norwegian_name: 'Grønn fluesopp',
  swedish_name: 'Lömsk flugsvamp',
  primary_image_url: null,
  edibility: 'deadly'
};

vi.mock('@/i18n/locale', () => ({ getUserLocale: async () => mockLocale }));

vi.mock('@/lib/log/request', () => {
  const logger = {
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(),
    child: () => logger
  };
  return { createRequestLogger: () => logger };
});

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert: async () => ({ error: null }) }) })
}));

vi.mock('@/lib/billing/subscription', () => ({
  getUserBillingSubscription: async () => null,
  getBillingCapabilities: () => ({ tier: 'premium', status: 'active', paid: true, aiDailyLimit: null })
}));

vi.mock('@/lib/supabase/server', () => {
  const table = (name: string) => {
    const builder: Record<string, unknown> = {
      select: () => builder,
      // Historikkraden (migrasjon 055) skrives med ØKTKLIENTEN. Uten denne
      // ville insert kastet, og recordIdentification ville svelget kastet —
      // skrivestien hadde vært helt utestet.
      insert: async () => ({ error: null }),
      ilike: () => builder,
      in: () => builder,
      gte: () => builder,
      lte: () => builder,
      limit: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () =>
        Promise.resolve({
          data: name === 'mushroom_species' ? KANTARELL : null,
          error: null
        }),
      then: (resolve: (v: unknown) => unknown) => {
        // look_alikes-joinet: én kritisk forvekslingsart for art 1.
        if (name === 'look_alikes') {
          return Promise.resolve({
            data: [
              {
                species_id: 1,
                danger_level: 'critical',
                similarity_description: null,
                difference_description: null,
                la: HVIT_FLUESOPP
              }
            ],
            error: null
          }).then(resolve);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve);
      }
    };
    return builder;
  };
  return {
    createClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'bruker-1' } }, error: null }) },
      from: table
    })
  };
});

const { POST } = await import('../route');

let n = 0;
function makeRequest() {
  n += 1;
  return new NextRequest('https://mycelet.com/api/identify', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.1.0.${n}` },
    body: JSON.stringify({ image: 'x'.repeat(100) })
  });
}

beforeEach(() => {
  mockLocale = 'nb';
  // isAiEnabled() krever minst 20 tegn og ikke plassholderverdien.
  vi.stubEnv('PLANTID_API_KEY', 'test-key-lang-nok-til-a-passere');
  // Kindwise svarer med det latinske navnet vi slår opp mot katalogen.
  vi.stubGlobal('fetch', async () =>
    new Response(
      JSON.stringify({
        result: {
          is_plant: { binary: false },
          classification: {
            suggestions: [
              { name: 'Cantharellus cibarius', probability: 0.92, details: { common_names: [], edibility: 'edible' } }
            ]
          }
        }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  );
});

async function suggestions(locale: 'nb' | 'sv') {
  mockLocale = locale;
  const res = await POST(makeRequest());
  const body = await res.json();
  return { status: res.status, body, top: body.suggestions?.[0] };
}

describe('artsnavnet på forslaget', () => {
  it('norsk leser får norsk', async () => {
    const { top } = await suggestions('nb');
    expect(top.norwegianName).toBe('Kantarell');
  });

  it('svensk leser får svensk', async () => {
    const { top } = await suggestions('sv');
    // Kantarell heter det samme, så denne alene beviser lite — den er med for
    // å vise at oppslaget ikke faller sammen. Beviset ligger i neste blokk.
    expect(top.norwegianName).toBe('Kantarell');
  });
});

describe('navnet på den DØDELIGE forvekslingsarten', () => {
  it('norsk leser: «Grønn fluesopp»', async () => {
    const { top } = await suggestions('nb');
    expect(top.dangerousLookAlikes?.[0]?.name).toBe('Grønn fluesopp');
  });

  it('svensk leser: «Lömsk flugsvamp» — ikke det norske navnet', async () => {
    const { top } = await suggestions('sv');
    expect(top.dangerousLookAlikes?.[0]?.name).toBe('Lömsk flugsvamp');
    expect(top.dangerousLookAlikes?.[0]?.name).not.toBe('Grønn fluesopp');
  });

  it('faregraden følger med uansett språk', async () => {
    for (const locale of ['nb', 'sv'] as const) {
      const { top } = await suggestions(locale);
      expect(top.dangerousLookAlikes?.[0]?.danger).toBe('critical');
      expect(top.dangerousLookAlikes?.[0]?.edibility).toBe('deadly');
    }
  });
});

describe('reserven når svensk navn mangler', () => {
  it('faller stille tilbake til norsk i stedet for å bli tomt', async () => {
    // getSpeciesDisplayName er bygget slik med vilje: en manglende rad skal gi
    // norsk tekst, ikke en blank etikett der et artsnavn skulle stått.
    const { getSpeciesDisplayName } = await import('@/lib/utils/species-name');
    expect(getSpeciesDisplayName({ norwegian_name: 'Grønn fluesopp', swedish_name: null }, 'sv')).toBe(
      'Grønn fluesopp'
    );
  });
});

describe('feilmeldingene følger leserens språk', () => {
  async function errorFor(locale: 'nb' | 'sv', setup: () => void) {
    mockLocale = locale;
    setup();
    const res = await POST(makeRequest());
    return { status: res.status, body: await res.json() };
  }

  it('AI avslått: svensk tekst', async () => {
    const { status, body } = await errorFor('sv', () => vi.stubEnv('PLANTID_API_KEY', 'kort'));
    expect(status).toBe(503);
    expect(body.error).toBe('AI-identifiering är inte aktiverad ännu.');
  });

  it('AI avslått: norsk tekst', async () => {
    const { body } = await errorFor('nb', () => vi.stubEnv('PLANTID_API_KEY', 'kort'));
    expect(body.error).toBe('AI-identifikasjon er ikke aktivert ennå.');
  });

  it('KODEN følger med — det er den klienten forgrener på', async () => {
    // Uten dette feltet måtte klienten gjenkjent tilstanden på selve teksten.
    for (const locale of ['nb', 'sv'] as const) {
      const { body } = await errorFor(locale, () => vi.stubEnv('PLANTID_API_KEY', 'kort'));
      expect(body.code).toBe('ai_disabled');
    }
  });

  it('den svenske teksten inneholder IKKE delstrengen den gamle klienten lette etter', async () => {
    // Dette er hele grunnen til at oversettelsen og kodefeltet måtte komme
    // sammen: `message.toLowerCase().includes('ikke aktivert')` ville sluttet å
    // treffe i det serveren svarte svensk, og panelet forsvunnet stille.
    const { body } = await errorFor('sv', () => vi.stubEnv('PLANTID_API_KEY', 'kort'));
    expect(body.error.toLowerCase()).not.toContain('ikke aktivert');
  });

  it('manglende bilde: begge språk, med kode', async () => {
    for (const [locale, tekst] of [['nb', 'Bilde mangler'], ['sv', 'Bild saknas']] as const) {
      mockLocale = locale;
      const res = await POST(
        new NextRequest('https://mycelet.com/api/identify', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.0.${Math.random()}` },
          body: JSON.stringify({})
        })
      );
      const body = await res.json();
      expect(body.error).toBe(tekst);
      expect(body.code).toBe('missing_image');
    }
  });
});
