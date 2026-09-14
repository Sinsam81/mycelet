// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProveLofteTekst } from '../ProveLofteTekst';
import type { ProveLofte } from '@/lib/billing/prove-lofte';

/**
 * Premium-knappene skal love gratisuka bare når butikken har sagt at den
 * finnes — samme regel som arket, så de to aldri motsier hverandre på samme
 * skjerm.
 */
let lofte: ProveLofte = { kjent: true, harProve: true, proveDager: 7, pris: null };

vi.mock('@/lib/hooks/useProveLofte', () => ({
  useProveLofte: () => lofte,
  hentProveLofte: vi.fn(),
  glemProveLofte: vi.fn()
}));

afterEach(cleanup);

describe('ProveLofteTekst', () => {
  it('med løfte når gratisuka finnes', () => {
    lofte = { kjent: true, harProve: true, proveDager: 7, pris: null };
    render(<ProveLofteTekst med="Prøv gratis i 7 dager" utenProve="Se Premium" />);
    expect(screen.getByText('Prøv gratis i 7 dager')).toBeTruthy();
  });

  it('uten løfte før butikken har svart', () => {
    lofte = { kjent: false };
    render(<ProveLofteTekst med="Prøv gratis i 7 dager" utenProve="Se Premium" />);
    expect(screen.getByText('Se Premium')).toBeTruthy();
    expect(screen.queryByText(/gratis/)).toBeNull();
  });

  it('uten løfte når butikken svarte nei', () => {
    lofte = { kjent: true, harProve: false, proveDager: null, pris: 'kr 79,00' };
    render(<ProveLofteTekst med="Prøv gratis i 7 dager" utenProve="Se Premium" />);
    expect(screen.getByText('Se Premium')).toBeTruthy();
  });
});
