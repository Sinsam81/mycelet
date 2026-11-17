// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ToTrinnsSletting } from '../ToTrinnsSletting';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * «Slett» på et lagret offline-område og «Tøm kartcachen» sletter nedlastede
 * kart, som ikke kan hentes igjen uten dekning. Første trykk skal spørre.
 */

afterEach(cleanup);

function rendrer(onBekreft = vi.fn()) {
  render(
    <ToTrinnsSletting
      etikett={nb.MushroomMap.delete}
      sporsmal="Slette kartet for «Nordmarka»?"
      bekreft={nb.MushroomMap.deleteAreaConfirmYes}
      avbryt={nb.MushroomMap.confirmCancel}
      onBekreft={onBekreft}
      knappKlasser="knapp"
    />
  );
  return onBekreft;
}

describe('ToTrinnsSletting', () => {
  it('første trykk sletter ingenting — det spør', () => {
    const onBekreft = rendrer();
    fireEvent.click(screen.getByRole('button', { name: nb.MushroomMap.delete }));
    expect(onBekreft).not.toHaveBeenCalled();
    expect(screen.getByText('Slette kartet for «Nordmarka»?')).toBeTruthy();
  });

  it('«Avbryt» avbryter og gir knappen tilbake', () => {
    const onBekreft = rendrer();
    fireEvent.click(screen.getByRole('button', { name: nb.MushroomMap.delete }));
    fireEvent.click(screen.getByRole('button', { name: nb.MushroomMap.confirmCancel }));
    expect(onBekreft).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: nb.MushroomMap.delete })).toBeTruthy();
  });

  it('sletter først på bekreftelsen, og står ikke låst etterpå', async () => {
    const onBekreft = rendrer(vi.fn().mockResolvedValue(undefined));
    fireEvent.click(screen.getByRole('button', { name: nb.MushroomMap.delete }));
    fireEvent.click(screen.getByRole('button', { name: nb.MushroomMap.deleteAreaConfirmYes }));
    expect(onBekreft).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByRole('button', { name: nb.MushroomMap.delete })).toBeTruthy());
  });

  it('har tekstene på begge språk, og sier at kartet ikke kan hentes uten dekning', () => {
    for (const katalog of [nb, sv]) {
      const m = katalog.MushroomMap;
      for (const k of ['deleteAreaConfirm', 'deleteAreaConfirmYes', 'clearTileCacheConfirm', 'clearTileCacheConfirmYes', 'confirmCancel'] as const) {
        expect(m[k], k).toBeTruthy();
      }
      expect(m.deleteAreaConfirm).toContain('{name}');
    }
    expect(nb.MushroomMap.clearTileCacheConfirm).toMatch(/uten dekning/);
    expect(sv.MushroomMap.clearTileCacheConfirm).toMatch(/utan täckning/);
  });
});

describe('kobling i kartet', () => {
  // __dirname, ikke new URL(…, import.meta.url): under jsdom er den ikke en fil-URL.
  const KILDE = readFileSync(resolve(__dirname, '..', 'MushroomMap.tsx'), 'utf8');

  it('verken «Slett» på et område eller «Tøm kartcachen» kaller slettingen direkte', () => {
    expect(KILDE).not.toContain('onClick={() => void deleteSavedArea(area.id)}');
    expect(KILDE).not.toContain('onClick={() => void clearTileCache()}');
    expect(KILDE).toContain('onBekreft={() => deleteSavedArea(area.id)}');
    expect(KILDE).toContain('onBekreft={clearTileCache}');
  });
});
