// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { PhotoCredit } from '../PhotoCredit';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Artsbildene er Wikimedia Commons-filer under CC BY / CC BY-SA. De lisensene
 * krever at fotograf og lisens navngis der bildet vises — appen brukte 72
 * bilder uten å oppfylle vilkårene for noen av dem.
 *
 * Den viktigste testen her er den siste: linja skal være HELT taus for rader
 * som ennå ikke er etterfylt. Seedingen skrev `license = 'Wikimedia Commons'`,
 * og rendret rått ville artssiden påstått at bildet er lisensiert under
 * «Wikimedia Commons» — en falsk lisenspåstand, verre enn ingen linje.
 */

afterEach(cleanup);

function rendrer(props: Parameters<typeof PhotoCredit>[0], locale: 'nb' | 'sv' = 'nb') {
  return render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'nb' ? nb : sv) as never} timeZone="Europe/Oslo">
      <PhotoCredit {...props} />
    </NextIntlClientProvider>
  );
}

describe('PhotoCredit', () => {
  it('navngir fotograf og lisens', () => {
    rendrer({ photographer: 'Holger Krisp', license: 'CC BY 3.0' });
    expect(screen.getByText('Foto: Holger Krisp (CC BY 3.0)')).toBeTruthy();
  });

  it('lenker til filsiden på Commons — kravet om lenke til kilden', () => {
    rendrer({
      photographer: 'Alan Rockefeller',
      license: 'CC BY-SA 4.0',
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Galerina.jpg'
    });
    const lenke = screen.getByRole('link');
    expect(lenke.getAttribute('href')).toBe('https://commons.wikimedia.org/wiki/File:Galerina.jpg');
    // Krysslenke ut av appen: uten noopener får målsiden en window.opener-referanse.
    expect(lenke.getAttribute('rel')).toContain('noopener');
  });

  it('sier «ukjent fotograf» når Commons ikke har forfatter — ikke ingenting', () => {
    // Seks av bildene våre har CC-lisens uten maskinlesbar forfatter.
    // Lisensen er fortsatt en opplysning brukeren har krav på.
    rendrer({ photographer: null, license: 'CC BY-SA 3.0' });
    expect(screen.getByText('Foto: ukjent fotograf (CC BY-SA 3.0)')).toBeTruthy();
  });

  it('har teksten på svensk også', () => {
    rendrer({ photographer: null, license: 'CC BY-SA 3.0' }, 'sv');
    expect(screen.getByText('Foto: okänd fotograf (CC BY-SA 3.0)')).toBeTruthy();
  });

  it('er helt taus for rader som ennå ikke er etterfylt', () => {
    // Ingen tekst, ingen tom linje, ingen «Foto: ()».
    const { container } = rendrer({ photographer: null, license: 'Wikimedia Commons' });
    expect(container.textContent).toBe('');
    cleanup();
    const tom = rendrer({ photographer: null, license: null });
    expect(tom.container.textContent).toBe('');
  });

  it('lager ikke lenke av en kilde som ikke er http(s)', () => {
    rendrer({ photographer: 'Kari', license: 'CC BY 4.0', sourceUrl: 'javascript:alert(1)' });
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Foto: Kari (CC BY 4.0)')).toBeTruthy();
  });
});
