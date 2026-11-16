// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SpeciesPhotoCarousel } from '../SpeciesPhotoCarousel';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Hovedbildet på artssiden: skarpere utgaver der de finnes, krediteringen på
 * plass uansett bredde, og ingen linje som sier «1 bilde» under hvert eneste.
 */

afterEach(cleanup);

type Bilde = Parameters<typeof SpeciesPhotoCarousel>[0]['photos'][number];

const LAGRET = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Sopp.jpg/330px-Sopp.jpg';
const SRCSET = `${LAGRET} 330w, ${LAGRET.replace('330px', '960px')} 960w`;

function bilde(overstyr: Partial<Bilde> = {}): Bilde {
  return {
    id: 'bilde-1',
    image_url: LAGRET,
    thumbnail_url: null,
    caption: null,
    is_primary: true,
    photographer: 'Fotograf Eksempel',
    license: 'CC BY 3.0',
    source_url: 'https://commons.wikimedia.org/wiki/File:Sopp.jpg',
    ...overstyr
  };
}

function rendrer(photos: Bilde[], locale: 'nb' | 'sv' = 'nb', sizes: string | undefined = '320px') {
  return render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
      <SpeciesPhotoCarousel photos={photos} speciesName="Kantarell" sizes={sizes} />
    </NextIntlClientProvider>
  );
}

describe('SpeciesPhotoCarousel', () => {
  it('viser hovedbildet straks, med de bredere utgavene nettleseren kan velge', () => {
    rendrer([bilde({ srcSet: SRCSET })]);
    const img = screen.getByRole('img', { name: 'Kantarell' });
    expect(img.getAttribute('src')).toBe(LAGRET);
    expect(img.getAttribute('srcset')).toBe(SRCSET);
    expect(img.getAttribute('sizes')).toBe('320px');
    // Sidens største element skal ikke vente på at noen ruller.
    expect(img.hasAttribute('loading')).toBe(false);
  });

  it('viser den lagrede utgaven alene når det ikke finnes bredere', () => {
    rendrer([bilde()]);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe(LAGRET);
    expect(img.hasAttribute('srcset')).toBe(false);
  });

  it('faller tilbake på den lagrede utgaven når en bredere ikke lar seg laste', () => {
    rendrer([bilde({ srcSet: SRCSET })]);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').hasAttribute('srcset')).toBe(false);
    expect(screen.getByRole('img').getAttribute('src')).toBe(LAGRET);
  });

  it('krediterer fotografen uansett hvilken bredde som vises', () => {
    rendrer([bilde({ srcSet: SRCSET })]);
    const kreditt = screen.getByText('Foto: Fotograf Eksempel (CC BY 3.0)');
    expect(kreditt.closest('a')?.getAttribute('href')).toBe('https://commons.wikimedia.org/wiki/File:Sopp.jpg');
    // Også etter at den bredere utgaven har feilet.
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByText('Foto: Fotograf Eksempel (CC BY 3.0)')).toBeTruthy();
  });

  it('sier ikke «1 bilde» under et enslig bilde', () => {
    for (const locale of ['nb', 'sv'] as const) {
      const { unmount } = rendrer([bilde()], locale);
      expect(screen.queryByText(/^1 bild/)).toBeNull();
      expect(screen.queryByRole('button')).toBeNull();
      unmount();
    }
  });

  it('teller og blar når det er flere bilder', () => {
    const andre = LAGRET.replace('Sopp', 'Annen');
    rendrer([
      bilde({ srcSet: SRCSET }),
      bilde({ id: 'bilde-2', image_url: andre, is_primary: false, photographer: 'Annen Eksempel', license: 'CC BY-SA 4.0' })
    ]);
    expect(screen.getByText('1 / 2 bilder')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Neste bilde' }));
    expect(screen.getByText('2 / 2 bilder')).toBeTruthy();
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe(andre);
    // Bilde to har ingen bredere utgaver — og arver ikke bilde éns.
    expect(img.hasAttribute('srcset')).toBe(false);
    // Krediteringen følger bildet som vises.
    expect(screen.getByText('Foto: Annen Eksempel (CC BY-SA 4.0)')).toBeTruthy();
    expect(screen.queryByText('Foto: Fotograf Eksempel (CC BY 3.0)')).toBeNull();
  });

  it('viser bildeteksten og bruker den som alt-tekst', () => {
    rendrer([bilde({ caption: 'Unge eksemplarer i mose' })]);
    expect(screen.getByText('Unge eksemplarer i mose')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Unge eksemplarer i mose' })).toBeTruthy();
  });

  it('sier fra når arten ikke har bilde', () => {
    rendrer([]);
    expect(screen.getByText('Ingen bilder enda')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });
});
