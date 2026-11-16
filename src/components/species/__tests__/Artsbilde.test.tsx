// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Artsbilde } from '../Artsbilde';

/**
 * Artssiden ber Commons om bredere utgaver av bildene enn de som er lagret.
 * De er avledet av URL-en, ikke lagret — så denne komponenten er sikringen:
 * lar en bredere utgave seg ikke laste, skal leseren få bildet som alltid har
 * virket, ikke et knust bildeikon.
 */

afterEach(cleanup);

const LAGRET = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Sopp.jpg/330px-Sopp.jpg';
const BRED = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Sopp.jpg/500px-Sopp.jpg';
const SRCSET = `${LAGRET} 330w, ${BRED} 500w, ${BRED.replace('500px', '960px')} 960w`;

describe('Artsbilde med srcset (hovedbildet)', () => {
  it('tilbyr nettleseren bredere utgaver, med den lagrede som src', () => {
    render(<Artsbilde src={LAGRET} srcSet={SRCSET} sizes="320px" alt="Kantarell" />);
    const bilde = screen.getByRole('img', { name: 'Kantarell' });
    expect(bilde.getAttribute('src')).toBe(LAGRET);
    expect(bilde.getAttribute('srcset')).toBe(SRCSET);
    expect(bilde.getAttribute('sizes')).toBe('320px');
    expect(bilde.getAttribute('decoding')).toBe('async');
    // Hovedbildet er sidens største element: lastes straks.
    expect(bilde.hasAttribute('loading')).toBe(false);
  });

  it('dropper hele srcset-lista når utgaven nettleseren valgte ikke lar seg laste', () => {
    render(<Artsbilde src={LAGRET} srcSet={SRCSET} sizes="320px" alt="Kantarell" />);
    fireEvent.error(screen.getByRole('img'));
    const bilde = screen.getByRole('img');
    // Å bytte bare src holder ikke: nettleseren fortsetter å velge fra srcset.
    expect(bilde.hasAttribute('srcset')).toBe(false);
    expect(bilde.hasAttribute('sizes')).toBe(false);
    expect(bilde.getAttribute('src')).toBe(LAGRET);
    expect(bilde.getAttribute('alt')).toBe('Kantarell');
  });

  it('prøver de bredere utgavene på nytt for neste bilde', () => {
    const { rerender } = render(<Artsbilde src={LAGRET} srcSet={SRCSET} alt="Bilde 1" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').hasAttribute('srcset')).toBe(false);

    const neste = LAGRET.replace('Sopp', 'Annen');
    const nesteSett = `${neste} 330w, ${neste.replace('330px', '960px')} 960w`;
    rerender(<Artsbilde src={neste} srcSet={nesteSett} alt="Bilde 2" />);
    expect(screen.getByRole('img').getAttribute('srcset')).toBe(nesteSett);
  });

  it('setter ikke sizes uten srcset', () => {
    render(<Artsbilde src={LAGRET} sizes="320px" alt="Kantarell" />);
    const bilde = screen.getByRole('img');
    expect(bilde.hasAttribute('srcset')).toBe(false);
    expect(bilde.hasAttribute('sizes')).toBe(false);
  });
});

describe('Artsbilde med reserve (forvekslingskortene)', () => {
  it('viser den bredere utgaven, lat, og bytter til den lagrede når den feiler', () => {
    render(<Artsbilde src={BRED} reserve={LAGRET} alt="Falsk kantarell" loading="lazy" className="h-full w-full" />);
    const bilde = screen.getByRole('img');
    expect(bilde.getAttribute('src')).toBe(BRED);
    expect(bilde.getAttribute('loading')).toBe('lazy');
    expect(bilde.getAttribute('decoding')).toBe('async');
    expect(bilde.className).toBe('h-full w-full');

    fireEvent.error(bilde);
    const etter = screen.getByRole('img');
    expect(etter.getAttribute('src')).toBe(LAGRET);
    expect(etter.getAttribute('loading')).toBe('lazy');
    expect(etter.className).toBe('h-full w-full');
  });

  it('har ingenting å falle tilbake på når reserven er samme bilde', () => {
    render(<Artsbilde src={LAGRET} reserve={LAGRET} alt="Brunskrubb" loading="lazy" />);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').getAttribute('src')).toBe(LAGRET);
  });
});

describe('bildet som feilet før siden ble levende', () => {
  // Siden er server-rendret. Feiler bildet før React har koblet på onError,
  // kommer hendelsen aldri — komponenten må se det selv når den monteres.
  function medFerdigLastetBilde(naturalWidth: number, test: () => void) {
    const complete = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'complete');
    const bredde = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'naturalWidth');
    Object.defineProperty(HTMLImageElement.prototype, 'complete', { configurable: true, get: () => true });
    Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => naturalWidth });
    try {
      test();
    } finally {
      if (complete) Object.defineProperty(HTMLImageElement.prototype, 'complete', complete);
      if (bredde) Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', bredde);
    }
  }

  it('faller tilbake når bildet er ferdig lastet uten bredde', () => {
    medFerdigLastetBilde(0, () => {
      render(<Artsbilde src={LAGRET} srcSet={SRCSET} alt="Kantarell" />);
      expect(screen.getByRole('img').hasAttribute('srcset')).toBe(false);
      expect(screen.getByRole('img').getAttribute('src')).toBe(LAGRET);
      cleanup();

      render(<Artsbilde src={BRED} reserve={LAGRET} alt="Falsk kantarell" loading="lazy" />);
      expect(screen.getByRole('img').getAttribute('src')).toBe(LAGRET);
    });
  });

  it('lar et bilde som er lastet i fred', () => {
    medFerdigLastetBilde(960, () => {
      render(<Artsbilde src={LAGRET} srcSet={SRCSET} alt="Kantarell" />);
      expect(screen.getByRole('img').getAttribute('srcset')).toBe(SRCSET);
    });
  });

  it('lar et bilde som ikke har begynt å laste i fred', () => {
    // jsdom laster ikke bilder: complete er false, som for et lat bilde
    // nedenfor skjermen i en nettleser.
    render(<Artsbilde src={BRED} reserve={LAGRET} alt="Falsk kantarell" loading="lazy" />);
    expect(screen.getByRole('img').getAttribute('src')).toBe(BRED);
  });
});
