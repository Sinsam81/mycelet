'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { forumErrorMessage } from '@/lib/moderation/forum-errors';

/**
 * Oversatt feiltekst for en forumhandling: innholdsfilteret og «ikke innlogget»
 * får sine egne tekster, alt annet får `fallback` — aldri den rå feilmeldingen.
 */
export function useForumErrorMessage() {
  const t = useTranslations('ContentFilter');
  return useCallback(
    (error: unknown, fallback: string) =>
      forumErrorMessage(error, {
        fallback,
        prohibited: t('controlledSubstanceTrade'),
        notLoggedIn: t('notLoggedIn')
      }),
    [t]
  );
}
