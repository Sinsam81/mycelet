-- 057: Soppvarsel uten konto — e-postpåmelding med dobbel opt-in.
--
-- Varselet hadde 3 abonnenter av 37 brukere: det krevde innlogget konto pluss
-- en bryter gjemt i profilen. Beslutningsmotoren (decision.ts) er produktets
-- sterkeste kort — flanken, karantenen, ærligheten — men distribusjonen var
-- en flaskehals. Denne migrasjonen lar hvem som helst abonnere med bare en
-- e-postadresse fra /soppvarsel, uten konto.
--
-- ── DOBBEL OPT-IN, MED VILJE ────────────────────────────────────────────────
--
-- Uten bekreftelsessteg kan hvem som helst melde på andres adresser, og
-- Resend-omdømmet vårt (nettopp møysommelig bygget opp) dør av klagene.
-- confirm_token sendes i en bekreftelses-epost; først når lenken er klikket
-- settes confirmed_at, og først da ser cron-jobben raden.
--
-- ── RLS: INGEN NYE POLICYER, OG DET ER POENGET ──────────────────────────────
--
-- Policyene fra 051 slipper bare eieren til via auth.uid() = user_id.
-- E-postrader har user_id NULL, som aldri matcher auth.uid() — de er dermed
-- usynlige for både anon og authenticated. Bare service-role (påmeldings-,
-- bekreftelses- og avmeldingsrutene + cron) kan lese dem. En e-postadresse er
-- persondata; den skal aldri kunne listes ut via PostgREST.
--
-- Kvoten fra 053 teller rader per user_id og er ufarlig her (NULL matcher
-- ingenting); misbruksvernet for e-postrader er rate-limiting i ruta pluss
-- unik-indeksen under.

alter table alert_subscriptions alter column user_id drop not null;

alter table alert_subscriptions add column if not exists email text;
alter table alert_subscriptions add column if not exists confirm_token uuid not null default gen_random_uuid();
alter table alert_subscriptions add column if not exists confirmed_at timestamptz;

-- Konto-abonnementene ble satt opp av innloggede brukere i et samtykke-UI —
-- de ER bekreftet, og cron-filteret under må ikke slå dem av.
update alert_subscriptions set confirmed_at = created_at where user_id is not null and confirmed_at is null;

-- En rad må tilhøre NOEN: enten en konto eller en e-postadresse.
alter table alert_subscriptions
  add constraint alert_subscriptions_eier check (user_id is not null or email is not null);

-- Én e-postrad per adresse per region (case-ufølsomt). unique(user_id, region)
-- fra 051 gjelder fortsatt kontoradene; NULL-user_id-rader passerer den fritt.
create unique index if not exists alert_subscriptions_email_region_idx
  on alert_subscriptions (lower(email), region)
  where user_id is null;

-- Bekreftelsesruta slår opp på tokenet alene.
create unique index if not exists alert_subscriptions_confirm_token_idx
  on alert_subscriptions (confirm_token);
