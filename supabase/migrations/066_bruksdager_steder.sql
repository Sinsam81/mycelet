-- 066: «Mine steder» som bruksflate.
--
-- Spørsmålet vinterplanen skal svare på er «kommer folk tilbake til skogen
-- sin?» (docs/strategi-2026-2027.md § 6, områdekartotek). Bruksdagene (064)
-- teller forsiden, kartet og områdesidene — ikke Mine steder. Uten denne
-- flaten finnes ikke tallet. Samme regler som før: én rad per bruker og dag,
-- ingen posisjon, ingen klokkeslett.

alter table bruksdager drop constraint if exists bruksdager_flate_check;
alter table bruksdager add constraint bruksdager_flate_check
  check (flate in ('hjem', 'kart', 'omrade', 'steder'));

comment on column bruksdager.flate is 'hjem = forsidekortet · kart = /map · omrade = /soppforhold/<område> · steder = /mine-steder';

notify pgrst, 'reload schema';
