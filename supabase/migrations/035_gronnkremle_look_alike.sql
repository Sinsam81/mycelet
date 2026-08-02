-- 035: grønnkremle → grønn fluesopp som strukturert forvekslingsrad.
--
-- BAKGRUNN
-- Grønnkremle (Russula aeruginea, id 68) er en grågrønn kremle som vokser under
-- bjørk. Katalogen har allerede en kuratert advarsel for arten, i
-- `edibility_notes`:
--
--   «Mild og god matkremle. OBS: hold den klart adskilt fra grønn fluesopp
--    (som har skiver med ring og volva — kremler har ingen av delene).»
--
-- Men arten hadde NULL rader i `look_alikes`. Begge de uavhengige
-- sikkerhetsmekanismene sviktet altså samtidig, av to ubeslektede grunner:
--
--   1. Advarselsteksten ble aldri rendret, fordi artssiden bare viste
--      `edibility_notes` for `conditionally_edible`. Rettet i koden.
--   2. Forvekslingskortet fantes ikke, fordi raden mangler. Rettet her.
--
-- HVA DENNE MIGRASJONEN IKKE ER
-- Dette er ikke ny mykologi. Teksten under er hentet fra den kuraterte
-- `edibility_notes`-oppføringen som allerede lå i produksjon — migrasjonen gjør
-- eksisterende, kvalitetssikret innhold strukturelt tilgjengelig, slik at det
-- også når AI-identifiseringen og forvekslingskortet.
--
-- DET STØRRE HULLET STÅR IGJEN
-- 26 av 52 spiselige arter har fortsatt ingen forvekslingsrad i det hele tatt.
-- Det kan ikke lukkes med en migrasjon — det krever en soppsakkyndig
-- gjennomgang. Inntil da sier appen det høyt: ruta merker forslag med
-- `lookAlikeData: 'none_recorded'`, og klienten skriver at fravær av advarsel
-- ikke betyr at arten er trygg. Se docs/lanseringsrevisjon-beslutning.md.
--
-- Idempotent: trygg å lime inn på nytt.

begin;

insert into look_alikes (
  species_id,
  look_alike_id,
  danger_level,
  similarity_description,
  difference_description
)
select
  68,   -- Grønnkremle (Russula aeruginea)
  52,   -- Grønn fluesopp (Amanita phalloides)
  'critical',
  'Begge kan ha en grågrønn til olivengrønn hatt og vokse under bjørk i samme skogtype på samme tid av året. På avstand, og særlig for unge sopper, er fargen alene ikke nok til å skille dem.',
  'Se på stilken og skivene. Grønn fluesopp har ring på stilken og en tydelig volva (pose) nederst, ofte delvis nedgravd — grav derfor alltid opp hele stilken. Kremler har verken ring eller volva, og skivene er sprø og smuldrer når du drar fingeren over dem. Kremlestilken knekker som kritt; fluesoppstilken er seig og trevlete.'
where exists (select 1 from mushroom_species where id = 68)
  and exists (select 1 from mushroom_species where id = 52)
  and not exists (
    select 1 from look_alikes where species_id = 68 and look_alike_id = 52
  );

commit;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- Skal gi nøyaktig én rad, med danger_level = 'critical':
--
-- select
--   s.norwegian_name  as art,
--   l.norwegian_name  as forvekslingsart,
--   la.danger_level
-- from look_alikes la
-- join mushroom_species s on s.id = la.species_id
-- join mushroom_species l on l.id = la.look_alike_id
-- where la.species_id = 68;
