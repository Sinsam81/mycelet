// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider, createTranslator } from 'next-intl';
import type { ReactNode } from 'react';
import nb from '../../../../../messages/nb.json';
import sv from '../../../../../messages/sv.json';

/**
 * Hele artssiden, rendret med ekte meldingskataloger og rader slik de står i
 * basen (lest 16. november 2026, bare lesing).
 *
 * Reglene har egne tester i src/lib/species/. Denne fila låser at siden setter
 * dem sammen riktig — for fem arter som hver treffer en annen grein:
 *
 *   kantarell        matsopp med kurve, «se etter» og forvekslinger begge veier
 *   grønn fluesopp   dødelig: ingen egne forvekslingsrader, ingen søkeinvitasjon
 *   pantermusserong  giftig, uten bilde og uten kurve, med kjennetegn i tekst
 *   vintersopp       matsopp med vintersesong: tekstraden står alene
 *   piggsopp         matsopp uten egne forvekslingsrader, bare rader som peker hit
 *
 * Datoen er låst til 13. september 2026, så «i dag»-streken ikke flytter seg.
 * De to genererte datafilene siden leser — fenologikurvene og lista over
 * smale bildeoriginaler — er byttet ut med faste utdrag, så testen ikke velter
 * når funnene importeres på nytt eller et artsbilde byttes ut.
 */

type Sprak = 'nb' | 'sv';
const KATALOGER = { nb, sv } as unknown as Record<Sprak, Record<string, unknown>>;

let sprak: Sprak = 'nb';
/** Settes av en test for å la én av forvekslingsspørringene feile. */
let forvekslingsfeil: 'fra' | 'til' | null = null;
const loggfeil = vi.fn();

vi.mock('next-intl/server', () => ({
  getLocale: async () => sprak,
  getTranslations: async (namespace: string) => createTranslator({ locale: sprak, messages: KATALOGER[sprak], namespace })
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  }
}));
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  )
}));
vi.mock('@/components/layout/PageWrapper', () => ({
  PageWrapper: ({ children }: { children: ReactNode }) => <div>{children}</div>
}));
// Serverkomponent (async) — den har sine egne tester (giftnummer.test.ts).
vi.mock('@/components/safety/PoisonHotlineLinks', () => ({
  PoisonHotlineLinks: () => <a href="tel:22591300">22 59 13 00</a>
}));
vi.mock('@/lib/log', () => ({ logger: { error: loggfeil, warn: vi.fn(), info: vi.fn(), debug: vi.fn(), trace: vi.fn() } }));

// Kurvene slik de sto i phenology-data.ts 16. november 2026 (`all`, uke 0–51).
// Vintersopp HAR en kurve: det er sesongraden over den som stopper den.
vi.mock('@/lib/prediction/phenology-data', () => ({
  PHENOLOGY_META: { d: 316542, species: 3, weeks: 52, minBand: 150, minAll: 40 },
  PHENOLOGY: {
    '1': {
      all: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.001, 0.001, 0.001, 0.001, 0.001, 0.001, 0.002, 0.003, 0.009, 0.029, 0.068,
        0.127, 0.213, 0.312, 0.395, 0.477, 0.567, 0.661, 0.737, 0.809, 0.894, 0.959, 0.99, 0.995, 1, 0.916, 0.784, 0.632,
        0.499, 0.363, 0.292, 0.245, 0.2, 0.156, 0.113, 0.062, 0.026, 0.01, 0, 0
      ]
    },
    '52': {
      all: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.001, 0.004, 0.006, 0.006, 0.006, 0.006, 0.004, 0.003, 0.003, 0.004, 0.008,
        0.009, 0.013, 0.018, 0.043, 0.074, 0.12, 0.181, 0.264, 0.387, 0.551, 0.702, 0.892, 0.992, 1, 0.909, 0.764, 0.528,
        0.348, 0.195, 0.094, 0.041, 0.02, 0.01, 0.007, 0, 0, 0, 0
      ]
    },
    '77': {
      all: [
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.012, 0.072, 0.124, 0.16, 0.186, 0.194, 0.148, 0.11, 0.083, 0.058, 0.042, 0.03,
        0.017, 0.008, 0.008, 0.004, 0.002, 0.004, 0.008, 0.014, 0.023, 0.039, 0.056, 0.087, 0.14, 0.206, 0.278, 0.364,
        0.458, 0.519, 0.597, 0.668, 0.807, 0.926, 1, 0.939, 0.779, 0.536, 0.287, 0.094, 0, 0
      ]
    }
  }
}));
// Grønn fluesopp-bildet er 1200 piksler bredt; kantarellbildet står ikke i
// lista og regnes som stort.
vi.mock('@/lib/species/commons-smale-originaler.generated', () => ({
  COMMONS_BREDDER_META: { hentet: '2026-11-16', filer: 5, smale: 1, storsteTrinn: 1280 },
  COMMONS_SMALE_ORIGINALER: { 'Amanita phalloides 1.JPG': 1200 }
}));

// ---------------------------------------------------------------------------
// Radene
// ---------------------------------------------------------------------------

