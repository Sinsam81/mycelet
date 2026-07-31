import { normalizeEdibility } from '@/lib/utils/edibility';

/**
 * Which species may be named as a REASON TO VISIT a place.
 *
 * The map's "🍄 Riktig skog + sesong for …" line and the species photo pins are
 * recommendations — they sit next to a "naviger hit" link. They are not the
 * species encyclopedia, which lives at /species and deliberately covers the
 * dangerous ones in full.
 *
 * Before this filter existed the lists were gated on season alone. In July that
 * admits 29 of the 72 catalogued species, of which 7 are toxic and one —
 * hvit fluesopp, Amanita virosa — is deadly. So the map could, and did, offer a
 * deadly Amanita as a reason to walk somewhere.
 *
 * WHY EXCLUDE RATHER THAN LABEL: there is a real argument that naming the
 * dangerous species growing in the same forest makes a forager safer, and that
 * argument is right — but the place for it is the safety panel and the
 * look-alike section, where it reads as a warning. Inside a ranked list headed
 * "right forest and season for", a red badge is decoration on an invitation.
 * The home page already makes exactly this split: "4 matsopper i sesong ·
 * 8 giftige å passe på".
 *
 * normalizeEdibility returns 'unknown' for anything unrecognised, so a missing
 * or misspelled edibility value fails closed.
 */
export function isRecommendableSpecies(edibility: string | null | undefined): boolean {
  const normalized = normalizeEdibility(edibility);
  return normalized === 'edible' || normalized === 'conditionally_edible';
}

/**
 * The counterpart: species worth naming as a HAZARD in the same area. Used to
 * warn, never to invite. Kept next to the recommendation rule so the two cannot
 * drift into overlapping.
 */
export function isHazardSpecies(edibility: string | null | undefined): boolean {
  const normalized = normalizeEdibility(edibility);
  return normalized === 'toxic' || normalized === 'deadly';
}
