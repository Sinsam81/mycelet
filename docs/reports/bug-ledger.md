# Buglogg

| ID | Alvor | Feil / reproduksjon | Rotårsak | Status |
|---|---|---|---|---|
| B01 | Høy UX | Mobilkart → legg til funn → sone: toppen havnet utenfor synlig kart | Arkets høyde var innholdsstyrt uten intern rulling | Fikset live i PR #71 |
| B02 | Middels | Svensk katalog/søk viste eller krevde norske navn | Visning og søk brukte `norwegian_name` direkte flere steder | Fikset live i PR #72/#73 |
| B03 | Høy UX | Kartkontroller dekket mye av mobilkartet og hadde lik visuell prioritet | Alle funksjoner var eksponert samtidig | Fikset live i PR #73 |
| B04 | Kritisk modell | Romlig AUC brukte bakgrunner som kunne være annen sesong/region og SDM-fold med geografisk lekkasje | Tilfeldig bakgrunn og ikke-romlig CV | Fikset i PR #75; korrigert baseline dokumentert |
| B05 | Høy modell | Manglende miljødata ble erstattet med koordinatseedet pseudo-variasjon | Deterministisk placeholder ble behandlet som signal | Fikset live i PR #76; ukjent er nøytralt |
| B06 | Høy modell | Nærlig forekomsttetthet ga poengboost selv om holdout var under tilfeldig | Heuristikk var koblet inn før target-group-validering | Fikset live i PR #76; beholdt kun som informasjon/proveniens |
| B07 | Kritisk produkt | Prediksjonsfliser var fra 23. mai og hadde ingen fungerende daglig kjøring | Cron manglet i deploykonfigurasjon | Fikset live i PR #77; fem regioner ferske og overvåket |
| B08 | Høy modell | Spot-feedback manglet besøkstid, modellversjon og vær/habitat; negative funn kunne forurense offentlig/statistikk | For tynt skjema og direkte klientinnsetting | Fikset live i PR #78 + migrasjon 029 |
| B09 | Høy modell | SMHI-regn og min/maks ble null i historisk cache | Døgnaggregerte CSV-rader har annet kolonneformat enn timerader | Fikset/testet i PR #79; 1 000 SE-rader komplette |
| B10 | Høy modell | `null` i væraudit ble konvertert til tallet 0 | `Number(null) === 0` | Fikset/testet i PR #79 |
| B11 | Middels drift | Gjentatt værimport kunne stoppe på allerede eksisterende førsteside | Eksisterende rader ble filtrert etter at LIMIT var fylt | Fikset i PR #79; skanner videre til manglende rader |
| B12 | Høy modell | Norsk lokal kjøring kunne ikke bygge historikk uten å kopiere produksjonshemmelighet | Frost krever klient-ID | Fikset sikkert i PR #80: avgrenset CRON_SECRET-rute i produksjon |
| B13 | Kritisk analyse | Værvindu ble lært og evaluert på samme rader; bakgrunn kunne være annet år/sted | Ingen holdout og for grov matching | Fikset i PR #81 med 70/30 temporal holdout og lokal/samme-år-prioritet |

## Åpne begrensninger

- `spot_feedback` har fortsatt 0 produksjonsrader og eksisterende funn har ingen vær-/habitatsnapshot. Koden er live; data kommer først fra nye brukerhandlinger.
- Svensk produksjon bruker fortsatt CORINE. Skogsstyrelsens rikere rastertjenester krever konto for REST/WMS; ingen utestet adapter ble aktivert.
- In-memory rate limiting er per Vercel-instans og blir upresis under skalering.
- Supabase viste ingen synlig logisk backup og PITR var av. Dette er en driftsrisiko som krever plan-/kostnadsvalg fra grunnlegger.

