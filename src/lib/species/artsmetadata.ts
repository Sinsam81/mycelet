/**
 * Det artssiden forteller søkemotorer og svarmotorer om seg selv:
 * metabeskrivelsen og de strukturerte dataene (JSON-LD).
 *
 * Artsnavnene er søkeordene med faktisk volum i nisjen, og de 80 artssidene
 * er de eneste sidene som kan rangere på dem. Før sa de strukturerte dataene
 * bare navn + latinsk navn, og beskrivelsen var de første 155 tegnene av
 * brødteksten, kuttet midt i et ord.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ALDRI EN SPISELIGHETSPÅSTAND I SØKETREFF, DELINGSKORT ELLER STRUKTURERTE DATA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Metabeskrivelsen og JSON-LD leses av maskiner og gjengis uten siden rundt:
 * uten sikkerhetsboksen, uten forvekslingsartene, uten «få soppen vurdert av
 * soppkontroll». Et felt som sa «spiselig» der ville blitt sitert alene.
 * Derfor:
 *
 *   - ingen spiselighet, ingen giftighet, ingen egenskap som kan leses slik;
 *   - beskrivelsen er ALDRI brødteksten fra basen. 23 av 80 ingresser sier noe
 *     om matverdi («Trygg og god matsopp.»), og den norske metabeskrivelsen
 *     var ingressen til november 2026. Begge bygges av den nøytrale setningen
 *     siden lager selv: navn, latinsk navn, sesongmåneder. `metabeskrivelse`
 *     tar derfor ikke imot brødtekst i det hele tatt;
 *   - bare det basen faktisk har: navn på de språkene vi har dem, eldre
 *     vitenskapelige navn (migrasjon 034), slekt og familie, bildet med
 *     fotograf og lisens.
 *
 * Rene funksjoner. Raden er utypet (`select('*')`), så hvert felt leses
 * defensivt.
 */

import { buildPhotoCredit } from '@/lib/utils/photo-credit';

/** Lengden søkemotorene viser av en beskrivelse før de kutter selv. */
export const META_MAKS = 155;

/**
 * Metabeskrivelsen for en artsside: den nøytrale setningen, og artens navn på
 * det andre språket når det får plass. Ingen av setningene kuttes.
 *
 *   `grunnsetning`      den nøytrale setningen (navn, latin, sesong, og hva
 *                       siden har). Den samme som i de strukturerte dataene.
 *   `kortGrunnsetning`  det første leddet av den (navn, latin, sesong). Brukes
 *                       når grunnsetningen ikke gir plass til tillegget: på
 *                       norsk gjaldt det 36 av de 77 artene med et annet
 *                       svensk navn (katalogen i november 2026).
 *   `tillegg`           artens navn på det andre språket («På svensk:
 *                       Karljohan.»). Språket velges av cookie, så søke-
 *                       motorene får den norske siden — der er dette det
 *                       eneste stedet beskrivelsen har det svenske navnet.
 *                       Får det ikke plass bak noen av setningene, står den
 *                       lange setningen alene.
 */
export function metabeskrivelse(input: {
  grunnsetning?: string | null;
  kortGrunnsetning?: string | null;
  tillegg?: string | null;
  maks?: number;
}): string | undefined {
  const maks = input.maks ?? META_MAKS;
  const grunnsetning = input.grunnsetning?.trim() || null;
  const kortGrunnsetning = input.kortGrunnsetning?.trim() || null;
  const tillegg = input.tillegg?.trim() || null;
  const medTillegg = (setning: string | null) =>
    setning && tillegg && setning.length + 1 + tillegg.length <= maks ? `${setning} ${tillegg}` : null;

  return (
    medTillegg(grunnsetning) ?? medTillegg(kortGrunnsetning) ?? grunnsetning ?? kortGrunnsetning ?? tillegg ?? undefined
  );
}

/** Feltene JSON-LD-en bygges av. Alt er `unknown`: raden er ikke typet. */
export interface ArtJsonLdRad {
  latin_name?: unknown;
  norwegian_name?: unknown;
  swedish_name?: unknown;
  english_name?: unknown;
  synonyms?: unknown;
  genus?: unknown;
  family?: unknown;
  primary_image_photographer?: unknown;
  primary_image_license?: unknown;
  primary_image_source_url?: unknown;
}

