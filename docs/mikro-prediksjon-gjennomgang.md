# Kan Mycelet peke deg 150 meter til et bedre skogparti? Gjennomgang 13.–14. september 2026

> Spørsmålet fra eieren: «Når man går i skogen er det ofte åpenbart om man er i
> et godt kantarellområde. Kan appen si at 150 meter østover er mye bedre enn
> her?» Dette dokumentet er svaret, med tall. Gjennomført av 53 uavhengige
> arbeidsagenter i seks lag: kartlegging av dagens modell, fagkunnskap per art,
> datakilder, empirisk signaltest mot egne funndata, fire konkurrerende design
> med tre dommere, og åtte motstandere som prøvde å rive alt ned.

## Svaret, kort

**Teknisk mulig, faglig ikke forsvarlig nå.** Dataene finnes i riktig oppløsning
(NIBIO SR16 gir et 2 × 2 km vindu med 16 m-ruter på et halvt sekund; Kartverkets
høydedata gir terrenget), men de skiller ikke et godt skogparti fra naboen
100–300 meter unna. Målt på våre egne funndata treffer en modell på SR16 +
terreng riktig parti **55 av 100 ganger, mot 50 for mynt**. Av det er anslagsvis
2–3 poeng sti-nærhet, ikke skog. Bare traktkantarell viser noe som ligner et
signal (61 av 100), og det hviler på små og sprikende utvalg.

Det du ser i skogen — mose, humus, feltsjikt, fuktighet på bakken — finnes ikke
i noen datakilde. Det dataene ser, er trestørrelse og treslag. Og funndataene fra
Artsobservasjoner beskriver først og fremst **hvor folk går**: funnpunkter ligger
i median 31 m fra nærmeste sti, deres egne kontrollpunkter 100–300 m unna ligger
41 m fra sti, tilfeldige skogpunkter 69 m. Den skjevheten overlever selv et paret
oppsett.

Konklusjon: ikke bygg kompasset. Bygg i stedet den datatypen som mangler, og rett
to feil i dagens modell som gjennomgangen fant på veien.

## Hva som ble testet

12 tester: fire områder (Oslo/Nordmarka, Bergen, Trondheim, Innlandet) × tre
arter (kantarell, steinsopp, traktkantarell). For hvert funn i Artsobservasjoner
(GBIF) ble det trukket et **paret kontrollpunkt 100–300 m unna i samme skog**, og
et tilfeldig skogpunkt i samme område. Alle punkter fikk SR16-attributter
(treslag, bonitet, volum, kronedekning, trehøyde, stammetall) og terreng
(høyde, helning, himmelretning). En liten modell med kryssvalidering ga AUC for
«funn mot paret kontroll» (det ærlige tallet) og «funn mot tilfeldig bakgrunn».
Totalt 684 par.

| Art | AUC funn vs. paret kontroll (samlet, 95 % KI) | Tolkning |
|---|---|---|
| Steinsopp | 0,507 (0,45–0,57) | ingenting |
| Kantarell | 0,534 (0,49–0,58) | ingenting / nederst i «svakt» |
| Traktkantarell | 0,611 (0,56–0,66) | nedre kant av «brukbart», sprikende mellom områder (0,53–0,70) |
| **Alle** | **0,552 (0,52–0,58)** | svakt, ikke brukbart |

Funn mot tilfeldig bakgrunn ga median AUC 0,73. Gapet mellom 0,73 og 0,55 er
tilgjengelighetsskjevhet: høyde over havet alene reproduserer nesten hele
bakgrunns-AUC-en. En modell trent på funn mot tilfeldige punkter lærer «hvor
folk går» og ser bra ut i en tradisjonell test, mens den er ubrukelig til å
skille et parti fra naboen. Dette bekrefter prosjektets tidligere romlige
validering (AUC ≈ 0,52) i 30 ganger finere skala.

Det ene som går igjen: **større trær, mer stående volum, færre stammer** i
funnrutene, med små effekter (Cohens d 0,1–0,45). Terreng (helning,
himmelretning) er null innen skogen i 12 av 12 tester. Bonitet skiller
landskap, men ikke naboparti. Treslagseffekten snur fortegn mellom områder.

## Hvorfor det blir sånn

- **Funndata er sti-data.** Funn mot paret kontroll: funnpunktet ligger nærmere
  stien i 57 % av parene (p < 0,001). En «innsats»-modell alene gir 0,52 innen
  par. Det gjenværende habitatsignalet er ≈ 0,53.
- **Det som gjør et sted åpenbart godt, er ikke kartlagt.** Mose, humusdybde,
  feltsjikt og markfukt på bakken finnes ikke som data i Norge eller Sverige.
- **SR16 mangler alder og hogstklasse i den offentlige tjenesten.** De to
  attributtene fagkunnskapen peker sterkest på, kan ikke hentes. Aldersleddet i
  habitatmodellen vår kan derfor aldri slå inn.
- **Koordinatusikkerheten er ikke lagret.** `coordinate_uncertainty_m` er NULL i
  alle 428 829 forekomstrader. Rundede koordinater (100 m–1 km) mot et 16 m
  raster drar alle tall mot 0,5. Filtrering på usikkerhet hentet live fra GBIF
  reddet ikke signalet (median endring +0,002).
- **Utvalgene er for små.** Median 48 par per test; ingen test hadde 80 % styrke
  til å oppdage AUC 0,58. Traktkantarell-tallet trenger 200+ par før det kan
  tros.

## Hvorfor et kompass ikke kan vises ærlig, selv med signal

