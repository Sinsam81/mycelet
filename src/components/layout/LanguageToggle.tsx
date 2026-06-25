'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Globe } from 'lucide-react';
import { setUserLocale } from '@/i18n/actions';
import { LOCALES, type Locale } from '@/i18n/config';

// Language switcher (Norsk / Svenska). Persists the choice in a cookie via a
// server action, then refreshes so the server re-renders in the new language.
export function LanguageToggle() {
  const locale = useLocale() as Locale;
  const t = useTranslations('Common');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const change = (next: Locale) => {
    if (next === locale || pending) return;
    startTransition(async () => {
      await setUserLocale(next);
      router.refresh();
    });
  };

  const labels: Record<Locale, string> = { nb: t('norwegian'), sv: t('swedish') };

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-0.5 text-sm">
      <Globe className="ml-1 h-3.5 w-3.5 text-gray-500" aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => change(l)}
          disabled={pending}
          aria-pressed={l === locale}
          className={`rounded-md px-2 py-1 font-medium transition disabled:opacity-60 ${
            l === locale ? 'bg-forest-800 text-white' : 'text-gray-700 hover:bg-gray-100'
          }`}
        >
          {labels[l]}
        </button>
      ))}
    </div>
  );
}
