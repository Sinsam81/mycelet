import { describe, expect, it } from 'vitest';
import nb from '../../../messages/nb.json';
import sv from '../../../messages/sv.json';

/**
 * Vaktposter for grunnene Apple avviste 1.0 på — og for naboene til dem.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVA SOM SKJEDDE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 2026-08-08 ble Mycelet 1.0 (2) sendt inn. Dagen etter kom avslaget:
 *
 *   «The submission offers auto-renewable subscriptions but does not include a
 *    functional link to the Terms of Use (EULA) in the app's metadata.»
 *    — Guideline 3.1.2, AUTOMATISK forhåndssjekk
 *
 * Det var en robot. Ingen hadde sett appen ennå. Gjennomgangen som fulgte fant
 * at det som ventet bak roboten var verre: iOS-skallet laster www.mycelet.com
 * (capacitor.config.ts → server.url), så den FØRSTE skjermen en anmelder ser er
 * den utloggede forsiden — og der sto det, i FAQ-en:
 *
 *   «Når kommer iOS-appen?»
 *   «Veldig snart — den er til vurdering hos Apple. I mellomtiden fungerer
 *    web-appen på alle telefoner: åpne mycelet.com i nettleseren.»
 *
 * Appen fortalte altså sin egen anmelder at den ikke var sluppet, og sendte
 * dem til nettsiden — der de samme to abonnementene selges via Stripe. Det er
 * retningslinje 3.1.1. På prissiden sto «abonnement kommer snart» mens
 * RevenueCat ble kontaktet, og Premium-kortet solgte «Prioritert eksperthjelp
 * (kommer)» med hake.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * HVORFOR DENNE TESTEN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Alle fire feilene var TEKST. Ingen av dem brøt en type, feilet en build eller
 * kastet en feil. De var riktige den dagen de ble skrevet, og ble farlige da
 * appen faktisk ble sendt inn — akkurat som i app-store-metadata.test.ts, der
 * beskrivelsen og feature-flaggene kom i utakt uten at noen merket det.
 *
 * Derfor står vaktposten på selve språkkatalogen. Den kan ikke se JSX, men den
 * kan se at ordene er borte — og ordene var problemet.
 */

type Catalog = Record<string, Record<string, unknown>>;
const CATALOGS: Array<[string, Catalog]> = [
  ['nb', nb as unknown as Catalog],
  ['sv', sv as unknown as Catalog]
];

/** Tekst som lover noe som ikke finnes ennå. Apple leser det som placeholder. */
const KOMMER_SNART = /kommer snart|kommer inom kort|coming soon/i;

describe('Apple 3.1.2 — ingen «kommer snart» der abonnement selges', () => {
  for (const [locale, catalog] of CATALOGS) {
    it(`${locale}: Pricing-teksten lover ikke funksjoner som ikke finnes`, () => {
      const verstinger = Object.entries(catalog.Pricing)
        .filter(([, v]) => typeof v === 'string' && KOMMER_SNART.test(v as string))
        .map(([k, v]) => `${k}: ${String(v)}`);

      expect(
        verstinger,
        'En betalingsside som sier at noe «kommer snart» leses av App Review som ' +
          'en app som ikke er ferdig (2.1), eller som et abonnement solgt på en ' +
          'funksjon som ikke finnes (3.1.2). Skriv om, eller fjern nøkkelen.'
      ).toEqual([]);
    });

    it(`${locale}: ingen funksjon i planene er merket «(kommer)»`, () => {
      // «premiumFeature4»: «Prioritert eksperthjelp (kommer)» sto med hake som
      // fjerde gode ved Premium. Nøkkelen er fjernet; kommer den tilbake, må
      // funksjonen finnes først.
      const merket = Object.entries(catalog.Pricing)
        .filter(([k]) => /Feature\d/.test(k))
        .filter(([, v]) => typeof v === 'string' && /\((kommer|kommer snart|planlagt)\)/i.test(v as string))
        .map(([k]) => k);

      expect(merket, 'Et abonnement kan ikke selges på en funksjon som ikke er bygget.').toEqual([]);
    });
  }
});

