'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SlidersHorizontal, X } from 'lucide-react';
import { activeFilterCount, type MapFilterState } from '@/lib/map/initial-filters';
import { LUKKEKNAPP_KLASSER } from '@/components/ui/useDialogFokus';
import { TREFF_44 } from './trykkflate';

// Typen og reglene for filtrene bor i src/lib/map/initial-filters.ts, der de
// har tester. Eksporteres videre herfra for dem som alt importerer den her.
export type { MapFilterState };

interface MapFiltersProps {
  filters: MapFilterState;
  onChange: (next: MapFilterState) => void;
  /**
   * Navnet på arten kartet er filtrert på, når det er kjent. Arket VISER
   * artsfilteret; det velges i søkefeltet øverst på kartet.
   *
   * Arket hadde før sitt eget artssøk og sitt eget stedssøk ved siden av det
   * felles søkefeltet. De skrev bare halve tilstanden: en art valgt her satte
   * id-en, men ikke navnet, så funn, fliser og registrerte funn ble filtrert
   * uten at noe på skjermen sa på hva — og det navnløse filteret ble husket
   * til neste besøk. «Nullstill art» her lot den grønne brikken og de lovende
   * områdene stå igjen for en art som ikke lenger filtrerte. Et sted valgt her
   * flyttet bare kartet: ingen værstripe, og en sen GPS-fiks dro kartet hjem
   * igjen. Nå finnes det ett søk, og arket har én vei ut av artsfilteret — den
   * samme som brikken bruker.
   */
  speciesName: string | null;
  /** Fjerner artsfilteret overalt: brikken, søketeksten, filteret og de lovende områdene. */
  onClearSpecies: () => void;
}

export function MapFilters({ filters, onChange, speciesName, onClearSpecies }: MapFiltersProps) {
  const t = useTranslations('MapFilters');
  const [open, setOpen] = useState(false);
  // Etikett og felt kobles uttrykkelig (htmlFor + id), ikke bare ved at
  // etiketten ligger rundt feltet: den uttalte koblingen er den hjelpemidler
  // leser sikrest. Krokene står før den tidlige returen under.
  const periodId = useId();
  const onlyMineId = useId();

  const activeCount = activeFilterCount(filters);

  // Collapsed: a small chip so the map stays the hero. Tap to reveal filters.
  //
  // Knappen ser fortsatt 36 px ut, men treffflaten er 44 × 44 px (se
  // trykkflate.ts). Større kan den ikke tegnes: søkefeltet begynner 8 px til
  // høyre for den, og en 44 px bred knapp ville stått kant i kant med det.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('title')}
        className={`absolute left-3 top-3 z-[1000] inline-flex h-9 w-9 items-center justify-center gap-1.5 rounded-full bg-white/95 p-0 text-sm font-medium text-gray-800 shadow-lg backdrop-blur hover:bg-white sm:w-auto sm:justify-start sm:px-3 ${TREFF_44}`}
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span className="hidden sm:inline">{t('title')}</span>
        {activeCount > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-forest-100 px-1 text-center text-[10px] font-semibold text-forest-900 sm:static sm:px-1.5 sm:text-xs">{activeCount}</span>
        ) : null}
      </button>
    );
  }

  return (
    <div className="absolute inset-x-3 bottom-3 z-[1100] max-h-[calc(100%-1.5rem)] space-y-2 overflow-y-auto overscroll-contain rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur sm:bottom-auto sm:left-3 sm:right-auto sm:top-3 sm:w-80">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900">{t('title')}</p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-forest-100 px-2 py-1 text-xs font-medium text-forest-900">{t('activeCount', { count: activeCount })}</span>
          <button type="button" onClick={() => setOpen(false)} aria-label={t('closeFilters')} className={LUKKEKNAPP_KLASSER}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Raden er 44 px høy, så treffflaten til «Nullstill art» blir inne i
          den og ikke når opp i krysset rett over. */}
      {filters.speciesId ? (
        <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg bg-forest-50 px-2 py-1.5">
          <p className="min-w-0 truncate text-sm text-gray-900">
            {speciesName ? t('speciesFilter', { species: speciesName }) : t('speciesFilterUnnamed')}
          </p>
          <button
            type="button"
            onClick={onClearSpecies}
            className={`relative shrink-0 text-xs font-medium text-forest-800 underline ${TREFF_44}`}
          >
            {t('resetSpecies')}
          </button>
        </div>
      ) : null}

      <label htmlFor={periodId} className="block text-xs font-medium text-gray-700">
        {t('period')}
        <select
          id={periodId}
          value={filters.period}
          onChange={(event) => onChange({ ...filters, period: event.target.value as MapFilterState['period'] })}
          className="mt-1 h-11 w-full rounded-lg border border-gray-300 px-2 text-sm"
        >
          <option value="month">{t('periodMonth')}</option>
          <option value="3months">{t('periodThreeMonths')}</option>
          <option value="year">{t('periodYear')}</option>
          <option value="all">{t('periodAll')}</option>
        </select>
      </label>

      <label htmlFor={onlyMineId} className="flex min-h-[44px] items-center gap-2 text-sm text-gray-800">
        <input
          id={onlyMineId}
          type="checkbox"
          checked={filters.onlyMine}
          onChange={(event) => onChange({ ...filters, onlyMine: event.target.checked })}
        />
        {t('onlyMine')}
      </label>

      <p className="text-xs text-gray-600">{t('searchHint')}</p>
    </div>
  );
}
