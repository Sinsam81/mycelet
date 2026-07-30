'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { FileText, Mail, ShieldAlert } from 'lucide-react';
import { LEGAL_ENTITY, entityMessageValues } from '@/lib/legal/entity';

/**
 * Terms, privacy policy and contact details, reachable from inside the app.
 *
 * Two App Store requirements land here:
 *  - Schedule 2 § 3.8(b): links to the privacy policy and terms of use must be
 *    accessible WITHIN the application, not only on the website.
 *  - Guideline 1.2: apps with user-generated content must publish contact
 *    information so a reviewer (and a user) can reach the developer.
 *
 * Before this, the only in-app link to either document was inside the cookie
 * banner, which disappears once dismissed — so in the shipped app there was
 * effectively no way to find them.
 *
 * The operator block reads from src/lib/legal/entity.ts, so it follows the
 * planned ENK → AS conversion like the legal pages do.
 */
export function LegalLinks() {
  const t = useTranslations('LegalLinks');
  const locale = useLocale();
  const entity = entityMessageValues(locale);

  const links = [
    { href: '/vilkar', label: t('terms'), icon: FileText },
    { href: '/kjopsvilkar', label: t('purchaseTerms'), icon: FileText },
    { href: '/personvern', label: t('privacy'), icon: FileText },
    { href: '/sikkerhet', label: t('safety'), icon: ShieldAlert },
    { href: '/datakilder', label: t('sources'), icon: FileText }
  ];

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3">
      <h2 className="mb-2 font-semibold text-forest-900">{t('title')}</h2>

      <ul className="space-y-1">
        {links.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className="flex items-center gap-2 rounded-lg px-1 py-1.5 text-sm text-gray-800 hover:bg-gray-50 hover:text-forest-900"
            >
              <Icon className="h-4 w-4 shrink-0 text-gray-400" />
              {label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t border-gray-100 pt-3 text-xs leading-relaxed text-gray-600">
        <p className="flex items-start gap-2">
          <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>{t('contactBody', entity)}</span>
        </p>
        <p className="mt-2 text-gray-500">
          {t('operatorLabel')}: {LEGAL_ENTITY.legalName} (org.nr. {LEGAL_ENTITY.orgNr})
          {LEGAL_ENTITY.postalAddress ? `, ${LEGAL_ENTITY.postalAddress}` : ''}
          {LEGAL_ENTITY.phone ? `, ${LEGAL_ENTITY.phone}` : ''}
        </p>
      </div>
    </div>
  );
}
