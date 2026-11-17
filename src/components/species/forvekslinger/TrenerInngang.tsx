import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronRight } from 'lucide-react';

/**
 * Inngangen til forvekslingstreneren fra artsbiblioteket.
 *
 * Egen komponent med egne meldinger (Forvekslingstrener.inngang*), så
 * biblioteksiden bare trenger én linje for å vise den. Foreløpig er dette den
 * eneste veien inn: bunnmenyen og forsiden er bevisst urørt.
 */
export function TrenerInngang() {
  const t = useTranslations('Forvekslingstrener');

  return (
    <Link
      href="/species/forvekslinger"
      className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-forest-200 bg-forest-50 px-4 py-3 text-forest-900 transition hover:border-forest-600"
    >
      <span>
        <span className="block text-sm font-semibold">{t('inngangTittel')}</span>
        <span className="block text-xs text-forest-800">{t('inngangTekst')}</span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-forest-700" aria-hidden="true" />
    </Link>
  );
}
