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
  edible: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  conditionally_edible: 'bg-amber-100 text-amber-800 border-amber-200',
  inedible: 'bg-orange-100 text-orange-800 border-orange-200',
  toxic: 'bg-red-100 text-red-800 border-red-200',
  deadly: 'bg-red-900 text-white border-red-950'
};

export function EdibilityBadge({ edibility }: EdibilityBadgeProps) {
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-1 text-xs font-semibold', classes[edibility])}>
      {labels[edibility]}
    </span>
  );
}
