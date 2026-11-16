import type { SupabaseClient } from '@supabase/supabase-js';
import { AAPNE_RAPPORTSTATUSER } from '@/lib/moderation/moderering';
import { erManglendeTabell } from '@/lib/supabase/tabell-finnes';

/**
 * Åpne rapporter i forumet: hvor mange som venter på en avgjørelse, og når den
 * eldste kom inn. Én spørring, bare lesing.
 *
 * ── HVORFOR ─────────────────────────────────────────────────────────────────
 *
 * En melding om et farlig råd eller trakassering sa ikke fra til noen. Den lå
 * i `reports` til en moderator tilfeldigvis åpnet /forum/moderation, og Apple
 * (retningslinje 1.2) venter at meldinger behandles innen ett døgn. Dagsrap-
 * porten, kveldsvarselet (/api/cron/aapne-rapporter) og /admin leser derfor
 * tallet herfra, så de og konsollen aldri kan vise forskjellige tall.
 *
 * «Åpen» er `pending` OG `reviewed` (AAPNE_RAPPORTSTATUSER): «gjennomgått»
 * betyr sett, ikke avsluttet. /admin telte før bare `pending`, og da forsvant
 * en rapport fra tavla i det noen hadde sett på den — uten at innholdet var
 * verken skjult eller frikjent.
 *
 * Spørringen er den samme som moderasjonsruten bruker for banneret sitt
 * (src/app/api/admin/moderation/route.ts): tellingen i hodet på svaret, og
 * den eldste raden som eneste rad. Må kjøres med tjenesterollen — gjennom
 * RLS ser en vanlig bruker bare sine egne rapporter.
 *
 * Ingenting om HVA som er meldt eller HVEM som meldte leses her. Tallet og
 * alderen er alt rapporten trenger.
 */

export interface AapneRapporterInn {
  antall: number;
  /** `created_at` for den eldste åpne rapporten; null når ingen er åpne. */
  eldsteOpprettet: string | null;
}

export type AapneRapporterSvar =
  | { ok: true; aapne: AapneRapporterInn }
  /** `mangler` = tabellen finnes ikke (migrasjon ikke kjørt), ellers en vanlig feil. */
  | { ok: false; feil: string; mangler: boolean };

export async function hentAapneRapporter(db: Pick<SupabaseClient, 'from'>): Promise<AapneRapporterSvar> {
  try {
    const { data, count, error } = await db
      .from('reports')
      .select('created_at', { count: 'exact' })
      .in('status', [...AAPNE_RAPPORTSTATUSER])
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) return { ok: false, feil: error.message || 'ukjent feil', mangler: erManglendeTabell(error) };
    // Med count: 'exact' har et vellykket svar alltid et tall. Uten det vet vi
    // ikke — og «0 åpne» er det ene svaret som ikke får være en gjetning.
    if (typeof count !== 'number') return { ok: false, feil: 'svaret manglet telling', mangler: false };

    const eldste = (data as Array<{ created_at?: string | null }> | null)?.[0]?.created_at;
    return { ok: true, aapne: { antall: count, eldsteOpprettet: typeof eldste === 'string' ? eldste : null } };
  } catch (err) {
    // Dagsrapporten skal gå ut selv om denne ene lesingen kaster.
    return { ok: false, feil: err instanceof Error ? err.message : 'ukjent feil', mangler: false };
  }
}
