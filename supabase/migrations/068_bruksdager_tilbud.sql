-- 068: «tilbud» som bruksflate — at prøvetilbudet faktisk ble VIST.
--
-- To dager etter at tilbudet gikk live (9. sep 2026): 12 kartbrukere, 1 på
-- prissiden, 0 prøveperioder — og ingen tall for om arket i det hele tatt
-- hadde vist seg. Uten «tilbud» kan ikke trakten tilbud vist → prisside →
-- prøveperiode leses. Samme regler som før: én rad per bruker og dag, ingen
-- posisjon, ingen klokkeslett. Teller aldri som bruk av forholdene.

alter table bruksdager drop constraint if exists bruksdager_flate_check;
alter table bruksdager add constraint bruksdager_flate_check
  check (flate in ('hjem', 'kart', 'omrade', 'steder', 'pris', 'tilbud'));

comment on column bruksdager.flate is 'hjem = forsidekortet · kart = /map · omrade = /soppforhold/<område> · steder = /mine-steder · pris = /pricing · tilbud = prøvetilbudet vist';

notify pgrst, 'reload schema';
