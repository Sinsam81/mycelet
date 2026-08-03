# Testet: markfuktighet (DTW) som romlig prediktor — negativt

**Målt 2026-08-03.** Kom ut av datakatalogen (`N-HAB-05 Markfuktighetskart`), som
sier laget er *«svært relevant for kantarell, traktkantarell og andre arter der
drenering og fuktighet påvirker fruktsetting»*.

**Konklusjon: det diskriminerer ikke. Ikke bruk tid på det igjen.**

## Hva laget er

NIBIOs markfuktighetskart er en **DTW-modell** — dybde til grunnvann — i klasser:

| klasse | farge |
|---|---|
| vann | mørk marineblå |
| 0 – 0,25 m | blå |
| 0,25 – 0,5 m | dodgerblå |
| 0,5 – 0,75 m | himmelblå |
| 0,75 – 1 m | lys himmelblå |
| > 1 m | hvit |

Nasjonal dekning, **~2 meters oppløsning**, lisens **CC BY 4.0** (fri kommersiell
bruk med kreditering). Det er den fineste oppløsningen noe kartlag i Mycelet har —
rasteret ellers har 3–8 km ruter.

## Slik hentes det (virker, hvis noen trenger laget til noe annet)

```
https://wms.nibio.no/cgi-bin/markfuktighetskart
  ?service=WMS&version=1.3.0&request=GetMap
  &layers=markfuktighetsklasser&crs=EPSG:25833
  &bbox=<minE>,<minN>,<maxE>,<maxN>&width=..&height=..&format=image/png
```

Tre feller som kostet tid:

1. **GetFeatureInfo gir «Search returned no results»** — det er et rasterlag.
   Man må lese pikselfargen fra GetMap.
2. **Akserekkefølgen er (øst, nord)** for EPSG:25833 på denne serveren, ikke
   (nord, øst). Feil rekkefølge gir et helt hvitt bilde uten feilmelding.
3. **Klasselaget rendres bare på stor målestokk.** Over ~1 km bredde er alt
   hvitt. Under ~500 m kommer klassene fram. `dtw_dekning` viser derimot dekning
   på alle nivåer, og er den man bør sjekke først.

Legendens URL må ha `STYLE=default`, ellers svarer serveren `MissingParameterValue`.

## Testen

**Design:** matchet kasus-kontroll med *target-group background*. For hvert
kantarellfunn ble det trukket et bakgrunnspunkt fra **andre sopparters** funn
0,3–10 km unna. Det kontrollerer både for hvor folk faktisk går (tilgjengelighets-
skjevheten som spiste det romlige signalet før) og for regionalt klima.

**Datagrunnlag:** `species_occurrences`, 300 matchede par i Norge. For hvert punkt
ble et 64 × 64 m vindu samplet i 32 × 32 piksler (~2 m/px), og andelen fuktige
klasser samt middel-DTW regnet ut.

## Resultat

| mål | kantarellfunn | bakgrunn | AUC |
|---|---|---|---|
| andel fuktig mark (0–1 m) | median 0,000 · snitt 0,054 | median 0,000 · snitt 0,061 | **0,496** |
| middel-DTW (m) | median 1,500 · snitt 1,397 | median 1,500 · snitt 1,407 | **0,489** |

AUC 0,5 er rent terningkast. Bakgrunnen er marginalt *fuktigere* enn funnene.

Over 90 % av begge settene ligger i «> 1 m»-klassen — de våte klassene er smale
render langs bekkedrag, og kantarell står ikke i dem oftere enn annen sopp gjør.

## Hva det betyr, og hva det ikke betyr

**Gyldig:** DTW kan ikke rangere steder for en gitt art. Det er det appen gjør, så
for vårt formål er svaret nei.

**Ikke vist:** at fuktighet er irrelevant for sopp generelt. Bakgrunnen er *andre
soppfunn*, så testen fjerner alt som er felles for all sopp. Skulle noen teste den
påstanden, trengs ekte fravær-data — som vi ikke har.

## Dette er det tredje romlige laget som gir null

| lag | AUC |
|---|---|
| forekomstkjerne (avstandsdempet) | 0,52 |
| SGU drenering (Sverige) | 0,47 |
| **NIBIO DTW (Norge)** | **0,49** |

Tre uavhengige terrengbaserte fuktproxyer, alle på tilfeldighetsnivå mot
target-group-bakgrunn. Mønsteret er tydelig nok til å slutte å lete der.

Den validerte aksen er fortsatt **tid** (fenologi, AUC 0,89). Se
[kalibrering-av-dommene.md](kalibrering-av-dommene.md) for hvordan produktet
er bygget rundt det.
