import { Suspense, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VISNINGSFRIST_MS } from '@/lib/billing/tidligere-abonnent-visning';

/**
 * Forsiden som serverkomponent, kalt som en vanlig asynkron funksjon.
 *
 * Fire ting som ikke bryter en type og ikke synes i en gjennomlesing, men som
 * alle har gått galt her før — eller ville gjort det ved neste omskriving:
 *
 *  1. Utloggede får landingssiden HEL, aldri bak et skjelett.
 *  2. Spørringene går i én runde. De sto i fem etter hverandre.
 *  3. Et tregt Stripe holder ikke siden igjen, og «vet ikke» blir aldri til et
 *     løfte om gratisuke. Betalende spør vi ikke Stripe om i det hele tatt.
 *  4. Tilbudsarket står FØR prognosekortet i samme strømmede enhet — arket
 *     lytter etter kortets hendelse, som sendes én gang.
 */

interface Rad {
  data: unknown;
  error: { message: string } | null;
}

const tilstand = {
  bruker: null as { id: string; email?: string } | null,
  svar: {} as Record<string, Rad>,
  /** Rekkefølgen spørringene startet og svarte i. */
  logg: [] as string[],
  /** Hva hver spørring ba om: «tabell.metode(argumenter)». */
  kall: [] as string[],
  /** Når satt: ingen spørring svarer før porten åpnes. */
  port: null as Promise<void> | null
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: tilstand.bruker } }) },
    from(tabell: string) {
      const bygger: Record<string, unknown> = {};
      for (const metode of ['select', 'eq', 'is', 'order', 'limit', 'maybeSingle']) {
        bygger[metode] = (...argumenter: unknown[]) => {
          tilstand.kall.push(`${tabell}.${metode}(${argumenter.map((a) => JSON.stringify(a)).join(',')})`);
          return bygger;
        };
      }
      // PostgREST-byggeren er en «thenable»: spørringen starter først når noen venter på den.
      bygger.then = (ok: (rad: Rad) => unknown, feil: (e: unknown) => unknown) => {
        tilstand.logg.push(`start:${tabell}`);
        return (tilstand.port ?? Promise.resolve())
          .then(() => {
            tilstand.logg.push(`svar:${tabell}`);
            return tilstand.svar[tabell] ?? { data: null, error: null };
          })
          .then(ok, feil);
      };
      return bygger;
    }
  })
}));

// Oversetteren svarer med nøkkelen — og verdiene den fikk, så testene kan se
// hva som ble satt inn («seasonSummaryTitle{"year":"2026"}»).
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (nokkel: string, verdier?: Record<string, unknown>) =>
    verdier ? `${nokkel}${JSON.stringify(verdier)}` : nokkel,
  getLocale: async () => 'nb'
}));

const stripe = {
  kall: [] as string[],
  kunder: [] as Array<{ id: string }>,
  abonnement: 0,
  henger: false,
  customers: {
    list: (p: { email: string }) => {
      stripe.kall.push(`customers:${p.email}`);
      return stripe.henger ? new Promise<never>(() => {}) : Promise.resolve({ data: stripe.kunder });
    }
  },
  subscriptions: {
    list: (p: { customer: string }) => {
      stripe.kall.push(`subscriptions:${p.customer}`);
      return Promise.resolve({ data: new Array(stripe.abonnement).fill({}) });
    }
  }
};
vi.mock('@/lib/stripe/server', () => ({ getStripeServerClient: () => stripe }));

const logg = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() };
vi.mock('@/lib/log', () => ({ logger: logg }));

const { default: HomePage } = await import('../page');
const { LandingPage } = await import('@/components/landing/LandingPage');
const { PageWrapper } = await import('@/components/layout/PageWrapper');
const { HjemSkjelett } = await import('@/components/home/HjemSkjelett');
const { MushroomDayCard } = await import('@/components/home/MushroomDayCard');
const { ProvGratisVedStart } = await import('@/components/billing/ProvGratisVedStart');
const { ProveLofteTekst } = await import('@/components/billing/ProveLofteTekst');
const { VarselCta } = await import('@/components/soppforhold/VarselCta');
const { BestRegionsCard } = await import('@/components/home/BestRegionsCard');
const { SkjulNarFolger } = await import('@/components/home/SkjulNarFolger');

