import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { timeZoneForLocale } from '@/i18n/config';
import { art } from '@/lib/species/__tests__/artskatalog-fixture';
import { ORDBLOKK_KLASSER } from '../Artsnavn';
import { SpeciesCard } from '../SpeciesCard';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Artskortet i biblioteket. Siden rendrer ett kort per art (~80), og hvert kort
 * hentet bildet sitt med én gang — også de langt under skjermkanten.
 */

const BILDE = 'https://bilder.example.org/kantarell.jpg';

function render(norskNavn: string, imageUrl: string | null, locale: 'nb' | 'sv' = 'nb') {
  return renderToString(
    <NextIntlClientProvider locale={locale} timeZone={timeZoneForLocale(locale)} messages={locale === 'sv' ? sv : nb}>
      <SpeciesCard species={art(norskNavn)} imageUrl={imageUrl} />
    </NextIntlClientProvider>
  );
}

const bilde = (html: string) => html.match(/<img[^>]*>/)?.[0] ?? '';

describe('bildet lastes først når kortet nærmer seg skjermen', () => {
  it('har loading="lazy" og decoding="async"', () => {
    const img = bilde(render('Kantarell', BILDE));
    expect(img).toContain(`src="${BILDE}"`);
    expect(img).toContain('loading="lazy"');
    expect(img).toContain('decoding="async"');
  });

  it('rammen har fast form, så kortet ikke hopper når bildet kommer', () => {
    expect(render('Kantarell', BILDE)).toContain('aspect-square');
  });

  it('uten bilde: en tekst i stedet, ikke et tomt <img>', () => {
    const html = render('Pantermusserong', null);
    expect(html).not.toContain('<img');
    expect(html).toContain(nb.SpeciesCard.noImage);
  });
});

describe('kortet sier hva arten er', () => {
  it('bildet har artsnavnet som alt-tekst, på leserens språk', () => {
    expect(bilde(render('Steinsopp', BILDE))).toContain('alt="Steinsopp"');
    expect(bilde(render('Steinsopp', BILDE, 'sv'))).toContain('alt="Karljohan"');
  });

  it('viser navn, latinsk navn og spiselighetsmerke i tekst', () => {
    const html = render('Hvit fluesopp', BILDE);
    expect(html).toContain('Hvit fluesopp');
    expect(html).toContain('Amanita virosa');
    expect(html).toContain(nb.EdibilityBadge.deadly);
    expect(html).toContain('href="/species/16"');
  });

  it('svensk leser får svensk navn og svensk merke', () => {
    const html = render('Hvit fluesopp', BILDE, 'sv');
    expect(html).toContain('Vit flugsvamp');
    expect(html).not.toContain('Hvit fluesopp');
    expect(html).toContain(sv.EdibilityBadge.deadly);
  });
});

describe('lange navn bryter i stedet for å bli kuttet av kortkanten', () => {
  // To kolonner gir navnet 139,5 px på en 375 px skjerm; «Brunkjøttbukkesopp»
  // er 167 px i Fraunces 700, og kortet har overflow-hidden.
  it('navnet er en overskrift av ordblokker, og det latinske navnet kan brytes', () => {
    const html = render('Brunkjøttbukkesopp', BILDE);
    expect(html).toMatch(
      new RegExp(`<h3 class="[^"]*"><span class="${ORDBLOKK_KLASSER}">Brunkjøttbukkesopp</span></h3>`)
    );
    expect(html).toContain('<p class="break-words text-xs italic text-gray-600">');
  });

  it('svensk: «Snöbollschampinjon» får samme behandling', () => {
    expect(render('Snøballsjampinjong', BILDE, 'sv')).toContain(
      `<span class="${ORDBLOKK_KLASSER}">Snöbollschampinjon</span>`
    );
  });
});
