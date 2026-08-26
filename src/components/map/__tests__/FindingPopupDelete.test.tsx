// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FindingPopup } from '../FindingPopup';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Slette-veien i kartpopupen — den ENESTE slette-flaten i appen.
 *
 * Bakgrunn: fram til nå kunne ingen fjerne et feilregistrert funn. RLS tillot
 * det (migrasjon 001:333), men grensesnittet fantes ikke, så eneste utvei var
 * å slette hele kontoen.
 *
 * Testene låser de fire tingene som gjør flaten trygg:
 *  1. Knappen vises BARE på egne funn.
 *  2. Første trykk sletter ikke — det spør.
 *  3. «Avbryt» avbryter faktisk.
 *  4. En feil etterlater ikke popupen i «sletter …» for alltid.
 */

const finding = {
  id: '11111111-2222-3333-4444-555555555555',
  user_id: 'bruker-1',
  username: 'sopper',
  species_id: 1,
  norwegian_name: 'Kantarell',
  latin_name: 'Cantharellus cibarius',
  edibility: 'edible' as const,
  display_lat: 59.9,
  display_lng: 10.7,
  thumbnail_url: null,
  verification_status: 'unverified',
  found_at: '2026-08-15T10:00:00Z',
  quantity: null,
  notes: null,
  is_zone_finding: false,
  zone_label: null,
  zone_precision_km: null
};

function rendrer(props: Partial<React.ComponentProps<typeof FindingPopup>> = {}, locale = 'nb') {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={(locale === 'sv' ? sv : nb) as never}
      timeZone="Europe/Oslo"
    >
      <FindingPopup finding={finding} {...props} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe('FindingPopup — sletting', () => {
  it('viser ingen slette-knapp på en annens funn', () => {
    rendrer({ canDelete: false, onDelete: vi.fn() });
    expect(screen.queryByText('Slett funn')).toBeNull();
  });

  it('viser ingen slette-knapp uten en handling å kalle', () => {
    rendrer({ canDelete: true });
    expect(screen.queryByText('Slett funn')).toBeNull();
  });

  it('spør før den sletter — første trykk kaller ingenting', () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    rendrer({ canDelete: true, onDelete });

    fireEvent.click(screen.getByText('Slett funn'));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Slette dette funnet?')).toBeTruthy();
    // Angremuligheten skal stå der FØR klikket, ikke bare i varselet etterpå.
    expect(screen.getByText('Du kan angre rett etterpå.')).toBeTruthy();
  });

  it('sletter først på bekreftelsen, og sender funnets id', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    rendrer({ canDelete: true, onDelete });

    fireEvent.click(screen.getByText('Slett funn'));
    fireEvent.click(screen.getByText('Slett'));

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(finding.id));
  });

  it('avbryter uten å slette', () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    rendrer({ canDelete: true, onDelete });

    fireEvent.click(screen.getByText('Slett funn'));
    fireEvent.click(screen.getByText('Avbryt'));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Slett funn')).toBeTruthy();
  });

  it('viser feilen og lar brukeren prøve igjen når slettingen feiler', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Nettverket falt ut'));
    rendrer({ canDelete: true, onDelete });

    fireEvent.click(screen.getByText('Slett funn'));
    fireEvent.click(screen.getByText('Slett'));

    // Feilen skal stå der brukeren ser på, og knappen skal være tilbake —
    // ikke en popup låst i «sletter …».
    await waitFor(() => expect(screen.getByText('Nettverket falt ut')).toBeTruthy());
    expect(screen.getByText('Slett funn')).toBeTruthy();
  });

  it('er oversatt til svensk', () => {
    rendrer({ canDelete: true, onDelete: vi.fn() }, 'sv');
    fireEvent.click(screen.getByText('Radera fynd'));
    expect(screen.getByText('Radera det här fyndet?')).toBeTruthy();
  });
});