type Element = ReactElement<Record<string, unknown>>;

/** Alle elementene i et JSX-tre, i den rekkefølgen React ville montert dem. */
function alle(node: ReactNode, ut: Element[] = []): Element[] {
  if (Array.isArray(node)) {
    for (const barn of node) alle(barn as ReactNode, ut);
  } else if (isValidElement(node)) {
    const element = node as Element;
    ut.push(element);
    alle(element.props.children as ReactNode, ut);
  }
  return ut;
}

/** All tekst i et JSX-tre (oversetteren i testen svarer med nøkkelen). */
function tekst(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map((barn) => tekst(barn as ReactNode)).join(' ');
  if (isValidElement(node)) return tekst((node as Element).props.children as ReactNode);
  return '';
}

/** Skallet siden sender med én gang, og det strømmede innholdet som kommer etter. */
async function skall() {
  const side = (await HomePage()) as Element;
  const grense = side.props.children as Element;
  const innhold = grense.props.children as Element;
  return { side, grense, innhold };
}

async function forside(): Promise<Element[]> {
  const { innhold } = await skall();
  const komponent = innhold.type as (props: unknown) => Promise<ReactNode>;
  return alle(await komponent(innhold.props));
}

const premiumKort = (elementer: Element[]) => elementer.find((e) => e.props.href === '/pricing?plan=season_pass');
const harType = (elementer: Element[], type: unknown) => elementer.some((e) => e.type === type);

