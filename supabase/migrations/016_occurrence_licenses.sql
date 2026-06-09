-- 016_occurrence_licenses.sql
-- LEGAL (M5 fra sikkerhetsrevisjonen): GBIF-poster har ulike lisenser, og
-- CC-BY-NC (ikke-kommersiell) kan ikke brukes i en kommersiell app. Importen
-- filtrerer nå til CC0/CC-BY og lagrer lisens + datasett per rad, slik at vi
-- kan dokumentere og kreditere kildene (se /datakilder).
--
-- Etter at denne er kjørt: kjør import-scriptet på nytt (backfiller lisens på
-- radene som er CC0/CC-BY) — scriptet sletter deretter rader uten lisens
-- (= alt som ikke lenger er hentbart under fri lisens).
--
-- Idempotent: trygt å lime inn på nytt.

ALTER TABLE species_occurrences
  ADD COLUMN IF NOT EXISTS license TEXT,
  ADD COLUMN IF NOT EXISTS dataset_key TEXT;
