-- 059: Fjern skjemadriften saved_places.
--
-- Tabellen ble oppdaget under RLS-oppryddingen i 058: den fantes i databasen
-- (med fire håndlagde «Egne steder …»-policyer som Advisor flagget), men i
-- ingen migrasjonsfil og ingen kodelinje. 0 rader. Trolig opprettet manuelt i
-- dashbordet tidlig i utviklingen av «Mine steder» og glemt da funksjonen
-- endte med å bygge på findings i stedet.
--
-- Etterkontrollspørringen i 058 bekreftet at dette var de FIRE siste
-- policyene med per-rad auth.uid() — alt annet er init-plan-optimalisert.
--
-- `if exists` gjør filen ufarlig for databaser som aldri hadde driften
-- (f.eks. en fremtidig frisk oppsett fra migrasjonene alene). Ingen cascade:
-- avhengigheter skal feile høyt, ikke rives med.

drop table if exists saved_places;