function tekst(verdi: unknown): string | null {
  const renset = typeof verdi === 'string' ? verdi.trim() : '';
  return renset === '' ? null : renset;
}

/**
 * schema.org/Taxon for artssiden. Se toppen av fila for hva som ALDRI skal
 * inn her.
 */
export function byggArtJsonLd(input: {
  /** Kanonisk adresse til siden. */
  url: string;
  /** Artens navn på sidens språk. */
  visningsnavn: string;
  rad: ArtJsonLdRad;
  /** Den nøytrale setningen (navn, latin, sesong) — aldri brødteksten. */
  beskrivelse?: string | null;
  /** Bildet, i den bredden vi vil vise fram. `null` når arten ikke har bilde. */
  bildeUrl?: string | null;
  /** Hvem som står bak siden: ORGANISASJON fra src/lib/seo/organisasjon.ts. */
  utgiver: unknown;
}): Record<string, unknown> {
  const { url, visningsnavn, rad, utgiver } = input;

  // Alle navnene vi har på arten, utenom det som allerede står som `name`:
  // latinsk navn først, så de andre språkene, så eldre vitenskapelige navn.
  const andreNavn: string[] = [];
  const sett = new Set([visningsnavn.trim().toLowerCase()]);
  const leggTil = (verdi: unknown) => {
    const navn = tekst(verdi);
    if (!navn || sett.has(navn.toLowerCase())) return;
    sett.add(navn.toLowerCase());
    andreNavn.push(navn);
  };
  leggTil(rad.latin_name);
  leggTil(rad.norwegian_name);
  leggTil(rad.swedish_name);
  leggTil(rad.english_name);
  if (Array.isArray(rad.synonyms)) rad.synonyms.forEach(leggTil);

  // Slekt, og familien over den. Begge står i basen for alle artene.
  const slekt = tekst(rad.genus);
  const familie = tekst(rad.family);
  const familieTakson = familie ? { '@type': 'Taxon', name: familie, taxonRank: 'family' } : null;
  const overordnet = slekt
    ? { '@type': 'Taxon', name: slekt, taxonRank: 'genus', ...(familieTakson ? { parentTaxon: familieTakson } : {}) }
    : familieTakson;

  // Bildet med fotograf og lisens — de samme verdiene, gjennom den samme
  // silen, som krediteringslinja på siden. Plassholdere blir aldri med.
  const bildeUrl = tekst(input.bildeUrl);
  let bilde: unknown = null;
  if (bildeUrl) {
    const kreditt = buildPhotoCredit({
      photographer: tekst(rad.primary_image_photographer),
      license: tekst(rad.primary_image_license),
      sourceUrl: tekst(rad.primary_image_source_url)
    });
    if (kreditt) {
      const verdier = kreditt.shape.values;
      const fotograf = 'photographer' in verdier ? verdier.photographer : null;
      const lisens = 'license' in verdier ? verdier.license : null;
      bilde = {
        '@type': 'ImageObject',
        contentUrl: bildeUrl,
        creditText: fotograf && lisens ? `${fotograf} (${lisens})` : (fotograf ?? lisens),
        ...(kreditt.href ? { acquireLicensePage: kreditt.href } : {})
      };
    } else {
      bilde = bildeUrl;
    }
  }

  const beskrivelse = tekst(input.beskrivelse);

  return {
    '@context': 'https://schema.org',
    '@type': 'Taxon',
    name: visningsnavn,
    ...(andreNavn.length > 0 ? { alternateName: andreNavn } : {}),
    taxonRank: 'species',
    url,
    ...(overordnet ? { parentTaxon: overordnet } : {}),
    ...(beskrivelse ? { description: beskrivelse } : {}),
    ...(bilde ? { image: bilde } : {}),
    publisher: utgiver
  };
}

/**
 * JSON-LD som trygt kan stå inne i en <script>-tagg. Navnene kommer fra
 * basen, og en «</script>» i en av dem ville ellers avsluttet taggen og latt
 * resten av strengen bli HTML.
 */
export function jsonLdTilScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
