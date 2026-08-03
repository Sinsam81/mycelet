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

## Status: alt utenom ett er ryddet

Fikset i [#131](https://github.com/Sinsam81/mycelet/pull/131):

| funn | hva som ble gjort |
|---|---|
| Mai motsa seg selv (`flush.ts:164`) | Begge portene leser `isInMushroomSeason`, utledet av vekttabellen. Artsporten kjøres først, så vårarter med egen kurve fortsatt får uttale seg. |
| Grå «dårlig dag» uoppnåelig (`PlaceForecastStrip.tsx:133`) | Begge stripene deler `forecast-scale.ts`, rekalibrert til 55/85. Søylehøydene er relative til uka. |
| Overskriften sto stille (`page.tsx:70`) | `season-headline.ts`. **Og en verre feil sveipen ikke fanget:** tallet som ble sendt inn var `inSeasonEdible.length`, kappet på 6, så august (39) og januar (2) leste likt. Det fulle tallet regnes nå før kuttet. 8 distinkte setninger mot 4. |
| 12 like søkeområder (`topSpotArea.ts:56`) | Rangeres innenfor settet, som flislaget. |

### «Forholdene er modne nå» — ikke en feil

Hypotesen var at fuktbøtta metter. **Målingen drepte den.** Å øke kapasiteten
gjør det verre, fordi en større bøtte tømmes saktere og fordampingen er kappet
på 5 mm/døgn (Open-Meteo ERA5, 6 steder NO+SE, 2019–2024, n = 3 312 aug–okt):

| kapasitet | = 1,000 | andel ≥ 0,55 |
|---|---|---|
| 50 mm | 26,2 % | 76,6 % |
| 150 mm | 24,0 % | **91,1 %** |

Modellen har rett: nordisk høstmark **er** våt. Banneret er ikke feil — det er
ubrukelig som *råd* når det gjentar seg i tjue dager. Det sier nå hvilken dag som
blir best i stedet. **Ikke rør fuktmodellen på dette grunnlaget.**

---

## Det ene som gjenstår

### terrain er konstanten 50 i 100 % av rasteret · `api/cron/generate-tiles/route.ts:153`

`cell-score.ts:118` faller til 50 når `elevation` mangler. De tre live-rutene
sender den; **flisgeneratoren gjør det ikke**. Signalet fantes til 2026-07-14
(commit `fb6d1c5` innførte elevation uten å oppdatere generatoren) — i
23. mai-batchen spente terrain 25–84 med 57 unike verdier.

Målt: `components.terrain = 50` i **15 260 av 15 260 fliser**, hver dag fra
2026-07-14 til 2026-08-02.

**Bevisst nedprioritert, av to grunner:**

⚠️ Terrain bidrar `terrain × 0,024` til den lagrede scoren — **0,62 poeng** over
hele sitt realiserte spenn, ~0,7 % av verdiområdet. Dette er *ikke* grunnen til
at kartet ser flatt ut, og må ikke selges som det.

⚠️ Å bare koble på elevation løser ingenting: `elevationToTerrainScore` gir flat
90 under 500 m, og ekte høyde for alle 109 flisceller er 10–709 m med median 247
— **94,5 % ville fått nøyaktig 90**. Konstanten 50 byttes mot konstanten 90.
Skalaen må rekalibreres mot høydene som faktisk finnes, ellers er fiksen
kosmetisk.

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
