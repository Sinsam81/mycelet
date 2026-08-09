# Artikkelutkast — IKKE PUBLISERT

Disse ligger her og **ikke** i `content/sanketips/` med vilje: byggeskriptet
bygger alt som ligger der, og disse har kjente feil.

Skrevet 2026-08-09, og deretter gjennom to uavhengige kontroller hver —
en mykologi-faktasjekk og en sikkerhetsgjennomgang. Kontrollene fant:

| utkast | faktafunn | sikkerhetsfunn |
|---|---|---|
| hvorfor-finner-du-ikke-sopp | 13 (2 alvorlige) | 9 (3 alvorlige) |
| hva-viser-soppkartene | 3 (1 alvorlig) | 1 alvorlig |
| derfor-aldri-spiselig | 0 | **4 kritiske** |

At sikkerhetsartikkelen har flest kritiske sikkerhetsfunn er ikke ironi — det
er forventet. Den handler om det farligste temaet, så terskelen er lavest der.

## Før noe av dette publiseres

1. Rett hvert funn fra begge kontrollene.
2. Kjør kontrollene på nytt på den rettede teksten. En rettelse kan innføre en
   ny feil, og en tekst som bare er sjekket i utkastform er ikke sjekket.
3. Flytt fila til `content/sanketips/`.
4. Legg slug-en inn i lenkelista i `public/landing/index.html` — den er
   hardkodet, og en artikkel uten oppføring der blir usynlig.
5. Kjør `node scripts/build-articles.mjs`.

## Hvorfor denne prosessen finnes

Faktasjekken på DENNE runden fant blant annet at en kanadisk kantarellstudie
var tillagt feil kilde (Pinna 2010 inneholder den ikke — det er Rochon 2011),
og at en tysk steinsopp-preprint ble brukt til å si det MOTSATTE av sin egen
konklusjon.

Begge feilene fantes også i den allerede publiserte `sopp-etter-regn.md`, og
er rettet der. Det er andre gang denne kontrollen har fanget en kildefeil på
vei ut. Ikke hopp over den.
