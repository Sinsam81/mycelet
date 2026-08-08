import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Hva kunden ser i sekundene etter at de har betalt.
 *
 * Sandbox-kjøpet 2026-08-08 gikk teknisk perfekt: Apples ark, RevenueCat,
 * webhooken og raden i billing_subscriptions — alt riktig. Men skjermen sa noe
 * annet. Skjermbildet like etter kjøpet viste:
 *
 *   • «Takk for kjøpet! Aktiverer abonnementet ditt …»   ← sto for alltid
 *   • kortet: «Sesongpass · Aktiv · Fornyes 9.8.2026»    ← riktig
 *   • merket øverst: «Gratis»                            ← i opptil fem minutter
 *
 * To uavhengige årsaker, begge på verst tenkelige tidspunkt:
 *
 * 1. refreshStatusUntilPaid() returnerte bare når abonnementet var aktivt, uten
 *    å fjerne «aktiverer»-meldingen.
 * 2. Headerens plan-merke leser betalingsstatus gjennom TanStack Query med fem
 *    minutters levetid. Prissiden hentet sin egen status ved siden av og rørte
 *    aldri den delte bufferen.
 */

const ROT = process.cwd();
const les = (p: string) => readFileSync(join(ROT, p), 'utf8');

describe('etter et fullført kjøp', () => {
  const prising = les('src/app/pricing/page.tsx');

  it('fjerner «aktiverer»-meldingen når abonnementet er aktivt', () => {
    // Uten dette står «Takk for kjøpet! Aktiverer abonnementet ditt …» over et
    // kort som allerede sier «Aktiv» — appen motsier seg selv rett etter betaling.
    const grein = prising.slice(prising.indexOf('refreshStatusUntilPaid'));
    const suksess = grein.slice(grein.indexOf('capabilities.paid'), grein.indexOf('iapActivationDelayed'));
    expect(suksess, 'suksess-greina må nullstille iapNotice').toMatch(/setIapNotice\(null\)/);
  });

  it('frisker opp den DELTE betalingsstatusen, ikke bare sidens egen', () => {
    const grein = prising.slice(prising.indexOf('refreshStatusUntilPaid'));
    const suksess = grein.slice(grein.indexOf('capabilities.paid'), grein.indexOf('iapActivationDelayed'));
    expect(suksess, 'må ugyldiggjøre billing-status-spørringen').toMatch(
      /invalidateQueries\(\{\s*queryKey:\s*BILLING_STATUS_KEY/
    );
  });
});

describe('nøkkelen til betalingsstatus finnes ett sted', () => {
  it('er eksportert fra useBilling', () => {
    expect(les('src/lib/hooks/useBilling.ts')).toMatch(/export const BILLING_STATUS_KEY/);
  });

  it('ingen skriver strengen på nytt for hånd', () => {
    // En hardkodet ['billing-status'] et tredje sted ville gitt nøyaktig samme
    // feil på nytt: to steder som tror de snakker om det samme, men ikke gjør det.
    for (const fil of [
      'src/app/pricing/page.tsx',
      'src/components/layout/Header.tsx',
      'src/lib/hooks/useBilling.ts'
    ]) {
      const t = les(fil);
      const hardkodet = t.match(/queryKey:\s*\[\s*'billing-status'/g) ?? [];
      expect(hardkodet, `${fil} skriver nøkkelen for hånd — bruk BILLING_STATUS_KEY`).toEqual([]);
    }
  });
});
