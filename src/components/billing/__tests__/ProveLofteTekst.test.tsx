// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ProveLofteTekst } from '../ProveLofteTekst';
import type { ProveLofte } from '@/lib/billing/prove-lofte';

/**
 * Knappene skal love gratisuka bare når butikken har sagt at den finnes på
 * planen knappen gjelder — samme regel som arket, så de to aldri motsier
 * hverandre på samme skjerm. Standardplanen er sesongpasset (dit alle
 * knappene leder); tekster som navngir Premium spør om Premium.
 */
const PASS = { plan: 'season_pass' as const, harProve: true, proveDager: 7, pris: '249 kr' };
const MAANED = { plan: 'premium' as const, harProve: true, proveDager: 7, pris: '99 kr' };
let lofte: ProveLofte = { kjent: true, season_pass: PASS, premium: MAANED };

vi.mock('@/lib/hooks/useProveLofte', () => ({
  useProveLofte: () => lofte,
  hentProveLofte: vi.fn(),
  glemProveLofte: vi.fn()
}));

afterEach(cleanup);

describe('ProveLofteTekst', () => {
  it('med løfte når gratisuka finnes på passet', () => {
    lofte = { kjent: true, season_pass: PASS, premium: MAANED };
    render(<ProveLofteTekst med="Prøv Sesongpass gratis" utenProve="Se Sesongpass og Premium" />);
    expect(screen.getByText('Prøv Sesongpass gratis')).toBeTruthy();
  });

  it('uten løfte før butikken har svart', () => {
    lofte = { kjent: false };
    render(<ProveLofteTekst med="Prøv Sesongpass gratis" utenProve="Se Sesongpass og Premium" />);
    expect(screen.getByText('Se Sesongpass og Premium')).toBeTruthy();
    expect(screen.queryByText(/gratis/)).toBeNull();
  });

  it('uten løfte når passet mangler gratisuka — selv om Premium har en (App Store i dag)', () => {
    lofte = { kjent: true, season_pass: { ...PASS, harProve: false, proveDager: null }, premium: MAANED };
    render(<ProveLofteTekst med="Prøv Sesongpass gratis" utenProve="Se Sesongpass og Premium" />);
    expect(screen.getByText('Se Sesongpass og Premium')).toBeTruthy();
  });

  it('en tekst som navngir Premium spør om Premium-tilbudet', () => {
    lofte = { kjent: true, season_pass: { ...PASS, harProve: false, proveDager: null }, premium: MAANED };
    render(<ProveLofteTekst plan="premium" med="Prøv Premium gratis i 7 dager" utenProve="Premium-verktøy" />);
    expect(screen.getByText('Prøv Premium gratis i 7 dager')).toBeTruthy();
  });

  it('uten løfte når butikken svarte uten tilbud', () => {
    lofte = { kjent: true, season_pass: null, premium: null };
    render(<ProveLofteTekst med="Prøv Sesongpass gratis" utenProve="Se Sesongpass og Premium" />);
    expect(screen.getByText('Se Sesongpass og Premium')).toBeTruthy();
  });
});