const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons/thumb';
const BILDE = {
  kantarell: `${COMMONS}/9/9a/Chanterelle_Cantharellus_cibarius.jpg/330px-Chanterelle_Cantharellus_cibarius.jpg`,
  gronnFluesopp: `${COMMONS}/9/99/Amanita_phalloides_1.JPG/500px-Amanita_phalloides_1.JPG`,
  vintersopp: `${COMMONS}/f/f3/2009-11-19_Flammulina_velutipes_agg_biolib.cz_crop.jpg/500px-2009-11-19_Flammulina_velutipes_agg_biolib.cz_crop.jpg`,
  falskKantarell: `${COMMONS}/5/5b/Hygrophoropsis_aurantiaca_241718.jpg/330px-Hygrophoropsis_aurantiaca_241718.jpg`,
  broketKremle: `${COMMONS}/f/f2/Russula_cyanoxantha.JPG/330px-Russula_cyanoxantha.JPG`,
  piggsopp: `${COMMONS}/b/b9/Hedgehog_fungi2.jpg/330px-Hedgehog_fungi2.jpg`,
  rodgulPiggsopp: `${COMMONS}/1/1f/Hydnum_rufescens_20070927w.JPG/330px-Hydnum_rufescens_20070927w.JPG`
};

const ARTER: Record<number, Record<string, unknown>> = {
  1: {
    id: 1,
    norwegian_name: 'Kantarell',
    swedish_name: 'Kantarell',
    english_name: 'Chanterelle',
    latin_name: 'Cantharellus cibarius',
    genus: 'Cantharellus',
    family: 'Cantharellaceae',
    edibility: 'edible',
    edibility_notes: null,
    season_start: 7,
    season_end: 9,
    habitat: ['barskog', 'blandingsskog', 'mose'],
    mycorrhizal_partners: ['gran', 'furu', 'bjørk', 'eik'],
    substrate: 'jord',
    commonality: 'very_common',
    synonyms: [],
    description: 'Gyllen-gul sopp med falske skiver som går ned på stilken. Mild fruktaktig lukt.',
    primary_image_url: BILDE.kantarell,
    primary_image_photographer: null,
    primary_image_license: 'CC BY-SA 3.0',
    primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Chanterelle_Cantharellus_cibarius.jpg'
  },
  52: {
    id: 52,
    norwegian_name: 'Grønn fluesopp',
    swedish_name: 'Lömsk flugsvamp',
    english_name: 'Death cap',
    latin_name: 'Amanita phalloides',
    genus: 'Amanita',
    family: 'Amanitaceae',
    edibility: 'deadly',
    edibility_notes: null,
    toxin_info: 'Amatoksiner',
    symptoms: 'Oppkast og diaré etter 6–24 timer, deretter leversvikt.',
    season_start: 8,
    season_end: 10,
    habitat: ['løvskog', 'eikeskog'],
    mycorrhizal_partners: ['eik', 'bøk'],
    substrate: 'jord',
    commonality: 'rare',
    synonyms: [],
    description:
      'Olivengrønn til gulgrønn hatt, hvite frie skiver, ring på stilken og en tydelig pose (volva) ved stilkbasen. Vokser i løvskog under eik og bøk.',
    primary_image_url: BILDE.gronnFluesopp,
    primary_image_photographer: 'Fotograf Eksempel',
    primary_image_license: 'CC BY-SA 3.0',
    primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Amanita_phalloides_1.JPG'
  },
  90: {
    id: 90,
    norwegian_name: 'Pantermusserong',
    swedish_name: 'Pantermusseron',
    english_name: null,
    latin_name: 'Tricholoma filamentosum',
    genus: 'Tricholoma',
    family: 'Tricholomataceae',
    edibility: 'toxic',
    edibility_notes: null,
    season_start: 8,
    season_end: 11,
    habitat: ['løvskog', 'edelløvskog'],
    mycorrhizal_partners: ['eik', 'lind', 'osp'],
    substrate: 'jord',
    commonality: 'rare',
    synonyms: [],
    description: 'Stor, kraftig og gråhvit musserong med tørr hatt dekket av mørkere gråbrune skjell.',
    cap_description: 'Lys grå til sølvgrå, TØRR og tett dekket av mørkere gråbrune SKJELL.',
    gills_description: 'Hvite til gråhvite, ganske tettsittende og buktet tilvokst til stilken.',
    stem_description: 'Kraftig og fast, hvitaktig til lyst brunlig, uten ring.',
    smell: 'Melaktig, som nymalt mel. Den fine melduften er ingen trygghetsgaranti.',
    taste: 'Mild.',
    primary_image_url: null
  },
  77: {
    id: 77,
    norwegian_name: 'Vintersopp',
    swedish_name: 'Vinterskivling',
    english_name: 'Velvet shank',
    latin_name: 'Flammulina velutipes',
    genus: 'Flammulina',
    family: 'Physalacriaceae',
    edibility: 'edible',
    edibility_notes: null,
    season_start: 10,
    season_end: 12,
    habitat: ['løvskog'],
    mycorrhizal_partners: null,
    substrate: 'død ved',
    commonality: 'common',
    synonyms: [],
    description: 'Klynger av oransjebrune, klebrige hatter med fløyelsaktig mørk stilk, på død løvved.',
    primary_image_url: BILDE.vintersopp,
    primary_image_photographer: 'Fotograf Eksempel',
    primary_image_license: 'CC BY-SA 3.0',
    primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Flammulina_velutipes.jpg'
  },
  7: {
    id: 7,
    norwegian_name: 'Piggsopp',
    swedish_name: 'Blek taggsvamp',
    english_name: 'Hedgehog mushroom',
    latin_name: 'Hydnum repandum',
    genus: 'Hydnum',
    family: 'Hydnaceae',
    edibility: 'edible',
    edibility_notes: 'God matsopp, lett å kjenne igjen på piggene.',
    season_start: 9,
    season_end: 11,
    habitat: ['granskog', 'blandingsskog', 'kalkrik'],
    mycorrhizal_partners: ['gran', 'eik'],
    substrate: 'jord',
    commonality: 'common',
    synonyms: [],
    description: 'Lys gul-oransje hatt med pigger under (i stedet for skiver).',
    primary_image_url: BILDE.piggsopp,
    primary_image_photographer: 'Fotograf Eksempel',
    primary_image_license: 'Public domain',
    primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Hedgehog_fungi2.jpg'
  }
};

