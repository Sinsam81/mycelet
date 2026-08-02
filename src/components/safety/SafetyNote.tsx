'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';

/**
 * Kort forbehold + vei til /sikkerhet, til bruk på flater som viser
 * spiselighetsmerker uten å si hva merket faktisk betyr.
 *
 * Bakgrunnen: /species og /calendar var de to eneste stedene i appen som
 * listet «Spiselig» for dusinvis av arter uten ett ord om at merket gjelder
 * ARTEN korrekt bestemt — ikke soppen brukeren står med. Kalenderen er
 * dessuten den flaten som mest direkte sier «plukk denne nå» («Kantarell ·
 * Topp-sesong · Spiselig»). Fravær av advarsel må aldri kunne leses som en
 * trygghetserklæring, så noten hører hjemme der merkene vises.
 *
 * Teksten ligger i messages/{nb,sv}.json (namespace SafetyNote) og lenka til
 * soppkontroll løses per språk via Safety.controlName på /sikkerhet.
 */
export function SafetyNote({ className }: { className?: string }) {
  const t = useTranslations('SafetyNote');

  return (
    <p
      className={`flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 ${className ?? ''}`}
    >
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
      <span>
        {t('badgeMeansSpecies')}{' '}
        <Link href="/sikkerhet" className="font-semibold underline underline-offset-2">
          {t('readSafety')}
        </Link>
      </span>
    </p>
  );
}
