// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { SkjulNarFolger } from '../SkjulNarFolger';
import { FOLGER_OMRADE_EVENT, meldFolgerOmrade, useFolgerOmrade } from '../folger-omrade-hendelse';

/**
 * «Slå på soppvarsel» sto igjen rett under «Du følger Oslo»: blokka er tegnet
 * på serveren og visste ikke om trykket. Innpakningen tar den bort i det
 * stripa i forsidekortet melder fra.
 */

afterEach(cleanup);

describe('SkjulNarFolger', () => {
  it('viser innholdet til brukeren følger et område — og tar det da bort for godt', () => {
    render(
      <SkjulNarFolger>
        <p>Slå på soppvarsel</p>
      </SkjulNarFolger>
    );
    expect(screen.getByText('Slå på soppvarsel')).toBeTruthy();

    act(() => meldFolgerOmrade());
    expect(screen.queryByText('Slå på soppvarsel')).toBe(null);
  });

  it('andre hendelser rører det ikke', () => {
    render(
      <SkjulNarFolger>
        <p>Slå på soppvarsel</p>
      </SkjulNarFolger>
    );
    act(() => {
      window.dispatchEvent(new Event('mycelet:forsidekort-klar'));
    });
    expect(screen.getByText('Slå på soppvarsel')).toBeTruthy();
  });
});

describe('useFolgerOmrade', () => {
  it('serverens svar gjelder fra første tegning', () => {
    expect(renderHook(() => useFolgerOmrade(true)).result.current).toBe(true);
    expect(renderHook(() => useFolgerOmrade(false)).result.current).toBe(false);
  });

  it('blir sann av hendelsen, og slutter å lytte når komponenten er borte', () => {
    const { result, unmount } = renderHook(() => useFolgerOmrade(false));
    act(() => {
      window.dispatchEvent(new Event(FOLGER_OMRADE_EVENT));
    });
    expect(result.current).toBe(true);
    unmount();
    // Ingen lytter igjen som kan sette tilstand på en avmontert komponent.
    expect(() => meldFolgerOmrade()).not.toThrow();
  });
});
