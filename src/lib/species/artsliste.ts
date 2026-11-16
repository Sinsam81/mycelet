import type { Locale } from '@/i18n/config';
import { erArtISesong } from '@/lib/sesong/art-i-sesong';
import { matchesHabitat } from '@/lib/species/habitat-filter';
import { sokIArter, type SokbarArt } from '@/lib/species/species-search';
import type { SeasonSpecies } from '@/lib/utils/season-region';
import type { Edibility } from '@/types/species';

/**
 * Filtrene i artsbiblioteket, brukt på lista som allerede er hentet.
 *
 * Alle fire — søk, spiselighet, «kun i sesong nå» og habitat — virker her, i
 * nettleseren. Før lå de tre siste i `queryFn` og var dermed en del av
 * spørringsnøkkelen: hvert valg i nedtrekkslista, hvert kryss og hver bokstav i
 * habitatfeltet hentet hele tabellen på nytt og tømte rutenettet mens det sto
 * på. Katalogen er 80 rader og endrer seg bare med en migrasjon.
 *
 * Måneden sendes inn (Oslo-tid, fra sesongtilstand i useSpecies.ts) — ingen
 * klokke leses her, så testene avhenger ikke av dagens dato.
 */

export interface ArtslisteFiltre {
  query: string;
  edibility: 'all' | Edibility;
  inSeasonNow: boolean;
  habitat: string;
}

/** Det filtrene trenger av en rad. */
export type ArtslisteRad = SokbarArt & SeasonSpecies & { habitat: string[] | null };

export function filtrerArtsliste<T extends ArtslisteRad>(
  arter: readonly T[],
  filtre: ArtslisteFiltre,
  locale: Locale | string,
  /** 1–12. */
  maaned: number
): T[] {
  // Søket først, mot HELE katalogen: det rangerer (uten søk sorterer det på
  // navnet leseren ser), og forsøket uten bøyningsendelse («kantareller») skal
  // avgjøres av om søket treffer en art i det hele tatt — ikke av om treffene
  // tilfeldigvis er filtrert bort. De andre filtrene beholder rekkefølgen.
  return sokIArter(arter, filtre.query, locale).filter((art) => {
    if (filtre.edibility !== 'all' && art.edibility !== filtre.edibility) return false;
    // Samme kalibrerte sesongvindu som kalenderen og artssidene (erArtISesong),
    // ellers svarer «i sesong nå» ulikt på to sider i samme app.
    if (filtre.inSeasonNow && erArtISesong(art, maaned) !== true) return false;
    // Habitatverdiene i basen er norske. matchesHabitat kjenner de svenske
    // skrivemåtene, ellers ga «barrskog» null treff for svenske brukere.
    if (!matchesHabitat(art.habitat, filtre.habitat)) return false;
    return true;
  });
}
