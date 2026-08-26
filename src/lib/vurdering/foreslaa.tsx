'use client';

import { isNativePlatform } from '@/lib/native/platform';
import { burdeSporre, merkSomHandtert } from './vurdering';

interface CapacitorMedInAppReview {
  isPluginAvailable?: (navn: string) => boolean;
  Plugins?: { InAppReview?: { requestReview?: () => Promise<void> } };
}

/**
 * Be om en App Store-vurdering på et gyllent øyeblikk — via APPLES EGEN
 * dialog (SKStoreReviewController gjennom @capacitor-community/in-app-review),
 * aldri en egen prompt.
 *
 * ⚠️ Retningslinje 5.6.1 forbyr egne vurderingsprompter («we will disallow
 * custom review prompts»). Første utkast her var en egen toast med
 * write-review-lenke — kontrollpanelet stoppet den før den nådde prod.
 * Systemdialogen er den eneste lovlige uoppfordrede formen; en write-review-
 * LENKE er kun lov som brukerinitiert element (profilsiden har en).
 *
 * Reglene (lib/vurdering): kun appskallet, kun etter at brukeren fullførte
 * noe verdifullt, og maks ÉN forespørsel noensinne per enhet — merket i det
 * forespørselen faktisk sendes. Kjører brukeren en binær uten plugin
 * (bygg ≤4), gjør kallet ingenting og merker INGENTING, så øyeblikket
 * overlever til appen er oppdatert. Apples API bestemmer selv om dialogen
 * faktisk vises (maks 3/år, kan slås av av brukeren).
 */
export function foreslaaVurdering(): void {
  if (typeof window === 'undefined') return;
  if (!burdeSporre(isNativePlatform(), window.localStorage)) return;

  const cap = (window as { Capacitor?: CapacitorMedInAppReview }).Capacitor;
  if (!cap?.isPluginAvailable?.('InAppReview')) return;

  merkSomHandtert('vist', window.localStorage);
  // Liten pust etter suksessmeldingen brukeren nettopp fikk.
  window.setTimeout(() => {
    cap.Plugins?.InAppReview?.requestReview?.().catch(() => {
      // Feiler dialogen, feiler den stille — aldri i et suksessøyeblikk.
    });
  }, 2200);
}