function hovedbilde(id: number, url: string, photographer: string | null) {
  return {
    id: `bilde-${id}`,
    image_url: url,
    thumbnail_url: null,
    caption: null,
    is_primary: true,
    photographer,
    license: 'CC BY-SA 3.0',
    source_url: 'https://commons.wikimedia.org/wiki/File:Eksempel.jpg'
  };
}

const BILDER: Record<number, unknown[]> = {
  1: [hovedbilde(1, BILDE.kantarell, null)],
  7: [hovedbilde(7, BILDE.piggsopp, 'Fotograf Eksempel')],
  52: [hovedbilde(52, BILDE.gronnFluesopp, 'Fotograf Eksempel')],
  77: [hovedbilde(77, BILDE.vintersopp, 'Fotograf Eksempel')],
  90: []
};

const FALSK_KANTARELL = {
  id: 22,
  norwegian_name: 'Falsk kantarell',
  swedish_name: 'Narrkantarell',
  latin_name: 'Hygrophoropsis aurantiaca',
  edibility: 'inedible',
  primary_image_url: BILDE.falskKantarell,
  primary_image_photographer: 'Annen Eksempel',
  primary_image_license: 'CC BY-SA 4.0',
  primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Hygrophoropsis_aurantiaca_241718.jpg'
};
const BLEK_KANTARELL = {
  id: 86,
  norwegian_name: 'Blek kantarell',
  swedish_name: 'Blek kantarell',
  latin_name: 'Cantharellus pallens',
  edibility: 'edible',
  primary_image_url: null
};
const BROKET_KREMLE = {
  id: 38,
  norwegian_name: 'Broket kremle',
  swedish_name: 'Brokkremla',
  latin_name: 'Russula cyanoxantha',
  edibility: 'edible',
  primary_image_url: BILDE.broketKremle,
  primary_image_photographer: null,
  primary_image_license: 'CC BY-SA 3.0',
  primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Russula_cyanoxantha.JPG'
};
const RODGUL_PIGGSOPP = {
  id: 36,
  norwegian_name: 'Rødgul piggsopp',
  swedish_name: 'Rödgul taggsvamp',
  latin_name: 'Hydnum rufescens',
  edibility: 'edible',
  primary_image_url: BILDE.rodgulPiggsopp,
  primary_image_photographer: 'Annen Eksempel',
  primary_image_license: 'CC BY-SA 3.0',
  primary_image_source_url: 'https://commons.wikimedia.org/wiki/File:Hydnum_rufescens_20070927w.JPG'
};

/** look_alikes: radene der arten står som species_id («fra») og som look_alike_id («til»). */
const FORVEKSLINGER: Record<number, { fra: unknown[]; til: unknown[] }> = {
  1: {
    fra: [
      {
        look_alike_id: 22,
        danger_level: 'high',
        similarity_description: 'Begge er oransje-gule traktformede sopper.',
        difference_description: 'Ekte kantarell har FALSKE skiver. Ved tvil — la den stå.',
        mushroom_species: FALSK_KANTARELL
      }
    ],
    til: [
      // Speilraden til den over, og en art som bare er ført fra den andre siden.
      { species_id: 22, danger_level: 'high', similarity_description: 'Speilrad.', difference_description: 'Speilrad.', mushroom_species: FALSK_KANTARELL },
      {
        species_id: 86,
        danger_level: 'low',
        similarity_description: 'Blek kantarell ligner vanlig kantarell.',
        difference_description: 'Blek kantarell er kraftigere og buttere.',
        mushroom_species: BLEK_KANTARELL
      }
    ]
  },
  52: {
    fra: [],
    til: [
      {
        species_id: 38,
        danger_level: 'critical',
        similarity_description: 'Broket kremle har ofte grønne og olivenfargede former.',
        difference_description: 'Grav opp HELE stilken. Ved tvil — la stå.',
        mushroom_species: BROKET_KREMLE
      }
    ]
  },
  // Piggsopp har ingen egne rader. Begge radene som peker hit er ført fra en
  // matsopp, med faregrad «lav» — og skilleteksten sier selv at ingen av dem
  // har giftige dobbeltgjengere.
  7: {
    fra: [],
    til: [
      {
        species_id: 36,
        danger_level: 'low',
        similarity_description: 'Nære slektninger i den samme mosekledde gran- og bjørkeskogen, fra sensommer til november.',
        difference_description:
          'Se hvor piggene slutter. Begge er blant våre sikreste matsopper — sopp med LYSE, sprø pigger under hatten har ingen giftige dobbeltgjengere her.',
        mushroom_species: RODGUL_PIGGSOPP
      },
      {
        species_id: 86,
        danger_level: 'low',
        similarity_description: 'Blek piggsopp er like blek, like kjøttfull og like uregelmessig trakt-/vifteformet.',
        difference_description: 'Snu soppen — det er hele svaret. Begge er gode matsopper, så du kan ta med begge.',
        mushroom_species: BLEK_KANTARELL
      }
    ]
  },
  77: { fra: [], til: [] },
  90: { fra: [], til: [] }
};

