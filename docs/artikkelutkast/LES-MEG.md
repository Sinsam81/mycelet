# Artikkelutkast — IKKE PUBLISERT

Disse ligger her og **ikke** i `content/sanketips/` med vilje: byggeskriptet
bygger alt som ligger der, og disse har kjente feil.

Skrevet 2026-08-09, og deretter gjennom to uavhengige kontroller hver —
en mykologi-faktasjekk og en sikkerhetsgjennomgang. Kontrollene fant:

| utkast | faktafunn | sikkerhetsfunn | status |
|---|---|---|---|
| hvorfor-finner-du-ikke-sopp | 13 (2 alvorlige) | 9 (3 alvorlige) | publisert 2026-08-14 etter runde 3 |
| hva-viser-soppkartene | 3 (1 alvorlig) | 1 alvorlig | publisert 2026-08-13 etter runde 3 |
| derfor-aldri-spiselig | 0 | **4 kritiske** | ligger her — KUN med menneske i loopen |
| naar-kommer-traktkantarellen | 20 (1 kritisk: byggefeil ga «1. september» i HTML) | 7 (1 alvorlig: skive-ordlyd harmonert til «tykke, fjerntstående» per fem-forvekslinger/SNL) | runde 1 26.08: 4 linser + skeptiker-verifisering, 27 bekreftede funn rettet; venter på endelig menneskelig klarering før publisering |

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

---

## Runde 3 for hvorfor-finner-du-ikke-sopp — 2026-08-14

Samme oppsett som kartartikkelens runde 3: ferske blikk + to skeptikere per
funn. **13 bekreftet (5 major), 2 avkreftet — alle rettet samme kveld.**

Det viktigste funnet var at den tyske steinsopp-preprinten kom i **versjon 2**
8. juni 2026, og at v2 forkaster femdagersvinduet artikkelen (og publiserte
sopp-etter-regn.md) bygde på: v2 finner temperaturoptimum ≈13 °C målt over
20 døgn og nedbørseffekt akkumulert over 26 døgn. v2 ble lest i fulltekst før
rettelsen; begge tekstene forteller nå samme historie. Lærdom: **preprints får
nye versjoner — sjekk versjonsnummeret hver gang kilden gjenbrukes.**
Appens femdagersregel var aldri kalibrert på preprinten (feltregler,
dokumentert i flush.ts), så ingen kodeendring.

Sluttkontroll med ferske øyne på den rettede teksten: **8 nye funn, alle
bekreftet av begge skeptikere, alle rettet** — 2 i utkastet (oversalg av hva
/soppforhold-siden viser: fuktkomponent og «sjekk punktene» — siden viser bare
samletallet) og 6 i den allerede publiserte sopp-etter-regn.md (feil
orellanin-latens «to–tre døgn» mot kildens 36 t–6 døgn, feltregler som ikke
stemte med flush.ts, foreldet funn-tall 315 000, og en annenhånds-detalj uten
forbehold). Deretter en siste klareringsrunde før PR.

Gjenstår i denne mappa: **derfor-aldri-spiselig** (4 kritiske sikkerhetsfunn
— skal IKKE gjøres uten menneske i loopen).
