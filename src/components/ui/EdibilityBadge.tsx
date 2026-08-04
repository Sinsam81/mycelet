import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Edibility } from '@/types/species';

interface EdibilityBadgeProps {
  edibility: Edibility;
}

const labelKeys: Record<Edibility, string> = {
  edible: 'edible',
  // ⚠️ Etiketten SKAL bære advarselen, ikke bare si at et vilkår finnes.
  //
  // Sto som «Betinget spiselig». Det forteller at det er en betingelse, men ikke
  // hva den er — og alle sju artene i denne klassen har notater som sier «rå er
  // den giftig», «må kokes minst 15 min» eller «må forvelles».
  //
  // Problemet er HVOR notatet vises: bare på artsdetaljsiden. Målt 2026-08-04 er
  // `edibility_notes` fraværende i artslista, i kalenderen (SeasonNow og
  // YearTable) og i AI-resultatet — altså på skjermen der noen står med soppen i
  // hånda og skal bestemme seg. Der sto det gule merket helt alene.
  //
  // «Spiselig — giftig rå» sier begge deler på to sekunder: den KAN spises, og
  // rå vil den skade deg. Detaljene står fortsatt i notatet på artssiden.
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
