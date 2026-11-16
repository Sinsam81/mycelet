/**
 * Faktaene artssiden viser fra artsraden — utover navn, spiselighet og sesong.
 *
 * Siden hentet hele raden (`select('*')`), men viste bare sesong og habitat.
 * Lest fra produksjon 10. november 2026: substrat, familie og vanlighet står
 * ført for alle 80 artene, vertstrær for 58 og eldre vitenskapelige navn for 5
 * — ingenting av det var synlig. Det samme gjaldt hatt-, skive-, stilk- og
 * luktbeskrivelsene til de åtte forvekslingsartene fra migrasjon 049: de
 * eneste artene uten bilde, altså nettopp der teksten er det eneste en leser
 * har å sammenligne med.
 *
 * Denne modulen avgjør HVA som vises, per språk. Den lager ingen tekst selv:
 * alt er enten et oppslag i et lukket vokabular eller basens egen tekst,
 * ordrett.
 *
 * REGLENE, og hvorfor:
 *
 * 1. HABITAT, VERTSTRÆR OG SUBSTRAT er lukkede vokabularer og vises på
 *    leserens språk (habitat-filter.ts, vertstraer.ts). Et ukjent habitatord
 *    slipper gjennom; et ukjent tre eller substrat vises ikke på svensk.
 *
 * 2. VANLIGHET vises ikke for giftige, dødelige eller ukjente arter. «Sjelden»
 *    på siden til grønn fluesopp leses som «da er det neppe den jeg har» — og
 *    fravær av fare skal aldri kunne leses ut av en faktarad. Samme tanke som
 *    sperre B i season-region.ts: en farlig art står likt overalt.
 *
 * 3. VANLIGHET vises ikke på svensk. Kolonnen er ført for Norge — søsterkolonnen
 *    `regions` i samme rad sier «Sør-Norge», «Midt-Norge», «hele Norge» — og vi
 *    har ingen svensk kilde for den. «Hur vanlig» over en verdi ført for Norge
 *    er en påstand om Sverige vi ikke har dekning for.
 *
 * 4. KJENNETEGN (hatt, skiver, stilk, kjøtt, lukt) vises bare på norsk. Det er
 *    norsk prosa med sikkerhetsforbehold i («melduften er ingen
 *    trygghetsgaranti»), og docs/svensk-lokalisering-restanser.md krever
 *    fagsjekket svensk for slik tekst — ikke maskinoversettelse. Teksten vises
 *    HEL, aldri avkortet, av samme grunn.
 *
 * 5. SMAK vises aldri, selv om kolonnen finnes. Å be folk smake på en sopp de
 *    ikke har bestemt, er et råd vi ikke gir.
 *
 * Ren funksjon. Raden er utypet (`select('*')`), så hvert felt leses defensivt:
 * en kolonne som mangler, er null eller har feil form gir ingen rad — aldri en
 * tom etikett.
 */

import { isDangerousEdibility } from '@/lib/utils/edibility';
import { habitatDisplay } from './habitat-filter';
import { substratVisning, vertstreListe } from './vertstraer';

/** Verdiene CHECK-beskrankningen på `commonality` tillater (migrasjon 001). */
export type Vanlighet = 'very_common' | 'common' | 'uncommon' | 'rare' | 'very_rare';

const VANLIGHETER: readonly Vanlighet[] = ['very_common', 'common', 'uncommon', 'rare', 'very_rare'];

export type Kjennetegnsdel = 'hatt' | 'skiver' | 'stilk' | 'kjott' | 'lukt';

export interface Kjennetegn {
  del: Kjennetegnsdel;
  tekst: string;
}

/**
 * Kolonnene fra `mushroom_species`, i den rekkefølgen en soppbok beskriver
 * dem. `taste` står med vilje ikke her — se regel 5.
 */
const KJENNETEGN_KOLONNER: ReadonlyArray<[Kjennetegnsdel, keyof ArtsfaktaRad]> = [
  ['hatt', 'cap_description'],
  ['skiver', 'gills_description'],
  ['stilk', 'stem_description'],
  ['kjott', 'flesh_description'],
  ['lukt', 'smell']
];

/** Feltene modulen leser. Alt er `unknown`: raden er ikke typet. */
export interface ArtsfaktaRad {
  edibility?: unknown;
  habitat?: unknown;
  mycorrhizal_partners?: unknown;
  substrate?: unknown;
  commonality?: unknown;
  family?: unknown;
  synonyms?: unknown;
  cap_description?: unknown;
  gills_description?: unknown;
  stem_description?: unknown;
  flesh_description?: unknown;
  smell?: unknown;
}

export interface Artsfakta {
  /** Habitat-taggene på leserens språk. Tom liste = vis tom-verdien, som før. */
  habitat: string[];
  /** «Vokser med». Tom liste = ingen rad. */
  vertstraer: string[];
  /** «Vokser på». `null` = ingen rad. */
  substrat: string | null;
  /** «Hvor vanlig». `null` = ingen rad (se regel 2 og 3). */
  vanlighet: Vanlighet | null;
  /** Latinsk familienavn. `null` = ingen rad. */
  familie: string | null;
  /** Eldre og alternative vitenskapelige navn (latin). Tom liste = ingen rad. */
  synonymer: string[];
  /** Tom liste = ingen seksjon og ingen overskrift (se regel 4). */
  kjennetegn: Kjennetegn[];
}

function tekst(verdi: unknown): string | null {
  const renset = typeof verdi === 'string' ? verdi.trim() : '';
  return renset === '' ? null : renset;
}

function tekstliste(verdi: unknown): string[] {
  if (!Array.isArray(verdi)) return [];
  const ut: string[] = [];
  for (const element of verdi) {
    const renset = tekst(element);
    if (renset && !ut.includes(renset)) ut.push(renset);
  }
  return ut;
}

export function byggArtsfakta(rad: ArtsfaktaRad, locale: string): Artsfakta {
  const svensk = locale === 'sv';
  const spiselighet = typeof rad.edibility === 'string' ? rad.edibility : null;

  const vanlighet =
    !svensk && !isDangerousEdibility(spiselighet) && VANLIGHETER.includes(rad.commonality as Vanlighet)
      ? (rad.commonality as Vanlighet)
      : null;

  const kjennetegn: Kjennetegn[] = [];
  if (!svensk) {
    for (const [del, kolonne] of KJENNETEGN_KOLONNER) {
      const innhold = tekst(rad[kolonne]);
      if (innhold) kjennetegn.push({ del, tekst: innhold });
    }
  }

  return {
    habitat: habitatDisplay(Array.isArray(rad.habitat) ? (rad.habitat as string[]) : null, locale),
    vertstraer: vertstreListe(rad.mycorrhizal_partners, locale),
    substrat: substratVisning(rad.substrate, locale),
    vanlighet,
    familie: tekst(rad.family),
    synonymer: tekstliste(rad.synonyms),
    kjennetegn
  };
}
