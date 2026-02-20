'use client';

import { ForumCategory } from '@/types/forum';

interface CategoryFilterProps {
  value: ForumCategory;
  onChange: (category: ForumCategory) => void;
}

const options: Array<{ label: string; value: ForumCategory }> = [
  { label: 'Alle', value: null },
  { label: 'Funn', value: 'find' },
  { label: 'Spørsmål', value: 'question' },
  { label: 'Tips', value: 'tip' },
  { label: 'Diskusjon', value: 'discussion' }
];

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
              active ? 'bg-forest-800 text-white' : 'bg-white text-gray-800 border border-gray-300'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
