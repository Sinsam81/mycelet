/**
 * «Se etter»-linja på artssiden — og porten foran den.
 *
 * `buildWhatToLookFor` (src/lib/prediction/what-to-look-for.ts) lager én
 * setning per art om hva man skal lete etter: «Kantarell står i symbiose med
 * blant annet gran, furu og bjørk — se i kanten mot lysninger og langs stier».
 * Den ble skrevet og testet i august 2026 og aldri koblet til noen flate.
 * Artssiden er den første. Setningen handler om hvordan ARTEN vokser, aldri
 * om et bestemt sted, så den lover ingenting om hvor det finnes sopp.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORTEN: BARE MATSOPP FÅR LINJA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Modulen bak vurderer ikke spiselighet. Den skriver like gjerne «Grønn
 * fluesopp står i symbiose med eik og bøk — gå sakte langs stier,
 * bestandskanter og små åpninger, der du ser bakken best». Andre halvdel er
 * et søkeråd uansett hva overskriften over sier, så en nøytral overskrift
 * («Der den vokser») ville ikke gjort setningen nøytral.
 *
 * Giftige, dødelige, uspiselige og ukjente arter får derfor INGEN linje — ikke
 * en omskrevet en. Samme regel, og samme funksjon, som kartet bruker for hvilke
 * arter som kan nevnes som en grunn til å dra et sted (`isRecommendableSpecies`
 * i recommendable.ts: utelat heller enn å merke). Ukjent eller feilstavet
 * spiselighet stenger porten.
 *
 * De artene mister ingenting på det: hvor en giftsopp vokser står allerede i
 * faktaradene rett over («Habitat», «Vokser med», «Vokser på»), som vises for
 * alle arter. En setning til med de samme trærne ville bare gjentatt dem — og
 * «står i symbiose med eik og bøk» på siden til en dødelig art leses fort som
 * «da er det ikke den jeg fant under bjørka».
 *
 * Ren funksjon. Raden er utypet (`select('*')`), så feltene vaskes før de
 * sendes videre: modulen bak forventer strenger og lister av strenger.
 */

import { DEFAULT_LOCALE, isLocale } from '@/i18n/config';
import { isRecommendableSpecies } from '@/lib/prediction/recommendable';
import { buildWhatToLookFor } from '@/lib/prediction/what-to-look-for';

/** Feltene linja bygges av. Alt er `unknown`: raden er ikke typet. */
export interface SeEtterRad {
  edibility?: unknown;
  norwegian_name?: unknown;
  swedish_name?: unknown;
  genus?: unknown;
  habitat?: unknown;
  mycorrhizal_partners?: unknown;
  substrate?: unknown;
}

function tekst(verdi: unknown): string | null {
  return typeof verdi === 'string' && verdi.trim() !== '' ? verdi : null;
}

function tekstliste(verdi: unknown): string[] {
  return Array.isArray(verdi) ? verdi.filter((element): element is string => typeof element === 'string') : [];
}

/**
 * Setningen under «Se etter» på leserens språk, eller `null` når arten ikke
 * skal ha noen (se porten over) eller raden ikke gir grunnlag for en.
 */
export function byggSeEtterLinje(rad: SeEtterRad | null | undefined, locale: string): string | null {
  if (!rad) return null;
  if (!isRecommendableSpecies(tekst(rad.edibility))) return null;

  return buildWhatToLookFor(
    {
      norwegian_name: tekst(rad.norwegian_name),
      swedish_name: tekst(rad.swedish_name),
      genus: tekst(rad.genus),
      habitat: tekstliste(rad.habitat),
      mycorrhizal_partners: tekstliste(rad.mycorrhizal_partners),
      substrate: tekst(rad.substrate)
    },
    isLocale(locale) ? locale : DEFAULT_LOCALE
  );
}
