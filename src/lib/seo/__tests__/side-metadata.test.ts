import { describe, expect, it } from 'vitest';
import { resolveAlternates } from 'next/dist/lib/metadata/resolvers/resolve-basics';
import { resolveOpenGraph } from 'next/dist/lib/metadata/resolvers/resolve-opengraph';
import { resolveTitle } from 'next/dist/lib/metadata/resolvers/resolve-title';
import { NETTSTED, SAMME_ADRESSE, sideMetadata } from '@/lib/seo/side-metadata';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * /species og /calendar arvet forsidens tittel og beskrivelse og hadde ingen
 * kanonisk adresse. Testene holder på formen metadataene får — og, nederst, på
 * de to tingene i Next vi lener oss på for at layouten rundt /species ikke
 * skal skade de 80 artssidene under den.
 */

const KALENDER = sideMetadata({ sti: '/calendar', tittel: 'Soppkalender', beskrivelse: 'Når hver art er ute.', locale: 'nb' });

describe('sideMetadata', () => {
  it('gir tittel og beskrivelse videre uendret — merkenavnet legger rot-layoutens mal på', () => {
    expect(KALENDER.title).toBe('Soppkalender');
    expect(KALENDER.description).toBe('Når hver art er ute.');
  });

  it('setter kanonisk adresse og og:url til samme sti, med nettstedet som base', () => {
    expect(String(KALENDER.metadataBase)).toBe(`${NETTSTED}/`);
    expect(KALENDER.alternates?.canonical).toBe('/calendar');
    expect(KALENDER.openGraph?.url).toBe('/calendar');
  });

  it('skriver ut hele openGraph — Next arver ikke siteName, locale og type fra rot-layouten', () => {
    expect(KALENDER.openGraph).toMatchObject({
      siteName: 'Mycelet',
      type: 'website',
      locale: 'nb_NO',
      title: 'Soppkalender',
      description: 'Når hver art er ute.'
    });
  });

  it('svensk leser får svensk og:locale', () => {
    const svensk = sideMetadata({ sti: '/calendar', tittel: 'x', beskrivelse: 'y', locale: 'sv' });
    expect(svensk.openGraph).toMatchObject({ locale: 'sv_SE' });
  });

  it('lover ingen språkadresser — norsk og svensk utgave har samme URL', () => {
    expect(KALENDER.alternates).toEqual({ canonical: '/calendar' });
  });
});

describe('tekstene bak /species og /calendar', () => {
  const tekster = [
    ['nb Species', nb.Species],
    ['sv Species', sv.Species],
    ['nb Calendar', nb.Calendar],
    ['sv Calendar', sv.Calendar]
  ] as const;

  it.each(tekster)('%s: tittelen får plass i et søketreff også med «— Mycelet» bak', (_navn, tekst) => {
    expect(tekst.metaTitle).not.toMatch(/Mycelet/);
    expect(`${tekst.metaTitle} — Mycelet`.length).toBeLessThanOrEqual(65);
  });

  it.each(tekster)('%s: beskrivelsen er en hel setning som ikke kappes (70–160 tegn)', (_navn, tekst) => {
    expect(tekst.metaDescription.length).toBeGreaterThanOrEqual(70);
    expect(tekst.metaDescription.length).toBeLessThanOrEqual(160);
    expect(tekst.metaDescription).toMatch(/[.!?]$/);
  });

  it('kalenderbeskrivelsen sier hva siden viser — ikke «plukk nå», og ikke en måned som blir gammel', () => {
    for (const tekst of [nb.Calendar.metaDescription, sv.Calendar.metaDescription]) {
      expect(tekst).not.toMatch(/plukk|plock/i);
      expect(tekst).not.toMatch(/januar|februar|mars|april|mai|maj|juni|juli|august|september|oktober|november|de[sc]ember/i);
    }
    // De giftige artene står i kalenderen; beskrivelsen skal ikke late som noe annet.
    expect(nb.Calendar.metaDescription).toMatch(/giftige/);
    expect(sv.Calendar.metaDescription).toMatch(/giftiga/);
  });

  it('de svenske tekstene er svenske, ikke norske med svensk nøkkel', () => {
    expect(sv.Species.metaTitle).toMatch(/Svamparter/);
    expect(sv.Species.metaDescription).toMatch(/svampar/);
    expect(sv.Calendar.metaTitle).toMatch(/Svampkalender/);
    expect(sv.Calendar.metaDescription).toMatch(/säsong/);
    for (const tekst of [sv.Species.metaTitle, sv.Species.metaDescription, sv.Calendar.metaTitle, sv.Calendar.metaDescription]) {
      expect(tekst).not.toMatch(/\bsopp|\bog\b|ø|æ/i);
    }
  });
});

/**
 * Det vi lener oss på i Next. Layouten i src/app/species/layout.tsx ligger også
 * rundt /species/[id], og to egenskaper ved Nexts metadataoppløsning avgjør om
 * artssidene tar skade av den. Appen kan ikke bygges i en test, så Nexts egne
 * oppløsere kalles direkte — endrer en oppgradering oppførselen, feiler dette
 * i stedet for at 80 sider stille får feil tittel eller canonical.
 */
describe('Next løser metadataene slik layouten forutsetter', () => {
  const base = new URL(NETTSTED);
  const kontekst = { trailingSlash: false, isStaticMetadataRouteFile: false };
  const kanonisk = async (sti: string, forespurt: string) =>
    (await resolveAlternates({ canonical: sti }, base, Promise.resolve(forespurt), kontekst))?.canonical?.url;

  it('SAMME_ADRESSE blir adressen som ble bedt om — biblioteket peker på seg selv', async () => {
    expect(await kanonisk(SAMME_ADRESSE, '/species')).toBe(`${NETTSTED}/species`);
  });

  it('… og en artsside som arver den, peker også på seg selv, ikke på biblioteket', async () => {
    expect(await kanonisk(SAMME_ADRESSE, '/species/57')).toBe(`${NETTSTED}/species/57`);
  });

  it('en fast sti løses mot nettstedet uansett hvilken side som ble bedt om', async () => {
    expect(await kanonisk('/calendar', '/calendar')).toBe(`${NETTSTED}/calendar`);
  });

  it('og:url følger samme regel som canonical', async () => {
    const forSide = async (forespurt: string) =>
      (await resolveOpenGraph({ url: SAMME_ADRESSE }, base, Promise.resolve(forespurt), kontekst, null))?.url?.toString();
    expect(await forSide('/species')).toBe(`${NETTSTED}/species`);
    expect(await forSide('/species/57')).toBe(`${NETTSTED}/species/57`);
  });

  it('en tittel som { default, template } gir malen videre til undersidene', () => {
    const rotMal = '%s — Mycelet';
    const fraLayout = resolveTitle({ default: 'Sopparter', template: rotMal }, rotMal);
    expect(fraLayout.absolute).toBe('Sopparter — Mycelet');
    expect(fraLayout.template).toBe(rotMal);
  });

  it('en tittel som ren streng nullstiller malen — derfor gjør layouten det ikke', () => {
    // Dette er fella: artssidene under ville fått tittelen sin uten «— Mycelet».
    expect(resolveTitle('Sopparter', '%s — Mycelet').template).toBeNull();
  });
});
