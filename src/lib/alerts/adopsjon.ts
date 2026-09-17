/**
 * Kontoløse varselrader som hører til en konto vi nå kjenner.
 *
 * ── PROBLEMET ───────────────────────────────────────────────────────────────
 *
 * Varselet kan slås på to steder: i appen, som en rad med user_id, og gjennom
 * det kontoløse skjemaet på /soppvarsel (migrasjon 057), som en rad med
 * user_id NULL og en e-postadresse. De to unikhetsdomenene møtes aldri:
 * `unique (user_id, region)` gjelder kontoradene, `unique (lower(email),
 * region) where user_id is null` gjelder de andre.
 *
 * Tre av de fem som fulgte et område 17. september 2026 kom inn gjennom
 * skjemaet — ofte FØR de laget konto. For dem er resultatet at
 *
 *   1. appen ikke ser abonnementet (RLS slipper bare `auth.uid() = user_id`
 *      til, og NULL matcher aldri), så vi spør dem om å slå på noe de
 *      allerede har, og
 *   2. samme menneske står som to abonnenter i tallene.
 *
 * ── LØSNINGEN ───────────────────────────────────────────────────────────────
 *
 * Når en innlogget bruker leser eller endrer varselet sitt, setter vi user_id
 * på de kontoløse radene som bærer NØYAKTIG hens egen adresse (sammenlignet
 * trimmet og med små bokstaver). Adressen kommer fra `auth.getUser()`, aldri
 * fra forespørselen — en rad kan derfor ikke havne på feil konto.
 *
 * Kollisjon: har kontoen alt en rad for samme region, kan user_id ikke settes
 * (unikhetsindeksen), og da slås den kontoløse raden av i stedet — ett
 * abonnement, én e-post. Er kontoens egen rad avslått mens den kontoløse er
 * aktiv, skrus kontoens på: mennesket ER påmeldt, og etterpå kan hen se det og
 * skru det av i appen. Det er en sammenslåing, ikke en ny påmelding.
 *
 * ── HVA VI ALDRI ADOPTERER ──────────────────────────────────────────────────
 *
 * Ubekreftede rader (dobbel opt-in ikke fullført) og avmeldte rader. En
 * ubekreftet rad blir «bekreftet» i det øyeblikket den får en user_id —
 * utsendingen ser bare `(!user_id && !confirmed_at)` — og da ville en lesing
 * av profilen ha gjort noen til mottaker uten at de klikket noe. Avmeldte
 * rader er et nei vi ikke skal rulle tilbake. Begge blir liggende; blir raden
 * bekreftet senere, plukkes den opp ved neste lesing.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { logger as rotLogger } from '@/lib/log';

/** En kontoløs rad, slik ruta leser den. */
export interface KontolosVarselRad {
  id: string;
  /** Skal alltid være null her — tas med for å kunne avvise en rad som ikke er kontoløs. */
  user_id: string | null;
  email: string | null;
  region: string;
  active: boolean;
  confirmed_at: string | null;
}

/** Kontoens egne rader (alle regioner, aktive som avslåtte). */
export interface EgenVarselRad {
  id: string;
  region: string;
  active: boolean;
}

export interface Adopsjonsplan {
  /** Kontoløse rader som skal få user_id. */
  adopter: string[];
  /** Kontoløse rader som skal slås av (kontoen har alt en rad for regionen). */
  deaktiverKontolos: string[];
  /** Kontoens egne rader som skal skrus på igjen (den kontoløse var aktiv). */
  aktiverEgen: string[];
}

const TOM: Adopsjonsplan = { adopter: [], deaktiverKontolos: [], aktiverEgen: [] };

/** Adresser sammenlignes trimmet og med små bokstaver — og forlater aldri minnet. */
export function vaskEpost(e: string | null | undefined): string {
  return typeof e === 'string' ? e.trim().toLowerCase() : '';
}

export function planleggAdopsjon(args: {
  /** Den innloggede brukerens EGEN adresse, fra auth — aldri fra forespørselen. */
  brukerEpost: string | null | undefined;
  kontolose: readonly KontolosVarselRad[];
  egne: readonly EgenVarselRad[];
}): Adopsjonsplan {
  const min = vaskEpost(args.brukerEpost);
  // Uten en adresse å matche på finnes det ingen trygg kobling.
  if (!min) return { ...TOM };

  const egenPerRegion = new Map<string, EgenVarselRad>();
  for (const r of args.egne) if (!egenPerRegion.has(r.region)) egenPerRegion.set(r.region, r);

  const adopter = new Set<string>();
  const deaktiver = new Set<string>();
  const aktiver = new Set<string>();
  /** Regioner denne planen alt har tatt en rad for — én rad per region. */
  const tatt = new Set<string>();

  for (const rad of args.kontolose) {
    // Ikke kontoløs: hører allerede til noen, og skal aldri flyttes.
    if (rad.user_id !== null) continue;
    // NØYAKTIG samme adresse etter små bokstaver. Ingen ilike, ingen delmatch.
    if (vaskEpost(rad.email) !== min) continue;
    // Ubekreftet eller avmeldt: se filhodet.
    if (rad.confirmed_at === null || !rad.active) continue;

    const egen = egenPerRegion.get(rad.region);
    if (egen) {
      deaktiver.add(rad.id);
      if (!egen.active) aktiver.add(egen.id);
      continue;
    }
    if (tatt.has(rad.region)) {
      // Kan ikke skje med dagens unikhetsindeks, men to rader for samme region
      // ville ellers kollidert på unique(user_id, region) ved adopsjon.
      deaktiver.add(rad.id);
      continue;
    }
    tatt.add(rad.region);
    adopter.add(rad.id);
  }

  return { adopter: [...adopter], deaktiverKontolos: [...deaktiver], aktiverEgen: [...aktiver] };
}

