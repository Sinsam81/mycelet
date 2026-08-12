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


---

## Runde 2 — 2026-08-09 kveld

Alle funn fra runde 1 ble rettet, og teksten deretter kontrollert på nytt av
**ferske** faktasjekkere og sikkerhetsgjennomganger som ikke hadde sett
utkastene før.

**Resultat: 0 av 3 klarert.** Begge kontrollene sier fortsatt MÅ RETTES på alle
tre.

### Det som ble bedre

Faktasjekken fant **ingen oppdiktet eller feilattribuert kilde** denne gangen.
Alle studiene finnes, med riktig forfatter, år, tidsskrift og sidetall, og de
sier det teksten sier de sier. Det var hovedproblemet i runde 1, og det er løst.

Den som rettet, kontrollerte kildene selv — lastet ned PDF-er, søkte i
fulltekst, og avviste én rettelse som var feil (se under).

### Lærdommen fra runde 2: faktasjekkeren tar også feil

Kontrollen hevdet at artikkelen oppga feil sesongvekt for appen (10/22/35 mot
5/10/15). Kontrollert i koden: **begge finnes**, for to ulike modeller.

| | brukes til | skala |
|---|---|---|
| `computeSeasonalScore` (prediction.ts) | prediksjon per rute på kartet | 5 / 10 / 15 |
| `SEASON_WEIGHT_BY_MONTH` (mushroom-day.ts) | dagsscoren på forsiden og /soppforhold | 10 / 22 / 35 |

Artikkelen skrev om dagsscoren og hadde rett. Faktasjekkeren så på feil
funksjon. **Hadde rettelsen blitt gjort blindt, ville vi innført en feil.**

Derfor står regelen: den som retter, skal kontrollere kilden — og koden — selv,
og skal avvise funn som ikke holder.

### Hva som gjenstår

Runde 2 ga fjorten nye punkter på den ene artikkelen alene. Flere handler om
belegg for påstander som er *sannsynlige, men ikke dokumenterte* — den typen
som er billigst å stryke.

Vurdér før runde 3: er alle tre artiklene verdt kostnaden, eller skal én
prioriteres og de to andre legges bort? Én publisert artikkel som holder, er
mer verdt enn tre som nesten gjør det.


---

## Runde 3 — 2026-08-12 natt

Kjørt kun på **hva-viser-soppkartene** (etter dokumentets eget råd: én god
foran tre nesten-gode). Fire ferske blikk (eksterne kilder, interne tall mot
koden, sikkerhet, språk) + to skeptikere per funn.

**Funn: 8 bekreftet (4 major), 3 avkreftet — alle rettet samme natt.** De
viktigste: foreldede forekomsttall presentert i presens, oversalg av hva
valideringen faktisk dekker, retningspåstand i et støynivå-resultat, og en
motsigelse mot publiserte les-terrenget.md (den publiserte tok feil — rettet).

**Sluttkontroll med ferske øyne: utkastet KLARERT.** Eneste funn var i den
allerede publiserte sopp-etter-regn.md (samme retningspåstand som runde 3
fjernet fra utkastet) — rettet i samme slipp.

Artikkelen er flyttet til content/sanketips/ og publisert via PR (2026-08-12/13).
Gjenstår i denne mappa: **hvorfor-finner-du-ikke-sopp** (13+9 funn i runde 1,
fjorten nye i runde 2) og **derfor-aldri-spiselig** (4 kritiske sikkerhetsfunn
— skal IKKE gjøres uten menneske i loopen).
