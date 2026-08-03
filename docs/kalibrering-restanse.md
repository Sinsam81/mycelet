# Restanse fra kalibreringssveipen

**Sveip kjørt 2026-08-02/03.** 29 agenter lette etter søsken av én feilklasse:
*en terskel eller skala satt for et verdiområde som ikke finnes.* 11 funn
bekreftet, 14 motbevist av skeptikeragenter.

Fikset i [#127](https://github.com/Sinsam81/mycelet/pull/127),
[#128](https://github.com/Sinsam81/mycelet/pull/128) og
[#129](https://github.com/Sinsam81/mycelet/pull/129):
dommene på kartet, kartfargene + dekkevnen, og de tre panelene på forsiden.
Bakgrunnen står i [kalibrering-av-dommene.md](kalibrering-av-dommene.md).

Under står det som gjenstår, med målingene, så neste runde slipper å måle på
nytt.

---

## Prinsippet de tre løsningene delte

Alle tre feilene hadde samme form, og alle tre ble løst likt:

> **Absolutt for ærlighet, relativ for lesbarhet.**

Fargen på en rute, dommen over den og ringen på forsiden sier hvor bra det er i
seg selv — de skal ikke lyve. Dekkevnen på kartet og søylehøyden i stripen sier
hvilken av de synlige som er best — de er rangeringer, ikke spådommer.

Grunnen er målt: variasjonen innenfor ett kartutsnitt (median 7 poeng) og
innenfor én uke (median 17 poeng) er smalere enn den smaleste bøtta i enhver
absolutt firetrinns skala. All variasjon ligger *mellom* dager og regioner, som
brukeren aldri ser side om side.

**Sjekk dette først** hvis noe annet i appen ser flatt ut.

---

## Gjenstående funn

### terrain er konstanten 50 i 100 % av rasteret · `api/cron/generate-tiles/route.ts:153`

`cell-score.ts:118` faller til 50 når `elevation` mangler. De tre live-rutene
sender den; **flisgeneratoren gjør det ikke**. Signalet fantes til 2026-07-14
(commit `fb6d1c5` innførte elevation uten å oppdatere generatoren) — i
23. mai-batchen spente terrain 25–84 med 57 unike verdier.

Målt: `components.terrain = 50` i **15 260 av 15 260 fliser**, hver dag fra
2026-07-14 til 2026-08-02.

⚠️ **Ikke prioriter dette som «grunnen til at kartet er flatt».** Sveipens egen
skeptiker regnet etter: terrain bidrar `terrain × 0,024` til den lagrede scoren,
altså **0,62 poeng** over hele sitt realiserte spenn — ~0,7 % av verdiområdet.

⚠️ **Og ikke bare koble på elevation.** `elevationToTerrainScore` gir flat 90
under 500 m. Ekte høyde for alle 109 flisceller er 10–709 m, median 247 → **94,5 %
ville fått nøyaktig 90**. Da byttes konstanten 50 mot konstanten 90, og kartet
blir like flatt, bare litt lysere. Skalaen må rekalibreres mot høydene som
faktisk finnes, ellers er fiksen kosmetisk.

### Grå «dårlig dag» er uoppnåelig i sesong · `PlaceForecastStrip.tsx:133`

Uttømmende oppregning av alle 36 nåbare værkombinasjoner mot `seasonWeight`:
i aug/sep/okt er sesongvekten 35, så laveste nåbare score er 35. Grått krever
< 40.

- **aug–okt:** grå 1 av 36 = **2,8 %**, og den ene krever døgnmiddel utenfor
  6–22 °C *og* < 10 mm regn på 14 dager *og* luftfuktighet < 65 % samtidig.
- juni til sammenligning: grå 41,7 %.

Stripen kan altså ikke si «ikke bry deg denne uka» i den ene perioden det betyr
noe. Dette er et **fjerde** terskelsett på samme skjerm — vurder å la den lese
fra samme sted som resten.

### «Forholdene er modne nå» sluker to av tre høysesongdager · `flush.ts:207`

Mai–nov, n = 17 584: fruiting **52,5 %** (september 66 %, oktober 69 %).

Årsaken er at fuktindeksen er en bryter, ikke en skala: **21,1 %** av aug–okt
ligger nøyaktig på 1,000 og 40,7 % ≥ 0,9, mens bare 12,5 % ligger i ±0,1 rundt
terskelen 0,55. Blant de fastlåste dagene er regn over 14 døgn median 92 mm,
p95 193 mm, maks 307 mm — mot en **bøttekapasitet på 50 mm**. Bøtta renner over
og mister all oppløsning i den øvre enden.

Banneret som skal svare «gå nå eller vent?» sier «gå nå» nesten alltid, og
skiller ikke en gjennomvåt uke fra en akkurat-passe-fuktig.

### Sesongporten spriker i mai · `flush.ts:164`

`assessFlush` slipper gjennom fra `month >= 5`, `assessMushroomDay` fra
`month >= 6`. Mai, n = 2212: **540 dager (24,4 %)** viser det grønne
«Forholdene er modne nå 🍄», og **540 av 540 (100 %)** har en ring som ikke er
grønn over seg, fordi `optimal` forekommer i 0,0 % av maidagene.

Kortet motsier seg selv i en hel måned. Enkleste fiks: la de to lese samme
sesongport.

### `headlineFewInSeason` er uoppnåelig · `page.tsx:70`

`edibleCount` er antall matsopp i sesong. Målt mot ekte `mushroom_species`
(n = 72), per måned jan→des: **2, 2, 2, 4, 5, 8, 20, 39, 46, 46, 16, 4**.
Minimum over året er 2, og `baseSeasonMask` kan bare *legge til* måneder — så
terskelen for «få arter i sesong» treffer aldri.

Følgen: **10 av 12 måneder** får samme setning «… i skogen». Årets viktigste
overgang for en soppapp, 31. juli → 1. august, endrer «Sommer i skogen» til
«Høysesong i skogen» — 9 av 15 tegn står stille.

### De 12 søkeområdene er per konstruksjon én farge · `topSpotArea.ts:56`

Sirklene fargelegges med den globale paletten, men settet ER de 12 høyest
scorende cellene lokalt. Proxy-måling på rasteret: **78 %** av settene får
nøyaktig én palettfarge, resten to, aldri tre eller fire.

12 identiske sirkler — samme farge, samme gjennomsiktighet, samme størrelse.
Brukeren må åpne popup på hver enkelt for å se tallet.

Dette er samme feil kartlaget hadde, og har samme løsning: rangér innenfor
settet. Se `fillOpacitiesForScores` i `condition-colors.ts`.

*(Proxy-forbehold: grid-ruta regner live på ~1,4 km oppløsning, ikke fra fliser,
så tallet viser klassen — ikke den eksakte andelen for søkeområdene.)*

---

## Hvordan måle på nytt

To feller kostet meg feil svar første gang:

1. **PostgREST kapper på 1000 rader.** Første utstrekningsmåling leste én side og
   ga «148 ruter, 181 km» mot fasit «226 ruter, 515 km». Paginer med
   `Range`-hode, eller hent ytterpunktene med `order=…&limit=1`.
2. **Mål det kartet TEGNER**, ikke råtabellen. `updateHeatLayer` bruker
   `bestTilePerCell` + `slice(0, 80)`. Over råtabellen er «poor» 38,5 %; over det
   som faktisk tegnes er den 78 %.

Og for visuelle endringer: bygg et Leaflet-prøvekart med ekte fliser over ekte
Kartverket-bakgrunn og **se på det**. Fire varianter ble forkastet den veien.
Mål gjerne pikselforskjellen også — men juster utsnittene først; 10 piksler i
utakt ga meg «77 % endret» der fasit var 0,6 %.
