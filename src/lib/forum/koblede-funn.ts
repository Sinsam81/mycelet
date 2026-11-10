import type { SupabaseClient } from '@supabase/supabase-js';
import type { ForumPost } from '@/types/forum';

/**
 * «Koblet funn» på et foruminnlegg, hentet gjennom maskeringslaget.
 *
 * Innleggene hentet tidligere funnet med et embed rett fra `findings`
 * (`finding:finding_id(...)`). Siden migrasjon 015 kan bare eieren lese sine
 * egne rader der, så PostgREST ga `finding: null` til alle andre: forfatteren
 * så linja «Koblet funn: kantarell • Sone: …», ingen andre gjorde det, og
 * forfatteren kunne ikke vite det.
 *
 * `public_findings` er viewet all offentlig lesing skal gå gjennom. Det slipper
 * bare ut funn som er offentlige eller omtrentlige, ikke negative og ikke
 * slettet — et privat funn gir derfor ingen linje for noen, forfatteren
 * medregnet. Det er riktig og likt for alle.
 *
 * Kolonnelista er med vilje smal: ingen koordinater (heller ikke de maskerte),
 * ikke notat, stedsnavn eller hvem som eier funnet. Innlegget trenger art og
 * sone, ingenting mer. Viewet har heller ikke `species_name_override` (fritekst
 * fra brukeren, som notatet), så et funn uten art fra artslista vises som
 * «ukjent art».
 */
export const KOBLET_FUNN_KOLONNER = 'id,species_id,norwegian_name,is_zone_finding,zone_label,zone_precision_km';

type KobletFunn = NonNullable<ForumPost['finding']>;

interface OffentligFunnRad {
  id: string;
  species_id: number | null;
  norwegian_name: string | null;
  is_zone_finding: boolean | null;
  zone_label: string | null;
  zone_precision_km: number | null;
}

interface ArtRad {
  id: number;
  norwegian_name: string | null;
  swedish_name: string | null;
}

export async function hentKobledeFunn<T extends { finding_id?: string | null }>(
  supabase: Pick<SupabaseClient, 'from'>,
  posts: T[]
): Promise<Array<T & { finding: KobletFunn | null }>> {
  const ids = Array.from(new Set(posts.map((post) => post.finding_id).filter((id): id is string => Boolean(id))));
  const utenFunn = () => posts.map((post) => ({ ...post, finding: null }));

  // De fleste innlegg har ingen kobling — da skal det ikke koste et kall.
  if (ids.length === 0) return utenFunn();

  try {
    const { data: funnRader, error: funnError } = await supabase.from('public_findings').select(KOBLET_FUNN_KOLONNER).in('id', ids);
    if (funnError) throw funnError;
    const funn = (funnRader ?? []) as unknown as OffentligFunnRad[];

    // Viewet har bare det norske navnet. Det svenske hentes fra artslista
    // (offentlig tabell), ellers får svenske lesere norske artsnavn.
    const artIds = Array.from(new Set(funn.map((f) => f.species_id).filter((id): id is number => typeof id === 'number')));
    const arter = new Map<number, ArtRad>();
    if (artIds.length > 0) {
      const { data: artRader, error: artError } = await supabase
        .from('mushroom_species')
        .select('id,norwegian_name,swedish_name')
        .in('id', artIds);
      // Feiler dette, har vi fortsatt det norske navnet fra viewet.
      if (!artError) {
        for (const art of (artRader ?? []) as unknown as ArtRad[]) arter.set(art.id, art);
      }
    }

    const perId = new Map<string, KobletFunn>();
    for (const f of funn) {
      const art = typeof f.species_id === 'number' ? arter.get(f.species_id) : undefined;
      const norsk = art?.norwegian_name ?? f.norwegian_name ?? null;
      perId.set(f.id, {
        id: f.id,
        species_id: f.species_id,
        species_name_override: null,
        is_zone_finding: f.is_zone_finding,
        zone_label: f.zone_label,
        zone_precision_km: f.zone_precision_km,
        mushroom_species: norsk || art?.swedish_name ? { norwegian_name: norsk, swedish_name: art?.swedish_name ?? null } : null
      });
    }

    return posts.map((post) => ({ ...post, finding: (post.finding_id ? perId.get(post.finding_id) : null) ?? null }));
  } catch (error) {
    // Et problem med viewet skal ikke ta ned hele forumlista: innleggene vises
    // uten funnlinja.
    console.warn('[forum] kunne ikke hente koblede funn', error);
    return utenFunn();
  }
}
