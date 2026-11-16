/**
 * Forvekslingsartene på en artsside — i BEGGE retninger.
 *
 * `look_alikes` er en rettet tabell (species_id → look_alike_id), og radene er
 * skrevet fra matsoppens side: «broket kremle forveksles med grønn fluesopp».
 * Artssiden spurte bare på `species_id`, så siden til grønn fluesopp fant ingen
 * rader og skrev «Vi har ikke ført inn forvekslingsarter for denne arten ennå»
 * — mens basen visste nøyaktig hvilke tre matsopper folk tar den for, og hadde
 * skilleteksten ferdig skrevet. Målt i produksjon 10. november 2026: 68 par,
 * 46 uten speilrad, og 20 arter som BARE finnes som en annens forveksling,
 * blant dem grønn fluesopp, flatklokkehatt og sandmorkel. Det mest verdifulle
 * sikkerhetsinnholdet i katalogen var usynlig fra den farlige siden.
 *
 * Denne modulen slår de to spørringene sammen til én kortliste:
 *
 *   'fra'  raden er ført på DENNE artens side (species_id = siden). Kortet
 *          viser forvekslingsarten, med radens faregrad.
 *   'til'  raden er ført på den ANDRE artens side og peker hit. Kortet viser
 *          arten som forveksles med denne — UTEN faregrad. Radens faregrad
 *          beskriver hvor farlig DENNE arten er som forveksling, ikke arten på
 *          kortet: «Fare: Kritisk» over en kantarell ville vært galt.
 *
 * Finnes paret i begge retninger (A→B og B→A), vinner 'fra'-raden: den er
 * skrevet for akkurat denne siden.
 *
 * ⚠️ EN FEIL ER ALDRI EN TOM LISTE. «Vi klarte ikke å sjekke» og «det finnes
 * ingen» er de to mest forskjellige beskjedene en soppapp kan gi, og de så helt
 * like ut da identifiseringen svelget feilen fra denne samme tabellen (se
 * enrich.ts). `ufullstendig` settes derfor når en av spørringene feilet, når en
 * av dem traff radgrensen (da kan vi ha mistet rader), og når en rad mangler
 * arten sin. `ingenRegistrert` — det eneste som gir «ikke ført inn ennå» — er
 * bare sann når begge retninger er lest helt og begge er tomme.
 *
 * ⚠️ KORT FRA DEN ANDRE SIDEN ER IKKE ARTENS EGEN LISTE. `ingenRegistrert`
 * slukket forbeholdet så snart ÉN rad pekte hit — også for matsopper uten egne
 * rader. Piggsopp (id 7) fikk da to grønne «Spiselig»-kort, rødgul piggsopp og
 * blek kantarell, og ingenting sa at piggsoppens egne farlige forvekslinger
 * aldri er ført inn: sterkere falsk trygghet enn stillheten forbeholdet ble
 * skrevet for. `egneRaderTomme` sier derfor fra om akkurat det — artens egne
 * rader er lest, og det finnes ingen — uansett hvor mange kort som kom fra den
 * andre siden. Lest i produksjon 16. november 2026: 20 arter har bare rader
 * som peker hit; to er matsopper (piggsopp, franskbrødsopp), seks er uspiselige
 * og tolv er giftige eller dødelige. Hvem av dem som trenger et forbehold over
 * kortene, vet siden: de giftige har allerede den røde boksen.
 *
 * Ren funksjon: ingen I/O, ingen tekst. Tekstene skrives ikke om her — skille-
 * og likhetsteksten nevner begge artene ved navn, og vises ordrett fra begge
 * sider.
 */

import { normalizeEdibility } from '@/lib/utils/edibility';

export type Faregrad = 'critical' | 'high' | 'medium' | 'low';

/** Hvilken side raden er ført på. Se toppen av filen. */
export type Forvekslingsretning = 'fra' | 'til';

/** Arten på kortet, slik den joines inn fra `mushroom_species`. */
export interface ForvekslingsArt {
  id: number;
  norwegian_name?: string | null;
  swedish_name?: string | null;
  latin_name?: string | null;
  edibility?: string | null;
  primary_image_url?: string | null;
  primary_image_photographer?: string | null;
  primary_image_license?: string | null;
  primary_image_source_url?: string | null;
}

/**
 * En rad fra `look_alikes` med den ANDRE arten joinet inn — via
 * look_alike_id-nøkkelen for 'fra'-spørringen og species_id-nøkkelen for
 * 'til'-spørringen. PostgREST gir relasjonen som objekt eller som array med
 * ett element, avhengig av hvordan joinet er skrevet.
 */
export interface ForvekslingsRad {
  danger_level?: string | null;
  similarity_description?: string | null;
  difference_description?: string | null;
  mushroom_species?: ForvekslingsArt | ForvekslingsArt[] | null;
}

export interface Forveksling {
  art: ForvekslingsArt;
  retning: Forvekslingsretning;
  /** Bare for 'fra'. `null` for 'til' — se toppen av filen. */
  faregrad: Faregrad | null;
  /** «Hvorfor de forveksles». */
  likhet: string | null;
  /** «Hvordan skille». */
  skille: string | null;
}

