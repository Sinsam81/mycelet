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

// Kontrast mot WCAG AA (4,5:1) — merket er 12 px og ofte den eneste
// sikkerhetsinformasjonen på skjermen. Hvit tekst på amber-500 var 2,15:1, på
// orange-500 2,80:1 og på emerald-600 3,77:1. De to gule/oransje har derfor
// mørk tekst i stedet for en mørkere flate: en mørk oransje ville ligget for
// nær det røde «giftig». Låst i __tests__/edibility-badge-kontrast.test.ts.
export const edibilityBadgeClasses: Record<Edibility, string> = {
  edible: 'bg-emerald-700 text-white',
  conditionally_edible: 'bg-amber-400 text-amber-950',
  inedible: 'bg-orange-500 text-orange-950',
  toxic: 'bg-red-600 text-white',
  deadly: 'bg-red-900 text-white',
  unknown: 'bg-gray-500 text-white'
};

export function EdibilityBadge({ edibility }: EdibilityBadgeProps) {
  const t = useTranslations('EdibilityBadge');
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold shadow-sm', edibilityBadgeClasses[edibility])}>
      {t(labelKeys[edibility])}
    </span>
  );
}
