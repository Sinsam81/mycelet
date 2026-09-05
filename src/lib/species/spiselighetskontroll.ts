import type { Edibility } from '@/types/species';

/**
 * Motsigelse mellom spiselighetsmerke og artens egen tekst.
 *
 * Klassen `conditionally_edible` vises som «Spiselig — giftig rå» / «krever
 * tilberedning». Det er et løfte: varm den, så er den trygg. Løftet er bare
 * sant for arter der merknaden faktisk handler om tilberedning. Normlistens
 * «Spiselig med merknad» (nyrefunksjon, allergi, «bør unngås») havner i samme
 * klasse (src/lib/species/normliste.ts), og da lyver merket.
 *
 * Krittøsterssopp sto slik i en måned: merket lovet at steking hjalp, teksten
 * sa «Koking eller steking fjerner ikke risikoen». Honningsopp og stankmorkel
 * var samme sak i august. Denne fila er vaktbikkja som skal si fra neste gang,
 * kjørt av scripts/kontroller-spiselighet.mjs mot hele artslista.
 */

export interface SpiselighetsRad {
  id: number;
  norwegian_name: string;
  edibility: Edibility | string;
  edibility_notes: string | null;
  toxin_info?: string | null;
}

/**
 * Tekst som betyr «ikke spis denne» — uansett tilberedning. «… spises rå» og
 * «frarådes nybegynnere» er IKKE frarådinger av arten (granmatriske, rødnende
 * fluesopp), derfor unntakene.
 */
const FRARAADING = /\b(ikke anbefalt|ikke matsopp|frarådes(?! nybegynnere)|anbefales ikke|bør unngås|skal ikke spises(?! rå)|ikke spis(?!es rå)\b)/i;
/** Tekst som sier at varmebehandling IKKE hjelper. */
const VARME_HJELPER_IKKE = /(koking|steking|varmebehandling|avkoking)[^.]{0,60}(fjerner ikke|hjelper ikke|nøytraliserer ikke|ikke nok)|(forsvinner|går) ikke (med|ved) (koking|steking|varme)/i;
/** Tekst som handler om helsetilstand, ikke tilberedning. */
const HELSEFORBEHOLD = /\b(nyre|lever|allergi|gravid|dialyse)\w*/i;

/**
 * null = ingen motsigelse; ellers en kort begrunnelse på norsk.
 * Bare `conditionally_edible` og `edible` kan motsi seg selv på denne måten —
 * de er de eneste klassene som gir grønt/gult merke.
 */
export function finnSpiselighetsMotsigelse(rad: SpiselighetsRad): string | null {
  const tekst = `${rad.edibility_notes ?? ''}\n${rad.toxin_info ?? ''}`;
  if (rad.edibility === 'conditionally_edible') {
    if (VARME_HJELPER_IKKE.test(tekst)) return 'merket sier «giftig rå», teksten sier at varme ikke fjerner risikoen';
    if (FRARAADING.test(tekst)) return 'merket sier «spiselig etter tilberedning», teksten fraråder arten';
    if (HELSEFORBEHOLD.test(tekst) && !/(rå|kok|stek|forvell|varmebehandl)/i.test(rad.edibility_notes ?? '')) {
      return 'merknaden gjelder helsetilstand, ikke tilberedning — hører ikke under «giftig rå»';
    }
    return null;
  }
  if (rad.edibility === 'edible') {
    if (FRARAADING.test(tekst)) return 'grønt merke, men teksten fraråder arten';
    if (VARME_HJELPER_IKKE.test(tekst)) return 'grønt merke, men teksten advarer om risiko som ikke fjernes ved varme';
    return null;
  }
  return null;
}
