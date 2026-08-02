# Validering av det romlige signalet mot uavhengig fasit

> 2. august 2026. Første gang modellen er målt mot noe annet enn våre egne funn.

## Kort

**Modellen skiller skog fra ikke-skog. Den skiller ikke god skog fra vanlig skog.**

| Sammenligning | AUC | Snittforskjell | p |
|---|---:|---:|---:|
| Alle par | 0,692 | +3,4 poeng | 0,050 |
| **Kun der begge punkter har skogdata** | **0,654** | **+1,1 poeng** | **0,44** |

## Metoden

**Fasit:** 308 soppsteder samlet fra åpne kilder (SoppkartNorge 133, Svampindex 108,
Reddit 38, Facebook ~22, øvrige forum ~11). Bare de 37 med tillitsgrad A ble brukt —
steder som går igjen i flere uavhengige kilder.

**Geokoding:** Kartverkets stedsnavn-API for Norge, Nominatim for Sverige. 34 av 37
fikk koordinat.

**⚠️ Kontroll som viste seg avgjørende:** hvert punkt ble målt mot kommunen det skal
ligge i, og forkastet over 40 km avvik. **8 av 34 var feil** — «Kåsen» havnet 458 km
fra Oppdal, «Krokskogen» i Hardanger, «Fløyen» ved Egersund. Kartverket returnerer
første delvise navnetreff, hvor som helst i landet. Uten den kontrollen ville
valideringen målt støy og gitt et tall som så ekte ut.

**26 steder** sto igjen.

**Kontrollpunkter:** 8 per sted, tilfeldig retning, 3–15 km unna. Samme region og
dermed samme vær og sesong — så det som måles er den LOKALE romlige diskrimineringen,
ikke om modellen kjenner en landsdel fra en annen.

**Mål:** AUC = sannsynligheten for at et anbefalt sted scorer høyere enn et tilfeldig
kontrollpunkt i samme område. 0,50 er myntkast.

## Konfunden som måtte fjernes

19 av 26 anbefalte steder hadde skogdata, mot bare 54 % av kontrollene. Modellen gir
skog høyere score enn ikke-skog, så en del av de 0,692 var «traff modellen skog?» —
ikke «traff modellen et GODT sted?».

Begrenset til par der **begge** punkter har skogdata: AUC 0,654, snittforskjell
+1,1 poeng, p = 0,44 over 18 steder. Ikke til å skille fra støy.

## Hva dette betyr

Modellen klarer å si at Nordmarka er bedre enn fjorden. Det gjør et kart også.
Innenfor skogen, på 3–15 kilometers skala, kan den ikke peke ut det anbefalte stedet
framfor et tilfeldig annet.

Det bekrefter AUC ~0,52 fra den interne backtesten — nå mot menneskers egne
anbefalinger i stedet for våre egne funn. To uavhengige metoder, samme svar.

**Produktkonsekvens:** en rangert liste med fem nåler påstår at vi kan skille sted 1
fra sted 4. Det kan vi ikke. «Ett område, godt beskrevet» er den ærlige formen.

## Forbehold

- **n = 18** skogmatchede steder. `p = 0,44` beviser ikke fravær av effekt — den
  klarer bare ikke å vise en. Et større utvalg kunne endret bildet.
- Geokodede sentroider av store områder (Kolmården, Söderåsen) er ikke «det anbefalte
  stedet». Det legger til støy som trekker mot 0,50.
- Anbefalingene handler delvis om **tilgjengelighet** — nær t-bane, parkering, sti —
  ikke bare om soppmengde. Det er en egenskap ved fasiten, ikke ved modellen.
- Bare 26 av 308 steder er brukt, alle tillitsgrad A.

## Om datasettet som kilde

78 % av de 308 kommer fra to guide-nettsteder (SoppkartNorge, Svampindex), ikke fra
forum. Enkeltfakta er ikke opphavsrettsbeskyttet, men en kuratert samling kan være
det — og å kopiere en konkurrents stedsliste inn i en betalt app er både juridisk
risikabelt og dårlig for tilliten i et lite fagmiljø.

**Datasettet ble derfor brukt som fasit for validering, og havner ikke i appen.**
Det er der det ga størst verdi uansett.