export interface Forvekslingsresultat {
  /** Kortene i visningsrekkefølge: farligst først. */
  kort: Forveksling[];
  /** Lista kan mangle rader. Siden skal si fra, uansett hvor mange kort den har. */
  ufullstendig: boolean;
  /** Begge retninger er lest helt, og begge er tomme. */
  ingenRegistrert: boolean;
  /**
   * Artens EGNE rader er lest uten feil, og det finnes ingen. Alle kortene —
   * om det er noen — er da 'til'-kort, hentet fra andre arters lister. Aldri
   * sann når spørringen på artens egen side feilet (da vet vi det ikke), og
   * aldri når radene finnes, men ikke lot seg vise.
   */
  egneRaderTomme: boolean;
}

/**
 * Radgrensen i begge spørringene. Høy med vilje, så en kritisk forveksling
 * aldri kan bli kuttet bort — og treffes den likevel, sier vi fra i stedet for
 * å late som lista er hel. Flest rader på én art i én retning i dag: 4.
 */
export const FORVEKSLING_RADGRENSE = 50;

const FAREGRAD_RANG: Record<Faregrad, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Etter alle 'fra'-kort: en art som bare forveksles MED denne, og som ikke selv er farlig. */
const RANG_ETTER_FRA = 4;

function somFaregrad(verdi: string | null | undefined): Faregrad {
  // Ukjent eller manglende faregrad vises som laveste — samme som siden gjorde
  // før. Rekkefølgen er en sortering, ikke et sikkerhetsskille: kortet vises.
  return verdi === 'critical' || verdi === 'high' || verdi === 'medium' || verdi === 'low' ? verdi : 'low';
}

function tekst(verdi: string | null | undefined): string | null {
  const renset = typeof verdi === 'string' ? verdi.trim() : '';
  return renset === '' ? null : renset;
}

function artFra(rad: ForvekslingsRad): ForvekslingsArt | null {
  const art = Array.isArray(rad.mushroom_species) ? rad.mushroom_species[0] : rad.mushroom_species;
  return art && typeof art.id === 'number' ? art : null;
}

/**
 * Sorteringsrangen. 'fra'-kort følger radens faregrad, som før.
 *
 * 'til'-kort har ingen faregrad for denne retningen, men arten på kortet har
 * en spiselighet: er DEN dødelig eller giftig, skal kortet aldri havne under en
 * rekke harmløse nærarter. I dag finnes ingen slik rad uten speilrad (alle
 * rader ført fra en giftsopp har en motrad), så dette er en sperre for neste
 * migrasjon, ikke en endring av dagens rekkefølge.
 */
function rang(kort: Forveksling): number {
  if (kort.retning === 'fra') return FAREGRAD_RANG[kort.faregrad ?? 'low'];
  const spiselighet = normalizeEdibility(kort.art.edibility);
  if (spiselighet === 'deadly') return FAREGRAD_RANG.critical;
  if (spiselighet === 'toxic' || spiselighet === 'unknown') return FAREGRAD_RANG.high;
  return RANG_ETTER_FRA;
}

export interface ForvekslingsInndata {
  /** Rader der denne arten står som `species_id`. */
  fram: readonly ForvekslingsRad[] | null | undefined;
  /** Rader der denne arten står som `look_alike_id`. */
  bak: readonly ForvekslingsRad[] | null | undefined;
  framFeilet?: boolean;
  bakFeilet?: boolean;
  /** Radgrensen spørringene ble kjørt med. */
  radgrense?: number;
}

export function slaaSammenForvekslinger({
  fram,
  bak,
  framFeilet = false,
  bakFeilet = false,
  radgrense = FORVEKSLING_RADGRENSE
}: ForvekslingsInndata): Forvekslingsresultat {
  const framRader = fram ?? [];
  const bakRader = bak ?? [];
  let ufullstendig =
    framFeilet || bakFeilet || framRader.length >= radgrense || bakRader.length >= radgrense;

  const perArt = new Map<number, Forveksling>();
  const leggTil = (rader: readonly ForvekslingsRad[], retning: Forvekslingsretning) => {
    for (const rad of rader) {
      const art = artFra(rad);
      if (!art) {
        // Raden finnes, men arten den peker på kom ikke med. Vi kan ikke vise
        // den — og da kan vi heller ikke påstå at lista er hel.
        ufullstendig = true;
        continue;
      }
      // 'fra' legges inn først, så en speilrad aldri overskriver den.
      if (perArt.has(art.id)) continue;
      perArt.set(art.id, {
        art,
        retning,
        faregrad: retning === 'fra' ? somFaregrad(rad.danger_level) : null,
        likhet: tekst(rad.similarity_description),
        skille: tekst(rad.difference_description)
      });
    }
  };
  leggTil(framRader, 'fra');
  leggTil(bakRader, 'til');

  const kort = [...perArt.values()].sort(
    (a, b) =>
      rang(a) - rang(b) ||
      // Lik rang: radene skrevet for denne siden først, så stabilt på id —
      // PostgREST lover ingen rekkefølge uten ORDER BY, og kort som bytter
      // plass mellom to sidevisninger ser ut som en feil.
      (a.retning === b.retning ? 0 : a.retning === 'fra' ? -1 : 1) ||
      a.art.id - b.art.id
  );

  return {
    kort,
    ufullstendig,
    ingenRegistrert: !ufullstendig && kort.length === 0,
    // Radene teller, ikke kortene: en egen rad som mangler arten sin gir ingen
    // kort, men den FINNES — da er beskjeden «klarte ikke å hente» (ufullstendig).
    egneRaderTomme: !framFeilet && framRader.length === 0
  };
}
