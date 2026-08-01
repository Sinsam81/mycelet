-- 034: Bring stored scientific names in line with the accepted taxonomy.
--
-- Historikk: denne ble opprinnelig skrevet 2026-07-30 som «030», men ble
-- liggende ukommittert i et worktree mens 030–033 gikk i produksjon. Den er
-- omnummerert og utvidet her.
--
-- Alle navn er kontrollert på nytt mot GBIF 2026-08-01, og hele artslisten
-- (72 arter) ble sveipet samtidig — det avdekket art 84, som den opprinnelige
-- versjonen ikke hadde med.
--
--   id 41  Agaricus silvaticus     -> Agaricus sylvaticus       OMDØPES
--   id 59  Clitocybe dealbata      -> Clitocybe rivulosa        OMDØPES
--   id 60  Inocybe erubescens      -> Inosperma erubescens      OMDØPES (+ slekt)
--   id 84  Albatrellus confluens   -> Albatrellopsis confluens  OMDØPES (+ slekt)
--   id 23  Agaricus xanthodermus   -> beholdes                  se punkt 3
--   id 18  Paxillus involutus      -> beholdes                  se punkt 4
--
-- GBIF-svarene som ligger til grunn (species/match, kingdom=Fungi):
--
--   Agaricus silvaticus      HIGHERRANK / CLASS   -> Agaricomycetes  ⚠️ se punkt 6
--   Agaricus sylvaticus      EXACT / SPECIES      ACCEPTED
--   Clitocybe dealbata       EXACT / SPECIES      SYNONYM  -> Clitocybe rivulosa
--   Clitocybe rivulosa       EXACT / SPECIES      ACCEPTED
--   Inocybe erubescens       EXACT / SPECIES      SYNONYM  -> Inosperma erubescens
--   Inosperma erubescens     EXACT / SPECIES      ACCEPTED
--   Albatrellus confluens    EXACT / SPECIES      SYNONYM  -> Albatrellopsis confluens
--   Albatrellopsis confluens EXACT / SPECIES      ACCEPTED
--   Agaricus xanthodermus    EXACT / SPECIES      ACCEPTED
--   Agaricus xanthoderma     FUZZY / SPECIES      -> samme art (derfor ikke brukt)
--
-- HVORFOR SYNONYM-KOLONNEN IKKE ER VALGFRI
-- En ren omdøping ville vært en sikkerhetsregresjon. /api/identify slår opp
-- AI-leverandørens artsnavn med et eksakt `ilike` mot latin_name, og
-- leverandøren returnerer de gamle, innarbeidede navnene. Mister vi det
-- treffet, vises en identifikasjon av Clitocybe rivulosa (giftig) eller
-- Inosperma erubescens (dødelig) uten norsk navn og uten spiselighetsmerke —
-- altså uten den halvdelen av svaret som betyr noe for sikkerheten.
--
-- `synonyms` er reserven som holder de oppslagene i live. Koden som bruker den
-- ligger i samme endring som denne migrasjonen; kjøres migrasjonen alene, skjer
-- det ingen skade, men reserven trer ikke i kraft før koden er ute.
--
-- HVA ANNET SOM NØKLER PÅ latin_name (kontrollert 2026-08-01, alt i orden)
--   * fenologikurver (src/lib/prediction/phenology-data.ts)  -> nøklet på id
--   * species_occurrences, look_alikes, findings, fliser     -> heltalls-FK på id
--   * scripts/generate-phenology.mjs, import-gbif-occurrences.mjs
--       -> leser latin_name ved kjøring, plukker nye navn opp av seg selv
--   * V1_LATIN_NAMES i src/app/api/cron/generate-tiles/route.ts
--       -> ingen av disse fem står der
--   * GENUS_PREFERENCES i src/lib/utils/species-scoring.ts
--       -> har verken Inocybe eller Albatrellus, så slektsbyttene er no-ops
--
-- idx_species_search bygges bevisst ikke om: alle søkeveier i appen bruker
-- `ilike`, ikke den tsvector-indeksen, så synonymer der ville ikke gitt noe på
-- en tabell med ~80 rader.
--
-- Trygg å kjøre om igjen: alle setninger er enten guardet eller matcher på
-- verdien før omdøpingen.

begin;

-- 1. Skjema ------------------------------------------------------------------

