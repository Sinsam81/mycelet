import { isNativePlatform } from './platform';
import { IapPlan, guessTierFromProductId } from '@/lib/billing/plans';
import { PlanViewState, getBlockingPaidPlan } from '@/lib/billing/plan-state';

/**
 * RevenueCat IAP wrapper for the native shells (Apple App Store rule 3.1.1
 * forbids Stripe in-app; Google Play equivalent later). Web keeps Stripe.
 *
 * All calls are guarded: the plugin's web implementation THROWS ("Web not
 * supported"), so nothing here may run outside the Capacitor shell. The
 * plugin is dynamically imported to keep it out of the web bundle.
 *
 * The RevenueCat app user id is the Supabase user UUID — that's what lets the
 * webhook (src/app/api/revenuecat/webhook) attach purchases to the right
 * `billing_subscriptions` row.
 *
 * NB (hosted shell): the shipped app binary carries the plugin's NATIVE side;
 * this JS ships from mycelet.com. Keep the npm version pinned and only bump it
 * together with an app-binary release, or the two sides can drift.
 */

export interface IapOffer {
  plan: IapPlan;
  productId: string;
  /** Localized, store-formatted price, e.g. "kr 79,00". SHOW this in the UI —
   * the App Store price tier can differ from the Stripe NOK price. */
  priceString: string;
  packageIdentifier: string;
  /** The raw RevenueCat package, passed back on purchase. */
  rcPackage: PurchasesPackageLike;
}

export type IapPurchaseOutcome = 'success' | 'cancelled' | 'blocked-active-plan';

// The plugin type surface we rely on (subset of @revenuecat/purchases-capacitor).
export interface PurchasesPackageLike {
  identifier: string;
  packageType: string;
  product: { identifier: string; priceString: string };
}
interface CustomerInfoLike {
  entitlements: { active: Record<string, unknown> };
}
interface PurchasesPluginLike {
  configure(options: { apiKey: string; appUserID?: string | null }): Promise<void>;
  isConfigured(): Promise<{ isConfigured: boolean }>;
  logIn(options: { appUserID: string }): Promise<unknown>;
  getOfferings(): Promise<{ current?: { availablePackages?: PurchasesPackageLike[] } | null }>;
  purchasePackage(options: { aPackage: PurchasesPackageLike }): Promise<{ customerInfo: CustomerInfoLike }>;
  restorePurchases(): Promise<{ customerInfo: CustomerInfoLike }>;
}

let configuredForUser: string | null = null;

async function loadPlugin(): Promise<PurchasesPluginLike> {
  const mod = await import('@revenuecat/purchases-capacitor');
  return mod.Purchases as unknown as PurchasesPluginLike;
}

/** True when running in the native shell AND the RevenueCat key is configured. */
export function isIapAvailable(): boolean {
  return isNativePlatform() && Boolean(process.env.NEXT_PUBLIC_REVENUECAT_APPLE_KEY);
}

/**
 * Configure (or re-identify) the SDK for the logged-in user. Idempotent per
 * user; safe to call on every pricing-page mount.
 */
export async function configurePurchases(userId: string): Promise<boolean> {
  if (!isIapAvailable()) return false;
  if (configuredForUser === userId) return true;

  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_APPLE_KEY as string;
  const purchases = await loadPlugin();
  const { isConfigured } = await purchases.isConfigured();
  if (isConfigured) {
    await purchases.logIn({ appUserID: userId });
  } else {
    await purchases.configure({ apiKey, appUserID: userId });
  }
  configuredForUser = userId;
  return true;
}

function packageToPlan(pkg: PurchasesPackageLike): IapPlan | null {
  // Primary: the standard RevenueCat package identifiers ($rc_monthly/$rc_annual).
  if (pkg.packageType === 'MONTHLY') return 'premium';
  if (pkg.packageType === 'ANNUAL') return 'season_pass';
  // Fallback: the SAME shared heuristic the webhook uses server-side, so the
  // app can never sell a package the webhook then fails to map.
  const tier = guessTierFromProductId(pkg.product.identifier);
  return tier === 'free' ? null : tier;
}

/** Load the current offering's packages mapped to Mycelet plans. */
export async function getIapOffers(): Promise<IapOffer[]> {
  if (!isIapAvailable()) return [];
  const purchases = await loadPlugin();
  const offerings = await purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];

  const offers: IapOffer[] = [];
  for (const pkg of packages) {
    const plan = packageToPlan(pkg);
    if (!plan) continue;
    offers.push({
      plan,
      productId: pkg.product.identifier,
      priceString: pkg.product.priceString,
      packageIdentifier: pkg.identifier,
      rcPackage: pkg
    });
  }
  return offers;
}

/**
 * Run the native purchase flow for an offer. Resolves 'cancelled' when the
 * user backs out of Apple's sheet; throws on real errors (caller shows a
 * translated error message).
 *
 * `planView` is REQUIRED so no call site can start an Apple purchase without
 * stating what the customer already pays for. Web is protected by the 409 in
 * /api/billing/checkout; this flow never touches that route, so the same rule
 * has to be enforced here — before Apple's sheet opens. Once the sheet is
 * confirmed the customer is charged, and a double subscription has to be
 * refunded by Apple, which they must ask for themselves.
 */
export async function purchaseIapOffer(offer: IapOffer, planView: PlanViewState): Promise<IapPurchaseOutcome> {
  if (getBlockingPaidPlan(planView)) return 'blocked-active-plan';

  const purchases = await loadPlugin();
  try {
    await purchases.purchasePackage({ aPackage: offer.rcPackage });
    return 'success';
  } catch (error) {
    if (isUserCancellation(error)) return 'cancelled';
    throw error;
  }
}

/**
 * Apple-required "Restore purchases". Returns true when an active entitlement
 * came back (the webhook then refreshes billing_subscriptions server-side).
 */
export async function restoreIapPurchases(): Promise<boolean> {
  const purchases = await loadPlugin();
  const { customerInfo } = await purchases.restorePurchases();
  return Object.keys(customerInfo.entitlements.active ?? {}).length > 0;
}

function isUserCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  // PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR — code "1" in the hybrid
  // SDKs. Deliberately narrow: an interrupted/failed transaction whose message
  // merely CONTAINS "cancelled" must surface as an error, not be swallowed as
  // a user cancellation.
  if (code === '1' || code === 1) return true;
  const message = String((error as { message?: unknown }).message ?? '');
  return /(purchase|user)\s*(was\s*)?cancell?ed/i.test(message);
}
