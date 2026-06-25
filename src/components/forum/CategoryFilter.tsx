'use client';

import { useTranslations } from 'next-intl';

import { ForumCategory } from '@/types/forum';

interface CategoryFilterProps {
  value: ForumCategory;
  onChange: (category: ForumCategory) => void;
}

const options: Array<{ key: string; value: ForumCategory }> = [
  { key: 'all', value: null },
  { key: 'find', value: 'find' },
  { key: 'question', value: 'question' },
  { key: 'tip', value: 'tip' },
  { key: 'discussion', value: 'discussion' }
];

export function CategoryFilter({ value, onChange }: CategoryFilterProps) {
  const t = useTranslations('CategoryFilter');

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
              active ? 'bg-forest-800 text-white' : 'bg-white text-gray-800 border border-gray-300'
            }`}
          >
            {t(option.key)}
          </button>
        );
      })}
    </div>
  );
}
