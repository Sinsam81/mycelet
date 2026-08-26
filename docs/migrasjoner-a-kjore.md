# Migrasjoner som venter på å kjøres

> Oppdatert 2. august 2026. Alle til og med **038 er kjørt i produksjon**.
> Lim inn én om gangen i Supabase → SQL Editor, i rekkefølgen under.

Rekkefølgen er ikke vilkårlig: dataretting → opprydding → tellere → trigger →
indeks og sikkerhet → destruktiv opprydding til slutt.

Alle seks er **idempotente** — kjører du en to ganger, gjør andre gang ingenting.

| # | Fil | Hva den gjør | Risiko |
|---|---|---|---|
| 039 | `039_fix_hvit_traktsopp_spelling.sql` | Retter «Hvit trakttsopp» → «Hvit traktsopp» på art 59 (giftig) | Ingen — én tekstretting |
| 040 | `040_purge_orphan_findings.sql` | Sletter eierløse funn som overlevde en kontosletting | Sletter data, men bare rader uten eier |
| 041 | `041_hidden_content_counters.sql` | Tellerne slutter å telle innhold ingen får se | Ingen — trigger + omregning |
| 042 | `042_freeze_display_location_on_update.sql` | Låser grovkorningen ved første stempling | Ingen — forebyggende |
| 043 | `043_geo_index_and_definer_hardening.sql` | Geo-indeks + låser `search_path` på fire SECURITY DEFINER-funksjoner | Ingen — indeks + herding |
| 044 | `044_drop_unused_profile_settings.sql` | Slipper to ubrukte kolonner på `profiles` | **Destruktiv** — se under |

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

Kontrollspørringen ligger som kommentar nederst i hver fil. Kjør den, og si fra
hva den gir — så bekrefter jeg mot produksjon.

## Hvorfor numrene ble ryddet

Åtte agenter jobbet parallelt i hver sin isolerte kopi av repoet, og hver av dem
tok «neste ledige nummer». Resultatet var **tre filer med 039 og to med 040**.
Innholdet var riktig; bare nummereringen kolliderte. Rekkefølgen over er satt
etter avhengighet, og det er kontrollert at ingen av dem rører de samme
databasefunksjonene — særlig at 043 (som låser `search_path`) ikke skriver over
funksjoner som 041 eller 042 oppretter.


## 055 — `saved_places` (ny, IKKE kjørt)

`055_saved_places.sql` oppretter tabellen bak «Steder du har markert» og
GPX-importen. Den er idempotent (`create table if not exists`, `drop trigger if
exists` før hver trigger) og rører ingen eksisterende tabell.

Uten den kjørt: `/mine-steder` viser en gul linje om at stedene ikke kunne
hentes, importknappen feiler ved lagring, og resten av appen er upåvirket —
funn, kart og varsel bruker ikke tabellen.

**Merk `revoke all ... from anon` nederst i fila.** Prosjektet har
`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon` stående, så en ny
tabell får anon-rettigheter automatisk. Samme lærdom som migrasjon 052.

Kontrollspørringen ligger som kommentar nederst i fila.
