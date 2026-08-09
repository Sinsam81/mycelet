import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
 *   «Snart — appen er til behandling i App Store. I mellomtiden bruker du
 *    Mycelet i nettleseren på mycelet.com, også på telefonen.»
 *
 * Appen fortalte altså sin egen anmelder at den ikke var sluppet, og sendte
 * dem til nettsiden — der de samme to abonnementene selges via Stripe. Det er
 * retningslinje 3.1.1. På prissiden sto «abonnement kommer snart» mens
 * RevenueCat ble kontaktet, og Premium-kortet solgte «Prioritert eksperthjelp
 * (kommer)» med hake.
 *
 * NB: sitatet over er fra `public/landing/index.html` — fila som faktisk
 * serveres. React-komponenten hadde sin egen, litt annerledes utgave av samme
 * spørsmål. Begge er rettet; se blokken nederst om hvorfor det er to av dem.
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEN EKTE FORSIDEN — public/landing/index.html
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Testene over vokter språkkatalogen, som React-appen leser. Men en utlogget
 * besøkende på `/` ser aldri React-appen:
 * `src/lib/supabase/middleware.ts` skriver forespørselen om til den statiske
 * fila `public/landing/index.html` (svensk: index.sv.html).
 *
 * Det gjør denne fila til det FØRSTE en anmelder hos Apple ser — iOS-skallet
 * laster www.mycelet.com og er utlogget ved oppstart.
 *
 * ⚠️ FELLA: Turbopack kjører ikke middleware i `npm run dev`. Lokalt får du
 * derfor React-versjonen i `src/components/landing/LandingPage.tsx`, og alt ser
 * riktig ut. Det skjedde her: rettelsene ble først gjort i React-komponenten,
 * verifisert i nettleseren lokalt, og traff ingenting i produksjon. Fila under
 * er den som gjelder. Skriver du om en av dem, skriv om begge.
 *
 * Fila har null JavaScript med vilje (selvhostede fonter, ingen sporing). Det
 * ene unntaket er pre-paint-vakten: ~250 byte som setter data-native på <html>
 * hvis Capacitor-broen finnes, slik at CSS-regelen kan skjule `[data-web-only]`
 * FØR noe males. Uten den kan ingenting skjules i appen — det finnes ingen
 * React her til å ta det etter mount.
 */
const LANDINGSSIDER = ['index.html', 'index.sv.html'] as const;

function landing(fil: string): string {
  return readFileSync(join(process.cwd(), 'public', 'landing', fil), 'utf8');
}

/**
 * Nærmeste omsluttende start-tagg for en tekst — nok her, fordi hvert element
 * vi sjekker er det innerste av sin type rundt teksten sin.
 */
function omsluttendeTagg(html: string, tekst: string, tagg: string): string {
  const i = html.indexOf(tekst);
  expect(i, `fant ikke «${tekst}» i landingssiden`).toBeGreaterThan(-1);
  const start = html.lastIndexOf(`<${tagg}`, i);
  expect(start, `fant ingen <${tagg}> før «${tekst}»`).toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('>', start) + 1);
}

describe('Den statiske forsiden — det Apple faktisk ser', () => {
  for (const fil of LANDINGSSIDER) {
    const html = landing(fil);

    it(`${fil}: pre-paint-vakten finnes`, () => {
      expect(html).toContain('html[data-native="true"] [data-web-only]{display:none!important}');
      expect(html).toContain('isNativePlatform');
      // Vakten må stå i <head>, ellers rekker innholdet å males først.
      expect(html.indexOf('data-native')).toBeLessThan(html.indexOf('</head>'));
    });

    it(`${fil}: prisene er skjult i appen`, () => {
      // Beløpene er hardkodede norske kroner. App Store trekker i kontoens egen
      // valuta — en svensk konto fikk «79 kr» presentert som sin pris (3.1.2).
      expect(omsluttendeTagg(html, '79 kr', 'section')).toContain('data-web-only');
      expect(omsluttendeTagg(html, '249 kr', 'section')).toContain('data-web-only');
    });

    it(`${fil}: «Kommer snart … App Store» er skjult i appen`, () => {
      const tekst = fil.includes('.sv.') ? 'Kommer snart till' : 'Kommer snart i';
      expect(omsluttendeTagg(html, tekst, 'a')).toContain('data-web-only');
    });

    it(`${fil}: iOS-spørsmålet i FAQ-en er skjult i appen`, () => {
      // Svaret sa at appen «er til behandling i App Store» og ba leseren bruke
      // Mycelet i nettleseren på mycelet.com i mellomtiden — en oppfordring ut
      // av appen, til stedet der de samme abonnementene selges via Stripe.
      // Retningslinje 3.1.1, på den aller første skjermen.
      const tekst = fil.includes('.sv.') ? 'När kommer iOS-appen?' : 'Når kommer iOS-appen?';
      expect(omsluttendeTagg(html, tekst, 'details')).toContain('data-web-only');
    });

    it(`${fil}: ingen påstand om at «web-appen er live»`, () => {
      expect(html).not.toMatch(/web-appen er live|webbappen är live/);
    });
  }
});
