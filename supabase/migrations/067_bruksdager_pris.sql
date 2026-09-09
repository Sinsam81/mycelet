-- 067: prissiden som bruksflate.
--
-- Null prøveperioder blant 76 brukere (9. september 2026), og ingen tall for
-- hvor mange som i det hele tatt SÅ tilbudet. Uten «pris» i bruksdagene kan
-- ikke trakten kart → prisside → prøveperiode leses. Samme regler som før:
-- én rad per bruker og dag, ingen posisjon, ingen klokkeslett.

alter table bruksdager drop constraint if exists bruksdager_flate_check;
alter table bruksdager add constraint bruksdager_flate_check
  check (flate in ('hjem', 'kart', 'omrade', 'steder', 'pris'));

comment on column bruksdager.flate is 'hjem = forsidekortet · kart = /map · omrade = /soppforhold/<område> · steder = /mine-steder · pris = /pricing';

notify pgrst, 'reload schema';