const ART = {
  id: 1,
  norwegian_name: 'Kantarell',
  swedish_name: 'Kantarell',
  latin_name: 'Cantharellus cibarius',
  edibility: 'edible',
  season_start: 1,
  season_end: 12,
  peak_season_start: null,
  peak_season_end: null,
  commonality: 'common',
  primary_image_url: null
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-15T10:00:00Z'));
  tilstand.bruker = { id: 'bruker-1', email: 'x@example.com' };
  tilstand.svar = { mushroom_species: { data: [ART], error: null } };
  tilstand.logg = [];
  tilstand.kall = [];
  tilstand.port = null;
  stripe.kall = [];
  stripe.kunder = [];
  stripe.abonnement = 0;
  stripe.henger = false;
  for (const f of Object.values(logg)) f.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('forsiden — skallet', () => {
  it('utlogget: landingssiden, hel og uten skjelett — og ingen spørringer', async () => {
    tilstand.bruker = null;
    const side = (await HomePage()) as Element;
    expect(side.type).toBe(LandingPage);
    expect(tilstand.logg).toEqual([]);
  });

  it('innlogget: topp og bunnmeny med en gang, innholdet strømmes bak forsidens eget skjelett', async () => {
    const { side, grense } = await skall();
    expect(side.type).toBe(PageWrapper);
    expect(grense.type).toBe(Suspense);
    expect((grense.props.fallback as Element).type).toBe(HjemSkjelett);
    // Skallet venter ikke på noe av innholdet.
    expect(tilstand.logg).toEqual([]);
  });
});

describe('forsiden — én runde, ikke fem', () => {
  it('alle spørringene er sendt før den første har svart', async () => {
    let aapne: () => void = () => {};
    tilstand.port = new Promise<void>((resolve) => {
      aapne = resolve;
    });
    const { innhold } = await skall();
    const ferdig = (innhold.type as (props: unknown) => Promise<ReactNode>)(innhold.props);
    await vi.advanceTimersByTimeAsync(0);

    expect([...tilstand.logg].sort()).toEqual(
      [
        'start:alert_subscriptions',
        'start:billing_subscriptions',
        'start:blocked_users',
        'start:findings',
        'start:mushroom_species',
        'start:public_findings'
      ].sort()
    );

    aapne();
    await ferdig;
  });
});

describe('forsiden — gratisuka loves bare når den finnes', () => {
  it('ny gratisbruker: arket står FØR prognosekortet, og knappen kan love uka', async () => {
    const elementer = await forside();
    const ark = elementer.findIndex((e) => e.type === ProvGratisVedStart);
    const kort = elementer.findIndex((e) => e.type === MushroomDayCard);
    expect(ark).toBeGreaterThan(-1);
    expect(kort).toBeGreaterThan(ark);

    const premium = premiumKort(elementer);
    expect(premium).toBeDefined();
    expect(harType(alle(premium), ProveLofteTekst)).toBe(true);
    expect(stripe.kall).toEqual(['customers:x@example.com']);
  });

  it('betalende: verken ark eller Premium-kort — og Stripe blir ikke spurt', async () => {
    tilstand.svar.billing_subscriptions = {
      data: {
        user_id: 'bruker-1',
        tier: 'season_pass',
        status: 'active',
        current_period_end: '2027-09-01T00:00:00Z',
        cancel_at_period_end: false,
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        metadata: null
      },
      error: null
    };
    const elementer = await forside();
    expect(harType(elementer, ProvGratisVedStart)).toBe(false);
    expect(premiumKort(elementer)).toBeUndefined();
    expect(harType(elementer, MushroomDayCard)).toBe(true);
    expect(stripe.kall).toEqual([]);
  });

  it('tidligere abonnent i raden (utløpt): Premium-kortet med nøytral knapp, uten ark og uten Stripe-kall', async () => {
    tilstand.svar.billing_subscriptions = {
      data: {
        user_id: 'bruker-1',
        tier: 'premium',
        status: 'canceled',
        current_period_end: '2026-07-01T00:00:00Z',
        cancel_at_period_end: false,
        stripe_customer_id: 'cus_1',
        stripe_subscription_id: 'sub_1',
        metadata: null
      },
      error: null
    };
    const elementer = await forside();
    expect(harType(elementer, ProvGratisVedStart)).toBe(false);
    const premium = premiumKort(elementer);
    expect(premium).toBeDefined();
    expect(harType(alle(premium), ProveLofteTekst)).toBe(false);
    expect(tekst(premium)).toContain('premiumSeePlansNeutral');
    expect(stripe.kall).toEqual([]);
  });

  it('slettet konto, samme e-post, gammelt Stripe-abonnement: ingen ny uke loves', async () => {
    stripe.kunder = [{ id: 'cus_gammel' }];
    stripe.abonnement = 1;
    const elementer = await forside();
    expect(harType(elementer, ProvGratisVedStart)).toBe(false);
    const premium = premiumKort(elementer);
    expect(harType(alle(premium), ProveLofteTekst)).toBe(false);
    expect(tekst(premium)).toContain('premiumSeePlansNeutral');
  });

  it('Stripe svarer ikke: siden kommer likevel når fristen går ut, uten løfte og med en logglinje uten e-post', async () => {
    stripe.henger = true;
    const { innhold } = await skall();
    let elementer: Element[] | null = null;
    void (innhold.type as (props: unknown) => Promise<ReactNode>)(innhold.props).then((jsx) => {
      elementer = alle(jsx);
    });

    await vi.advanceTimersByTimeAsync(VISNINGSFRIST_MS - 1);
    expect(elementer).toBe(null);
    await vi.advanceTimersByTimeAsync(1);
    expect(elementer).not.toBe(null);

    const ferdig = elementer as unknown as Element[];
    expect(harType(ferdig, ProvGratisVedStart)).toBe(false);
    expect(harType(ferdig, MushroomDayCard)).toBe(true);
    expect(tekst(premiumKort(ferdig))).toContain('premiumSeePlansNeutral');

    expect(logg.warn).toHaveBeenCalledWith('home.provesvar_ukjent', { userId: 'bruker-1' });
    expect(JSON.stringify(logg.warn.mock.calls)).not.toContain('x@example.com');
  });
});

describe('forsiden — Premium-kortet lover ikke lovende områder utenom sesongen', () => {
  // ⭐ Lovende finner ofte ingenting fra november til juni, også for betalende
  // (sesongtekst.ts → lovendeLofte). Da sier punktet «når forholdene tillater det».
  it.each([
    ['september', '2026-09-15T10:00:00Z', 'premiumFeatureFullPrediction'],
    ['november', '2026-11-16T10:00:00Z', 'premiumFeatureFullPredictionBetinget'],
    ['januar', '2027-01-15T10:00:00Z', 'premiumFeatureFullPredictionBetinget'],
    ['juni', '2027-06-15T10:00:00Z', 'premiumFeatureFullPredictionBetinget'],
    ['juli', '2027-07-15T10:00:00Z', 'premiumFeatureFullPrediction']
  ])('%s: %s gir %s', async (_maaned, naa, nokkel) => {
    vi.setSystemTime(new Date(naa));
    const punkter = alle(premiumKort(await forside()))
      .filter((e) => e.type === 'li')
      .map((e) => tekst(e).trim());
    expect(punkter).toEqual([nokkel, 'premiumFeatureOfflineMap', 'premiumFeatureUnlimitedAi']);
  });
});

describe('forsiden — egne funn og varsel', () => {
  it('følger alt et område: kortene får vite det, og oppfordringen under er borte', async () => {
    tilstand.svar.alert_subscriptions = { data: { region: 'Oslo' }, error: null };
    const elementer = await forside();
    const kort = elementer.find((e) => e.type === MushroomDayCard);
    expect(kort?.props.folgerOmrade).toBe(true);
    expect(elementer.find((e) => e.type === BestRegionsCard)?.props.folger).toBe(true);
    expect(harType(elementer, VarselCta)).toBe(false);
  });

  it('følger ingenting: kortet kan spørre, og oppfordringen står — pakket inn så den kan tas bort etter et trykk', async () => {
    const elementer = await forside();
    expect(elementer.find((e) => e.type === MushroomDayCard)?.props.folgerOmrade).toBe(false);
    expect(elementer.find((e) => e.type === BestRegionsCard)?.props.folger).toBe(false);
    // Serveren vet ikke om trykket på «Følg Oslo». SkjulNarFolger gjør.
    const innpakning = elementer.find((e) => e.type === SkjulNarFolger);
    expect(innpakning).toBeDefined();
    expect(harType(alle(innpakning), VarselCta)).toBe(true);
  });

  it('feiler oppslagene, står siden — og feilen står i loggen', async () => {
    tilstand.svar.findings = { data: null, error: { message: 'tidsavbrudd' } };
    tilstand.svar.alert_subscriptions = { data: null, error: { message: 'tidsavbrudd' } };
    const elementer = await forside();
    expect(harType(elementer, MushroomDayCard)).toBe(true);
    expect(tekst(elementer[0])).not.toContain('yourFindings');
    // Heller spørre en abonnent én gang for mye enn å gjemme varselet.
    expect(harType(elementer, VarselCta)).toBe(true);
    expect(logg.error).toHaveBeenCalledWith('home.user_findings_failed', { userId: 'bruker-1', message: 'tidsavbrudd' });
    expect(logg.warn).toHaveBeenCalledWith('home.varsel_oppslag_feilet', { userId: 'bruker-1', message: 'tidsavbrudd' });
  });

  it('egne funn gir statistikkortet', async () => {
    tilstand.svar.findings = { data: [{ species_id: 1 }, { species_id: 1 }, { species_id: null }], error: null };
    const elementer = await forside();
    expect(tekst(elementer[0])).toContain('yourFindings');
  });
});

describe('forsiden — ingenting står to ganger', () => {
  const TOPP = { ...ART, id: 2, norwegian_name: 'Steinsopp', peak_season_start: 8, peak_season_end: 10 };
  const DODELIG = { ...ART, id: 3, norwegian_name: 'Hvit fluesopp', latin_name: 'Amanita virosa', edibility: 'deadly' };
  const lenkerTil = (elementer: Element[], href: string) => elementer.filter((e) => e.props.href === href);

  beforeEach(() => {
    tilstand.svar.mushroom_species = { data: [ART, TOPP, DODELIG], error: null };
  });

  it('matsoppene i sesong står ÉN gang — de sto som tekstliste og så som bilder', async () => {
    const elementer = await forside();
    expect(lenkerTil(elementer, '/species/1')).toHaveLength(1);
    expect(lenkerTil(elementer, '/species/2')).toHaveLength(1);
  });

  it('det ene kortet bærer det tekstlista hadde: toppsesong-merket, «sesong er det vi vet sikrest» og «Se alle»', async () => {
    const elementer = await forside();
    expect(tekst(lenkerTil(elementer, '/species/2')[0])).toContain('inSeasonAtPeak');
    expect(tekst(lenkerTil(elementer, '/species/1')[0])).toContain('inSeasonInSeason');
    const side = tekst(elementer[0]);
    expect(side).toContain('inSeasonWhy');
    expect(lenkerTil(elementer, '/species').length).toBeGreaterThan(0);
    expect(lenkerTil(elementer, '/calendar').length).toBeGreaterThan(0);
  });

  it('de giftige i sesong står fortsatt navngitt i den røde lista — og aldri blant matsoppene', async () => {
    const elementer = await forside();
    const side = tekst(elementer[0]);
    expect(side).toContain('dangerousWarningTitle');
    expect(side).toContain('Hvit fluesopp');
    // Én lenke: den i den røde lista. Den dødelige arten har ingen flis i sesongkortet.
    expect(lenkerTil(elementer, '/species/3')).toHaveLength(1);
    expect(tekst(lenkerTil(elementer, '/species/3')[0])).not.toMatch(/inSeasonAtPeak|inSeasonInSeason/);
  });

  it('alle seks lenkene nederst står — personvern, vilkår og kjøpsvilkår må kunne nås fra appen', async () => {
    const elementer = await forside();
    for (const href of ['/sikkerhet', '/personvern', '/datakilder', '/vilkar', '/kjopsvilkar', '/apenhet']) {
      expect(lenkerTil(elementer, href).length, href).toBeGreaterThan(0);
    }
  });
});

/**
 * «Sesongen din 2026» — brukerens egne registrerte funn, oppsummert når
 * sesongen er på hell eller over (november–mars). Reglene er enhetstestet i
 * src/lib/findings/__tests__/sesongoppsummering.test.ts; her sjekkes at
 * forsiden henter det den trenger, viser kortet til rett tid og aldri viser
 * de samme tallene to ganger.
 */
describe('forsiden — «Sesongen din» utenom sesongen', () => {
  const FUNN_2026 = [
    { species_id: 1, found_at: '2026-11-02T09:00:00Z' },
    { species_id: 1, found_at: '2026-09-20T15:00:00Z' },
    { species_id: null, found_at: '2026-08-14T08:00:00Z' }
  ];
  const side = async () => tekst((await forside())[0]);

  it('henter registreringsdagen i SAMME spørring, nyeste først', async () => {
    await forside();
    const funnkall = tilstand.kall.filter((k) => k.startsWith('findings.'));
    expect(funnkall).toContain('findings.select("species_id,found_at")');
    expect(funnkall).toContain('findings.order("found_at",{"ascending":false})');
    expect(funnkall).toContain('findings.limit(1000)');
    // Én spørring mot funnene, som før.
    expect(tilstand.logg.filter((l) => l === 'start:findings')).toHaveLength(1);
  });

  it('i sesongen (september): livstidstallene som før, ingen oppsummering', async () => {
    tilstand.svar.findings = { data: FUNN_2026, error: null };
    const tekster = await side();
    expect(tekster).toContain('yourFindings');
    expect(tekster).not.toContain('seasonSummaryTitle');
  });

  it('i november: kortet er sesongen — tall, første og siste registrering, og arten som står alene øverst', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    tilstand.svar.findings = { data: FUNN_2026, error: null };
    const tekster = await side();
    expect(tekster).toContain('seasonSummaryTitle{"year":"2026"}');
    expect(tekster).not.toContain('yourFindings');
    expect(tekster).toContain('seasonSummarySpan{"first":"14. august","last":"2. november"}');
    expect(tekster).toContain('seasonSummaryMostFound{"species":"Kantarell","count":2}');
    // Sesongen ER alt brukeren har: livstidstallene ville vært de samme tallene en gang til.
    expect(tekster).not.toContain('seasonSummaryAllTime');
    // Veien til stedene står.
    expect((await forside()).some((e) => e.props.href === '/mine-steder')).toBe(true);
  });

  it('i januar gjelder fortsatt sesongen som begynte året før', async () => {
    vi.setSystemTime(new Date('2027-01-20T12:00:00Z'));
    tilstand.svar.findings = { data: FUNN_2026, error: null };
    expect(await side()).toContain('seasonSummaryTitle{"year":"2026"}');
  });

  it('eldre funn i tillegg: livstidstallene står som en egen linje', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    tilstand.svar.findings = {
      data: [...FUNN_2026, { species_id: 2, found_at: '2025-09-01T10:00:00Z' }],
      error: null
    };
    const tekster = await side();
    expect(tekster).toContain('seasonSummaryTitle{"year":"2026"}');
    expect(tekster).toContain('seasonSummaryAllTime{"total":4,"species":2}');
  });

  it('ingen funn denne sesongen: livstidskortet som før — aldri et «0 funn»-kort', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    tilstand.svar.findings = { data: [{ species_id: 1, found_at: '2025-09-01T10:00:00Z' }], error: null };
    const tekster = await side();
    expect(tekster).toContain('yourFindings');
    expect(tekster).not.toContain('seasonSummaryTitle');
  });

  it('alt registrert samme dag: én dato, ikke «første … siste» med samme dag to ganger', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    tilstand.svar.findings = { data: [{ species_id: 1, found_at: '2026-09-20T15:00:00Z' }], error: null };
    const tekster = await side();
    expect(tekster).toContain('seasonSummaryOneDay{"date":"20. september"}');
    expect(tekster).not.toContain('seasonSummarySpan');
    // Ett funn av én art er ikke «oftest».
    expect(tekster).not.toContain('seasonSummaryMostFound');
  });

  it('ingen funn i det hele tatt: ikke noe kort', async () => {
    vi.setSystemTime(new Date('2026-11-16T12:00:00Z'));
    const tekster = await side();
    expect(tekster).not.toContain('yourFindings');
    expect(tekster).not.toContain('seasonSummaryTitle');
  });
});

describe('forsiden — måneden er Oslo-måneden', () => {
  // Serveren går i UTC. Forsiden leste måneden av serverklokka og lå en time
  // eller to etter ved hvert månedsskifte.
  it('31. oktober 23:30 UTC er november i Oslo', async () => {
    vi.setSystemTime(new Date('2026-10-31T23:30:00Z'));
    const tekster = tekst((await forside())[0]);
    expect(tekster).toContain('monthNovember');
    expect(tekster).not.toContain('monthOctober');
  });

  it('nyttårsaften 23:30 UTC er januar neste år i Oslo', async () => {
    vi.setSystemTime(new Date('2026-12-31T23:30:00Z'));
    const tekster = tekst((await forside())[0]);
    expect(tekster).toContain('monthJanuary');
    expect(tekster).toMatch(/monthJanuary\s+2027/);
  });
});
