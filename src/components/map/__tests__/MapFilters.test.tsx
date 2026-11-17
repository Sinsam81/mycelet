// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';
import { MapFilters, type MapFilterState } from '../MapFilters';

/**
 * Filterarket VISER artsfilteret; det velger det ikke.
 *
 * Arket hadde et eget artssøk og et eget stedssøk ved siden av det felles
 * søkefeltet øverst på kartet. Arten valgt her satte bare id-en: funn, fliser
 * og registrerte funn ble filtrert uten at noe på skjermen sa på hva, og
 * «Nullstill art» lot brikken «Lovende steder for …» og de lovende områdene
 * stå igjen. Stedet valgt her flyttet bare kartet, uten værstripe, og en sen
 * GPS-fiks dro det hjem igjen.
 */

const UTEN_ART: MapFilterState = { speciesId: null, period: 'month', onlyMine: false };
const MED_ART: MapFilterState = { speciesId: 3, period: 'month', onlyMine: false };

function rendrer(
  props: Partial<React.ComponentProps<typeof MapFilters>> = {},
  locale: 'nb' | 'sv' = 'nb'
) {
  const onChange = vi.fn();
  const onClearSpecies = vi.fn();
  render(
    <NextIntlClientProvider locale={locale} messages={(locale === 'sv' ? sv : nb) as never} timeZone="Europe/Oslo">
      <MapFilters filters={UTEN_ART} onChange={onChange} speciesName={null} onClearSpecies={onClearSpecies} {...props} />
    </NextIntlClientProvider>
  );
  return { onChange, onClearSpecies };
}

const aapne = (navn = 'Filtre') => fireEvent.click(screen.getByRole('button', { name: new RegExp(navn) }));

afterEach(cleanup);

describe('MapFilters', () => {
  it('har ingen egne søkefelt — art og sted velges i søkefeltet på kartet', () => {
    rendrer();
    aapne();
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText('Art og sted velger du i søkefeltet øverst på kartet.')).toBeTruthy();
    // Det arket eier, står igjen.
    expect(screen.getByLabelText('Periode')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Kun mine funn' })).toBeTruthy();
  });

  it('viser hvilken art kartet er filtrert på', () => {
    rendrer({ filters: MED_ART, speciesName: 'Kantarell' });
    aapne();
    expect(screen.getByText('Art: Kantarell')).toBeTruthy();
  });

  it('sier fra om artsfilteret også før navnet er kjent', () => {
    rendrer({ filters: MED_ART, speciesName: null });
    aapne();
    expect(screen.getByText('Kartet er filtrert på én art')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Nullstill art' })).toBeTruthy();
  });

  it('«Nullstill art» går samme vei som brikken — ikke en egen, halv nullstilling', () => {
    const { onChange, onClearSpecies } = rendrer({ filters: MED_ART, speciesName: 'Kantarell' });
    aapne();
    fireEvent.click(screen.getByRole('button', { name: 'Nullstill art' }));
    expect(onClearSpecies).toHaveBeenCalledTimes(1);
    // Arket rører ikke speciesId selv: da ble brikken og de lovende områdene stående.
    expect(onChange).not.toHaveBeenCalled();
  });

  it('uten artsfilter vises verken artslinja eller nullstillingen', () => {
    rendrer();
    aapne();
    expect(screen.queryByRole('button', { name: 'Nullstill art' })).toBeNull();
    expect(screen.queryByText(/^Art:/)).toBeNull();
  });

  it('artsfilteret teller på filterknappen, så det synes også når arket er lukket', () => {
    rendrer({ filters: MED_ART, speciesName: 'Kantarell' });
    expect(screen.getByRole('button', { name: /Filtre/ }).textContent).toContain('1');
  });

  it('periode og «Kun mine funn» endres som før, og tar artsfilteret med videre', () => {
    const { onChange } = rendrer({ filters: MED_ART, speciesName: 'Kantarell' });
    aapne();
    fireEvent.change(screen.getByLabelText('Periode'), { target: { value: 'year' } });
    expect(onChange).toHaveBeenLastCalledWith({ speciesId: 3, period: 'year', onlyMine: false });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Kun mine funn' }));
    expect(onChange).toHaveBeenLastCalledWith({ speciesId: 3, period: 'month', onlyMine: true });
  });

  it('kobler etikett og felt uttrykkelig — htmlFor og id, ikke bare ved at etiketten ligger rundt', () => {
    rendrer();
    aapne();
    const periode = screen.getByLabelText('Periode');
    const mine = screen.getByRole('checkbox', { name: 'Kun mine funn' });
    for (const felt of [periode, mine]) {
      expect(felt.id).not.toBe('');
      expect(felt.closest('label')?.getAttribute('for')).toBe(felt.id);
    }
    expect(periode.id).not.toBe(mine.id);
  });

  it('svensk: samme innhold på svensk', () => {
    const { onClearSpecies } = rendrer({ filters: MED_ART, speciesName: 'Kantarell' }, 'sv');
    aapne('Filter');
    expect(screen.getByText('Art: Kantarell')).toBeTruthy();
    expect(screen.getByText('Art och plats väljer du i sökfältet högst upp på kartan.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Återställ art' }));
    expect(onClearSpecies).toHaveBeenCalledTimes(1);
  });
});
