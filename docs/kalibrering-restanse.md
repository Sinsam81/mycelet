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

## Ryddet 2026-08-04: terrain og dekningen

### terrain — MÅLT, og svaret er at høyde ikke tilfører noe

`terrain` var konstanten 50 i alle 15 260 fliser fordi generatoren aldri sendte
`elevation`. Den nærliggende «fiksen» var å koble den på. **Det ville vært feil.**

Testet med samme metode som fuktkartet — matchet kasus-kontroll, 400 par,
bakgrunn fra andre arters funn 0,3–10 km unna, høyder fra Open-Meteo:

| | kantarellfunn | bakgrunn |
|---|---|---|
| p10 | 27 m | 18 m |
| median | **89 m** | **90 m** |
| p90 | 172 m | 183 m |
| **AUC** | colspan | **0,509** |

Rent terningkast. Og **100 % av funnene ligger under 500 m**, som er nøyaktig
der `elevationToTerrainScore` gir flat 90. Å koble på elevation ville byttet
konstanten 50 mot konstanten 90 og ikke tilført én bit informasjon.

**terrain er derfor bevisst inert.** Ikke «fiks» det ved å sende elevation — det
er målt, og det gir ingenting. Skulle noen ta det opp igjen, må de først vise at
høyde diskriminerer, ikke bare at konstanten ser stygg ut.

Dette er nå **fjerde** romlige prediktor på tilfeldighetsnivå:

| lag | AUC |
|---|---|
| forekomstkjerne | 0,52 |
| SGU drenering (SE) | 0,47 |
| NIBIO DTW (NO) | 0,49 |
| **høyde over havet** | **0,509** |

Mønsteret er entydig nok til å slutte å lete etter romlige terrengprediktorer.
Den validerte aksen er tid (fenologi, AUC 0,89) — og siden 2026-08-04 også
**forskjellen mellom landsdeler**, som er 47 poeng mot 7 inne i ett utsnitt.
Se `/api/prediction/regions`.

### Dekningen — utvidet fra 13 til 22 regioner

Ni nye, valgt etter funntetthet i områder som sto uten dekning:

**Norge** (29 ms/rute, ~3 s til sammen): Kristiansand 3297 funn, Tromsø 1470,
Ålesund 1190, Bodø 762.

**Sverige** (329 ms/rute): Kalmar 6376, Falun 2682, Jönköping 2560,
Sundsvall 2553, Östersund 2299. **Kiruna er utelatt** — 191 funn forsvarer ikke
kostnaden hver natt.

De svenske boksene er bevisst smalere enn de norske. Etter utvidelsen:

```
NO   9 regioner · 399 ruter · ~12 s
SE  13 regioner · 420 ruter · ~138 s   (grense 150)
```

Vokser lista videre: **krymp boksene, ikke hev grensen.** Testen «lar hvert land
kjøres for seg» er det som står mellom oss og en cron som timer ut midt i
kjøringen.

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
