/**
 * Sonevakta — et sone-funn får ikke bli stående offentlig med et punkt som
 * røper breddegraden.
 *
 * HVORFOR
 * Migrasjon 075 retter sone-ruta i triggeren set_display_location (filhodet i
 * supabase/migrations/075_sonerute_uten_breddegradslekkasje.sql). Den limes inn
 * for hånd, og koden kan ikke spørre databasen om den er kjørt. Men koden kan
 * SE resultatet: POST /api/findings får raden tilbake fra innsettingen, med
 * punktet triggeren stemplet. Er det ikke punktet 075 gir (sonerute.ts), står
 * den gamle triggeren fortsatt — og da er funnets eksakte breddegrad lesbar for
 * alle i det sekundet raden finnes.
 *
 * Da gjøres funnet privat med én gang. Privat går alltid, også med den gamle
 * triggeren: den grenen kommer før sone-grenen og tømmer display_*. Lykkes ikke
 * det, slettes raden. Et sone-funn med et røpende punkt skal aldri bli stående.
 *
 * Samme mønster som jittervakt.ts (snubletråden for 042): appen kan ikke se
 * migrasjonen, men den kan se hva den gjør. Vakta er en nødbrems til eieren har
 * limt inn 075; når punktet stemmer, gjør den ingenting.
 *
 * Gjelder bare sone-funn som ikke er private. Private funn har ikke noe punkt,
 * og vanlige funn stemples ikke av sone-grenen.
 */

import { stempletMed075, type LagretSonefunn } from './sonerute';

/** Kolonnene innsettingen må lese tilbake for at vakta skal kunne dømme. */
export const SONEVAKT_KOLONNER =
  'id, latitude, longitude, visibility, is_zone_finding, zone_precision_km, display_latitude, display_longitude';

/** Gjelder vakta for funnet slik det ble bedt lagret? */
export function sonevaktGjelder(funn: { isZoneFinding: boolean; visibility: string }): boolean {
  return funn.isZoneFinding === true && funn.visibility !== 'private';
}

/**
 * Det vakta trenger av Supabase-klienten. Bare eierens egen økt: begge kallene
 * er filtrert på user_id i tillegg til RLS.
 */
export interface SonevaktKlient {
  from(tabell: 'findings'): {
    update(verdier: { visibility: 'private' }): {
      eq(kolonne: 'id', verdi: string): {
        eq(kolonne: 'user_id', verdi: string): {
          select(kolonner: string): {
            maybeSingle(): PromiseLike<{
              data: { visibility?: string | null; display_latitude?: number | null; display_longitude?: number | null } | null;
              error: { code?: string; message?: string } | null;
            }>;
          };
        };
      };
    };
    delete(): {
      eq(kolonne: 'id', verdi: string): {
        eq(kolonne: 'user_id', verdi: string): {
          select(kolonner: 'id'): PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>;
        };
      };
    };
  };
}

export type SonevaktUtfall =
  /** Punktet er det 075 gir. Ingenting er gjort. */
  | { utfall: 'stemmer' }
  /** Punktet var ikke trygt; funnet er nå privat og har ikke noe offentlig punkt. */
  | { utfall: 'gjort_privat'; grunn: 'gammelt_stempel' | 'uleselig' }
  /** Privat lyktes ikke; raden er slettet. */
  | { utfall: 'slettet'; grunn: 'gammelt_stempel' | 'uleselig'; privatFeil: string | null }
  /** Verken privat eller sletting lyktes. Raden kan stå offentlig — logg som feil. */
  | { utfall: 'sto_igjen'; grunn: 'gammelt_stempel' | 'uleselig'; privatFeil: string | null; slettFeil: string | null };

function harTallfelter(rad: Partial<LagretSonefunn>): boolean {
  return (['latitude', 'longitude', 'zone_precision_km', 'display_latitude', 'display_longitude'] as const).every(
    (k) => typeof rad[k] === 'number' && Number.isFinite(rad[k])
  );
}

/**
 * Feilen som en kode som aldri er tom. supabase-js kaster ikke når et kall
 * feiler underveis (brudd, tidsavbrudd): postgrest-js svarer med
 * `error.code === ''` og årsaken i `message`, og et feilsvar uten JSON-kropp
 * gir `{ message: '' }`. Med `??` ble begge en tom streng, og en tom streng
 * telte som at kallet gikk — vakta svarte «gjort privat» mens raden sto
 * offentlig.
 */
function feilkode(error: { code?: string; message?: string }): string {
  return error.code || error.message || 'ukjent';
}

/** Det samme for en feil som faktisk ble kastet: aldri en tom streng. */
function kastetKode(feil: unknown): string {
  return (feil instanceof Error && feil.name) || 'kastet';
}

/**
 * Sjekk raden innsettingen ga tilbake, og gjør funnet privat (eller slett det)
 * når punktet ikke er 075 sitt. Kalles bare når sonevaktGjelder er sann.
 *
 * En rad som ikke kom lesbart tilbake (manglende eller ikke-numeriske felt),
 * behandles som et gammelt stempel: vi kan ikke stå inne for et punkt vi ikke
 * har sett.
 */
export async function sikreSonefunn(
  klient: SonevaktKlient,
  args: { id: string; userId: string; rad: Partial<LagretSonefunn> | null | undefined }
): Promise<SonevaktUtfall> {
  const rad = args.rad ?? {};
  const lesbar = harTallfelter(rad);
  if (lesbar && stempletMed075(rad as LagretSonefunn)) return { utfall: 'stemmer' };
  const grunn = lesbar ? 'gammelt_stempel' : 'uleselig';

  // Hvert steg regnes som gått bare når ingen feil er notert (null). Alt som
  // noteres, er en ikke-tom streng — se feilkode.
  let privatFeil: string | null = null;
  try {
    const { data, error } = await klient
      .from('findings')
      .update({ visibility: 'private' })
      .eq('id', args.id)
      .eq('user_id', args.userId)
      .select('visibility, display_latitude, display_longitude')
      .maybeSingle();
    // Privat er bare bekreftet når raden kom tilbake privat OG uten punkt.
    // Ingen rad tilbake betyr at oppdateringen ikke traff.
    if (error) privatFeil = feilkode(error);
    else if (!data) privatFeil = 'ingen_rad';
    else if (data.visibility !== 'private' || data.display_latitude != null || data.display_longitude != null)
      privatFeil = 'punkt_sto_igjen';
  } catch (feil) {
    privatFeil = kastetKode(feil);
  }
  if (privatFeil === null) return { utfall: 'gjort_privat', grunn };

  let slettFeil: string | null = null;
  try {
    // Med .select: en sletting som ikke traff noen rad, gir ingen feil — bare
    // en tom liste. Den skal ikke telle som slettet.
    const { data, error } = await klient
      .from('findings')
      .delete()
      .eq('id', args.id)
      .eq('user_id', args.userId)
      .select('id');
    if (error) slettFeil = feilkode(error);
    else if (!data || data.length === 0) slettFeil = 'ingen_rad';
  } catch (feil) {
    slettFeil = kastetKode(feil);
  }
  if (slettFeil === null) return { utfall: 'slettet', grunn, privatFeil };
  return { utfall: 'sto_igjen', grunn, privatFeil, slettFeil };
}
