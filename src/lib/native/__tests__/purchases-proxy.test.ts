import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * REGRESJONSVAKT — Capacitor-plugin-en er en PROXY, ikke et objekt.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FEILEN DENNE TESTEN FINNES FOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kjøpsknappen dukket aldri opp i iOS-appen. Vi lette i RevenueCat-oppsettet, i
 * produktstatusen hos Apple, og i at ingen binær var lastet opp. Ingen av delene
 * var årsaken. Feilen lå i én linje:
 *
 *     async function loadPlugin() {
 *       const mod = await import('@revenuecat/purchases-capacitor');
 *       return mod.Purchases;          // ← her
 *     }
 *
 * Capacitor gir deg ikke plugin-objektet, men en proxy som gjør ETHVERT
 * feltoppslag om til et native metodekall. Når en async-funksjon returnerer en
 * verdi, leser JavaScript `.then` på den for å se om det er et løfte. Proxyen
 * svarer med en funksjon, JavaScript kaller den, og iOS får spørsmål om en
 * metode som ikke finnes:
 *
 *     "Purchases.then()" is not implemented on ios
 *
 * Kallstedet i /pricing hadde `catch {}`, så feilen forsvant sporløst. Den ble
 * først synlig da Sentry og navngitt diagnostikk kom på plass.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DEN EKSISTERENDE TESTEN IKKE FANGET DEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * purchases.test.ts mocker plugin-en som et VANLIG OBJEKT. Et vanlig objekt har
 * ingen `.then`, så `await` er helt trygt — og feilen kan ikke oppstå. Mocken
 * var enklere enn virkeligheten på nøyaktig det punktet som var ødelagt.
 *
 * Derfor etterligner mocken under proxy-oppførselen: alt kan leses, alt er
 * kallbart, og ukjente metoder kaster slik Capacitor gjør.
 */

/** Metodene den ekte plugin-en faktisk har på iOS. */
const EKTE_METODER = new Set([
  'configure',
  'isConfigured',
  'logIn',
  'getOfferings',
  'purchasePackage',
  'restorePurchases',
  'checkTrialOrIntroductoryPriceEligibility'
]);

/** Gratisuka slik App Store leverer den via RevenueCat: introPrice med pris 0, én uke. */
const GRATIS_UKE = { price: 0, priceString: 'kr 0,00', cycles: 1, period: 'P1W', periodUnit: 'WEEK', periodNumberOfUnits: 1 };

const getOfferings = vi.fn(async () => ({
  current: {
    identifier: 'default',
    availablePackages: [
      {
        identifier: '$rc_monthly',
        packageType: 'MONTHLY',
        product: { identifier: 'no.mycelet.premium.monthly', priceString: 'kr 79,00', introPrice: GRATIS_UKE }
      },
      {
        identifier: '$rc_annual',
        packageType: 'ANNUAL',
        product: { identifier: 'no.mycelet.seasonpass.yearly', priceString: 'kr 249,00', price: 249, currencyCode: 'NOK', introPrice: null }
      }
    ]
  }
}));

/** Styres per test: hva Apple sier om Apple-ID-ens rett til introtilbudet, eller at kallet kaster (gammelt skall). */
let kvalifisering: Record<string, { status: number }> | 'kaster' = {};
const checkTrialOrIntroductoryPriceEligibility = vi.fn(async () => {
  if (kvalifisering === 'kaster') throw new Error('"Purchases.checkTrialOrIntroductoryPriceEligibility()" is not implemented on ios');
  return kvalifisering;
});

const ekte: Record<string, unknown> = {
  configure: vi.fn(async () => undefined),
  isConfigured: vi.fn(async () => ({ isConfigured: false })),
  logIn: vi.fn(async () => ({})),
  getOfferings,
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn(),
  checkTrialOrIntroductoryPriceEligibility
};

/** Oppfører seg som Capacitors plugin-proxy: alt er kallbart, ukjent kaster. */
const PurchasesProxy = new Proxy(
  {},
  {
    get(_t, prop: string) {
      if (EKTE_METODER.has(prop)) return ekte[prop];
      // Capacitor returnerer en funksjon for ALT — også `then`. Det er dette som
      // gjør proxyen «thenable» og utløser feilen.
      return () => {
        throw new Error(`"Purchases.${String(prop)}()" is not implemented on ios`);
      };
    }
  }
);

