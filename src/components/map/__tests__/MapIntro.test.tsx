// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { MapIntro } from '../MapIntro';

/**
 * Introen på kartet er en dialog, ikke et slør med en boks oppå.
 *
 * Den manglet rolle, navn, Escape og all fokushåndtering: en skjermleser fikk
 * fire løse linjer mens kartet bak fortsatt lot seg nå, og fokus ble stående
 * bak sløret.
 */

function Side({ onLukk, locale = 'nb' }: { onLukk?: () => void; locale?: 'nb' | 'sv' }) {
  const [aapen, setAapen] = useState(false);
  return (
    <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
      <button type="button" onClick={() => setAapen(true)}>
        Åpne
      </button>
      <button type="button">Bak sløret</button>
      {aapen ? (
        <MapIntro
          onLukk={() => {
            onLukk?.();
            setAapen(false);
          }}
        />
      ) : null}
    </NextIntlClientProvider>
  );
}

function aapne() {
  const knapp = screen.getByText('Åpne');
  knapp.focus();
  fireEvent.click(knapp);
  return knapp;
}

afterEach(cleanup);

describe('MapIntro', () => {
  it('er en modal dialog med overskriften som navn', () => {
    render(<Side />);
    aapne();
    const dialog = screen.getByRole('dialog', { name: nb.MushroomMap.introTitle });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(nb.MushroomMap.introTitle);
  });

  it('flytter fokus inn i dialogen når den åpnes', () => {
    render(<Side />);
    aapne();
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).not.toBe(document.body);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('lukker på Escape og gir fokus tilbake til det som hadde det', () => {
    const onLukk = vi.fn();
    render(<Side onLukk={onLukk} />);
    const knapp = aapne();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onLukk).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(knapp);
  });

  it('holder Tab inne i dialogen — kartet bak skal ikke kunne nås', () => {
    render(<Side />);
    aapne();
    const skjonner = screen.getByRole('button', { name: nb.MushroomMap.introGotIt });
    skjonner.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(skjonner);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(skjonner);
    expect(document.activeElement).not.toBe(screen.getByText('Bak sløret'));
  });

  it('«Skjønner!» lukker', () => {
    const onLukk = vi.fn();
    render(<Side onLukk={onLukk} />);
    aapne();
    fireEvent.click(screen.getByRole('button', { name: nb.MushroomMap.introGotIt }));
    expect(onLukk).toHaveBeenCalledTimes(1);
  });

  it('et trykk på sløret lukker, et trykk i boksen gjør det ikke', () => {
    const onLukk = vi.fn();
    render(<Side onLukk={onLukk} />);
    aapne();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('heading'));
    expect(onLukk).not.toHaveBeenCalled();
    fireEvent.click(dialog);
    expect(onLukk).toHaveBeenCalledTimes(1);
  });

  it('knappen er minst 44 px høy, og boksen ruller når den er høyere enn kartet', () => {
    render(<Side />);
    aapne();
    const knapp = screen.getByRole('button', { name: nb.MushroomMap.introGotIt });
    expect(knapp.className).toContain('min-h-[44px]');
    // jsdom har ingen layout, så dette er klassene som gir oppførselen.
    const boks = screen.getByRole('heading').parentElement!;
    expect(boks.className.split(' ')).toEqual(expect.arrayContaining(['max-h-full', 'overflow-y-auto']));
    // Det er boksen som har fokus som ruller, så piltastene ruller den.
    expect(document.activeElement).toBe(boks);
  });

  it('«Skjønner!» står fast nederst når boksen ruller — knappen skal aldri ligge under kanten', () => {
    render(<Side />);
    aapne();
    const fot = screen.getByRole('button', { name: nb.MushroomMap.introGotIt }).parentElement!;
    expect(fot.className.split(' ')).toEqual(expect.arrayContaining(['sticky', 'bottom-0', 'bg-white']));
    expect(fot.parentElement).toBe(screen.getByRole('heading').parentElement);
  });

  it('svensk: samme dialog på svensk', () => {
    const onLukk = vi.fn();
    render(<Side onLukk={onLukk} locale="sv" />);
    aapne();
    const dialog = screen.getByRole('dialog', { name: sv.MushroomMap.introTitle });
    expect(dialog.textContent).toContain('Satellit');
    fireEvent.click(within(dialog).getByRole('button', { name: sv.MushroomMap.introGotIt }));
    expect(onLukk).toHaveBeenCalledTimes(1);
  });
});

describe('kartet bruker dialogen', () => {
  // MushroomMap.tsx lastes ikke av noen test (Leaflet + DOM), derfor en kildevakt.
  // __dirname, ikke new URL(…, import.meta.url): under jsdom er den ikke en fil-URL.
  const KILDE = readFileSync(resolve(__dirname, '../MushroomMap.tsx'), 'utf8');

  it('viser MapIntro, og lukkingen husker at introen er sett', () => {
    expect(KILDE).toContain('{showIntro ? <MapIntro onLukk={dismissIntro} /> : null}');
    const lukking = KILDE.slice(KILDE.indexOf('const dismissIntro = useCallback('), KILDE.indexOf('const dismissIntro = useCallback(') + 200);
    expect(lukking).toContain('setShowIntro(false)');
    expect(lukking).toContain("writeLocal('mycelet:map-intro-v1', '1')");
  });

  it('har ikke lenger sitt eget slør uten rolle', () => {
    expect(KILDE).not.toContain("t('introTitle')");
    expect(KILDE).not.toContain("t('introGotIt')");
    // Sløret var kartets eneste element som dekket hele flata.
    expect(KILDE).not.toMatch(/absolute inset-0 z-\[1100\]/);
  });
});