ALTER TABLE mushroom_species
  ADD COLUMN IF NOT EXISTS synonyms TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

ALTER TABLE mushroom_species
  ADD COLUMN IF NOT EXISTS taxonomy_note TEXT;

COMMENT ON COLUMN mushroom_species.synonyms IS
  'Superseded or alternative scientific names for this species. Populated so a '
  'rename never makes the species unfindable: users, older field guides and the '
  'AI identification provider all still use the previous names.';

COMMENT ON COLUMN mushroom_species.taxonomy_note IS
  'Curator-facing note about the name concept (species aggregate vs. segregate, '
  'disagreement between nomenclatural authorities). Not user-facing copy.';

-- array_to_string() er STABLE, ikke IMMUTABLE, og kan derfor ikke brukes
-- direkte i en generert kolonne. For text[] ER resultatet immutabelt (ingen
-- locale- eller typeutskriftsvariasjon), så denne tynne innpakningen er trygg
-- å erklære som det.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'immutable_array_to_string'
  ) THEN
    CREATE FUNCTION immutable_array_to_string(arr TEXT[], sep TEXT)
    RETURNS TEXT
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
    AS 'SELECT array_to_string(arr, sep)';
  END IF;
END $$;

-- Flatet kopi, slik at appens eksisterende `.or(... .ilike ...)`-filtre kan
-- dekke synonymer uten å måtte håndtere array-oppslag spesielt.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'mushroom_species' AND column_name = 'synonyms_text'
  ) THEN
    ALTER TABLE mushroom_species
      ADD COLUMN synonyms_text TEXT
      GENERATED ALWAYS AS (immutable_array_to_string(synonyms, ' ')) STORED;
  END IF;
END $$;


-- 2. Omdøpinger --------------------------------------------------------------
-- Matcher på det gamle latin_name (UNIQUE), så en ny kjøring endrer ingenting.

-- id 41 — 'silvaticus' er en ortografisk variant som GBIF ikke fører på
-- artsnivå i det hele tatt. Se punkt 6: dette er også en aktiv datafeil, ikke
-- bare et kosmetisk navneproblem.
UPDATE mushroom_species
SET latin_name = 'Agaricus sylvaticus',
    synonyms   = ARRAY['Agaricus silvaticus']
WHERE latin_name = 'Agaricus silvaticus';

-- id 59 — Clitocybe dealbata er synonym for C. rivulosa i alle kilder.
UPDATE mushroom_species
SET latin_name = 'Clitocybe rivulosa',
    synonyms   = ARRAY['Clitocybe dealbata', 'Clitocybe rivulosa var. dealbata']
WHERE latin_name = 'Clitocybe dealbata';

-- id 60 — flyttet ut av Inocybe til Inosperma (Matheny & Esteve-Rav.).
-- Familien Inocybaceae er uendret. 'Inocybe patouillardii' er det andre navnet
-- arten fortsatt publiseres mye under.
UPDATE mushroom_species
SET latin_name = 'Inosperma erubescens',
    genus      = 'Inosperma',
    synonyms   = ARRAY['Inocybe erubescens', 'Inocybe patouillardii']
WHERE latin_name = 'Inocybe erubescens';

-- id 84 — flyttet til Albatrellopsis (Teixeira). Familien Albatrellaceae er
-- uendret. Denne sto ikke i den opprinnelige versjonen; den ble funnet da hele
-- artslisten ble sveipet mot GBIF 2026-08-01.
UPDATE mushroom_species
SET latin_name = 'Albatrellopsis confluens',
    genus      = 'Albatrellopsis',
    synonyms   = ARRAY['Albatrellus confluens', 'Polyporus confluens']
WHERE latin_name = 'Albatrellus confluens';


