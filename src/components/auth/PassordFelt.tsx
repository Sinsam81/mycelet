'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface PassordFeltProps {
  label: string;
  value: string;
  onChange: (verdi: string) => void;
  /** 'current-password' ved innlogging, 'new-password' ved registrering og nytt passord. */
  autoComplete: 'current-password' | 'new-password';
  minLength?: number;
}

/**
 * Passordfelt med «vis passord».
 *
 * Registreringen har ett passordfelt, og en tastefeil der ble først oppdaget
 * etter runden Mail → Safari → appen. Med knappen kan brukeren se hva som
 * står før innsending.
 *
 * text-base (16 px) er med vilje: iOS zoomer inn på felt med mindre skrift
 * når de får fokus, og zoomer ikke ut igjen.
 */
export function PassordFelt({ label, value, onChange, autoComplete, minLength }: PassordFeltProps) {
  const t = useTranslations('AuthPassord');
  const id = useId();
  const [synlig, setSynlig] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-800">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={synlig ? 'text' : 'password'}
          required
          minLength={minLength}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-12 text-base"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setSynlig((v) => !v)}
          aria-pressed={synlig}
          aria-label={synlig ? t('hide') : t('show')}
          title={synlig ? t('hide') : t('show')}
          className="absolute inset-y-0 right-0 flex min-h-[44px] w-11 items-center justify-center rounded-r-lg text-gray-600 hover:text-forest-800"
        >
          {synlig ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