- Scoren fra 16 m-data mister halve korrelasjonen med seg selv på **64 meter**.
  En ett-skudds retning gått 150 m lander i median 36 m og i verste tidel 76 m
  fra ruten den pekte på. Feilen er like stor som avstanden scoren gjelder for.
- Været i dagens modell er ett tall per region. En «habitat × vær»-faktorisering
  innenfor et kartvindu er derfor en konstant ganger habitat; den sier ingenting
  om «i dag» på partinivå.
- Nevneren: 51 målte brukere på ti dager, 5 med gjenbruk. Ingen test av et
  kompass kan gi svar før publikum finnes.

## Det gjennomgangen fant som faktisk skal rettes

1. **Parserfeil i SR16-oppslaget (rettet i denne PR-en).** NIBIO utelater hele
   delen for et lag uten data i stedet for å sende −9999. Parseren leste verdiene
   posisjonelt, så manglende bonitet gjorde at stående volum ble lest som
   bonitet: «65 m³/ha» ble «bonitet 65», som slår inn bonusen for rikt jordsmonn
   (+0,1) og en falsk begrunnelse til brukeren, og forvrenger jordfaktoren i
   nattflisene. Målt i 0–14 % av skogrutene per område, reprodusert live av ti
   uavhengige agenter. Parseren er nå nøkkelbasert på overskriftene.
2. **Ruter med treslag = nodata ble kastet (rettet).** Funnet live ved 60,2602,
   5,2623: treslag mangler, men bonitet 23 og 732 m³/ha. Nå beholdes ruten som
   «ukjent» treslag. Om lag 1 av 14 registrerte funnsteder har nodata i SR16.
3. **`radius_meters = 500` i alle 2 751 flisrader**, mens en rute er 7,8 × 3–4,4
   km. Kartet tegner riktig størrelse fra metadata, men tallet i tabellen er
   feil med to størrelsesordener. Kø: rett kolonnen, gi flislaget en tegnforklaring
   med oppløsning.
4. **Koordinatusikkerhet må lagres** (kolonnen finnes, aldri fylt), og
   `findings.location_accuracy` skrives ikke (NULL på alle rader). Kø.

## Veien til «hvor» — det som er verdt å gjøre

Rekkefølgen er bevisst: data før modell, modell før kompass.

1. **Høsten 2026: samle fravær.** Hver eneste romlige test vi har, sammenligner
   funn med gjettede ikke-funn. Ingen har noen gang registrert «her lette jeg,
   fant ikke» med posisjon. En enkel feltprotokoll for eieren og 5 pilotbrukere:
   på hver tur, to steder 100–300 m fra hverandre, ett trykk «bra / ikke bra»
   per sted, uten å se noen score først. 6 personer × 10 turer gir 120 parede
   observasjoner med den datatypen modellen aldri har hatt.
2. **Vinter: traktkantarell-testen, forhåndsregistrert.** Samlet over ≥ 6
   norske områder, ≥ 200 par, GBIF-usikkerhet ≤ 50 m, kontroller 100–300 m,
   sti-avstand som kovariat, kryssvalidering gruppert per par. Terskel: AUC ≥ 0,60
   med p < 0,01 → bygg; 0,55–0,60 → beta med stillhet som standard; under 0,55
   → ikke bygg. Kantarell og steinsopp får ingen partilovnad før nye data sier
   noe annet.
3. **Hvis testen består: «Skogflekker» (2 uker), ikke kompass.** Et 16 m-lag for
   ett kartutsnitt, bare Norge, bare traktkantarell artsvektet, resten som
   skogstruktur-kontrast. Relativ prosentil i utsnittet, aldri 0–100. Ingen pil,
   ingen kontinuerlig GPS: avstand og åttepunkts retning fra siste posisjon, bare
   ved nøyaktighet ≤ 30 m. Treffprosenten står på laget («omtrent 6 av 10»).
   Dommerne rangerte dette som best på gjennomførbarhet og brukerverdi; det
   grundigste designet (10 uker) ble rangert lavest på kost.
4. **Det som allerede er sant, sies tydeligere.** Skog mot ikke-skog, gran mot
   furu mot lauv, hogstflate og myr: det skiller SR16 ærlig på 16 m. Det er en
   kategorisk hjelp («du står i ung furuplanting, granskogen begynner 200 m
   nord»), ikke en sannsynlighet, og den kan vises uten å love funn.

## Hva dette betyr for Mycelet

Styrken er og blir **når**: fenologi og omslag med AUC 0,83–0,89, offentlig
fasit, varsel. «Hvor» kan vi si på landskapsnivå (region, skogtype, høydebelte)
og på kategorinivå (treslag, hogstflate). «Hvor» på 100 meter kommer ikke fra
åpne data i overskuelig framtid; det kommer fra brukerens egne steder og
observasjoner. Det er derfor Mine steder og feltnotater er riktig retning for
vinteren, og derfor bør appen aldri tegne en pil den ikke kan stå inne for.

## Forbehold

Testene brukte litt ulike metoder (4–17 attributter, ulike høydekilder), samlet
AUC antar uavhengighet parene ikke har, og funnpunkter klumper seg på populære
lokaliteter. Ingen av forbeholdene trekker i retning av et sterkere signal enn
det som er rapportert; de fleste trekker mot 0,5. Bakgrunnstallene (0,73) er
mindre skjevhetskorrigerte enn prosjektets eget romlige backtest-skript og skal
aldri brukes som mål på prediksjonsevne.

Relaterte dokumenter: `docs/validering-romlig-signal.md`,
`docs/test-innsatskorrigert-forekomst.md`, `docs/autoresearch-runbook.md`.
