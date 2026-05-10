import { cn } from '@/lib/utils/cn';
import { Edibility } from '@/types/species';

interface EdibilityBadgeProps {
  edibility: Edibility;
}

const labels: Record<Edibility, string> = {
  edible: 'Spiselig',
  conditionally_edible: 'Betinget spiselig',
  inedible: 'Uspiselig',
  toxic: 'Giftig',
  deadly: 'Dødelig giftig'
};

const classes: Record<Edibility, string> = {
  edible: 'bg-emerald-600 text-white',
  conditionally_edible: 'bg-amber-500 text-white',
  inedible: 'bg-orange-500 text-white',
  toxic: 'bg-red-600 text-white',
  deadly: 'bg-red-900 text-white'
};

export function EdibilityBadge({ edibility }: EdibilityBadgeProps) {
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm', classes[edibility])}>
      {labels[edibility]}
    </span>
  );
}
