// @vitest-environment jsdom
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useDialogFokus } from '../useDialogFokus';

/**
 * Dialogene hadde verken Escape, fokusflytt, fokusfelle eller fokus tilbake.
 * Disse testene låser de fire — og de to tingene som er lette å ødelegge:
 * at slettedialogen ikke kan lukkes midt i slettingen, og at bare det øverste
 * av to ark lukkes.
 */

afterEach(cleanup);

function Dialog({
  navn,
  onLukk,
  kanLukkes = true,
  tom = false
}: {
  navn: string;
  onLukk: () => void;
  kanLukkes?: boolean;
  tom?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogFokus(ref, { aapen: true, onLukk, kanLukkes });
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label={navn}>
      {tom ? null : (
        <>
          <button type="button">{navn} første</button>
          <input aria-label={`${navn} felt`} />
          <button type="button">{navn} siste</button>
        </>
      )}
    </div>
  );
}

function Side({ kanLukkes = true, onLukk }: { kanLukkes?: boolean; onLukk?: () => void }) {
  const [aapen, setAapen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAapen(true)}>
        Åpne
      </button>
      <button type="button">Bak</button>
      {aapen ? (
        <Dialog
          navn="A"
          kanLukkes={kanLukkes}
          onLukk={() => {
            onLukk?.();
            setAapen(false);
          }}
        />
      ) : null}
    </>
  );
}

function aapne() {
  const knapp = screen.getByText('Åpne');
  knapp.focus();
  fireEvent.click(knapp);
  return knapp;
}

describe('useDialogFokus', () => {
  it('flytter fokus til panelet — ikke til et felt, som ville dratt opp tastaturet', () => {
    render(<Side />);
    aapne();
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('lukker på Escape og gir fokus tilbake til knappen som åpnet', () => {
    const onLukk = vi.fn();
    render(<Side onLukk={onLukk} />);
    const knapp = aapne();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onLukk).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(knapp);
  });

  it('lar Escape være når dialogen ikke kan lukkes (sletting pågår)', () => {
    const onLukk = vi.fn();
    render(<Side kanLukkes={false} onLukk={onLukk} />);
    aapne();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onLukk).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('holder Tab inne i panelet, begge veier', () => {
    render(<Side />);
    aapne();
    const forste = screen.getByText('A første');
    const siste = screen.getByText('A siste');

    // Fra panelet går Shift+Tab til siste, ikke ut i siden bak.
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(siste);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(forste);

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(siste);
  });

  it('henter fokus inn igjen når det har havnet bak dialogen', () => {
    render(<Side />);
    aapne();
    screen.getByText('Bak').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('A første'));
  });

  it('lar Tab gå sin vanlige gang midt i panelet', () => {
    render(<Side />);
    aapne();
    screen.getByText('A første').focus();
    const hendelse = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(hendelse);
    expect(hendelse.defaultPrevented).toBe(false);
  });

  it('holder fokus på panelet når det ikke har noe å fokusere', () => {
    render(<Dialog navn="Tom" tom onLukk={() => {}} />);
    const hendelse = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(hendelse);
    expect(hendelse.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('lukker bare det øverste av to ark', () => {
    const lukkUnder = vi.fn();
    const lukkOver = vi.fn();
    function To() {
      const [over, setOver] = useState(true);
      return (
        <>
          <Dialog navn="Under" onLukk={lukkUnder} />
          {over ? (
            <Dialog
              navn="Over"
              onLukk={() => {
                lukkOver();
                setOver(false);
              }}
            />
          ) : null}
        </>
      );
    }
    render(<To />);
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Over' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(lukkOver).toHaveBeenCalledTimes(1);
    expect(lukkUnder).not.toHaveBeenCalled();
    // Fokus går tilbake til arket under, som nå er det øverste.
    expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Under' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(lukkUnder).toHaveBeenCalledTimes(1);
  });

  it('gir ikke fokus tilbake til et tekstfelt (iOS-tastaturet skal ikke opp igjen)', () => {
    function MedFelt() {
      const [aapen, setAapen] = useState(false);
      return (
        <>
          <input aria-label="søk" onKeyDown={(e) => e.key === 'Enter' && setAapen(true)} />
          {aapen ? <Dialog navn="A" onLukk={() => setAapen(false)} /> : null}
        </>
      );
    }
    render(<MedFelt />);
    const felt = screen.getByLabelText('søk');
    felt.focus();
    fireEvent.keyDown(felt, { key: 'Enter' });
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).not.toBe(felt);
  });
});
