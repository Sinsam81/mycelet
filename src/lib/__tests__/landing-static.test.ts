import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FREE_DAILY_AI_LIMIT } from '@/lib/billing/plans';
import { SANKETIPS } from '@/lib/sanketips/manifest.generated';
import nb from '../../../messages/nb.json';
import sv from '../../../messages/sv.json';

/**
 * De to statiske landingssidene i public/landing/ er det FØRSTE en utlogget
 * besøkende ser — middleware rewriter «/» dit. De bygges ikke fra
 * meldingskatalogen, så ingenting annet enn denne testen holder dem i sync
 * med koden.
 */
const FILES = ['public/landing/index.html', 'public/landing/index.sv.html'] as const;

function landing(file: string): string {
  return readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
}

describe('statiske landingssider', () => {
  /**
   * Skriftene er selvhostet (public/landing/f1..f8.woff2). En preconnect mot
   * fonts.googleapis.com hentet derfor ingenting — den åpnet bare DNS + TCP +
   * TLS mot Google for hver eneste utloggede besøkende, før personvern-
   * erklæringen er lest og uten at noe i erklæringen omtaler forbindelsen.
   */
  it('åpner ingen forbindelse til tredjepart før besøkende har sett noe', () => {
    for (const file of FILES) {
      const html = landing(file);
      expect(html, file).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
      expect(html, file).not.toMatch(/rel="(preconnect|dns-prefetch)"/);
    }
  });

  it('har fortsatt de selvhostede skriftene — så testen over ikke består på en tom side', () => {
    for (const file of FILES) {
      expect(landing(file), file).toContain('/landing/f1.woff2');
    }
  });

  /**
   * Gratiskvoten står i klartekst her (statisk HTML kan ikke lese konstanten).
   * Endres FREE_DAILY_AI_LIMIT uten at teksten følger med, lover forsiden noe
   * annet enn API-et håndhever — og da skal denne bli rød.
   */
  it('oppgir samme gratis AI-kvote som FREE_DAILY_AI_LIMIT håndhever', () => {
    for (const file of FILES) {
      const html = landing(file);
      const quotas = [...html.matchAll(/(\d+) AI-identif\w+/g)].map((m) => Number(m[1]));
      expect(quotas.length, `${file}: fant ingen kvotepåstand å sjekke`).toBeGreaterThan(0);
      for (const quota of quotas) {
        expect(quota, file).toBe(FREE_DAILY_AI_LIMIT);
      }
    }
  });
});

/**
 * Fila har null JavaScript, så den kan ikke vite hvilken måned det er. Den sa
 * «I sesong nå: Kantarell · Steinsopp · Rødskrubb · Sandsopp» hele året — i
 * november og februar også, rett før setningen om at kalenderen følger
 * breddegraden. Etiketten er nå en som er sann året rundt («Høstens
 * klassikere»). Skal siden noen gang si hva som er i sesong NÅ, må den
 * setningen komme fra noe som kjenner datoen.
 */
describe('statiske landingssider — ingenting som bare er sant deler av året', () => {
  it('lover ikke at bestemte arter er i sesong «nå»', () => {
    for (const file of FILES) {
      expect(landing(file), file).not.toMatch(/I sesong nå|I säsong nu/i);
    }
  });

  it('artene står der fortsatt, under en etikett som holder året rundt', () => {
    expect(landing('public/landing/index.html')).toMatch(/Høstens klassikere<\/span>\s*<span[^>]*>Kantarell</);
    expect(landing('public/landing/index.sv.html')).toMatch(/Höstens klassiker<\/span>\s*<span[^>]*>Kantarell</);
  });

  it('sier ikke at appen venter på Apple — den ligger i App Store', () => {
    for (const file of FILES) {
      expect(landing(file), file).not.toMatch(/til vurdering|til behandling i App Store|för granskning|granskas av Apple/i);
    }
  });
});

/**
 * React-komponenten src/components/landing/LandingPage.tsx er RESERVEN: den
 * vises bare der mellomvaren ikke kjører (lokal utvikling, og dermed
 * `npm run qa`). Ingen besøkende ser den, så ingen merket at spørsmålet om
 * iOS-appen fortsatt svarte «til vurdering hos Apple nå» måneder etter at appen
 * lå i App Store. app-review-312.test.ts skriver «skriver du om en av dem,
 * skriv om begge» — her er det som holder de to sammen.
 */
describe('React-reserven sier det samme som den statiske siden', () => {
  const PAR = [
    { file: 'public/landing/index.html', landing: (nb as { Landing: Record<string, string> }).Landing, butikk: '/no/' },
    { file: 'public/landing/index.sv.html', landing: (sv as { Landing: Record<string, string> }).Landing, butikk: '/se/' }
  ];

  for (const { file, landing: katalog, butikk } of PAR) {
    it(`${file}: samme spørsmål om appen, og samme svar`, () => {
      const html = landing(file);
      expect(html).toContain(`>${katalog.faqIosQ}<`);
      // Svaret er lenket i den statiske fila; teksten er den samme.
      const utenTagger = html.replace(/<[^>]+>/g, '');
      expect(utenTagger).toContain(katalog.faqIosA);
      expect(katalog.faqIosA).toMatch(/App Store/);
      expect(katalog.faqIosA).not.toMatch(/vurdering|granskning|I mellomtiden|Under tiden/i);
    });

    it(`${file}: lenker til App Store i butikken for språket`, () => {
      expect(landing(file)).toContain(`https://apps.apple.com${butikk}app/id6784672944`);
    });
  }
});