vi.mock('@revenuecat/purchases-capacitor', () => ({ Purchases: PurchasesProxy }));
vi.mock('../platform', () => ({ isNativePlatform: () => true }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: vi.fn(), captureException: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  kvalifisering = {};
});

describe('plugin-en tåler å bli hentet gjennom en async-funksjon', () => {
  it('kaster ikke «Purchases.then() is not implemented» når tilbudene hentes', async () => {
    vi.stubEnv('NEXT_PUBLIC_REVENUECAT_APPLE_KEY', 'appl_test');
    const { getIapOffers } = await import('../purchases');

    // Selve regresjonen: FØR fiksen kastet denne linja, fordi `await loadPlugin()`
    // leste `.then` på proxyen og kalte den.
    const offers = await getIapOffers();

    expect(offers).toHaveLength(2);
    expect(offers.map((o) => o.plan).sort()).toEqual(['premium', 'season_pass']);
    expect(offers.find((o) => o.plan === 'premium')?.priceString).toBe('kr 79,00');
  });

  it('viser Apples pris, ikke vår egen konstant', async () => {
    vi.stubEnv('NEXT_PUBLIC_REVENUECAT_APPLE_KEY', 'appl_test');
    const { getIapOffers } = await import('../purchases');
    const offers = await getIapOffers();
    expect(offers.find((o) => o.plan === 'season_pass')?.priceString).toBe('kr 249,00');
  });

  it('tar med butikkens tall og valuta når skallet gir dem — og null når det ikke gjør det', async () => {
    // «Tilsvarer ca. 21 kr per måned» regnes av disse; mangler de, står kortet uten beløp.
    vi.stubEnv('NEXT_PUBLIC_REVENUECAT_APPLE_KEY', 'appl_test');
    const { getIapOffers } = await import('../purchases');
    const offers = await getIapOffers();
    const sesong = offers.find((o) => o.plan === 'season_pass');
    expect(sesong?.price).toBe(249);
    expect(sesong?.currencyCode).toBe('NOK');
    const premium = offers.find((o) => o.plan === 'premium');
    expect(premium?.price).toBeNull();
    expect(premium?.currencyCode).toBeNull();
  });

  it('lover gratisuka bare på produktet som faktisk har den i butikken', async () => {
    vi.stubEnv('NEXT_PUBLIC_REVENUECAT_APPLE_KEY', 'appl_test');
    const { getIapOffers } = await import('../purchases');
    const offers = await getIapOffers();
    const premium = offers.find((o) => o.plan === 'premium');
    const sesong = offers.find((o) => o.plan === 'season_pass');
    expect(premium?.harProve).toBe(true);
    expect(premium?.proveDager).toBe(7);
    expect(sesong?.harProve).toBe(false);
    expect(sesong?.proveDager).toBeNull();
  });

  it('trekker løftet når Apple sier at Apple-ID-en ikke kvalifiserer', async () => {
    vi.stubEnv('NEXT_PUBLIC_REVENUECAT_APPLE_KEY', 'appl_test');
    kvalifisering = { 'no.mycelet.premium.monthly': { status: 1 } }; // INTRO_ELIGIBILITY_STATUS_INELIGIBLE
    const { getIapOffers } = await import('../purchases');
    const offers = await getIapOffers();
    expect(offers.find((o) => o.plan === 'premium')?.harProve).toBe(false);
  });

  it('et skall uten kvalifiseringsmetoden (kallet kaster) mister ikke tilbudene — løftet dømmes etter introPrice', async () => {
    vi.stubEnv('NEXT_PUBLIC_REVENUECAT_APPLE_KEY', 'appl_test');
    kvalifisering = 'kaster';
    const { getIapOffers } = await import('../purchases');
    const offers = await getIapOffers();
    expect(offers).toHaveLength(2);
    expect(offers.find((o) => o.plan === 'premium')?.harProve).toBe(true);
  });

  it('mocken etterligner faktisk Capacitor — ellers beviser testen ingenting', () => {
    // Kontroll av selve testen: proxyen MÅ se thenable ut, ellers ville den
    // gamle koden bestått og vakten vært verdiløs.
    const then = (PurchasesProxy as unknown as { then: unknown }).then;
    expect(typeof then, 'proxyen må svare med en funksjon på .then').toBe('function');
    expect(() => (then as () => void)()).toThrow(/not implemented on ios/);
  });
});
