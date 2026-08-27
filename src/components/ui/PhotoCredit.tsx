'use client';

import { useTranslations } from 'next-intl';
import { buildPhotoCredit, type PhotoCreditSource } from '@/lib/utils/photo-credit';

/**
 * Diskret «Foto: {fotograf} ({lisens})» under et artsbilde.
 *
 * Artsbildene er Commons-filer under CC BY / CC BY-SA — lisenser som krever
 * navngiving der bildet vises. Teksten lenker til filsiden på Commons når vi
 * har den: det dekker kravet om lenke til kilden, og filsiden er der de fulle
 * vilkårene står.
 *
 * Rendrer INGENTING når vi ikke har ekte verdier (se buildPhotoCredit) — en
 * halv kreditering med plassholdere er verre enn ingen.
 */
export function PhotoCredit({
  photographer,
  license,
  sourceUrl,
  className = ''
}: PhotoCreditSource & { className?: string }) {
  const t = useTranslations('PhotoCredit');
  const credit = buildPhotoCredit({ photographer, license, sourceUrl });
  if (!credit) return null;

  // Eksplisitt greining i stedet for t(credit.shape.key, …): hver melding har
  // sitt eget sett parametere, og en dynamisk nøkkel skjuler en manglende
  // oversettelse til den står i produksjon.
  const text =
    credit.shape.key === 'full'
      ? t('full', credit.shape.values)
      : credit.shape.key === 'photographerOnly'
        ? t('photographerOnly', credit.shape.values)
        : t('licenseOnly', credit.shape.values);

  const classes = `text-[11px] leading-snug text-gray-500 ${className}`.trim();

  if (!credit.href) {
    return <p className={classes}>{text}</p>;
  }

  return (
    <p className={classes}>
      <a
        href={credit.href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-gray-700"
        title={t('sourceLinkTitle')}
      >
        {text}
      </a>
    </p>
  );
}
