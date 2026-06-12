// One-off: create the Mycelet subscription products/prices in Stripe.
// Idempotent via lookup_key — re-running reuses existing prices, never duplicates.
// Run: node --env-file=.env.local scripts/stripe-setup-products.mjs
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key || /xxxx/.test(key)) { console.error('STRIPE_SECRET_KEY mangler/placeholder'); process.exit(1); }
const s = new Stripe(key, { apiVersion: '2024-06-20' });

const PLANS = [
  { envKey: 'STRIPE_PRICE_PREMIUM_MONTHLY', lookup: 'mycelet_premium_monthly', name: 'Mycelet Premium',
    amount: 7900, interval: 'month', description: 'Ubegrenset AI-identifikasjon, prediksjon og premium-funksjoner.' },
  { envKey: 'STRIPE_PRICE_SEASON_PASS', lookup: 'mycelet_season_pass_yearly', name: 'Mycelet Sesongpass',
    amount: 24900, interval: 'year', description: 'Alle premium-funksjoner, fornyes årlig.' }
];

const acct = await s.accounts.retrieve();
console.log(`Konto: ${acct.id} | land: ${acct.country} | standardvaluta: ${(acct.default_currency || '?').toUpperCase()}`);
console.log('');

const out = [];
for (const p of PLANS) {
  const existing = (await s.prices.list({ lookup_keys: [p.lookup], active: true, limit: 1 })).data[0];
  let price;
  if (existing && existing.unit_amount === p.amount && existing.recurring?.interval === p.interval) {
    price = existing;
    console.log(`• ${p.name}: gjenbruker eksisterende pris ${price.id}`);
  } else {
    // Stripe prices are immutable, so a changed amount means a NEW price. Reuse
    // the product if one exists; transfer_lookup_key moves the key onto the new
    // price; retire the old one so only the current price is active.
    const productId = existing
      ? (typeof existing.product === 'string' ? existing.product : existing.product.id)
      : (await s.products.create({ name: p.name, description: p.description, metadata: { mycelet_plan: p.lookup } })).id;
    price = await s.prices.create({
      product: productId, unit_amount: p.amount, currency: 'nok',
      recurring: { interval: p.interval }, lookup_key: p.lookup, transfer_lookup_key: true,
      metadata: { mycelet_plan: p.lookup }
    });
    if (existing) await s.prices.update(existing.id, { active: false });
    console.log(`• ${p.name}: ${existing ? 'ny pris (beløp endret)' : 'opprettet'} ${price.id}`);
  }
  const nok = (price.unit_amount / 100).toFixed(0);
  console.log(`    ${nok} NOK / ${price.recurring.interval}  (${price.currency.toUpperCase()})`);
  out.push(`${p.envKey}=${price.id}`);
}

console.log('\n--- ENV-LINJER (til .env.local) ---');
for (const line of out) console.log(line);
