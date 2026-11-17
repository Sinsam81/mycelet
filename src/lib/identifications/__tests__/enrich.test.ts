import { describe, expect, it, vi } from 'vitest';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';
import { ARTSKATALOG, art, type KatalogArt } from '@/lib/species/__tests__/artskatalog-fixture';
import { enrichSuggestions, visesSomFarligForveksling, type BaseSuggestion } from '../enrich';

/**
 * Forvekslingsadvarselen i AI-resultatet, med de alvorlige look_alikes-radene
 * slik de sto i produksjon 16. november 2026 (bare lesing: species_id,
 * look_alike_id og faregrad for alle 28 radene med high eller critical).
 * Artene er katalogen fra 10. november (artskatalog-fixture).
 *
 * Feilen: fire av radene er speilrader ført fra den farlige siden, og peker på
 * en matsopp. enrich.ts tok med alle alvorlige rader for forslagets art, så et
 * forslag om falsk kantarell fikk «Farlig dobbeltgjenger: Kantarell» med et
 * grønt «Spiselig» — og hvit fluesopp, et dødelig forslag, fikk sjampinjongen.
 * Både et ferskt resultat og historikkvisningen går gjennom enrichSuggestions,
 * så testene her dekker begge.
 */

type Faregrad = 'high' | 'critical';
interface Rad {
  species_id: number;
  look_alike_id: number;
  danger_level: Faregrad;
  similarity_description?: string | null;
  difference_description?: string | null;
}

/** Kantarell → Falsk kantarell (high). Tekstene ordrett fra basen (se forvekslinger.test.ts). */
const KANTARELL_TIL_FALSK: Rad = {
  species_id: 1,
  look_alike_id: 22,
  danger_level: 'high',
  similarity_description: 'Begge er oransje-gule traktformede sopper. Klassisk forveksling for nybegynnere.',
  difference_description:
    'Ekte kantarell har FALSKE skiver (årer som går ned på stilken) og fastere kjøtt. Falsk kantarell har EKTE smale skiver og mykere kjøtt. Lukten er mild-fruktig på ekte kantarell, mer "soppete" på falsk. Ved tvil — la den stå.'
};
/** Falsk kantarell → Kantarell (high). Speilraden. */
const FALSK_TIL_KANTARELL: Rad = {
  species_id: 22,
  look_alike_id: 1,
  danger_level: 'high',
  similarity_description: 'Begge oransje traktsopper i barskog.',
  difference_description:
    'Falsk kantarell har ekte smale skiver, ekte kantarell har falske årer som går ned på stilken. Ved tvil — la den stå.'
};

const r = (species_id: number, look_alike_id: number, danger_level: Faregrad): Rad => ({
  species_id,
  look_alike_id,
  danger_level
});

/** Alle 28 alvorlige rader i produksjon 16. november 2026. */
const PRODUKSJONSRADER: readonly Rad[] = [
  // Fra en art som ikke er mat, til en matsopp — de fire speilradene.
  FALSK_TIL_KANTARELL,
  r(16, 10, 'critical'), // Hvit fluesopp → Sjampinjong
  r(17, 3, 'critical'), // Spiss giftslørsopp → Traktkantarell
  r(23, 10, 'critical'), // Karbol-sjampinjong → Sjampinjong
  // Mellom arter som ikke er mat.
  r(11, 56, 'critical'), // Honningsopp → Flatklokkehatt
  r(11, 24, 'high'), // Honningsopp → Svovelsopp
  r(24, 11, 'high'), // Svovelsopp → Honningsopp
  // Fra en matsopp til en art som ikke er mat.
  KANTARELL_TIL_FALSK,
  r(3, 17, 'critical'),
  r(10, 16, 'critical'),
  r(10, 23, 'critical'),
  r(77, 56, 'critical'),
  r(38, 52, 'critical'),
  r(33, 18, 'high'),
  r(32, 18, 'high'),
  r(70, 15, 'high'),
  r(19, 57, 'critical'),
  r(83, 18, 'high'),
  r(72, 90, 'high'),
  r(40, 16, 'critical'),
  r(41, 16, 'critical'),
  r(41, 23, 'high'),
  r(20, 57, 'critical'),
  r(78, 52, 'critical'),
  r(80, 62, 'high'),
  r(55, 53, 'high'),
  r(68, 52, 'critical'),
  r(82, 59, 'critical')
];

