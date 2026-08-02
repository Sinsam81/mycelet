import { describe, expect, it } from 'vitest';
import { stripPoisonHotline } from '@/lib/utils/poison-hotline';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Ekte tekst fra basen. Kopiert ordrett fra migrasjonene 017, 026, 027 og 028
 * — det er disse strengene en leser faktisk får servert øverst i den røde
 * boksen på artssiden.
 */
const SYMPTOMS_FROM_DB = {
  hvitFluesopp:
    'Symptomfritt intervall 6–24 t, deretter kraftig oppkast/diaré og en tilsynelatende bedring før akutt leversvikt. At du føler deg frisk betyr IKKE at du er trygg — ring Giftinformasjonen 22 59 13 00 straks ved mistanke.',
  giftslorsopp:
    'Symptomer kan komme først 2–3 uker etter inntak: tørste, kvalme, hodepine og nyresvikt. Det lange symptomfrie intervallet betyr IKKE at du er trygg — ring Giftinformasjonen 22 59 13 00 ved mistanke.',
  gronnFluesopp:
    'Symptomfritt i 6–24 t, deretter kraftige magesmerter, oppkast og diaré, tilsynelatende bedring, så lever- og nyresvikt. Ring Giftinformasjonen 22 59 13 00 straks ved mistanke.',
  gifttrakt:
    'Svette, spyttflod, tåreflod, magesmerter og små pupiller innen 0,5–2 t. Ring Giftinformasjonen 22 59 13 00.',
  morkel:
    'Rå/dårlig tilberedt morkel gir kvalme, oppkast og magesmerter. Ved forveksling med steinmorkel: livsfarlig — ring Giftinformasjonen 22 59 13 00.'
};

const NORWEGIAN_HOTLINE = /22\s*59\s*13\s*00/;
const SWEDISH_HOTLINE = /010[\s-]*456\s*67\s*00/;

describe('stripPoisonHotline', () => {
  it('fjerner det norske giftinformasjonsnummeret fra alle symptomtekstene i basen', () => {
    for (const [name, text] of Object.entries(SYMPTOMS_FROM_DB)) {
      const cleaned = stripPoisonHotline(text) ?? '';
      expect(cleaned, name).not.toMatch(NORWEGIAN_HOTLINE);
      expect(cleaned, name).not.toContain('Giftinformasjonen');
    }
  });

  it('beholder det medisinske innholdet — særlig at et symptomfritt intervall ikke er trygghet', () => {
    expect(stripPoisonHotline(SYMPTOMS_FROM_DB.hvitFluesopp)).toBe(
      'Symptomfritt intervall 6–24 t, deretter kraftig oppkast/diaré og en tilsynelatende bedring før akutt leversvikt. At du føler deg frisk betyr IKKE at du er trygg.'
    );
    expect(stripPoisonHotline(SYMPTOMS_FROM_DB.giftslorsopp)).toBe(
      'Symptomer kan komme først 2–3 uker etter inntak: tørste, kvalme, hodepine og nyresvikt. Det lange symptomfrie intervallet betyr IKKE at du er trygg.'
    );
    expect(stripPoisonHotline(SYMPTOMS_FROM_DB.morkel)).toBe(
      'Rå/dårlig tilberedt morkel gir kvalme, oppkast og magesmerter. Ved forveksling med steinmorkel: livsfarlig.'
    );
  });

  it('dropper hele setningen når den bare var oppfordringen om å ringe', () => {
    expect(stripPoisonHotline(SYMPTOMS_FROM_DB.gifttrakt)).toBe(
      'Svette, spyttflod, tåreflod, magesmerter og små pupiller innen 0,5–2 t.'
    );
    expect(stripPoisonHotline(SYMPTOMS_FROM_DB.gronnFluesopp)).toBe(
      'Symptomfritt i 6–24 t, deretter kraftige magesmerter, oppkast og diaré, tilsynelatende bedring, så lever- og nyresvikt.'
    );
  });

  it('tar også det svenske nummeret — en norsk leser skal ikke få 010-456 67 00', () => {
    const cleaned =
      stripPoisonHotline(
        'Kraftige magesmerter innen 2 t. Ring Giftinformationscentralen 010-456 67 00 omedelbart.'
      ) ?? '';
    expect(cleaned).toBe('Kraftige magesmerter innen 2 t.');
    expect(cleaned).not.toMatch(SWEDISH_HOTLINE);
  });

  it('tar nummeret også med landskode og uten mellomrom', () => {
    expect(stripPoisonHotline('Kvalme etter 3 t. Ring +47 22 59 13 00.')).toBe('Kvalme etter 3 t.');
    expect(stripPoisonHotline('Kvalme etter 3 t. Ring 22591300.')).toBe('Kvalme etter 3 t.');
    expect(stripPoisonHotline('Kräkningar. Ring +46 10 456 67 00.')).toBe('Kräkningar.');
  });

  it('lar tekst uten giftnummer stå helt urørt', () => {
    const untouched =
      'Symptomfritt intervall 6–24 t, deretter kraftig oppkast. Tidsforløpet 0,5–3 t og 2–3 uker er avgjørende. Kontakt lege umiddelbart.';
    expect(stripPoisonHotline(untouched)).toBe(untouched);
  });

  it('forveksler ikke tallområder og datoer med telefonnummer', () => {
    const ranges = 'Sesong 2026-04-29. Symptomer 0,5–3 t, deretter 6–24 t og opptil 2–3 uker.';
    expect(stripPoisonHotline(ranges)).toBe(ranges);
  });

  it('gir null for tom tekst, så kallstedet ikke rendrer en tom etikett', () => {
    expect(stripPoisonHotline(null)).toBeNull();
    expect(stripPoisonHotline(undefined)).toBeNull();
    expect(stripPoisonHotline('')).toBeNull();
    expect(stripPoisonHotline('Ring Giftinformasjonen 22 59 13 00.')).toBeNull();
  });
});

