import type { Logger } from '@/lib/log';
import { seasonFitForSpecies } from '@/lib/utils/identify-ranking';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import type { IdentifySuggestion } from '@/types/identify';
import type { Locale } from '@/i18n/config';
import { photoCreditFromSpeciesRow } from '@/lib/utils/photo-credit';
import type { PhotoCreditInfo } from '@/types/identify';

/**
 * Beriker artsforslag med katalogdata og SIKKERHETSDATA (spiselighet + farlige
 * forvekslingsarter).
 *
 * Hvorfor dette bor i sin egen fil, og ikke inne i /api/identify:
 *
 * To flater viser det samme resultatet — en fersk identifisering, og en rad
 * hentet fra identifiseringshistorikken. Begge må vise NØYAKTIG samme
 * forvekslingsadvarsel. Hadde de hatt hver sin kopi av spørringene, ville
 * kurateringsarbeidet vårt (migrasjonene 048/049/050 la forvekslingsdata på 14
 * matsopper) kunnet treffe den ene og ikke den andre — og det utslaget er
 * «denne soppen har ingen farlige tvillinger» kontra «denne har en dødelig
 * tvilling». Det er den forskjellen hele appen finnes for å formidle.
 *
 * Historikken lagrer forslagene som de var. Den lagrede JSON-en gjenbrukes
 * ALDRI som fasit for sikkerhet eller artsnavn: denne funksjonen kjøres på nytt
 * ved hver visning, slik at en rad fra i fjor får dagens forvekslingsdata og
 * dagens språk.
 */

/** Feltene som kommer fra leverandøren (eller fra en lagret rad) før berikelse. */
export interface BaseSuggestion {
  /** Latinsk navn — nøkkelen alle katalogoppslag går på. */
  name: string;
  commonNames: string[];
  probability: number;
  /** Leverandørens spiselighet. Overskrives av katalogens når arten finnes hos oss. */
  edibility: string;
  description: string | null;
  taxonomy: Record<string, string> | null;
  similarImages: string[];
}

export interface EnrichOptions {
  locale: Locale;
  /**
   * Måneden sesongvurderingen skal gjelde for (1-12).
   *
   * For en fersk identifisering er det inneværende måned. For en visning fra
   * historikken er det måneden identifiseringen BLE GJORT — «i sesong nå» om en
   * septemberidentifisering man ser på i januar ville vært et svar på et
   * spørsmål brukeren ikke stilte.
   */
  month: number;
  log: Pick<Logger, 'error'>;
}

/**
 * `seasonFactor` er ikke med i IdentifySuggestion (klienten trenger den ikke),
 * men rangeringen i /api/identify gjør det — derfor følger den med ut herfra.
 */
export type EnrichedSuggestion = IdentifySuggestion & {
  seasonFactor: number;
  nearbyFindings: number;
};

