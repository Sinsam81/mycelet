# Kalibrering av dommene på kartet

**Skrevet 2026-08-02.** Bakgrunn: Sindre om kartet — *«Jeg føler ikke at dette gir
noe verdi. Det sier at alle steder er like gode å lete.»*

Konklusjonen etter måling: han hadde rett i symptomet, men årsaken var ikke at
appen var for ærlig. Skalaen var feilkalibrert, og språket var gradbøyd i stedet
for strukturelt ulikt.

## Hva som var galt

### 1. Den nederste dommen var uoppnåelig

`scoreToCondition` og `verdictText` brukte tersklene **75 / 55 / 35**, satt som om
scoren brukte hele 0–100. Det gjør den ikke.

Målt over hele `prediction_tiles` i produksjon 2026-08-02 (n = 1000):

```
spenn 43–85 · p25 = 50 · median = 55 · p75 = 59 · p95 = 80
```

Minimumsverdien som finnes er **43**. Terskelen for «svake forhold» var **35**.
Appen kunne altså bokstavelig talt aldri si at det var lite sopp i skogen.

Fordelingen av dommer med de gamle tersklene:

| dom | andel av rasteret |
|---|---|
| Svake forhold | **0,0 %** |
| Brukbare forhold | 71,0 % |
| Gode forhold | 25,7 % |
| Svært gode forhold | 3,3 % |

**71 % av landet fikk samme dom.** Det er flatheten brukeren opplever.

### 2. Årsaken til at scoren ikke sprer seg

I `computeAdvancedEnvironmentScore` er `vegetation`, `terrain` og `soil` satt til
konstanten 50 når skogdata mangler. De veier 0,3 + 0,12 + 0,1 = 52 % av
miljøleddet:

```
environment = 0,3·50 + 0,12·50 + 0,1·50 + 0,25·moisture + 0,23·trend
            = 26 + …                        // gulv 26, tak 74
```

Over halve miljøleddet er en konstant. Spennet er derfor bygget inn i modellen.
Det er ikke rettet her — det er en større jobb — men tersklene tar nå hensyn til
det.

### 3. De fire dommene var samme setning

```
Svært gode forhold for kantarell nå
Gode forhold for kantarell nå
Brukbare forhold for kantarell nå
Svake forhold for kantarell nå
```

Fire setninger med identisk hale, som skiller seg på ett adjektiv. En tooltip er
et halvt sekunds blikk — det holder ikke å gradbøye.

## Hva som er gjort

Nye terskler, forankret i den målte fordelingen:

```ts
VERDICT_PEAK_MIN     = 72   // topp ~10 % av det som faktisk forekommer
VERDICT_GOOD_MIN     = 60   // topp ~25 %
VERDICT_STARTING_MIN = 50   // rundt medianen
```

Ny fordeling over de samme 1000 rutene:

| dom | gammel | ny |
|---|---|---|
| Lite sopp i skogen nå | 0,0 % | **38,5 %** |
| Så vidt i gang | 71,0 % | 44,5 % |
| Gode dager | 25,7 % | 11,9 % |
| Nå er det … 🍄 | 3,3 % | **5,1 %** |

Og strukturelt ulike setninger:

```
Lite kantarell i skogen nå (43/100)
Kantarell er så vidt i gang (52/100)
Gode dager for steinsopp nå (64/100)
Nå er det kantarell 🍄 (76/100)
```

Kartets tooltip leder nå med dommen og har tallet i parentes. Før sto det
`Best nå: Kantarell 52/100 — Gjelder hele ruta — ikke et bestemt punkt i den` —
et tall uten mening, etterfulgt av en ren ansvarsfraskrivelse.

## Om ærligheten

Forbeholdet om at ruta gjelder som helhet er **ikke fjernet**. Det er flyttet fra
tooltipen til popupen (`searchAreaExplainer`), der brukeren faktisk leser
detaljer. Prinsippet: *forbeholdet hører i detaljen, verdien hører i
overskriften.* Det motsatte — disclaimer som overskrift — var det som gjorde
kartet verdiløst.

Ingen påstand om treffsikkerhet er endret. Den romlige AUC-en er fortsatt ~0,52,
og appen rangerer fortsatt ikke område 1 mot område 4. Det som er endret er at
appen nå **kan si at det er dårlig**, og at den sier det tydelig når det er bra.
Det er den validerte aksen: tid, AUC 0,89.

## Rettelse: fordelingstallene over gjelder feil populasjon

Tabellen «gammel mot ny» er målt over **alle artsrader** i `prediction_tiles`.
Kartet tegner ikke dem — det tegner **beste art per rute**, kuttet på 80. Over
den populasjonen er fordelingen med de nye tersklene **78 / 15 / 5 / 2 %**, ikke
38,5 / 44,5 / 11,9 / 5,1 %.

Det er ikke en detalj. 78 % «poor» var grunnen til at første forsøk på gradert
dekkevne gjorde laget usynlig — se [kartets-dekning.md](kartets-dekning.md) og
kommentaren over `fillOpacitiesForScores`.

**Lærdom for neste måling:** mål på det `updateHeatLayer` faktisk tegner
(`bestTilePerCell` + `slice(0, 80)`), ikke på råtabellen.

## Tersklene løser ikke flathet på én skjerm

Kalibreringen er riktig, men den fikser en annen ting enn den ser ut til.
Målt med kollapsen kartet tegner: score-spennet **inne i ett kartutsnitt** har
median **7 poeng**, mens den smaleste bøtta er **10 poeng** bred. En absolutt
firetrinns skala kan derfor per konstruksjon ikke skille noe på én skjerm — 68 %
av dagens utsnitt er ensfargede ved standard zoom, 85 % ved den zoomen kartet
lander på etter posisjonsbestemmelse.

All variasjon ligger **mellom** dager og regioner, som brukeren aldri ser side om
side. Derfor er dekkevnen nå relativ til utsnittet (`fillOpacitiesForScores`)
mens fargen forblir absolutt.

## Hva som gjenstår

- **Kompresjonen i selve modellen** (punkt 2 over). Ekte skogdata for flere ruter
  ville gitt reell spredning i `vegetation`/`soil`/`terrain` i stedet for
  konstanten 50. Måling 2026-08-02: 20 av 49 ruter på Nesodden har SR16-data.
- **Tersklene bør etterprøves når rasteret dekker en hel sesong.** Fordelingen
  over er målt på to augustdatoer. I september vil den flytte seg oppover, og da
  skal ikke «Nå er det kantarell 🍄» fyre på halve kartet. Kjør målingen i
  `docs/kalibrering-av-dommene.md` på nytt i uke 38 og juster.
