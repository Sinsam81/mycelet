'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface SpeciesSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function SpeciesSearch({ value, onChange }: SpeciesSearchProps) {
  const t = useTranslations('SpeciesSearch');

  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('placeholder')}
        className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm"
      />
    </label>
  );
}