// ---------------------------------------------------------------------------
// En Supabase-klient som svarer med radene over
// ---------------------------------------------------------------------------

function svar(tabell: string, filtre: Record<string, unknown>) {
  if (tabell === 'mushroom_species') {
    const art = ARTER[Number(filtre.id)];
    return art ? { data: art, error: null } : { data: null, error: { message: 'ingen rad' } };
  }
  if (tabell === 'species_photos') return { data: BILDER[Number(filtre.species_id)] ?? [], error: null };
  if (tabell === 'look_alikes') {
    const retning = 'species_id' in filtre ? 'fra' : 'til';
    if (forvekslingsfeil === retning) return { data: null, error: { message: 'statement timeout' } };
    const id = Number(retning === 'fra' ? filtre.species_id : filtre.look_alike_id);
    return { data: FORVEKSLINGER[id]?.[retning] ?? [], error: null };
  }
  return { data: null, error: { message: `ukjent tabell ${tabell}` } };
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from(tabell: string) {
      const filtre: Record<string, unknown> = {};
      const bygger = {
        select: () => bygger,
        eq(kolonne: string, verdi: unknown) {
          filtre[kolonne] = verdi;
          return bygger;
        },
        order: () => bygger,
        limit: () => bygger,
        single: async () => svar(tabell, filtre),
        then: (ok: (verdi: unknown) => unknown, feil?: (grunn: unknown) => unknown) =>
          Promise.resolve(svar(tabell, filtre)).then(ok, feil)
      };
      return bygger;
    }
  })
}));

const { default: SpeciesDetailPage, generateMetadata } = await import('../page');

async function rendrer(id: number, locale: Sprak = 'nb') {
  sprak = locale;
  const side = await SpeciesDetailPage({ params: Promise.resolve({ id: String(id) }) });
  return render(
    <NextIntlClientProvider locale={locale} messages={KATALOGER[locale] as never} timeZone="Europe/Oslo">
      {side}
    </NextIntlClientProvider>
  );
}

/** Raden i «Detaljer» med denne etiketten, eller null. */
function detaljrad(etikett: string): HTMLElement | null {
  const dt = screen.queryAllByText(etikett).find((element) => element.tagName === 'DT');
  return dt?.parentElement ?? null;
}

