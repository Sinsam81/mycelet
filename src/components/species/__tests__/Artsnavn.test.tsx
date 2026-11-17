// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Artsnavn, ORDBLOKK_KLASSER } from '../Artsnavn';

/**
 * Artsnavnet deles ord for ord i inline-blokker som aldri er bredere enn linja.
 * jsdom og renderToString har ingen layout, så testen låser oppbygningen og
 * klassene — selve brytingen er målt i Chrome og WebKit (se komponenten).
 */

const blokk = (ord: string) => `<span class="${ORDBLOKK_KLASSER}">${ord}</span>`;

describe('Artsnavn', () => {
  it('ett langt ord blir én ordblokk som kan deles, ikke stikke ut', () => {
    expect(renderToStaticMarkup(<Artsnavn navn="Snøballsjampinjong" />)).toBe(
      `<span>${blokk('Snøballsjampinjong')}</span>`
    );
    expect(ORDBLOKK_KLASSER.split(' ')).toEqual(
      expect.arrayContaining(['inline-block', 'max-w-full', 'break-words', 'hyphens-auto'])
    );
  });

  it('flere ord: én blokk per ord, med vanlig mellomrom mellom', () => {
    // hyphens-auto på hele navnet fikk Safari til å dele ord som bare kunne
    // flyttet seg («Rødnende flue-sopp»); per ord flyttes ordet helt ned først.
    expect(renderToStaticMarkup(<Artsnavn navn="  Rødnende   fluesopp " />)).toBe(
      `<span>${blokk('Rødnende')} ${blokk('fluesopp')}</span>`
    );
  });

  it('teksten er fortsatt hele navnet, så lenker og knapper rundt heter det samme', () => {
    const div = document.createElement('div');
    div.innerHTML = renderToStaticMarkup(<Artsnavn navn="Bleklodden steinsopp" />);
    expect(div.textContent).toBe('Bleklodden steinsopp');
  });

  it('elementtype og typografi kommer fra kallstedet', () => {
    expect(renderToStaticMarkup(<Artsnavn as="h3" navn="Kantarell" className="font-serif text-base" />)).toBe(
      `<h3 class="font-serif text-base">${blokk('Kantarell')}</h3>`
    );
  });
});
