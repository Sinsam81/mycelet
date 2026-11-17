import { createTranslator } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ARTSKATALOG } from '@/lib/species/__tests__/artskatalog-fixture';
import { META_MAKS } from '@/lib/species/artsmetadata';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import nb from '../../../../../messages/nb.json';
import sv from '../../../../../messages/sv.json';

/**
 * Søketreffet og delingskortet for alle 80 artene i katalogen, på begge språk.
 *
 * Beskrivelsen siteres uten siden rundt — uten sikkerhetsboksen, uten
 * forvekslingsartene — akkurat som de strukturerte dataene. Den norske var
 * ingressen fra basen, og 23 av 80 ingresser sier noe om matverdi («Trygg og
 * god matsopp.»). Katalogfixturen har ingen ingresser, så hver rad får her den
 * verste brødteksten vi kan tenke oss i alle tekstkolonnene. Ingenting av den
 * skal komme ut, for noen art, på noe språk.
 */

type Sprak = 'nb' | 'sv';
const KATALOGER = { nb, sv } as unknown as Record<Sprak, Record<string, unknown>>;
let sprak: Sprak = 'nb';

const MATVERDI = /trygg|matsopp|spiselig|god å spise/i;
const MATVERDI_SV = /ätlig|matsvamp|säker|god att äta/i;

/** Brødtekst som sier alt den ikke skal — i hver tekstkolonne på hver rad. */
const PAASTANDER = 'Trygg og god matsopp. Spiselig, og god å spise stekt i smør.';

vi.mock('next-intl/server', () => ({
  getLocale: async () => sprak,
  getTranslations: async (namespace: string) => createTranslator({ locale: sprak, messages: KATALOGER[sprak], namespace })
}));

// Svarer med hele raden uansett hva som ble valgt: testen skal vise at siden
// ikke BRUKER brødteksten, ikke bare at den lar være å hente den.
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    from() {
      let id: unknown;
      const bygger = {
        select: () => bygger,
        eq(_kolonne: string, verdi: unknown) {
          id = verdi;
          return bygger;
        },
        single: async () => {
          const art = ARTSKATALOG.find((rad) => rad.id === Number(id));
          if (!art) return { data: null, error: { message: 'ingen rad' } };
          return {
            data: { ...art, description: PAASTANDER, edibility_notes: PAASTANDER, toxin_info: PAASTANDER, symptoms: PAASTANDER },
            error: null
          };
        }
      };
      return bygger;
    }
  })
}));

const { generateMetadata } = await import('../page');

function metadata(id: number) {
  return generateMetadata({ params: Promise.resolve({ id: String(id) }) });
}

beforeEach(() => {
  sprak = 'nb';
});

describe('beskrivelsen i søketreff og delingskort', () => {
  it('har alle de 80 artene å gå gjennom', () => {
    expect(ARTSKATALOG).toHaveLength(80);
  });

  for (const locale of ['nb', 'sv'] as const) {
    it(`${locale}: sier aldri noe om matverdi, for noen art`, async () => {
      sprak = locale;
      for (const art of ARTSKATALOG) {
        const meta = await metadata(art.id);
        const beskrivelse = String(meta.description ?? '');
        const delingskort = String(meta.openGraph?.description ?? '');
        for (const [navn, tekst] of [
          ['description', beskrivelse],
          ['og:description', delingskort]
        ]) {
          expect(tekst, `${art.norwegian_name} (${navn})`).not.toMatch(MATVERDI);
          expect(tekst, `${art.norwegian_name} (${navn})`).not.toMatch(MATVERDI_SV);
        }
        // Ikke tom heller: den nøytrale setningen, med artens latinske navn.
        expect(beskrivelse, art.norwegian_name).toContain(`(${art.latin_name})`);
        expect(beskrivelse.length, art.norwegian_name).toBeLessThanOrEqual(META_MAKS);
        expect(delingskort, art.norwegian_name).toBe(beskrivelse);
      }
    });

    it(`${locale}: beholder navnet på det andre språket for hver art som har et annet`, async () => {
      // Den nøytrale setningen er lengre enn den gamle ingressen fikk være, så
      // uten den korte reserven falt «På svensk: …» bort for 36 arter på norsk.
      sprak = locale;
      const t = createTranslator({ locale, messages: KATALOGER[locale], namespace: 'SpeciesDetail' }) as unknown as (
        key: string,
        values: Record<string, string>
      ) => string;
      let medAnnetNavn = 0;
      for (const art of ARTSKATALOG) {
        const navn = getSpeciesDisplayName(art, locale);
        const annet = (locale === 'sv' ? art.norwegian_name : art.swedish_name)?.trim();
        if (!annet || annet.toLowerCase() === navn.toLowerCase()) continue;
        medAnnetNavn++;
        const meta = await metadata(art.id);
        expect(String(meta.description), art.norwegian_name).toContain(t('metaOtherLanguageName', { name: annet }));
      }
      expect(medAnnetNavn).toBeGreaterThan(70);
    });
  }
});
