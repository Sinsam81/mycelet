-- 072: Påminnelse før første belastning for prøver kjøpt i App Store, og
--      svaret på det ene spørsmålet i e-posten.
--
-- Bakgrunn (september 2026): på nett sender Stripe hendelsen
-- customer.subscription.trial_will_end tre dager før gratisuka blir til et
-- trekk, og webhooken svarer med en e-post (src/lib/billing/prove-paaminnelse.ts).
-- Apple sender ingen tilsvarende påminnelse før et introduksjonstilbud
-- konverterer — det første kunden merker er belastningen på Apple-ID-en,
-- og en refusjonsforespørsel er dyrere for alle enn en kunde som avsluttet
-- i tide. Cronen /api/cron/prove-paaminnelse-app (06:30 UTC) leser derfor
-- radene i billing_subscriptions som RevenueCat eier og står som trialing,
-- og sender e-posten selv, 3 (eller som innhenting 2) dager før prøveslutt.
--
-- Hvorfor en egen tabell for «sendt»: begge webhookene bygger
-- billing_subscriptions.metadata fra bunnen ved hver skriving (se
-- prove-merke.ts), så et sendt-merke der ville forsvinne ved neste
-- RevenueCat-hendelse og e-posten gått igjen. Nøkkelen er bruker, kanal og
-- prøveslutt-DATOEN: flyttes prøveslutt (ny prøve, forlenget periode) er det
-- en ny påminnelse; samme dato sendes aldri to ganger. Cronen RESERVERER
-- raden før den sender (primærnøkkelen er låsen: finnes den alt, hopper
-- kjøringen over) og sletter den igjen om sendingen feiler, så neste dag
-- prøver på nytt (innenfor vinduet på 2–3 dager, altså høyst én gang til).
-- En rad som står, betyr sendt. Merket kunne ikke skrives ETTER sendingen:
-- gikk e-posten og skrivingen feilet, ville neste morgen sendt igjen —
-- Resends idempotensnøkkel lever et døgn, og cronen går hvert døgn.
--
-- prove_svar: det frivillige spørsmålet nederst i e-posten («Hva var
-- viktigst for deg i uka?») med tre lenker til GET /api/prove/svar. Lenka
-- bærer et HMAC-token av bruker + prøveslutt + utsendingstid, aldri en
-- adresse, aldri en innlogging. Ett svar per bruker og prøve; et nytt trykk
-- overskriver. Ruta skriver bare på en ekte navigering (Sec-Fetch-Dest:
-- document) minst ti minutter etter utsendingen, ellers via en knapp
-- (POST) — e-postskannere følger alle lenkene i en e-post innen sekunder,
-- og skal ikke svare for kunden. Leses av dagsrapporten («Svar fra
-- prøvestartere (7 d)»).
--
-- RLS er på uten policyer på begge: kun service role (cronen, svar-ruta,
-- rapporten og innsynsuttrekket). Slettes kontoen, følger radene med
-- (cascade). Begge er knyttet til bruker-ID og er med i GDPR-eksporten
-- (/api/me/export: trialReminders og trialAnswers, lest med
-- tjenesterollen) og nevnt i personvernerklæringen under betalingsdata.

create table if not exists prove_paaminnelser (
  user_id      uuid not null references auth.users(id) on delete cascade,
  kanal        text not null check (kanal in ('revenuecat')),
  prove_slutt  date not null,
  sendt_at     timestamptz not null default now(),
  primary key (user_id, kanal, prove_slutt)
);

alter table prove_paaminnelser enable row level security;
-- Ingen policyer med vilje: kun service role.

comment on table prove_paaminnelser is 'Sendte påminnelser før første belastning for prøver kjøpt i butikk (App Store via RevenueCat). Én rad per bruker, kanal og prøveslutt-dato; reserveres før sending og slettes om sendingen feiler, så en rad som står betyr sendt. Kun service role. Med i GDPR-eksporten (trialReminders).';
comment on column prove_paaminnelser.prove_slutt is 'Prøveslutt som Oslo-dato (billing_subscriptions.current_period_end). Flytter datoen seg, er det en ny påminnelse.';

create table if not exists prove_svar (
  user_id      uuid not null references auth.users(id) on delete cascade,
  prove_slutt  date not null,
  valg         text not null check (valg in ('omrader', 'offline', 'ai')),
  svart_at     timestamptz not null default now(),
  primary key (user_id, prove_slutt)
);

alter table prove_svar enable row level security;
-- Ingen policyer med vilje: kun service role.

comment on table prove_svar is 'Svar på «Hva var viktigst for deg i uka?» fra påminnelsen før første belastning. Ett svar per bruker og prøve; nytt trykk overskriver. Kun service role; vises bare i eierens dagsrapport.';

notify pgrst, 'reload schema';
