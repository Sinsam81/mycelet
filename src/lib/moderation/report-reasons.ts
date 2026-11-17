import type { ReportReason } from '@/types/forum';

/**
 * Meldegrunnene i den rekkefølgen de står i nedtrekket, med nøkkelen for den
 * oversatte teksten i `ReportButton`-navnerommet.
 *
 * Én liste, fordi grunnen vises to steder: der brukeren melder (ReportButton)
 * og der moderatoren leser meldingen (moderasjonskonsollen og «Mine
 * rapporter»). De to siste viste den rå databaseverdien («dangerous_advice»)
 * fordi tekstene bare fantes inne i knappen.
 *
 * Må holdes i takt med `reports_reason_check`
 * (supabase/migrations/031_report_reasons_illegal_content.sql).
 */
export const REPORT_REASONS: ReadonlyArray<{ value: ReportReason; labelKey: string }> = [
  { value: 'spam', labelKey: 'reasonSpam' },
  { value: 'inappropriate', labelKey: 'reasonInappropriate' },
  { value: 'misinformation', labelKey: 'reasonMisinformation' },
  { value: 'dangerous_advice', labelKey: 'reasonDangerousAdvice' },
  { value: 'harassment', labelKey: 'reasonHarassment' },
  { value: 'illegal_content', labelKey: 'reasonIllegalContent' },
  { value: 'controlled_substances', labelKey: 'reasonControlledSubstances' },
  { value: 'privacy', labelKey: 'reasonPrivacy' },
  { value: 'protected_species', labelKey: 'reasonProtectedSpecies' },
  { value: 'sale', labelKey: 'reasonSale' },
  { value: 'other', labelKey: 'reasonOther' }
];

const LABEL_KEY = new Map<string, string>(REPORT_REASONS.map((r) => [r.value, r.labelKey]));

/**
 * Nøkkelen i `ReportButton`-navnerommet for en meldegrunn, eller null når
 * verdien er ukjent (en grunn lagt til i databasen før koden) — kallstedet
 * viser da råverdien heller enn en tom linje.
 */
export function reportReasonLabelKey(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return LABEL_KEY.get(reason) ?? null;
}
