'use client';

import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SpeciesSearchProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Søkefeltet i artsbiblioteket.
 *
 * Feltet hadde ikke noe tilgjengelig navn — <label> pakket bare inn et ikon, så
 * plassholderen var det eneste en skjermleser fikk — og ingen måte å tømme det
 * på uten å holde slettetasten inne. På telefon rettet autokorrektur dessuten
 * artsnavn til «nærmeste» vanlige ord og satte stor forbokstav.
 *
 * `type="search"` gir søketast på telefontastaturet og Escape-tømming på
 * skrivebord. Den innebygde tømmeknappen i WebKit/Blink skjules, ellers står
 * det to kryss i feltet (vårt eget virker også i Firefox, som ikke har noen).
 */
export function SpeciesSearch({ value, onChange }: SpeciesSearchProps) {
  const t = useTranslations('SpeciesSearch');
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Treffene oppdateres mens man skriver. «Søk» på telefontastaturet har
        // derfor bare én jobb: å legge vekk tastaturet så lista synes.
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
        placeholder={t('placeholder')}
        aria-label={t('label')}
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-11 text-sm [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          aria-label={t('clear')}
          // 44 × 44 px treffflate rundt et 16 px kryss, sentrert på feltet.
          className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-gray-500 hover:text-gray-800"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