export interface EnrichResult {
  suggestions: EnrichedSuggestion[];
  /**
   * Satt når et oppslag feilet. Da mangler sikkerhetsinformasjon i svaret, og
   * klienten MÅ si fra — stillhet skal aldri kunne bety «ingen fare».
   */
  safetyDataIncomplete: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function enrichSuggestions(
  supabase: any,
  base: BaseSuggestion[],
  { locale, month, log: userLog }: EnrichOptions
): Promise<EnrichResult> {
  let safetyDataIncomplete = false;

  const suggestions = await Promise.all(
    base.slice(0, 3).map(async (suggestion) => {
      const mapped = { ...suggestion } as {
        name: string;
        commonNames: string[];
        probability: number;
        edibility: string;
        description: string | null;
        taxonomy: Record<string, string> | null;
        similarImages: string[];
        speciesId?: number;
        norwegianName?: string;
        imageUrl?: string | null;
      imageCredit?: PhotoCreditInfo | null;
        imageCredit?: PhotoCreditInfo | null;
        inSeason?: boolean;
        peakSeason?: boolean;
        nearbyFindings: number;
        seasonFactor: number;
        /**
         * Hvorfor tre tilstander og ikke to: en art UTEN registrerte
         * forvekslingsrader rendret tidligere nøyaktig likt som en art vi
         * har sjekket og funnet trygg. 24 av 45 spiselige arter i katalogen
         * har null rader — for dem var et rent resultat ikke til å skille
         * fra «ingen farlige forvekslinger finnes».
         *   present        — vi har data, og her er de
         *   none_recorded  — arten finnes hos oss, men ingen er ført inn ennå
         *   unavailable    — vi vet ikke: spørringen feilet, eller arten er
         *                    ikke i katalogen vår i det hele tatt
         */
        lookAlikeData?: 'present' | 'none_recorded' | 'unavailable';
        dangerousLookAlikes?: Array<{
          name: string;
          danger: string;
          speciesId?: number;
          imageUrl?: string | null;
          imageCredit?: PhotoCreditInfo | null;
          edibility?: string | null;
          whySimilar?: string | null;
          howToTell?: string | null;
        }>;
      };
      mapped.seasonFactor = 1;
      mapped.nearbyFindings = 0;

      // primary_image_* er krediteringen for primary_image_url. Bildene er
      // Commons-filer under CC BY / CC BY-SA, og lisensene krever at fotograf
      // og lisens navngis der bildet vises — AI-resultatet viser det samme
      // bildet som artssiden, så kravet gjelder her også.
      const SPECIES_FIELDS =
        'id,norwegian_name,swedish_name,edibility,primary_image_url,primary_image_photographer,primary_image_license,primary_image_source_url,season_start,season_end,peak_season_start,peak_season_end';

      // eslint-disable-next-line prefer-const
      let { data: species, error: speciesError } = await supabase
        .from('mushroom_species')
        .select(SPECIES_FIELDS)
        .ilike('latin_name', suggestion.name)
        .maybeSingle();

      // Feiler oppslaget, mister vi BÅDE spiselighet og speciesId — og uten
      // speciesId kjører forvekslingssjekken under aldri for dette forslaget.
      // «Ingen treff i katalogen» og «spørringen feilet» så tidligere helt like
      // ut. Nå merker vi det, slik at brukeren får beskjed.
      if (speciesError) {
        safetyDataIncomplete = true;
        userLog.error('identify.species_lookup_failed', speciesError, { latinName: suggestion.name });
      }

      // Leverandøren rapporterer de innarbeidede, eldre artsnavnene, og flere
      // av dem er nå synonymer for det aksepterte navnet vi lagrer (migrasjon
      // 034). Uten denne reserven ville en omdøping strippet både det norske
      // navnet og spiselighetsmerket av resultatet — og blant de berørte
      // artene er én giftig og én dødelig, så merket er den sikkerhetskritiske
      // halvdelen av svaret.
      //
      // Kun binomialer: et bart slektsnavn ville truffet for mange rader til
      // at treffet kan stoles på.
      if (!species && suggestion.name.trim().includes(' ')) {
        const { data: bySynonym, error: synonymError } = await supabase
          .from('mushroom_species')
          .select(SPECIES_FIELDS)
          .ilike('synonyms_text', `%${suggestion.name.trim()}%`)
          .limit(1);
        if (synonymError) {
          safetyDataIncomplete = true;
          userLog.error('identify.synonym_lookup_failed', synonymError, { latinName: suggestion.name });
        }
        species = bySynonym?.[0] ?? null;
      }

      if (species) {
        mapped.speciesId = species.id;
        mapped.norwegianName = getSpeciesDisplayName(species, locale);
        mapped.edibility = species.edibility;
        mapped.imageUrl = (species.primary_image_url as string | null) ?? null;
        mapped.imageCredit = mapped.imageUrl ? photoCreditFromSpeciesRow(species) : null;
        // Samme sesongvindu som kalenderen og artsbiblioteket. Se
        // seasonFitForSpecies for hvorfor det rå katalogvinduet ikke duger.
        const fit = seasonFitForSpecies(month, species);
        mapped.inSeason = fit.inSeason;
        mapped.peakSeason = fit.peakSeason;
        mapped.seasonFactor = fit.factor;
      }

      return mapped;
    })
  );

  const speciesIds = suggestions
    .map((s) => s.speciesId)
    .filter((id): id is number => id != null);

  // SAFETY: surface high/critical look-alikes right in the result (not hidden on
  // the species page). Location-independent, so always run.
  if (speciesIds.length > 0) {
    /** Radformen fra look_alikes-joinet — nok til å slå opp navnet på riktig språk. */
    type LookAlikeSpeciesRow = {
      id: number;
      norwegian_name: string;
      swedish_name: string | null;
      primary_image_url: string | null;
      primary_image_photographer?: string | null;
      primary_image_license?: string | null;
      primary_image_source_url?: string | null;
      edibility: string | null;
    };

    type LookAlikeEntry = {
      name: string;
      danger: string;
      speciesId?: number;
      imageUrl?: string | null;
      edibility?: string | null;
      whySimilar?: string | null;
      howToTell?: string | null;
    };
    const { data: lookAlikes, error: lookAlikeError } = await supabase
      .from('look_alikes')
      .select(
        'species_id, danger_level, similarity_description, difference_description, la:mushroom_species!look_alikes_look_alike_id_fkey(id, norwegian_name, swedish_name, primary_image_url, primary_image_photographer, primary_image_license, primary_image_source_url, edibility)'
      )
      .in('species_id', speciesIds)
      .in('danger_level', ['high', 'critical']);

    // Dette er den viktigste feilsjekken i hele kodebasen.
    //
    // Spørringen droppet tidligere `error`, og `lookAlikes ?? []` gjorde en
    // hvilken som helst databasefeil om til en tom liste. Resultatet var at
    // appen viste nøyaktig det samme som når arten FAKTISK ikke har farlige
    // forvekslingsarter — altså ingen advarsel. For en soppapp er «vi klarte
    // ikke sjekke» og «det finnes ingen fare» de to mest forskjellige
    // beskjedene som finnes, og de så helt like ut.
    //
    // Vi avbryter ikke identifikasjonen — brukeren skal fortsatt få forslagene
    // sine — men flagget følger med ut, og klienten sier fra om at sjekken
    // ikke ble kjørt.
    if (lookAlikeError) {
      safetyDataIncomplete = true;
      userLog.error('identify.look_alikes_failed', lookAlikeError, { speciesIds });
    }

    const byId = new Map<number, LookAlikeEntry[]>();
    for (const row of lookAlikes ?? []) {
      const r = row as unknown as {
        species_id: number | null;
        danger_level: string;
        similarity_description: string | null;
        difference_description: string | null;
        la:
          | LookAlikeSpeciesRow
          | LookAlikeSpeciesRow[]
          | null;
      };
      const laObj = Array.isArray(r.la) ? r.la[0] : r.la;
      if (r.species_id == null || !laObj?.norwegian_name) continue;
      const arr = byId.get(r.species_id) ?? [];
      arr.push({
        // Advarselslinja i UI-et er oversatt, men navnene inni kom rått fra
        // norwegian_name. En svensk bruker fikk «Kan förväxlas med grønn
        // fluesopp» der arten heter Lömsk flugsvamp — navnet på den
        // dødeligste soppen vi har, skrevet så svensken ikke kjenner det igjen.
        name: getSpeciesDisplayName(laObj, locale),
        danger: r.danger_level,
        speciesId: laObj.id,
        imageUrl: laObj.primary_image_url ?? null,
        imageCredit: laObj.primary_image_url ? photoCreditFromSpeciesRow(laObj) : null,
        edibility: laObj.edibility ?? null,
        whySimilar: r.similarity_description ?? null,
        howToTell: r.difference_description ?? null
      });
      byId.set(r.species_id, arr);
    }
    for (const s of suggestions) {
      if (s.speciesId != null && byId.has(s.speciesId)) {
        // Critical first, so UIs that show "the worst" can take index 0.
        s.dangerousLookAlikes = byId
          .get(s.speciesId)!
          .sort((a, b) => (a.danger === b.danger ? 0 : a.danger === 'critical' ? -1 : 1));
      }
    }
  }

  // Hva VET vi om forvekslingsarter for hvert forslag? Må settes etter joinet,
  // og også når joinet feilet — derfor utenfor if-en over.
  for (const s of suggestions) {
    if (safetyDataIncomplete || s.speciesId == null) {
      // Spørringen feilet, eller arten er ikke i katalogen vår. Uansett: vi
      // har ingen dekning å love.
      s.lookAlikeData = 'unavailable';
    } else if ((s.dangerousLookAlikes?.length ?? 0) > 0) {
      s.lookAlikeData = 'present';
    } else {
      s.lookAlikeData = 'none_recorded';
    }
  }

  return { suggestions: suggestions as unknown as EnrichedSuggestion[], safetyDataIncomplete };
}