/**
 * Kodebasen har ikke oppsett for komponenttester (ingen jsdom), så artssiden
 * låses slik entity.test.ts og edibility-asymmetry.test.ts allerede gjør det:
 * ved å lese kilden. Det fanger nøyaktig det vi er redde for — at noen senere
 * rendrer råteksten fra basen igjen, og at det norske nummeret dermed dukker
 * opp over det svenske i samme røde boks.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const speciesPageSource = (require('node:fs') as typeof import('node:fs')).readFileSync(
  new URL('../../../app/species/[id]/page.tsx', import.meta.url),
  'utf8'
);

describe('artssiden', () => {
  it('rendrer symptomer og toksin gjennom stripPoisonHotline, ikke rått fra basen', () => {
    expect(speciesPageSource).toContain('stripPoisonHotline(species.symptoms)');
    expect(speciesPageSource).toContain('stripPoisonHotline(species.toxin_info)');
    expect(speciesPageSource).not.toContain('{species.symptoms}');
    expect(speciesPageSource).not.toContain('{species.toxin_info}');
  });
});

/**
 * Selve nummeret skal komme fra Safety-namespacet. Denne vakten sier at ingen
 * av de sikkerhetsnære navnerommene blander landene: en svensk leser skal
 * aldri se det norske nummeret, og omvendt. (Vilkår-teksten er unntatt — der
 * listes begge land bevisst, med land foran hvert nummer.)
 */
const SAFETY_NAMESPACES = ['Safety', 'SafetyWarning', 'SpeciesDetail', 'Sikkerhet', 'Identify'] as const;

function safetyText(catalog: Record<string, unknown>): string {
  return SAFETY_NAMESPACES.map((ns) => JSON.stringify(catalog[ns] ?? {})).join(' ');
}

describe('giftinformasjonsnummer i meldingskatalogene', () => {
  it('gir norske lesere det norske nummeret og ingen svenske', () => {
    const text = safetyText(nb as Record<string, unknown>);
    expect(text).toMatch(NORWEGIAN_HOTLINE);
    expect(text).not.toMatch(SWEDISH_HOTLINE);
  });

  it('gir svenske lesere det svenske nummeret og ingen norske', () => {
    const text = safetyText(sv as Record<string, unknown>);
    expect(text).toMatch(SWEDISH_HOTLINE);
    expect(text).not.toMatch(NORWEGIAN_HOTLINE);
  });

  it('har riktig tel:-mål for hvert språk', () => {
    expect((nb as { Safety: { poisonTel: string } }).Safety.poisonTel).toBe('+4722591300');
    // Sverige: 112 ved akutt fare — Giftinformationscentralen ber selv folk
    // ringe 112 i akutte tilfeller, og 010-456 67 00 ellers.
    expect((sv as { Safety: { poisonTel: string } }).Safety.poisonTel).toBe('112');
  });
});

