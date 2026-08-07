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
  'restorePurchases'
]);

const getOfferings = vi.fn(async () => ({
  current: {
    identifier: 'default',
    availablePackages: [
      { identifier: '$rc_monthly', packageType: 'MONTHLY', product: { identifier: 'no.mycelet.premium.monthly', priceString: 'kr 79,00' } },
      { identifier: '$rc_annual', packageType: 'ANNUAL', product: { identifier: 'no.mycelet.seasonpass.yearly', priceString: 'kr 249,00' } }
    ]
  }
}));

const ekte: Record<string, unknown> = {
  configure: vi.fn(async () => undefined),
  isConfigured: vi.fn(async () => ({ isConfigured: false })),
  logIn: vi.fn(async () => ({})),
  getOfferings,
  purchasePackage: vi.fn(),
  restorePurchases: vi.fn()
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

afterEach(() => vi.unstubAllEnvs());

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

  it('mocken etterligner faktisk Capacitor — ellers beviser testen ingenting', () => {
    // Kontroll av selve testen: proxyen MÅ se thenable ut, ellers ville den
    // gamle koden bestått og vakten vært verdiløs.
    const then = (PurchasesProxy as unknown as { then: unknown }).then;
    expect(typeof then, 'proxyen må svare med en funksjon på .then').toBe('function');
    expect(() => (then as () => void)()).toThrow(/not implemented on ios/);
  });
});