export function erTomPlan(plan: Adopsjonsplan): boolean {
  return plan.adopter.length === 0 && plan.deaktiverKontolos.length === 0 && plan.aktiverEgen.length === 0;
}

/**
 * Kjører planen for én bruker. Kalles av /api/me/soppvarsel ved både lesing og
 * lagring.
 *
 * Admin-klienten er nødvendig: kontoløse rader har user_id NULL og er derfor
 * usynlige for sesjonsklienten uansett policy (migrasjon 057). Alle spørringer
 * er likevel snevret til NØYAKTIG denne brukerens egen adresse, og skrivingene
 * gjentar betingelsen (`is user_id null` + `eq email`), så en samtidig endring
 * ikke kan flytte en fremmed rad.
 *
 * Feilsikker som revisjonsloggen: mangler tjenestenøkkelen, eller feiler en
 * spørring, går den egentlige handlingen (lese eller slå på varselet) videre
 * som før. En advarsel i loggen, aldri en adresse.
 */
export async function adopterKontolosVarsler(args: {
  brukerId: string;
  brukerEpost: string | null | undefined;
  log?: Pick<typeof rotLogger, 'warn' | 'info'>;
}): Promise<Adopsjonsplan> {
  const log = args.log ?? rotLogger;
  const min = vaskEpost(args.brukerEpost);
  if (!min) return { ...TOM };

  try {
    const db = createAdminClient();

    // Kolonnen skrives alltid med små bokstaver (påmeldingsruta), og den unike
    // indeksen står på lower(email) — eq på små bokstaver er både riktig og
    // trygt. ilike med en adresse ville sluppet jokertegn inn i oppslaget.
    const [{ data: kontolose, error: kontolosErr }, { data: egne, error: egneErr }] = await Promise.all([
      db
        .from('alert_subscriptions')
        .select('id,user_id,email,region,active,confirmed_at')
        .is('user_id', null)
        .eq('email', min),
      db.from('alert_subscriptions').select('id,region,active').eq('user_id', args.brukerId)
    ]);
    if (kontolosErr || egneErr) {
      log.warn('varseladopsjon.lesing_feilet', { message: kontolosErr?.message ?? egneErr?.message });
      return { ...TOM };
    }

    const plan = planleggAdopsjon({
      brukerEpost: min,
      kontolose: (kontolose ?? []) as KontolosVarselRad[],
      egne: (egne ?? []) as EgenVarselRad[]
    });
    if (erTomPlan(plan)) return plan;

    if (plan.adopter.length > 0) {
      const { error } = await db
        .from('alert_subscriptions')
        .update({ user_id: args.brukerId })
        .in('id', plan.adopter)
        .is('user_id', null)
        .eq('email', min);
      if (error) log.warn('varseladopsjon.adopsjon_feilet', { message: error.message });
    }
    if (plan.deaktiverKontolos.length > 0) {
      const { error } = await db
        .from('alert_subscriptions')
        .update({ active: false })
        .in('id', plan.deaktiverKontolos)
        .is('user_id', null)
        .eq('email', min);
      if (error) log.warn('varseladopsjon.deaktivering_feilet', { message: error.message });
    }
    if (plan.aktiverEgen.length > 0) {
      const { error } = await db
        .from('alert_subscriptions')
        .update({ active: true })
        .in('id', plan.aktiverEgen)
        .eq('user_id', args.brukerId);
      if (error) log.warn('varseladopsjon.aktivering_feilet', { message: error.message });
    }

    // Tellinger, aldri adresser.
    log.info('varseladopsjon.utfort', {
      adoptert: plan.adopter.length,
      deaktivert: plan.deaktiverKontolos.length,
      aktivert: plan.aktiverEgen.length
    });
    return plan;
  } catch (e) {
    log.warn('varseladopsjon.hoppet_over', { message: e instanceof Error ? e.message : 'ukjent' });
    return { ...TOM };
  }
}
