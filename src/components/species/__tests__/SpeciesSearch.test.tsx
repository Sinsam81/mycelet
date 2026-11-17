// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { SpeciesSearch } from '../SpeciesSearch';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

/**
 * Søkefeltet i artsbiblioteket hadde ikke noe tilgjengelig navn (plassholderen
 * var alt en skjermleser fikk) og ingen måte å tømme det på. Og plassholderen
 * lovet for lite: søket finner nå svenske navn fra norsk side og omvendt.
 */

function rendrer(value: string, onChange = vi.fn(), locale: 'nb' | 'sv' = 'nb') {
  render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
      <SpeciesSearch value={value} onChange={onChange} />
    </NextIntlClientProvider>
  );
  return onChange;
}

afterEach(() => {
  cleanup();
});

describe('søkefeltet', () => {
  it('er et søkefelt med et navn, ikke bare en plassholder', () => {
    rendrer('');
    const felt = screen.getByRole('searchbox', { name: nb.SpeciesSearch.label });
    expect(felt.getAttribute('placeholder')).toBe(nb.SpeciesSearch.placeholder);
  });

  it('har navn og plassholder på svensk også', () => {
    rendrer('', vi.fn(), 'sv');
    const felt = screen.getByRole('searchbox', { name: sv.SpeciesSearch.label });
    expect(felt.getAttribute('placeholder')).toBe(sv.SpeciesSearch.placeholder);
  });

  it('lar ikke telefonen rette artsnavn eller sette stor forbokstav', () => {
    rendrer('');
    const felt = screen.getByRole('searchbox');
    expect(felt.getAttribute('autocapitalize')).toBe('none');
    expect(felt.getAttribute('autocorrect')).toBe('off');
    expect(felt.getAttribute('spellcheck')).toBe('false');
    expect(felt.getAttribute('enterkeyhint')).toBe('search');
  });

  it('melder hvert tastetrykk videre', () => {
    const onChange = rendrer('kan');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'kant' } });
    expect(onChange).toHaveBeenCalledWith('kant');
  });

  it('Enter legger vekk tastaturet (feltet mister fokus)', () => {
    rendrer('kantarell');
    const felt = screen.getByRole('searchbox');
    felt.focus();
    expect(document.activeElement).toBe(felt);
    fireEvent.keyDown(felt, { key: 'Enter' });
    expect(document.activeElement).not.toBe(felt);
  });
});

describe('tømmeknappen', () => {
  it('finnes ikke når feltet er tomt', () => {
    rendrer('');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('tømmer søket og gir fokus tilbake til feltet', () => {
    const onChange = rendrer('karljohan');
    const knapp = screen.getByRole('button', { name: nb.SpeciesSearch.clear });
    fireEvent.click(knapp);
    expect(onChange).toHaveBeenCalledWith('');
    expect(document.activeElement).toBe(screen.getByRole('searchbox'));
  });

  it('har svensk navn for svenske lesere', () => {
    rendrer('karljohan', vi.fn(), 'sv');
    expect(screen.getByRole('button', { name: sv.SpeciesSearch.clear })).toBeTruthy();
  });

  it('er en vanlig knapp, så Enter i et omsluttende skjema ikke tømmer søket', () => {
    rendrer('karljohan');
    expect(screen.getByRole('button').getAttribute('type')).toBe('button');
  });
});

describe('plassholderen lover det søket holder', () => {
  it('nevner alle tre navnetypene på begge språk', () => {
    expect(nb.SpeciesSearch.placeholder).toMatch(/norsk/);
    expect(nb.SpeciesSearch.placeholder).toMatch(/svensk/);
    expect(nb.SpeciesSearch.placeholder).toMatch(/latinsk/);
    expect(sv.SpeciesSearch.placeholder).toMatch(/svenskt/);
    expect(sv.SpeciesSearch.placeholder).toMatch(/norskt/);
    expect(sv.SpeciesSearch.placeholder).toMatch(/latinskt/);
  });
});
