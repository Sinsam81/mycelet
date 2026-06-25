import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Edibility } from '@/types/species';

interface EdibilityBadgeProps {
  edibility: Edibility;
}

const labelKeys: Record<Edibility, string> = {
  edible: 'edible',
  conditionally_edible: 'conditionallyEdible',
  inedible: 'inedible',
  toxic: 'toxic',
  deadly: 'deadly',
  unknown: 'unknown'
};

const classes: Record<Edibility, string> = {
  edible: 'bg-emerald-600 text-white',
  conditionally_edible: 'bg-amber-500 text-white',
  inedible: 'bg-orange-500 text-white',
  toxic: 'bg-red-600 text-white',
  deadly: 'bg-red-900 text-white',
  unknown: 'bg-gray-500 text-white'
};

export function EdibilityBadge({ edibility }: EdibilityBadgeProps) {
  const t = useTranslations('EdibilityBadge');
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm', classes[edibility])}>
      {t(labelKeys[edibility])}
    </span>
  );
}
