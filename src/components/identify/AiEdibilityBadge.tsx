import { useTranslations } from 'next-intl';
import { EdibilityBadge } from '@/components/ui/EdibilityBadge';
import { normalizeEdibility } from '@/lib/utils/edibility';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';

/**
 * Spiselighetsmerket for et AI-FORSLAG — det eneste merket som skal stå ved
 * siden av en art bildegjenkjenningen har foreslått.
 *
 * Bevisst asymmetri, og kjernen i hele identifiseringsflyten:
 *
 * Et AI-forslag sier «bildet ligner på denne arten», ikke «dette ER denne
 * arten». Da er de to utfallene ikke likeverdige:
 *
 *   • En ADVARSEL er nyttig selv når arts-ID-en er feil. Får du vite at noe i
 *     dette landskapet av forslag er dødelig, skjerper du deg — det er riktig
 *     respons uansett.
 *   • Et GRØNT «spiselig» er skadelig når arts-ID-en er feil. Det er nettopp
 *     da folk blir forgiftet.
 *
 * Derfor: alt som IKKE er en invitasjon til å spise beholder det tydelige
 * merket — giftig, dødelig, uspiselig og ukjent. (Ukjent må være med:
 * normalizeEdibility gjør alt ukjent om til 'unknown', og SafetyWarning
 * behandler det allerede som farlig.) Bare de to spiselige klassene mister
 * stempelet sitt; de får en nøytral «ikke matvurdert»-merking, og spiselighet
 * leses på artssiden, der dataene er kuraterte og arten er valgt av et menneske.
 *
 * Merk at predikatet er isRecommendableSpecies, ikke isHazardSpecies:
 * sistnevnte dekker bare giftig/dødelig, og ville gitt «ikke matvurdert» til
 * ukjente arter — for mykt.
 *
 * Regelen bodde først bare i IdentifyResult. Forvekslingskortet («Ditt
 * forslag») og historikklista brukte et rått EdibilityBadge og stemplet det
 * samme forslaget grønt — derfor én komponent, brukt alle tre stedene, og
 * edibility-asymmetry.test.ts leser alle kildene.
 *
 * Ingen 'use client' og ingen andre hooks enn useTranslations: historikklista
 * (/identifiseringer) er en serverkomponent — samme mønster som EdibilityBadge.
 */
export function AiEdibilityBadge({ edibility }: { edibility: string | null | undefined }) {
  const t = useTranslations('IdentifyResult');
  if (!isRecommendableSpecies(edibility)) {
    return <EdibilityBadge edibility={normalizeEdibility(edibility)} />;
  }
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 ring-1 ring-inset ring-gray-300">
      {t('notFoodAssessed')}
    </span>
  );
}
