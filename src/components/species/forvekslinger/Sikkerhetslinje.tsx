import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/**
 * Den faste sikkerhetslinja i forvekslingstreneren.
 *
 * Den står to steder med NØYAKTIG samme ordlyd: øverst på siden, og under
 * kjennetegnene i hver avsløring — der leseren nettopp har fått «riktig» eller
 * «feil» om en giftig sopp, og linja øverst for lengst er rullet ut av skjermen
 * på en telefon. Ordlyden er ikke opp til kallstedet: den ligger i én melding
 * (Forvekslingstrener.sikkerhetslinje) og sier tre ting som alltid skal med —
 * et bilde er aldri nok, kjennetegnene må sjekkes på soppen selv, og treneren
 * vurderer ikke en sopp du har funnet.
 *
 * Uten 'use client' med vilje: komponenten brukes både av serversiden og av
 * klientkomponenten, og useTranslations virker begge steder.
 */
export function Sikkerhetslinje({ className }: { className?: string }) {
  const t = useTranslations('Forvekslingstrener');

  return (
    <p
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900',
        className
      )}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <span>
        {t('sikkerhetslinje')}{' '}
        <Link href="/sikkerhet" className="font-semibold underline underline-offset-2">
          {t('sikkerhetLenke')}
        </Link>
      </span>
    </p>
  );
}