/**
 * Det direkte nummeret til giftinformasjonen.
 *
 * Sverige har to nummer, og begge sto i lenketeksten — men lenka gikk til
 * 112 for begge. En svensk bruker som ville ringe Giftinformationscentralen
 * om noe ikke-akutt trykket på «010-456 67 00» og ringte nødsentralen.
 * Invarianten under er hele poenget: sifrene i teksten du trykker på må
 * være sifrene som slås.
 */
interface SafetyNumbers {
  poisonTel: string;
  poisonAcuteLabel: string;
  poisonTelDirect: string;
  poisonDirectLabel: string;
  poisonNumber: string;
  poisonName: string;
}

const safety = (catalog: unknown) => (catalog as { Safety: SafetyNumbers }).Safety;

/** Sifrene i en synlig etikett, uten nasjonal null foran retningsnummeret. */
function shownDigits(label: string): string {
  return label.replace(/\D/g, '').replace(/^0/, '');
}

describe('lenkene til giftinformasjonen', () => {
  it('slår nøyaktig det nummeret som står i lenketeksten', () => {
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const s = safety(catalog);
      for (const [tel, label] of [
        [s.poisonTel, s.poisonAcuteLabel],
        [s.poisonTelDirect, s.poisonDirectLabel]
      ] as const) {
        expect(tel.replace(/\D/g, ''), `${locale}: «${label}» → ${tel}`).toMatch(
          new RegExp(`${shownDigits(label)}$`)
        );
      }
    }
  });

  it('gir svensker et klikkbart direktenummer som ikke er nødsentralen', () => {
    const s = safety(sv);
    expect(s.poisonTel).toBe('112');
    expect(s.poisonTelDirect).toBe('+46104566700');
    expect(s.poisonTelDirect).not.toBe(s.poisonTel);
    expect(s.poisonDirectLabel).toMatch(SWEDISH_HOTLINE);
  });

  it('gir nordmenn én lenke — samme nummer to ganger ville sett ut som to linjer', () => {
    const s = safety(nb);
    expect(s.poisonTelDirect).toBe(s.poisonTel);
  });

  it('lar ren tekst-visning fortsatt nevne begge numrene', () => {
    // poisonNumber brukes der nummeret IKKE er en lenke (identify-siden,
    // SafetyWarning). Den må derfor fortsatt inneholde begge etikettene.
    for (const [locale, catalog] of [
      ['nb', nb],
      ['sv', sv]
    ] as const) {
      const s = safety(catalog);
      expect(s.poisonNumber, locale).toContain(s.poisonAcuteLabel);
      expect(s.poisonNumber, locale).toContain(s.poisonDirectLabel);
    }
  });
});

/**
 * Kildevakt, samme mønster som artssiden over: de tre sidene som RINGER
 * giftinformasjonen skal gå gjennom PoisonHotlineLinks. Bygger noen en
 * `tel:`-lenke her igjen, går det svenske direktenummeret tilbake til å
 * være tekst på en lenke som ringer 112.
 */
const LINK_PAGES = [
  '../../../app/species/[id]/page.tsx',
  '../../../app/sikkerhet/page.tsx',
  '../../../app/personvern/page.tsx'
] as const;

describe('sidene som ringer giftinformasjonen', () => {
  it('bygger ikke tel:-lenka selv', () => {
    for (const page of LINK_PAGES) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const source = (require('node:fs') as typeof import('node:fs')).readFileSync(
        new URL(page, import.meta.url),
        'utf8'
      );
      expect(source, page).toContain('PoisonHotlineLinks');
      expect(source, page).not.toContain("tel:${s('poisonTel')}");
    }
  });
});
