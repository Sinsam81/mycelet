# Migrasjoner — hovedbok

> Oppdatert 16. november 2026. Filene ligger i `supabase/migrations/`, og de
> limes inn for hånd i Supabase → SQL Editor, én om gangen, i nummerrekkefølge.

> ⚠️ **STATUS ER IKKE BEKREFTET — EIEREN MÅ BEKREFTE.**
> Det eneste dette dokumentet vet sikkert, er at alle til og med **038** var
> kjørt i produksjon 2. august 2026. For 039–075 står det under hva repoet
> *tyder på*, ikke hva som er sant i databasen. Ingen rad skal leses som
> «kjørt» før eieren har bekreftet den — bruk spørringen under
> [«Én spørring som svarer for alle»](#én-spørring-som-svarer-for-alle) og
> skriv datoen inn i kolonnen.

**Regel fra nå av:** en PR som legger til en migrasjon, legger også til raden
sin i tabellen her, med status «ikke kjørt», og en rad i spørringen lenger ned.
Testen `src/lib/__tests__/migrasjonshovedbok.test.ts` feiler hvis en av dem
mangler. Den som kjører migrasjonen, bytter status til «kjørt» med dato.

Statusverdier:

- **kjørt `<dato>`** — bekreftet av eieren mot databasen.
- **trolig kjørt – bekreft** — en funksjon som er beskrevet som i drift, er
  avhengig av den. Det er en indikasjon, ikke en bekreftelse.
- **ukjent – må bekreftes** — repoet sier ingenting om den er kjørt.
- **ikke kjørt** — ny, venter.

## 075 haster — lim den inn før noen lagrer sitt første sone-funn

Et sone-funn («hemmeligsted-vennlig») skal bare vise hvilken rute funnet ligger
i. Slik ruta ble regnet ut, kan den **eksakte breddegraden** til funnet regnes
ut av tallene kartet gir til alle — ruta skjulte bare øst–vest. Regnestykket
står øverst i fila.

**Ingenting har lekket ennå.** 16. november 2026 fantes det ingen offentlige
sone-funn i databasen (`public_findings` der `is_zone_finding` er sann: 0 av 19
offentlige funn, lest med den åpne nøkkelen). Hullet åpner seg med det første
sone-funnet noen lagrer fra kartet — derfor haster det likevel.

075 er ikke avhengig av noen utgivelse av appen eller av de andre radene i
lista. Den kan limes inn i dag, før alt annet:

1. **Lim inn `075_sonerute_uten_breddegradslekkasje.sql`** i SQL Editor — hele
   fila, uten å merke noe av teksten først — og kjør.
2. **Kontroller.** Kjør spørringen under «Én spørring som svarer for alle» —
   raden `075` skal stå som `true`. Kontroll 3 nederst i fila skal gi `0`.
3. **Skriv datoen** i statuskolonnen for 075 i tabellen under.
4. **Si fra at 075 er kjørt.** Til da lar «Endre deling» på Mine steder ingen
   funn bli sone-funn: bryteren `SONE_OMGJORING_AAPEN` i
   `src/lib/findings/delingsendring.ts` står av, og en test nekter den å stå
   på før raden 075 under er merket «kjørt». Å slå den på er én linje kode.

Fila retter triggeren og stempler sone-funn som måtte finnes, på nytt. Det
den ikke kan gjøre, er å ta tilbake breddegrader noen alt har hentet ut — så
lim den inn mens tallet over fortsatt er 0.

**Lim aldri inn 042 etter 075** — se «Når en tidlig migrasjon kjøres sent».

## 074 hører til utgivelsen den kom i — gjøres samme dag

074 er ikke en rad som kan vente i lista. Koden og migrasjonen er to halvdeler
av samme personvernendring, og den er ikke ferdig før begge er ute. Sett av ti
minutter samme dag som koden deployes, og ta stegene i denne rekkefølgen:

1. **Deploy.** Vent til Vercel viser utgivelsen som «Ready» i produksjon. Åpne
   så `https://www.mycelet.com/api/health`: står ordet `tabeller` i svaret, er
   den nye koden ute.
2. **Last ned dataene dine én gang** (Profil → «Last ned mine data»). Du skal
   få en fil, ikke en feilmelding. Får du en feilmelding: stopp her, og ikke
   gå videre til steg 3.
3. **Lim inn `074_verified_foragers_skjul_merknad.sql`** i SQL Editor og kjør.
4. **Kontroller.** Kjør spørringen under «Én spørring som svarer for alle» —
   raden `074` skal stå som `true`. (De tre kontrollene nederst i fila viser
   det samme i detalj.) Last så ned dataene dine én gang til; det skal fortsatt
   gi en fil. Åpne også forumet: innleggene og merkene skal vises som før.
5. **Skriv datoen** i statuskolonnen for 074 i tabellen under.

Rekkefølgen er ikke valgfri. Kjøres 074 før den nye koden er ute, svarer
dataeksporten med en feil for alle brukere helt til utgivelsen er på plass.
Skjer det likevel, er det ingenting å rette i databasen: fullfør deployen, så
virker eksporten igjen.

## 039–044 (ventelista fra 2. august)

Rekkefølgen er ikke vilkårlig: dataretting → opprydding → tellere → trigger →
indeks og sikkerhet → destruktiv opprydding til slutt. Alle seks er
**idempotente** — kjører du en to ganger, gjør andre gang ingenting. To
forbehold: 041 og 043 oppfører seg annerledes når en senere migrasjon (056 og
054) allerede er kjørt, se «Når en tidlig migrasjon kjøres sent».

| # | Fil | Hva den gjør | Risiko | Status |
|---|---|---|---|---|
| 039 | `039_fix_hvit_traktsopp_spelling.sql` | Retter «Hvit trakttsopp» → «Hvit traktsopp» på art 59 (giftig) | Ingen — én tekstretting | ukjent – må bekreftes |
| 040 | `040_purge_orphan_findings.sql` | Sletter eierløse funn som overlevde en kontosletting | Sletter data, men bare rader uten eier | ukjent – må bekreftes |
| 041 | `041_hidden_content_counters.sql` | Tellerne slutter å telle innhold ingen får se | Ingen — trigger + omregning | ukjent – må bekreftes |
| 042 | `042_freeze_display_location_on_update.sql` | Låser grovkorningen ved første stempling | Avløst av 075: lim inn 075 i stedet, og **aldri** denne etter 075 | ukjent – må bekreftes |
| 043 | `043_geo_index_and_definer_hardening.sql` | Geo-indeks + låser `search_path` på fire SECURITY DEFINER-funksjoner | Ingen — indeks + herding | ukjent – må bekreftes |
| 044 | `044_drop_unused_profile_settings.sql` | Slipper to ubrukte kolonner på `profiles` | **Destruktiv** — se under | ukjent – må bekreftes |

## 045–075

| # | Fil | Hva den gjør | Status |
|---|---|---|---|
| 045 | `045_fix_traktsopp_spelling_in_prose.sql` | Retter «trakttsopp» også i teksten brukeren leser | ukjent – må bekreftes |
| 046 | `046_ametystsopp_ikke_matsopp_og_navnretting.sql` | Sikkerhetsretting: ametystsopp er ikke matsopp, pluss navnretting | ukjent – må bekreftes |
| 047 | `047_normlistekontroll_hele_artslisten.sql` | Sikkerhetskontroll av hele artslisten mot normlisten | ukjent – må bekreftes |
| 048 | `048_forvekslingsdata_14_matsopper.sql` | Forvekslingsdata for 14 matsopper som sto uten | ukjent – må bekreftes |
| 049 | `049_nye_forvekslingsarter.sql` | Åtte nye arter som låser opp forvekslingsdata | ukjent – må bekreftes |
| 050 | `050_handlingsraad_paa_alle_alvorlige_advarsler.sql` | Handlingsråd på alle kritiske og høye forvekslingsadvarsler | ukjent – må bekreftes |
| 051 | `051_soppvarsel.sql` | Tabellene `alert_subscriptions` og `region_daily_scores` | trolig kjørt – bekreft (soppvarselet er i drift) |
| 052 | `052_revoke_anon_paa_varselabonnement.sql` | Tar leserettighetene på `alert_subscriptions` fra anon | ukjent – må bekreftes |
| 053 | `053_tak_paa_varselabonnement.sql` | Tak på antall varselabonnement per bruker | ukjent – må bekreftes |
| 054 | `054_occurrence_year_filter_and_uncertainty.sql` | Årsfilter i `get_occurrences_in_bounds` + koordinatusikkerhet | ukjent – må bekreftes |
| 055 | `055_identification_history.sql` | Tabellen `identifications` («mine identifiseringer») | trolig kjørt – bekreft (historikken er i drift) |
| 056 | `056_soft_delete_findings.sql` | `findings.deleted_at` + filtrering i `public_findings` og `get_user_stats` | ukjent – må bekreftes (se under) |
| 057 | `057_epostvarsel_uten_konto.sql` | Soppvarsel uten konto, med dobbel opt-in | trolig kjørt – bekreft (kontoløs påmelding er i drift) |
| 058 | `058_rls_initplan_optimalisering.sql` | RLS-ytelse: `auth.uid()`/`auth.role()` som init-plan | ukjent – må bekreftes |
| 059 | `059_dropp_saved_places_drift.sql` | Fjerner skjemadriften `saved_places` | ukjent – må bekreftes |
| 060 | `060_varsel_hendelser.sql` | Loggen over sendte varsler per region (`varsel_hendelser`) | ukjent – må bekreftes |
| 061 | `061_x_innlegg.sql` | Loggen over publiserte X-innlegg (`x_innlegg`) | ukjent – må bekreftes |
| 062 | `062_bildekreditering.sql` | Fotograf- og lisenskolonner på artsbildene | trolig kjørt – bekreft (krediteringen er i drift) |
| 063 | `063_varsel_kilde_og_aktivering.sql` | Kilde og åpningstidspunkt på varselpåmeldinger | ukjent – må bekreftes |
| 064 | `064_bruksdager.sql` | Tabellen `bruksdager` | trolig kjørt – bekreft (dagsrapporten leser den) |
| 065 | `065_krittosterssopp_ikke_matsopp.sql` | Sikkerhetsretting: krittøsterssopp er ikke matsopp | ukjent – må bekreftes |
| 066 | `066_bruksdager_steder.sql` | Bruksflaten `steder` | trolig kjørt – bekreft |
| 067 | `067_bruksdager_pris.sql` | Bruksflaten `pris` | trolig kjørt – bekreft |
| 068 | `068_bruksdager_tilbud.sql` | Bruksflaten `tilbud` | trolig kjørt – bekreft |
| 069 | `069_rapportpuls.sql` | Tabellen `rapportpuls` — pensjonert 17. september 2026, ingenting leser eller skriver den | trolig kjørt – bekreft (kun historikk) |
| 070 | `070_flatetellinger.sql` | Tabellen `flatetellinger` + funksjonen `tell_flate` | trolig kjørt – bekreft |
| 071 | `071_soppregistreringer.sql` | Tabellen `soppregistreringer` | trolig kjørt – bekreft |
| 072 | `072_prove_paaminnelser.sql` | Tabellene `prove_paaminnelser` og `prove_svar` | trolig kjørt – bekreft |
| 073 | `073_ai_identifiseringsfeil.sql` | Tabellen `ai_identifiseringsfeil` | trolig kjørt – bekreft |
| 074 | `074_verified_foragers_skjul_merknad.sql` | Kolonnerettigheter på `verified_foragers`: anon og innloggede roller får bare kolonnene forum-merket trenger | **ikke kjørt** — gjøres samme dag som utgivelsen, se øverst |
| 075 | `075_sonerute_uten_breddegradslekkasje.sql` | Sone-ruta røper ikke lenger funnets eksakte breddegrad; eksisterende sone-funn stemples på nytt | **ikke kjørt** — haster, se øverst |

## Én spørring som svarer for alle

Lim inn i SQL Editor. Den leser bare — ingenting i databasen endres — og gir
én rad for hver migrasjon fra 039 til 075. `true` betyr at sporet etter
migrasjonen finnes.

Slik brukes den:

1. Kjør spørringen.
2. For hver rad som står som `true`: skriv «kjørt» og dagens dato i
   statuskolonnen over.
3. Står noen som `false`: ta den med **lavest nummer**, lim inn den fila, og
   kjør spørringen på nytt. Gjenta til alle står som `true`.
4. Blir en rad stående som `false` også etter at fila er limt inn, eller
   stopper fila med en feil: stopp der og spør. Ikke lim inn samme fil flere
   ganger.

Lim aldri inn en fil når raden dens allerede står som `true`. Flere av filene
tåler ikke å kjøres to ganger, og noen gjør skade når de kjøres etter en
nyere — se «Når en tidlig migrasjon kjøres sent».

Tre rader følger ikke steg 3: **075** haster og kan limes inn før alle de
andre, **074** har sin egen rekkefølge (se øverst for begge), og **044** er
frivillig — den kan stå som `false` (se «Om 044»).

```sql
SELECT * FROM (VALUES
  ('039', NOT EXISTS (SELECT 1 FROM mushroom_species WHERE norwegian_name = 'Hvit trakttsopp')),
  ('040', NOT EXISTS (SELECT 1 FROM findings WHERE user_id IS NULL AND (is_negative_observation = false OR visibility = 'private'))),
  ('041', EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.comments') AND tgname = 'comments_count_trigger' AND (tgtype & 16) <> 0)),
  ('042', EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regproc('public.set_display_location') AND prosrc LIKE '%OLD.display_latitude%')),
  ('043', to_regclass('public.idx_occurrences_lat_lng') IS NOT NULL),
  ('044', NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'default_finding_visibility')),
  ('045', NOT EXISTS (SELECT 1 FROM mushroom_species WHERE concat_ws(' ', description, edibility_notes, toxin_info, symptoms) LIKE '%trakttsopp%') AND NOT EXISTS (SELECT 1 FROM look_alikes WHERE concat_ws(' ', similarity_description, difference_description) LIKE '%trakttsopp%')),
  ('046', EXISTS (SELECT 1 FROM mushroom_species WHERE latin_name = 'Laccaria amethystina' AND edibility = 'inedible')),
  ('047', EXISTS (SELECT 1 FROM mushroom_species WHERE latin_name = 'Hygrophoropsis aurantiaca' AND edibility = 'inedible') AND EXISTS (SELECT 1 FROM mushroom_species WHERE data_source = 'ikke_pa_normlisten_egen_vurdering')),
  ('048', (SELECT count(*) FROM look_alikes WHERE (species_id, look_alike_id) IN ((38, 52), (65, 2))) = 2),
  ('049', EXISTS (SELECT 1 FROM mushroom_species WHERE latin_name IN ('Tricholoma filamentosum', 'Tricholoma virgatum', 'Tricholoma saponaceum', 'Tricholoma arvernense', 'Lactarius helvus', 'Ampulloclitocybe clavipes', 'Cortinarius traganus', 'Pleurocybella porrigens'))),
  ('050', NOT EXISTS (SELECT 1 FROM look_alikes WHERE danger_level IN ('critical', 'high') AND difference_description <> '' AND difference_description !~* '(la\s+(den\s+)?stå|kast|ikke\s+spis)')),
  ('051', to_regclass('public.alert_subscriptions') IS NOT NULL),
  ('052', to_regclass('public.alert_subscriptions') IS NOT NULL AND NOT has_table_privilege('anon', to_regclass('public.alert_subscriptions'), 'SELECT, INSERT, UPDATE, DELETE')),
  ('053', to_regproc('public.enforce_alert_subscription_cap') IS NOT NULL),
  ('054', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'species_occurrences' AND column_name = 'coordinate_uncertainty_m')),
  ('055', to_regclass('public.identifications') IS NOT NULL),
  ('056', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'findings' AND column_name = 'deleted_at') AND EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regproc('public.get_user_stats') AND prosrc LIKE '%deleted_at%')),
  ('057', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'alert_subscriptions' AND column_name = 'confirm_token')),
  ('058', EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Brukere kan oppdatere egen profil' AND qual ~* 'select auth\.uid\(\)')),
  ('059', to_regclass('public.saved_places') IS NULL),
  ('060', to_regclass('public.varsel_hendelser') IS NOT NULL),
  ('061', to_regclass('public.x_innlegg') IS NOT NULL),
  ('062', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'mushroom_species' AND column_name = 'primary_image_license')),
  ('063', EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'alert_subscriptions' AND column_name = 'kilde')),
  ('064', to_regclass('public.bruksdager') IS NOT NULL),
  ('065', EXISTS (SELECT 1 FROM mushroom_species WHERE latin_name = 'Pleurocybella porrigens' AND edibility = 'inedible')),
  ('066', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.bruksdager') AND conname = 'bruksdager_flate_check' AND pg_get_constraintdef(oid) LIKE '%''steder''%')),
  ('067', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.bruksdager') AND conname = 'bruksdager_flate_check' AND pg_get_constraintdef(oid) LIKE '%''pris''%')),
  ('068', EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = to_regclass('public.bruksdager') AND conname = 'bruksdager_flate_check' AND pg_get_constraintdef(oid) LIKE '%''tilbud''%')),
  ('069', to_regclass('public.rapportpuls') IS NOT NULL),
  ('070', to_regclass('public.flatetellinger') IS NOT NULL),
  ('071', to_regclass('public.soppregistreringer') IS NOT NULL),
  ('072', to_regclass('public.prove_paaminnelser') IS NOT NULL AND to_regclass('public.prove_svar') IS NOT NULL),
  ('073', to_regclass('public.ai_identifiseringsfeil') IS NOT NULL),
  ('074', NOT EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = to_regclass('public.verified_foragers') AND a.attname = 'note' AND NOT a.attisdropped AND (has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT') OR has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT')))),
  ('075', EXISTS (SELECT 1 FROM pg_proc WHERE oid = to_regproc('public.set_display_location') AND prosrc LIKE '%zone_grid_location%') AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = to_regclass('public.findings') AND tgname IN ('findings_set_display_location', 'findings_updated_at') AND tgenabled <> 'O'))
) AS t(migrasjon, kjort)
ORDER BY migrasjon;
```

### Hva `true` betyr

For de fleste radene er sporet en endring i selve skjemaet — en tabell,
kolonne, indeks, funksjon, trigger eller rettighet som er kommet til eller
tatt bort.

Ni rader endrer data, ikke skjema: **039, 040, 045–050 og 065**. Der sjekker
raden at dataene står slik migrasjonen etterlater dem. Det er nok til å lukke
raden, men det er verdt å vite hva det betyr:

- **040** er en tilstand, ikke en engangshendelse. Den blir `false` igjen hvis
  en konto slettes fra Supabase-dashbordet i stedet for i appen. Da limes 040
  inn på nytt.
- **045** blir `true` allerede når 039 er kjørt, fordi 039 retter de samme to
  tekstene. Da er det ingenting igjen for 045 å gjøre.
- **046, 047 og 065** er sikkerhetsrettingene av spiselighet. `true` betyr at
  ametystsopp (046), falsk kantarell (047) og krittøsterssopp (065) faktisk
  står som «ikke matsopp» i databasen nå. For 047 er falsk kantarell
  stikkprøven; fila retter fire arter i samme kjøring.
- **066 og 067** blir `true` også når en senere av de tre (067, 068) er kjørt:
  den nyeste regelen inneholder de eldre flatene.
- **042** blir `true` også når 075 er kjørt: 075 inneholder vakten 042 legger
  inn. Da er det ingenting igjen for 042 å gjøre, og den skal ikke limes inn.
- **075** sjekker to ting: at triggeren bruker den nye utregningen av
  sone-ruta, og at de to triggerne på `findings` står på. Blir den `false`
  igjen senere, er 042 limt inn etterpå — lim da inn 075 på nytt.

`/api/health` (uten `?fast=1`) sier også fra under `checks.tabeller` når en av
tabellene fra 007, 020, 064 og 070–073 mangler.

### Vil du se mer enn ja/nei

Tolv av filene har en egen kontrollspørring som viser detaljene. De andre
25 har ingen — for dem er raden i spørringen over hele kontrollen.

- **Nederst i fila:** 039, 041, 043, 045, 050, 056, 058, 074, 075
- **I filhodet (før SQL-en):** 040, 042, 044

Tre av dem bør du vite dette om:

- **041**, den andre kontrollen (statistikken), stemmer ikke lenger når 056 er
  kjørt: 056 skriver over funksjonen den måler. Se «Når en tidlig migrasjon
  kjøres sent».
- **042** ber deg oppdatere et funn for å se at posisjonen står stille. Det er
  en skriving. Raden i spørringen over svarer uten å røre noe.
- **058** skal gi 0 rader, men lister de to policyene på `bruksdager` når 064
  er kjørt — de er skrevet etter 058. Det betyr ikke at 058 mangler.

## Når en tidlig migrasjon kjøres sent

Nummerrekkefølgen forutsetter at alt kjøres i tur. Kjøres en tidlig migrasjon
etter en senere, er det fem steder som biter:

- **041 etter 056.** Begge skriver funksjonen `get_user_stats`, og den som
  kjøres sist, vinner. Limes 041 inn når 056 allerede er kjørt, teller profilen
  slettede funn igjen. Spørringen fanger det: raden 056 blir `false`. Lim da
  inn 056 på nytt (den er idempotent). Etter 056 teller profilen til gjengjeld
  skjulte innlegg igjen, uansett rekkefølge. Det er en mangel i 056 som bare en
  ny migrasjon kan rette, ikke en ny kjøring.
- **042 etter 075.** Begge skriver funksjonen `set_display_location`, og den
  som kjøres sist, vinner. 075 inneholder alt 042 gjør, pluss rettingen av
  sone-ruta. Limes 042 inn etterpå, regnes ruta ut på den gamle måten igjen, og
  breddegraden til hvert sone-funn som lagres, kan regnes ut av det kartet
  viser. Når 075 er kjørt, står derfor også raden 042 som `true` — den skal
  ikke limes inn da. Skjer det likevel, blir raden 075 `false`: lim inn 075 på
  nytt. Den er idempotent, og stempler sone-funnene som kom til i mellomtiden.
- **043 etter 054.** 054 erstatter `get_occurrences_in_bounds` med en versjon
  som har ett argument til. 043 prøver å låse `search_path` på den gamle, og
  stopper da med `function public.get_occurrences_in_bounds(…) does not
  exist`. Ingenting er endret når den stopper. Lim da inn 043 uten setningen
  på tre linjer som begynner med
  `alter function public.get_occurrences_in_bounds(` — 054 har allerede låst
  `search_path` på den nye versjonen.
- **049 etter 065.** 065 retter spiseligheten på krittøsterssopp, en art 049
  oppretter. Ble 065 kjørt først, traff den ingen rad, og 049 legger da arten
  inn med det gamle merket («Spiselig — giftig rå»). Raden 065 står som `false`
  til 065 er limt inn på nytt. Gjør det med en gang.
- **066 eller 067 etter 068.** Hver av de tre erstatter regelen for hvilke
  flater `bruksdager` godtar. Limes en eldre inn etter en nyere, stopper den
  med en feil hvis tabellen allerede har rader for de nyeste flatene. Har den
  ikke det, blir regelen smalere igjen, og appen får ikke lenger registrert
  dem. Radene 066 og 067 står derfor som `true` så snart 068 er kjørt, og skal
  ikke limes inn da.

## Om 056 — sletting av eget funn (lagt til 26. august 2026)

**Denne må kjøres før slette-knappen virker.** Til den er kjørt svarer
appen «Funnet ditt er trygt og IKKE slettet» i stedet for å feile stille —
men brukeren kan altså ikke slette funn før migrasjonen er inne.

Idempotent: `ADD COLUMN IF NOT EXISTS` + `CREATE OR REPLACE` hele veien.
Kontrollspørringene ligger nederst i filen; begge skal gi 0 rader.

## Om 044

Den slipper `profiles.default_finding_visibility` og
`profiles.notification_preferences`.

Kontrollert mot produksjon 2. august: **0 filer i `src/` refererer dem**, og alle
17 profilrader holder nøyaktig skjema-standarden fra migrasjon 001 (`'public'` og
`{"finding_comments":true,"forum_replies":true,"season_alerts":true}`). Ingen har
noen gang endret dem, fordi det aldri har vært noe grensesnitt for det.

Å slippe dem mister altså ingen brukervalg. Men det er den eneste destruktive i
lista, så den står sist — og du kan trygt hoppe over den. Ubrukte kolonner koster
ingenting å la stå.

## Etter hver migrasjon

Kjør spørringen under «Én spørring som svarer for alle» på nytt. Raden for
migrasjonen du nettopp limte inn skal ha gått fra `false` til `true`. Skriv så
datoen inn i statuskolonnen over. Har en annen rad gått motsatt vei, fra `true`
til `false`, er det en av fellene under «Når en tidlig migrasjon kjøres sent» —
følg rådet der.

## Hvorfor numrene ble ryddet

Åtte agenter jobbet parallelt i hver sin isolerte kopi av repoet, og hver av dem
tok «neste ledige nummer». Resultatet var **tre filer med 039 og to med 040**.
Innholdet var riktig; bare nummereringen kolliderte. Rekkefølgen over er satt
etter avhengighet, og det er kontrollert at ingen av dem rører de samme
databasefunksjonene — særlig at 043 (som låser `search_path`) ikke skriver over
funksjoner som 041 eller 042 oppretter.

Det samme kan skje igjen når flere grener legger til en migrasjon samtidig:
sjekk at ingen to filer deler nummer før de flettes. Testen nevnt øverst feiler
på to filer med samme nummer.
