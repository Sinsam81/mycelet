'use client';

import { Search } from 'lucide-react';

interface SpeciesSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function SpeciesSearch({ value, onChange }: SpeciesSearchProps) {
  return (
    <label className="relative block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Søk på norsk eller latinsk navn"
        className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm"
      />
    </label>
  );
}