-- 3. id 23 Agaricus xanthodermus — beholdes bevisst ---------------------------
--
-- Dyntaxa er avvikeren her, og å følge den ville gjort ting verre:
--
--   Dyntaxa (SE)      Agaricus xanthoderma  AKSEPTERT  (xanthodermus = synonym)
--   Nortaxa (NO)      Agaricus xanthodermus AKSEPTERT  (xanthoderma  = synonym)
--   GBIF              Agaricus xanthodermus AKSEPTERT  (xanthoderma treffer bare
--                                                       FUZZY, ikke EXACT)
--
-- Dette er den langvarige ICN-uenigheten om kjønnssamsvar: -derma (intetkjønns
-- substantiv i apposisjon) mot -dermus. Å døpe om ville (a) motsagt den norske
-- autoriteten i en norsk-primær app, og (b) nedgradert GBIF-oppslaget i
-- scripts/import-gbif-occurrences.mjs fra EXACT til FUZZY.
--
-- Dyntaxa-skrivemåten føres som synonym i stedet, så en svensk bruker som søker
-- 'Agaricus xanthoderma' fortsatt finner arten.
UPDATE mushroom_species
SET synonyms = ARRAY['Agaricus xanthoderma', 'Psalliota xanthoderma'],
    taxonomy_note =
      'Nortaxa (NO) og GBIF regner Agaricus xanthodermus som akseptert navn; '
      'Dyntaxa (SE) aksepterer Agaricus xanthoderma i stedet. Beholdt som '
      'xanthodermus: det er den norske autoritetens navn, og den eneste '
      'skrivemåten GBIF treffer eksakt. Kontrollert 2026-08-01.'
WHERE latin_name = 'Agaricus xanthodermus';


-- 4. id 18 Paxillus involutus — kun notat, ingen endring ---------------------
--
-- Ifølge Artfakta hører det svenske navnet 'Pluggskivling' til Paxillus
-- involutus s.lat. (samleart), ikke til segregatet s.str. Å beholde det enkle
-- binomialet + det folkelige navnet er riktig for en soppapp — hele samlearten
-- er giftig, så skillet endrer ingenting brukeren må handle på — men det skal
-- ikke forveksles med en identifikasjon på segregatnivå.
UPDATE mushroom_species
SET taxonomy_note =
      'swedish_name ''Pluggskivling'' gjelder Paxillus involutus s.lat. '
      '(samleart) ifølge Artfakta, ikke segregatet s.str. Bevisst: hele '
      'samlearten er giftig, så splitten har ingen konsekvens for plukking. '
      'Ikke behandle forekomst- eller fenologidata her som segregatnivå. '
      'Kontrollert 2026-08-01.'
WHERE latin_name = 'Paxillus involutus';

commit;


-- 5. Kontroll etter kjøring --------------------------------------------------
-- Skal gi 6 rader, alle med de nye navnene og ingen tomme synonymlister der
-- det skal være synonymer.
--
--   SELECT id, norwegian_name, latin_name, genus, synonyms, synonyms_text
--   FROM mushroom_species
--   WHERE latin_name IN (
--     'Agaricus sylvaticus', 'Clitocybe rivulosa', 'Inosperma erubescens',
--     'Albatrellopsis confluens', 'Agaricus xanthodermus', 'Paxillus involutus'
--   )
--   ORDER BY id;


-- 6. OPPFØLGING (ikke del av denne migrasjonen — ikke kjør i blinde) ----------
--
-- Omdøpingen av id 41 retter en levende datafeil, ikke bare en etikett.
-- 'Agaricus silvaticus' finnes ikke i GBIF-ryggraden, og gbifMatch() i
-- scripts/import-gbif-occurrences.mjs godtok alt som ikke var matchType 'NONE'.
-- Navnet slo derfor gjennom med matchType=HIGHERRANK til usageKey 186 — HELE
-- KLASSEN Agaricomycetes — i stedet for arten.
--
-- Målt 2026-08-01: art 41 har 8 230 forekomster. Til sammenligning har
-- kantarell 8 399 og steinsopp 8 400, mens karbol-sjampinjong har 529 og
-- hvit trakttsopp 34. En middels vanlig sjampinjong på nivå med kantarell er
-- ikke troverdig — radene er et utvalg av alle skivlingsopper i Norden.
--
-- Fenologikurven for art 41 er generert fra nettopp de radene.
--
-- gbifMatch() er strammet inn i samme endring som denne migrasjonen, så feilen
-- kan ikke gjenta seg. Selve oppryddingen må kjøres manuelt:
--
--   DELETE FROM species_occurrences WHERE species_id = 41;
--
--   -- deretter, i prosjektmappa:
--   ONLY_MISSING=1 node --env-file=.env.local scripts/import-gbif-occurrences.mjs NO SE
--   node --env-file=.env.local scripts/generate-phenology.mjs
--
-- Kjør DELETE først ETTER at omdøpingen over er gjennomført, ellers importeres
-- klasse-støyen på nytt under det gamle navnet.