/**
 * Artikkelkortene er skrevet for hånd i den statiske fila, så de vet ikke
 * hvilke artikler som finnes. Den svenske siden var en oversettelse av den
 * norske: alle seks kortene pekte på NORSKE artikler, merket «på norska» —
 * også «Hur länge efter regnet kommer svampen?», som hadde ligget på svensk
 * siden 2. september. Ingen av de seks svenske artiklene var lenket fra den
 * svenske landingssiden i det hele tatt.
 *
 * Manifestet (bygd av scripts/build-articles.mjs) er fasiten for hva som
 * finnes og på hvilket språk; her holdes kortene opp mot det.
 */
describe('statiske landingssider — artikkelkortene peker på artikler som finnes, på riktig språk', () => {
  const artikler = new Map(SANKETIPS.map((a) => [a.slug, a]));

  /** Hver lenke til en artikkel: slug, hele <a …>-taggen, og hvor i fila den står. */
  function artikkellenker(html: string): Array<{ slug: string; tagg: string; pos: number }> {
    return [...html.matchAll(/<a\b[^>]*\bhref="\/sanketips\/([^"#?]+)"[^>]*>/g)].map((m) => ({
      slug: m[1],
      tagg: m[0],
      pos: m.index ?? 0
    }));
  }

  const SIDER = [
    { file: 'public/landing/index.html', lang: 'nb' },
    { file: 'public/landing/index.sv.html', lang: 'sv' }
  ] as const;

  for (const { file, lang } of SIDER) {
    it(`${file}: ingen døde artikkellenker`, () => {
      const lenker = artikkellenker(landing(file));
      expect(lenker.length, `${file}: fant ingen artikkellenker å sjekke`).toBeGreaterThan(0);
      for (const { slug } of lenker) {
        expect(artikler.has(slug), `${file}: /sanketips/${slug} finnes ikke i manifestet`).toBe(true);
      }
    });

    it(`${file}: lenker aldri til den andre språkutgaven når artikkelen finnes på sidens eget språk`, () => {
      for (const { slug } of artikkellenker(landing(file))) {
        const artikkel = artikler.get(slug);
        if (!artikkel || artikkel.lang === lang) continue;
        expect(
          artikkel.alternate,
          `${file}: /sanketips/${slug} er på ${artikkel.lang}, men finnes på ${lang} som /sanketips/${artikkel.alternate} — pek dit`
        ).toBeNull();
      }
    });
  }

  it('den norske siden lenker bare til norske artikler', () => {
    for (const { slug } of artikkellenker(landing('public/landing/index.html'))) {
      expect(artikler.get(slug)?.lang, slug).toBe('nb');
    }
  });

  /**
   * En svensk artikkel ingen kan nå fra den svenske landingssiden var hele
   * feilen. Blir denne rød etter en ny svensk artikkel: gi den et kort, eller
   * en linje i en liste — den må bare kunne nås.
   */
  it('den svenske siden når hver eneste svenske artikkel som finnes', () => {
    const lenket = new Set(artikkellenker(landing('public/landing/index.sv.html')).map((l) => l.slug));
    const svenske = SANKETIPS.filter((a) => a.lang === 'sv').map((a) => a.slug);
    expect(svenske.length).toBeGreaterThan(0);
    for (const slug of svenske) {
      expect(lenket.has(slug), `/sanketips/${slug} er ikke lenket fra index.sv.html`).toBe(true);
    }
  });

  /**
   * Artikler som bare finnes på norsk kan stå på den svenske siden, men
   * leseren skal vite det før hun trykker: lenka er merket hreflang="nb", og
   * etiketten over den sier «på norska». Svenske artikler skal IKKE ha merket.
   *
   * Etiketten er den lille overskriften i versaler. Et KORT har sin egen, inne
   * i lenka; en lenke i en liste står under etiketten til blokka den ligger i.
   */
  it('den svenske siden merker norske artikler «på norska» — og bare dem', () => {
    const html = landing('public/landing/index.sv.html');
    const ETIKETT = /text-transform:uppercase[^>]*>([^<]*)</g;
    const etikettFor = (pos: number): string => {
      const iLenka = html.slice(pos, html.indexOf('</a>', pos));
      const egen = [...iLenka.matchAll(ETIKETT)][0]?.[1];
      if (egen !== undefined) return egen;
      return [...html.slice(0, pos).matchAll(ETIKETT)].at(-1)?.[1] ?? '';
    };

    const lenker = artikkellenker(html);
    expect(lenker.some((l) => artikler.get(l.slug)?.lang === 'sv')).toBe(true);
    for (const { slug, tagg, pos } of lenker) {
      const norsk = artikler.get(slug)?.lang === 'nb';
      if (norsk) {
        expect(tagg, slug).toContain('hreflang="nb"');
        expect(etikettFor(pos), slug).toContain('på norska');
      } else {
        expect(tagg, slug).not.toContain('hreflang="nb"');
        expect(etikettFor(pos), slug).not.toContain('på norska');
      }
    }
  });
});