/** SQL ILIKE uten jokertegn er likhet uten store/små bokstaver; % er «hva som helst». */
function ilike(verdi: unknown, monster: string): boolean {
  const regex = monster
    .split('%')
    .map((del) => del.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return typeof verdi === 'string' && new RegExp(`^${regex}$`, 'i').test(verdi);
}

/** En katalograd der spiselighetsklassen kan mangle, slik kolonnen tillater. */
type KatalogRad = Omit<KatalogArt, 'edibility'> & { edibility: string | null };

/**
 * Nok av PostgREST-klienten til spørringene i enrich.ts: arten på latinsk navn
 * (maybeSingle), synonymreserven (limit) og look_alikes med forvekslingsarten
 * joinet inn (await på selve spørringen). Filtrene virker — også danger_level.
 */
function lagSupabase(rader: readonly Rad[], katalog: readonly KatalogRad[] = ARTSKATALOG) {
  const artMedId = new Map(katalog.map((a) => [a.id, a]));
  return {
    from(tabell: string) {
      const filtre: Array<(rad: Record<string, unknown>) => boolean> = [];
      const kilde = (): Record<string, unknown>[] =>
        tabell === 'mushroom_species'
          ? katalog.map((a) => ({ ...a }))
          : rader.map((rad) => {
              const la = artMedId.get(rad.look_alike_id);
              return {
                ...rad,
                la: la
                  ? {
                      id: la.id,
                      norwegian_name: la.norwegian_name,
                      swedish_name: la.swedish_name,
                      primary_image_url: la.primary_image_url,
                      primary_image_photographer: null,
                      primary_image_license: null,
                      primary_image_source_url: null,
                      edibility: la.edibility
                    }
                  : null
              };
            });
      const treff = () => kilde().filter((rad) => filtre.every((f) => f(rad)));
      const sporring = {
        select: () => sporring,
        ilike: (kolonne: string, monster: string) => {
          filtre.push((rad) => ilike(rad[kolonne], monster));
          return sporring;
        },
        in: (kolonne: string, verdier: unknown[]) => {
          filtre.push((rad) => verdier.includes(rad[kolonne]));
          return sporring;
        },
        maybeSingle: async () => ({ data: treff()[0] ?? null, error: null }),
        limit: async (antall: number) => ({ data: treff().slice(0, antall), error: null }),
        then: (ok: (svar: unknown) => unknown, feil?: (grunn: unknown) => unknown) =>
          Promise.resolve({ data: treff(), error: null }).then(ok, feil)
      };
      return sporring;
    }
  };
}

function forslag(latinskNavn: string, probability = 80): BaseSuggestion {
  return {
    name: latinskNavn,
    commonNames: [],
    probability,
    edibility: 'unknown',
    description: null,
    taxonomy: null,
    similarImages: []
  };
}

async function berik(
  latinskeNavn: string[],
  { rader = PRODUKSJONSRADER, locale = 'nb' as const }: { rader?: readonly Rad[]; locale?: 'nb' | 'sv' } = {}
) {
  const log = { error: vi.fn() };
  const ut = await enrichSuggestions(
    lagSupabase(rader),
    latinskeNavn.map((navn) => forslag(navn)),
    { locale, month: 8, log }
  );
  expect(log.error).not.toHaveBeenCalled();
  expect(ut.safetyDataIncomplete).toBe(false);
  return ut.suggestions;
}

const navnPa = (s: { dangerousLookAlikes?: Array<{ name: string }> }) => (s.dangerousLookAlikes ?? []).map((d) => d.name);

describe('speilradene fra produksjon', () => {
  it('falsk kantarell får aldri kantarellen som farlig dobbeltgjenger', async () => {
    // Scenarioet fra gjennomgangen: Kindwise foreslår falsk kantarell først og kantarell etter.
    const [falsk, kantarell] = await berik(['Hygrophoropsis aurantiaca', 'Cantharellus cibarius']);

    expect(falsk.speciesId).toBe(22);
    expect(falsk.edibility).toBe('inedible');
    expect(falsk.dangerousLookAlikes).toBeUndefined();
    // Ingen grønn tvilling — det gule forbeholdet i stedet.
    expect(falsk.lookAlikeData).toBe('none_recorded');

    // Kantarellen beholder sin egen rad, med tekstene som er skrevet for den.
    expect(kantarell.lookAlikeData).toBe('present');
    expect(kantarell.dangerousLookAlikes).toEqual([
      expect.objectContaining({
        name: 'Falsk kantarell',
        danger: 'high',
        speciesId: 22,
        edibility: 'inedible',
        whySimilar: KANTARELL_TIL_FALSK.similarity_description,
        howToTell: KANTARELL_TIL_FALSK.difference_description
      })
    ]);
  });

  it.each([
    ['Amanita virosa', 'Hvit fluesopp', 'deadly'],
    ['Cortinarius rubellus', 'Spiss giftslørsopp', 'deadly'],
    ['Agaricus xanthodermus', 'Karbol-sjampinjong', 'toxic']
  ])('et giftig eller dødelig forslag (%s) får ingen matsopp som dobbeltgjenger', async (latin, navn, klasse) => {
    const [s] = await berik([latin]);
    expect(s.norwegianName).toBe(navn);
    expect(s.edibility).toBe(klasse);
    expect(s.dangerousLookAlikes).toBeUndefined();
    expect(s.lookAlikeData).toBe('none_recorded');
  });

  it('matsoppene på den andre siden av speilradene beholder advarslene sine, verst først', async () => {
    const [sjampinjong, traktkantarell] = await berik(['Agaricus campestris', 'Craterellus tubaeformis']);
    expect(navnPa(sjampinjong)).toEqual(['Hvit fluesopp', 'Karbol-sjampinjong']);
    expect(sjampinjong.dangerousLookAlikes?.every((d) => d.danger === 'critical')).toBe(true);
    expect(navnPa(traktkantarell)).toEqual(['Spiss giftslørsopp']);
    expect(traktkantarell.dangerousLookAlikes?.[0]).toMatchObject({ danger: 'critical', edibility: 'deadly' });
  });

  it('forvekslinger som ikke er mat står alltid — også for et forslag som ikke er mat', async () => {
    // Feiler mot advarselen: honningsopp er uspiselig, flatklokkehatt dødelig.
    const [honningsopp, svovelsopp] = await berik(['Armillaria mellea', 'Hypholoma fasciculare']);
    expect(navnPa(honningsopp)).toEqual(['Flatklokkehatt', 'Svovelsopp']);
    expect(honningsopp.dangerousLookAlikes?.[0]).toMatchObject({ danger: 'critical', edibility: 'deadly' });
    expect(navnPa(svovelsopp)).toEqual(['Honningsopp']);
  });

  it('på svensk: samme regel, svenske navn', async () => {
    const [falsk, kantarell] = await berik(['Hygrophoropsis aurantiaca', 'Cantharellus cibarius'], { locale: 'sv' });
    expect(falsk.norwegianName).toBe('Narrkantarell');
    expect(falsk.dangerousLookAlikes).toBeUndefined();
    expect(navnPa(kantarell)).toEqual(['Narrkantarell']);
  });

  it('over hele katalogen: aldri en matsopp ved et forslag som ikke er mat, og ingen annen rad mistes', async () => {
    let vist = 0;
    for (const katalogArt of ARTSKATALOG) {
      const [s] = await berik([katalogArt.latin_name]);
      expect(s.speciesId, katalogArt.norwegian_name).toBe(katalogArt.id);
      const egne = PRODUKSJONSRADER.filter((rad) => rad.species_id === katalogArt.id);
      const forventet = isRecommendableSpecies(katalogArt.edibility)
        ? egne
        : egne.filter((rad) => !isRecommendableSpecies(ARTSKATALOG.find((a) => a.id === rad.look_alike_id)?.edibility));
      const viste = s.dangerousLookAlikes ?? [];
      expect(viste.map((d) => d.speciesId).sort(), katalogArt.norwegian_name).toEqual(
        forventet.map((rad) => rad.look_alike_id).sort()
      );
      if (!isRecommendableSpecies(katalogArt.edibility)) {
        expect(viste.filter((d) => isRecommendableSpecies(d.edibility)), katalogArt.norwegian_name).toEqual([]);
      }
      vist += viste.length;
    }
    // 28 alvorlige rader, fire speilrader mot en matsopp: 24 står igjen.
    expect(vist).toBe(24);
  });
});

describe('regelen utenfor dagens data', () => {
  it('to matsopper med en alvorlig rad mellom seg: raden står (kuratert faregrad)', async () => {
    // Finnes ikke i basen i dag. Begge er mat, så forslaget får ingen grønn
    // tvilling «i stedet for» en advarsel — raden er en advarsel om noe annet.
    const [rodskrubb] = await berik(['Leccinum aurantiacum'], { rader: [r(5, 6, 'high')] });
    expect(navnPa(rodskrubb)).toEqual(['Brunskrubb']);
  });

  it('et forslag uten spiselighet i katalogen regnes ikke som mat', async () => {
    const katalog: KatalogRad[] = ARTSKATALOG.map((a) => (a.id === 22 ? { ...a, edibility: null } : a));
    const s = await enrichSuggestions(lagSupabase([FALSK_TIL_KANTARELL], katalog), [forslag('Hygrophoropsis aurantiaca')], {
      locale: 'nb',
      month: 8,
      log: { error: vi.fn() }
    });
    expect(s.suggestions[0].dangerousLookAlikes).toBeUndefined();
  });

  it('en forvekslingsart uten spiselighet i katalogen vises — vi vet ikke at den er trygg', async () => {
    const katalog: KatalogRad[] = ARTSKATALOG.map((a) => (a.id === 1 ? { ...a, edibility: null } : a));
    const s = await enrichSuggestions(lagSupabase([FALSK_TIL_KANTARELL], katalog), [forslag('Hygrophoropsis aurantiaca')], {
      locale: 'nb',
      month: 8,
      log: { error: vi.fn() }
    });
    expect(navnPa(s.suggestions[0])).toEqual(['Kantarell']);
    expect(s.suggestions[0].dangerousLookAlikes?.[0].edibility).toBeNull();
  });

  it('forslagets spiselighet er katalogens, ikke leverandørens', async () => {
    // Kindwise kan kalle falsk kantarell «edible». Det er katalogen som avgjør.
    const fraLeverandor = { ...forslag('Hygrophoropsis aurantiaca'), edibility: 'edible' };
    const s = await enrichSuggestions(lagSupabase(PRODUKSJONSRADER), [fraLeverandor], {
      locale: 'nb',
      month: 8,
      log: { error: vi.fn() }
    });
    expect(s.suggestions[0].edibility).toBe('inedible');
    expect(s.suggestions[0].dangerousLookAlikes).toBeUndefined();
  });

  it('fixturen er den katalogen testene tror den er', () => {
    expect(art('Falsk kantarell')).toMatchObject({ id: 22, edibility: 'inedible' });
    expect(art('Kantarell')).toMatchObject({ id: 1, edibility: 'edible' });
    expect(art('Hvit fluesopp')).toMatchObject({ id: 16, edibility: 'deadly' });
    expect(art('Sjampinjong')).toMatchObject({ id: 10, edibility: 'edible' });
  });
});

describe('visesSomFarligForveksling', () => {
  const KLASSER = ['edible', 'conditionally_edible', 'inedible', 'toxic', 'deadly', 'unknown', null, undefined, 'tull'];
  const MAT = new Set(['edible', 'conditionally_edible']);

  it.each(KLASSER.flatMap((forslaget) => KLASSER.map((forvekslingen) => [forslaget, forvekslingen] as const)))(
    'forslag %s, forveksling %s',
    (forslaget, forvekslingen) => {
      const forventet = !MAT.has(forvekslingen as string) || MAT.has(forslaget as string);
      expect(visesSomFarligForveksling(forslaget, forvekslingen)).toBe(forventet);
    }
  );

  it('en forveksling som ikke er mat vises uansett forslag', () => {
    for (const forvekslingen of ['inedible', 'toxic', 'deadly', 'unknown', null]) {
      for (const forslaget of KLASSER) expect(visesSomFarligForveksling(forslaget, forvekslingen)).toBe(true);
    }
  });
});