function jsonLd(container: HTMLElement): Record<string, unknown> {
  return JSON.parse(container.querySelector('script[type="application/ld+json"]')?.textContent ?? '{}');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-13T10:00:00Z'));
  sprak = 'nb';
  forvekslingsfeil = null;
  loggfeil.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('kantarell — en matsopp med alt', () => {
  it('viser sesongen som tekst og som kurve, med toppen i ord og i dag markert', async () => {
    await rendrer(1);
    const sesong = detaljrad('Sesong');
    expect(sesong?.textContent).toContain('jun – okt');

    const kurve = within(sesong as HTMLElement).getByRole('img');
    expect(kurve.getAttribute('aria-label')).toMatch(/^Kantarell: registrerte funn uke for uke, fra april til november\. Flest registrerte funn fra /);
    expect(within(sesong as HTMLElement).getByText('i dag')).toBeTruthy();
    // Bildeteksten sier hva kurven ikke er.
    expect(sesong?.textContent).toContain('ikke hvor mye som finnes, og ikke hvor');
    expect(sesong?.textContent?.replace(/\s/g, '')).toContain('316542');
  });

  it('viser faktaradene og «se etter»-linja', async () => {
    await rendrer(1);
    expect(detaljrad('Habitat')?.textContent).toContain('barskog, blandingsskog, mose');
    expect(detaljrad('Vokser med')?.textContent).toContain('gran, furu, bjørk, eik');
    expect(detaljrad('Hvor vanlig')?.textContent).toContain('Svært vanlig');
    expect(detaljrad('Familie')?.textContent).toContain('Cantharellaceae');
    expect(detaljrad('Se etter')?.textContent).toContain(
      'Kantarell står i symbiose med blant annet gran, furu og bjørk — se i kanten mot lysninger og langs stier'
    );
  });

  it('viser forvekslingene i begge retninger, uten å gjenta en art', async () => {
    await rendrer(1);
    const kort = screen.getAllByRole('article').filter((a) => a.querySelector('a[href^="/species/"]') && !a.querySelector('article'));
    expect(kort.map((k) => k.querySelector('a')?.getAttribute('href'))).toEqual(['/species/22', '/species/86']);

    // Sidens egen rad: faregraden. Raden fra den andre siden: et nøytralt merke.
    expect(within(kort[0]).getByText('Fare: Høy')).toBeTruthy();
    expect(within(kort[0]).queryByText('Forveksles med denne')).toBeNull();
    expect(within(kort[1]).getByText('Forveksles med denne')).toBeTruthy();
    expect(within(kort[1]).queryByText(/^Fare:/)).toBeNull();

    expect(within(kort[0]).getByText('Ekte kantarell har FALSKE skiver. Ved tvil — la den stå.')).toBeTruthy();
    expect(within(kort[0]).getByText('Begge er oransje-gule traktformede sopper.')).toBeTruthy();
    expect(screen.queryByText('Speilrad.')).toBeNull();
    expect(screen.queryByText(/Vi har ikke ført inn forvekslingsarter/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('henter bildene i riktig bredde og krediterer dem', async () => {
    await rendrer(1);
    const bilder = screen.getAllByRole('img').filter((element) => element.tagName === 'IMG');
    const [hoved, kortbilde] = bilder;
    // Hovedbildet: den lagrede utgaven som src, bredere trinn i srcset, straks.
    expect(hoved.getAttribute('src')).toBe(BILDE.kantarell);
    expect(hoved.getAttribute('srcset')).toContain('/960px-Chanterelle_Cantharellus_cibarius.jpg 960w');
    expect(hoved.getAttribute('srcset')).toContain('/1280px-Chanterelle_Cantharellus_cibarius.jpg 1280w');
    expect(hoved.getAttribute('sizes')).toContain('320px');
    expect(hoved.hasAttribute('loading')).toBe(false);
    // Kortet: 500 piksler, lat.
    expect(kortbilde.getAttribute('src')).toContain('/500px-Hygrophoropsis_aurantiaca_241718.jpg');
    expect(kortbilde.getAttribute('loading')).toBe('lazy');
    expect(kortbilde.getAttribute('alt')).toBe('Falsk kantarell');
    // Bare kortene med bilde har et.
    expect(bilder).toHaveLength(2);

    // Kreditering: hovedbildet (lisens uten fotograf) og kortet.
    expect(screen.getByText('Foto: ukjent fotograf (CC BY-SA 3.0)')).toBeTruthy();
    const kortKreditt = screen.getByText('Foto: Annen Eksempel (CC BY-SA 4.0)');
    expect(kortKreditt.closest('a')?.getAttribute('href')).toBe(
      'https://commons.wikimedia.org/wiki/File:Hygrophoropsis_aurantiaca_241718.jpg'
    );
    // Krediteringen er en lenke og står ikke inne i lenka til arten.
    expect(kortKreditt.closest('a[href^="/species/"]')).toBeNull();
    expect(screen.queryByText('1 bilde')).toBeNull();
  });

  it('forteller søkemotorene hvilken art det er, uten et ord om spiselighet', async () => {
    const { container } = await rendrer(1);
    const data = jsonLd(container);
    expect(data).toMatchObject({
      '@type': 'Taxon',
      name: 'Kantarell',
      taxonRank: 'species',
      url: 'https://www.mycelet.com/species/1',
      alternateName: ['Cantharellus cibarius', 'Chanterelle'],
      parentTaxon: { name: 'Cantharellus', parentTaxon: { name: 'Cantharellaceae' } }
    });
    expect((data.image as { contentUrl: string }).contentUrl).toContain('/1280px-Chanterelle_Cantharellus_cibarius.jpg');
    expect(data.description).toContain('juni – oktober');
    expect(JSON.stringify(data)).not.toMatch(/spiselig|edib|matsopp|giftig|toxic/i);
  });
});

describe('grønn fluesopp — en dødelig art', () => {
  it('viser artene den forveksles med, selv om den ikke har egne rader', async () => {
    // Selve feilen i funn 24: siden sa «ikke ført inn ennå».
    await rendrer(52);
    expect(screen.getByRole('link', { name: /Broket kremle/ }).getAttribute('href')).toBe('/species/38');
    expect(screen.getByText('Forveksles med denne')).toBeTruthy();
    expect(screen.getByText('Grav opp HELE stilken. Ved tvil — la stå.')).toBeTruthy();
    // Radens «kritisk» gjelder fluesoppen, ikke kremla på kortet.
    expect(screen.queryByText(/^Fare:/)).toBeNull();
    expect(screen.queryByText(/Vi har ikke ført inn forvekslingsarter/)).toBeNull();
  });

  it('inviterer aldri til å lete etter den', async () => {
    for (const locale of ['nb', 'sv'] as const) {
      const { unmount } = await rendrer(52, locale);
      expect(detaljrad(locale === 'nb' ? 'Se etter' : 'Titta efter'), locale).toBeNull();
      expect(document.body.textContent, locale).not.toMatch(/gå sakte langs stier|gå långsamt längs stigar/);
      unmount();
    }
  });

  it('sier ikke hvor vanlig den er', async () => {
    // «Sjelden» på denne siden leses som «da er det neppe den jeg har».
    await rendrer(52);
    expect(detaljrad('Hvor vanlig')).toBeNull();
    expect(screen.queryByText('Sjelden')).toBeNull();
  });

  it('får samme kurve og samme ordlyd som en matsopp', async () => {
    await rendrer(52);
    const sesong = detaljrad('Sesong') as HTMLElement;
    const kurve = within(sesong).getByRole('img');
    expect(kurve.getAttribute('aria-label')).toMatch(/^Grønn fluesopp: registrerte funn uke for uke/);
    expect(sesong.textContent).toContain('ikke hvor mye som finnes, og ikke hvor');
  });

  it('har advarselen og giftinformasjonen øverst', async () => {
    await rendrer(52);
    expect(screen.getByText('Dødelig giftig — ikke spis')).toBeTruthy();
    expect(screen.getByText('Amatoksiner')).toBeTruthy();
    expect(screen.getByRole('link', { name: '22 59 13 00' })).toBeTruthy();
  });

  it('sier fra når forvekslingene ikke lot seg hente — aldri «ikke ført inn»', async () => {
    forvekslingsfeil = 'til';
    await rendrer(52);
    expect(screen.getByRole('alert').textContent).toContain('Vi klarte ikke å hente forvekslingsartene');
    expect(screen.queryByText(/Vi har ikke ført inn forvekslingsarter/)).toBeNull();
    expect(loggfeil).toHaveBeenCalledWith('species.look_alikes_failed', expect.anything(), expect.objectContaining({ retning: 'til' }));
  });
});

describe('pantermusserong — giftig, uten bilde', () => {
  it('viser kjennetegnene i tekst, hele, og aldri smak', async () => {
    await rendrer(90);
    expect(screen.getByRole('heading', { name: 'Kjennetegn' })).toBeTruthy();
    expect(screen.getByText('Melaktig, som nymalt mel. Den fine melduften er ingen trygghetsgaranti.')).toBeTruthy();
    expect(screen.queryByText('Mild.')).toBeNull();
  });

  it('har verken bilde, kurve eller «se etter»', async () => {
    await rendrer(90);
    expect(screen.getByText('Ingen bilder enda')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    expect(detaljrad('Sesong')?.textContent).toContain('aug – nov');
    expect(detaljrad('Se etter')).toBeNull();
  });

  it('sier ærlig at ingen forvekslingsarter er ført inn', async () => {
    await rendrer(90);
    expect(screen.getByText(/Vi har ikke ført inn forvekslingsarter for denne arten ennå/)).toBeTruthy();
  });

  it('viser ikke de norske kjennetegnene på svensk', async () => {
    await rendrer(90, 'sv');
    expect(screen.queryByRole('heading', { name: 'Kännetecken' })).toBeNull();
    expect(screen.queryByText(/Melaktig, som nymalt mel/)).toBeNull();
  });
});

describe('vintersopp — sesong om vinteren', () => {
  it('får ingen kurve som ville stått flat der raden sier «i sesong»', async () => {
    await rendrer(77);
    const sesong = detaljrad('Sesong') as HTMLElement;
    // Katalogen sier okt–des, og de daterte funnene utvider vinduet.
    expect(sesong.textContent).toMatch(/des|jan|mar/);
    expect(within(sesong).queryByRole('img')).toBeNull();
    expect(screen.queryByText('i dag')).toBeNull();
  });

  it('får «se etter» som en vedboende matsopp', async () => {
    await rendrer(77);
    expect(detaljrad('Se etter')?.textContent).toContain('Vintersopp vokser på død ved av løvtrær');
  });
});

/** Forbeholdet over kortene når artens EGNE forvekslinger ikke er ført inn. */
const EGNE_IKKE_FORT = {
  nb: /Vi har ennå ikke ført inn hva denne arten selv kan forveksles med/,
  sv: /Vi har ännu inte fört in vad den här arten själv kan förväxlas med/
};

/** Forvekslingskortene, i den rekkefølgen de står på siden. */
function forvekslingskort(): HTMLElement[] {
  return screen
    .getAllByRole('article')
    .filter((artikkel) => artikkel.querySelector('a[href^="/species/"]') && !artikkel.querySelector('article'));
}

describe('piggsopp — en matsopp som bare står på andres lister', () => {
  // Hullet etter funn 24: «ikke ført inn ennå» forsvant så snart ÉN rad pekte
  // hit. Piggsopp fikk da to grønne «Spiselig»-kort under «Forveksling og
  // nærarter», og ingenting sa at piggsoppens egne forvekslinger aldri er ført
  // inn — sterkere falsk trygghet enn stillheten forbeholdet ble skrevet for.
  it('viser kortene fra den andre siden, med forbeholdet over dem', async () => {
    await rendrer(7);
    const kort = forvekslingskort();
    expect(kort.map((k) => k.querySelector('a')?.getAttribute('href'))).toEqual(['/species/36', '/species/86']);
    for (const k of kort) {
      expect(within(k).getByText('Forveksles med denne')).toBeTruthy();
      expect(within(k).getByText('Spiselig')).toBeTruthy();
      expect(within(k).queryByText(/^Fare:/)).toBeNull();
    }

    // Tre ting må stå der: hvor kortene kommer fra, at de ikke er en
    // trygghetserklæring, og hva leseren skal gjøre.
    const forbehold = screen.getByText(EGNE_IKKE_FORT.nb);
    expect(forbehold.textContent).toContain('Det som står under, er hentet fra andre arters forvekslingslister');
    expect(forbehold.textContent).toContain('farlige forvekslingsarter kan mangle');
    expect(forbehold.textContent).toContain('betyr IKKE at arten er trygg å plukke');
    expect(forbehold.textContent).toContain('Få alltid soppen vurdert av soppkontroll');
    // Inne i seksjonen, og FØR det første kortet: «det som står under».
    const seksjon = screen.getByRole('heading', { name: 'Se også' }).closest('article');
    expect(seksjon?.contains(forbehold)).toBe(true);
    expect(forbehold.compareDocumentPosition(kort[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // «Vi har ikke ført inn forvekslingsarter» ville motsagt kortene, og
    // ingenting feilet: ingen av de to andre beskjedene.
    expect(screen.queryByText(/Vi har ikke ført inn forvekslingsarter/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sier det på svensk på den svenske siden', async () => {
    await rendrer(7, 'sv');
    const forbehold = screen.getByText(EGNE_IKKE_FORT.sv);
    expect(forbehold.textContent).toContain('Det som står nedan är hämtat från andra arters förväxlingslistor');
    expect(forbehold.textContent).toContain('farliga förväxlingsarter kan saknas');
    expect(forbehold.textContent).toContain('betyder INTE att arten är säker att plocka');
    expect(forbehold.textContent).toContain('Låt alltid svampen bedömas av svampkontroll');
    // Forbeholdet er oversatt, ikke norsk prosa fra basen.
    expect(forbehold.closest('[lang="nb"]')).toBeNull();
    expect(screen.queryByText(EGNE_IKKE_FORT.nb)).toBeNull();
    expect(forvekslingskort()).toHaveLength(2);
  });

  it('sier «klarte ikke å hente», ikke «ikke ført inn», når artens egne rader feilet', async () => {
    // Da vet vi ikke om piggsoppen har egne rader. Kortene fra retningen som
    // virket vises fortsatt.
    forvekslingsfeil = 'fra';
    await rendrer(7);
    expect(screen.getByRole('alert').textContent).toContain('Vi klarte ikke å hente forvekslingsartene');
    expect(forvekslingskort()).toHaveLength(2);
    expect(screen.queryByText(EGNE_IKKE_FORT.nb)).toBeNull();
    expect(screen.queryByText(/Vi har ikke ført inn forvekslingsarter/)).toBeNull();
  });

  it('sier bare «klarte ikke å hente» når radene som peker hit feilet', async () => {
    // Ingen kort å stå over, og «ikke ført inn» ville vært en påstand om en
    // retning vi ikke fikk lest.
    forvekslingsfeil = 'til';
    await rendrer(7);
    expect(screen.getByRole('alert').textContent).toContain('Vi klarte ikke å hente forvekslingsartene');
    expect(screen.queryByRole('heading', { name: 'Se også' })).toBeNull();
    expect(screen.queryByText(EGNE_IKKE_FORT.nb)).toBeNull();
    expect(screen.queryByText(/Vi har ikke ført inn forvekslingsarter/)).toBeNull();
  });
});

describe('forbeholdet om artens egne forvekslinger', () => {
  it('står ikke på kantarell, som har egne rader', async () => {
    await rendrer(1);
    expect(forvekslingskort()).toHaveLength(2);
    expect(screen.queryByText(EGNE_IKKE_FORT.nb)).toBeNull();
  });

  it('står ikke på grønn fluesopp — der sier den røde boksen det som trengs', async () => {
    // Heller ingen egne rader, men «betyr ikke at arten er trygg å plukke»
    // under «Dødelig giftig — ikke spis» ville vært meningsløst.
    for (const locale of ['nb', 'sv'] as const) {
      const { unmount } = await rendrer(52, locale);
      expect(forvekslingskort(), locale).toHaveLength(1);
      expect(screen.queryByText(EGNE_IKKE_FORT[locale]), locale).toBeNull();
      unmount();
    }
  });

  it('står ikke der ingen rader finnes i noen retning — da gjelder «ikke ført inn» alene', async () => {
    await rendrer(77);
    expect(screen.getByText(/Vi har ikke ført inn forvekslingsarter for denne arten ennå/)).toBeTruthy();
    expect(screen.queryByText(EGNE_IKKE_FORT.nb)).toBeNull();
  });

  it('står i entall når bare én art peker hit', () => {
    // Seks av de åtte artene dette gjelder i dag har ett kort.
    const tekst = (locale: Sprak, count: number) => {
      const t = createTranslator({ locale, messages: KATALOGER[locale], namespace: 'SpeciesDetail' }) as unknown as (
        key: string,
        values?: Record<string, number>
      ) => string;
      return t('lookAlikesOwnNotRecorded', { count });
    };
    expect(tekst('nb', 1)).toContain('Det som står under, er hentet fra en annen arts forvekslingsliste, så');
    expect(tekst('nb', 3)).toContain('Det som står under, er hentet fra andre arters forvekslingslister, så');
    expect(tekst('sv', 1)).toContain('Det som står nedan är hämtat från en annan arts förväxlingslista, så');
    expect(tekst('sv', 3)).toContain('Det som står nedan är hämtat från andra arters förväxlingslistor, så');
  });
});

describe('på svensk', () => {
  it('viser kantarellens side på svensk, med de norske tekstene merket som norske', async () => {
    const { container } = await rendrer(1, 'sv');
    expect(detaljrad('Habitat')?.textContent).toContain('barrskog, blandskog, mossa');
    expect(detaljrad('Växer med')?.textContent).toContain('gran, tall, björk, ek');
    expect(detaljrad('Titta efter')?.textContent).toContain('Kantarell lever i symbios med bland annat gran, tall och björk');
    // Vanlighet er ført for Norge og vises ikke på svensk.
    expect(detaljrad('Hur vanlig')).toBeNull();

    const sesong = detaljrad('Säsong') as HTMLElement;
    expect(within(sesong).getByRole('img').getAttribute('aria-label')).toMatch(/^Kantarell: registrerade fynd vecka för vecka, från april till november\./);
    expect(sesong.textContent).toContain('inte hur mycket som finns, och inte var');

    // Beskrivelsen og forvekslingstekstene er norske i basen.
    const norske = [...container.querySelectorAll('[lang="nb"]')].map((element) => element.textContent);
    expect(norske).toContain('Gyllen-gul sopp med falske skiver som går ned på stilken. Mild fruktaktig lukt.');
    expect(norske).toContain('Ekte kantarell har FALSKE skiver. Ved tvil — la den stå.');
    // Kortene bruker det svenske navnet.
    expect(screen.getByRole('link', { name: /Narrkantarell/ })).toBeTruthy();
  });
});

describe('norsk brødtekst for svenske lesere', () => {
  const OVERST = sv.SpeciesDetail.norwegianProseNote;
  const FORVEKSLINGER = sv.SpeciesDetail.norwegianLookAlikeNote;

  it('svensk: én linje over teksten og én ved forvekslingene, på svensk og ikke merket som norsk', async () => {
    await rendrer(1, 'sv');
    for (const linje of [OVERST, FORVEKSLINGER]) {
      const element = screen.getByText(linje);
      expect(element.closest('[lang="nb"]'), linje).toBeNull();
    }
    // Linja står over den første norske teksten, ikke langt under den.
    const overst = screen.getByText(OVERST);
    const beskrivelse = screen.getByText('Gyllen-gul sopp med falske skiver som går ned på stilken. Mild fruktaktig lukt.');
    expect(overst.compareDocumentPosition(beskrivelse) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const skille = screen.getByText('Ekte kantarell har FALSKE skiver. Ved tvil — la den stå.');
    expect(screen.getByText(FORVEKSLINGER).compareDocumentPosition(skille) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('svensk, dødelig art: gift- og symptomteksten vises fortsatt, merket som norsk', async () => {
    await rendrer(52, 'sv');
    expect(screen.getByText(OVERST)).toBeTruthy();
    expect(screen.getByText('Amatoksiner').getAttribute('lang')).toBe('nb');
    expect(screen.getByText('Oppkast og diaré etter 6–24 timer, deretter leversvikt.').getAttribute('lang')).toBe('nb');
    expect(screen.getByText('Grav opp HELE stilken. Ved tvil — la stå.').getAttribute('lang')).toBe('nb');
  });

  it('norsk leser ser ingen endring: ingen linje, ingen lang-merking', async () => {
    const { container } = await rendrer(1, 'nb');
    expect(screen.queryByText(OVERST)).toBeNull();
    expect(screen.queryByText(FORVEKSLINGER)).toBeNull();
    expect(screen.queryByText(nb.SpeciesDetail.norwegianProseNote)).toBeNull();
    expect(screen.queryByText(nb.SpeciesDetail.norwegianLookAlikeNote)).toBeNull();
    expect(container.querySelector('[lang="nb"]')).toBeNull();
  });
});

describe('metadata', () => {
  it('gir norsk ingress, og navnet på svensk når det er et annet', async () => {
    const kantarell = await generateMetadata({ params: Promise.resolve({ id: '1' }) });
    expect(kantarell.title).toBe('Kantarell (Cantharellus cibarius) — sesong, kjennetegn og spiselighet');
    // Samme navn på begge språk: ingenting å legge til.
    expect(kantarell.description).toBe('Gyllen-gul sopp med falske skiver som går ned på stilken. Mild fruktaktig lukt.');
    expect(kantarell.alternates?.canonical).toBe('https://www.mycelet.com/species/1');

    const fluesopp = await generateMetadata({ params: Promise.resolve({ id: '52' }) });
    expect(String(fluesopp.description).endsWith('På svensk: Lömsk flugsvamp.')).toBe(true);
    expect(String(fluesopp.description).length).toBeLessThanOrEqual(155);
    expect(fluesopp.description).toContain('… På svensk');
  });

  it('bruker en bred utgave av bildet i delingskortet', async () => {
    const kantarell = await generateMetadata({ params: Promise.resolve({ id: '1' }) });
    expect(kantarell.openGraph?.images).toEqual([{ url: BILDE.kantarell.replace('/330px-', '/1280px-') }]);
    // 1200 piksler bred original: 960 er det bredeste trinnet den har.
    const fluesopp = await generateMetadata({ params: Promise.resolve({ id: '52' }) });
    expect(fluesopp.openGraph?.images).toEqual([{ url: BILDE.gronnFluesopp.replace('/500px-', '/960px-') }]);
    const uten = await generateMetadata({ params: Promise.resolve({ id: '90' }) });
    expect(uten.openGraph?.images).toBeUndefined();
  });

  it('bygger svensk beskrivelse av det vi har på svensk', async () => {
    sprak = 'sv';
    const fluesopp = await generateMetadata({ params: Promise.resolve({ id: '52' }) });
    expect(fluesopp.title).toBe('Lömsk flugsvamp (Amanita phalloides) — säsong, kännetecken och ätlighet');
    expect(fluesopp.description).toMatch(/^Lömsk flugsvamp \(Amanita phalloides\): säsong augusti – oktober\./);
    expect(fluesopp.description).not.toContain('Olivengrønn');
  });

  it('gir tom metadata for en art som ikke finnes', async () => {
    expect(await generateMetadata({ params: Promise.resolve({ id: '9999' }) })).toEqual({});
    expect(await generateMetadata({ params: Promise.resolve({ id: 'kantarell' }) })).toEqual({});
  });
});

describe('en art som ikke finnes', () => {
  it('gir 404', async () => {
    await expect(SpeciesDetailPage({ params: Promise.resolve({ id: '9999' }) })).rejects.toThrow('NEXT_NOT_FOUND');
    await expect(SpeciesDetailPage({ params: Promise.resolve({ id: 'kantarell' }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });
});