describe('Apple 3.1.1 — kjøpsvilkårene i appen peker ikke ut av App Store', () => {
  /**
   * Web-utgaven MÅ nevne begge kanalene: en kunde som kjøper på mycelet.com
   * inngår avtale med selgeren, og angrerettloven § 8 krever at selger, pris og
   * betalingsmåte oppgis før avtalen. App-utgaven skal bare omtale kanalen som
   * faktisk gjelder der — Apple.
   */
  const FORBUDT_I_APPEN = [
    { ord: 'Stripe', hvorfor: 'navngir en betalingsleverandør utenom App Store' },
    { ord: 'mycelet.com', hvorfor: 'peker kunden til nettbutikken' },
    { ord: '{website}', hvorfor: 'blir til mycelet.com når den rendres' }
  ];

  for (const [locale, catalog] of CATALOGS) {
    const nativeTekst = catalog.Kjopsvilkar?.productsAndPricesBodyNative as string | undefined;

    it(`${locale}: app-utgaven av «Produkter og priser» finnes`, () => {
      expect(
        nativeTekst,
        'src/app/kjopsvilkar/page.tsx velger denne i iOS-skallet — mangler den, ' +
          'faller siden tilbake på web-teksten som beskriver kortkjøp via Stripe.'
      ).toBeTypeOf('string');
      expect((nativeTekst ?? '').length).toBeGreaterThan(300);
    });

    for (const { ord, hvorfor } of FORBUDT_I_APPEN) {
      it(`${locale}: app-utgaven nevner ikke «${ord}»`, () => {
        expect(nativeTekst ?? '', `${hvorfor} — retningslinje 3.1.1.`).not.toContain(ord);
      });
    }

    it(`${locale}: web-utgaven beskriver fortsatt begge kanalene`, () => {
      // Motsatt vakt: fjerner noen Stripe-avsnittet fra WEB-teksten for å «være
      // på den sikre siden», ryker en opplysningsplikt overfor web-kunden.
      const web = catalog.Kjopsvilkar?.productsAndPricesBody as string;
      expect(web).toContain('Stripe');
      expect(web).toMatch(/App Store/);
    });
  }
});

describe('Apple 5.1.1(v) — kontosletting sier fra om Apple-abonnementet', () => {
  for (const [locale, catalog] of CATALOGS) {
    it(`${locale}: advarselen finnes og peker på App Store`, () => {
      // Apples egen side om kontosletting krever at en bruker med løpende
      // abonnement får beskjed om at det IKKE avsluttes med kontoen. Lista sa
      // «Stripe-data fjernes automatisk» — feil selskap, og feil konklusjon:
      // Apple ville fortsatt trukket penger etter at kontoen var slettet.
      const a = catalog.AccountDataActions;
      expect(a.appleSubscriptionWarning).toBeTypeOf('string');
      expect(String(a.appleSubscriptionWarning)).toMatch(/App Store/);
      expect(String(a.appleSubscriptionLink)).toMatch(/App Store/);
    });

    it(`${locale}: app-utgaven av slette-lista nevner ikke Stripe`, () => {
      expect(String(catalog.AccountDataActions.deletedSubscriptionNative)).not.toContain('Stripe');
    });
  }
});

describe('nb og sv har de samme nøklene i det som ble endret', () => {
  // En manglende svensk nøkkel gir «Pricing.iapRetry» som knappetekst i appen.
  // Sverige er halve markedet, og App Review kan kjøre i svensk locale.
  const NAMESPACES = ['Pricing', 'Kjopsvilkar', 'AccountDataActions', 'Profile', 'FindingPopup'];

  for (const ns of NAMESPACES) {
    it(`${ns} har lik nøkkelmengde i nb og sv`, () => {
      const nbKeys = Object.keys((nb as unknown as Catalog)[ns] ?? {}).sort();
      const svKeys = Object.keys((sv as unknown as Catalog)[ns] ?? {}).sort();
      expect(nbKeys.length).toBeGreaterThan(0);
      expect(svKeys).toEqual(nbKeys);
    });
  }
});
