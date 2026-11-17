// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { StedetsFunn } from '../StedetsFunn';
import type { FunnIKort } from '@/lib/findings/mine-funn';
import nb from '../../../../messages/nb.json';

/**
 * Lenka fra kartets popup: `/mine-steder?funn=<id>` åpner stedet med funnet
 * og markerer det, så eieren kan endre deling eller notat med en gang.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

const A = '11111111-2222-3333-4444-555555555555';
const B = '66666666-7777-8888-9999-000000000000';

function funn(over: Partial<FunnIKort> = {}): FunnIKort {
  return {
    id: A,
    artsnavn: 'Kantarell',
    datoTekst: '12. sep. 2026',
    deling: 'private',
    soneNavn: null,
    soneKm: 5,
    notat: null,
    bilde: null,
    aapnesTidligst: null,
    ...over
  };
}

const TO_FUNN = [funn(), funn({ id: B, artsnavn: 'Steinsopp' })];

function rendrer(apneFunnId: string | null) {
  return render(
    <NextIntlClientProvider locale="nb" messages={nb as never} timeZone="Europe/Oslo">
      <StedetsFunn funn={TO_FUNN} angrefristDager={30} apneFunnId={apneFunnId} />
    </NextIntlClientProvider>
  );
}

afterEach(cleanup);

describe('StedetsFunn — åpnet fra kartet', () => {
  it('står åpent med funnet markert og i fokus når lenka peker på et funn her', () => {
    rendrer(B);
    expect(screen.getByRole('button', { name: 'Skjul funnene' }).getAttribute('aria-expanded')).toBe('true');
    const rad = screen.getByText('Steinsopp').closest('li') as HTMLLIElement;
    expect(rad.getAttribute('aria-current')).toBe('true');
    expect(document.activeElement).toBe(rad);
    // Bare det ene funnet er markert.
    expect((screen.getByText('Kantarell').closest('li') as HTMLLIElement).getAttribute('aria-current')).toBeNull();
    // Handlingene er der med en gang.
    expect(screen.getAllByRole('button', { name: nb.MineSteder.changeSharing })).toHaveLength(2);
  });

  it('er lukket som før når lenka peker på et funn under et annet sted', () => {
    rendrer('99999999-0000-0000-0000-000000000000');
    expect(screen.getByRole('button', { name: 'Vis funnene (2)' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('er lukket som før uten lenke', () => {
    rendrer(null);
    expect(screen.getByRole('button', { name: 'Vis funnene (2)' }).getAttribute('aria-expanded')).toBe('false');
  });
});
