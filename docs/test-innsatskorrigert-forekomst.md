# Testen som avgjør om flere forekomstdata er verdt å hente

> Skrevet 2. august 2026. Ligger klar til etter App Store-innsendingen.
> Forutsetter `docs/validering-romlig-signal.md`.

## Spørsmålet

Det ble foreslått å bygge et langt større forekomstdatasett — Artsobservasjoner,
Artportalen via SLU, GBIF, iNaturalist, supplert med forumfunn — og å bearbeide
punktene til rangerte «soppområder» med en poengmodell.

Planen er god på datateknikk. Den løser bare ikke grunnen til at signalet vi
allerede har ikke virker.

## Utgangspunktet: vi har dette allerede, og det virket ikke

`species_occurrences` har **327 298 rader** fra GBIF — som i praksis ER
Artsobservasjoner og Artportalen republisert. Signalet ble målt og slått av:

```
src/lib/prediction/cell-score.ts:148
  const occurrenceBoost = 1;

  «Leakage-resistant validation against local, seasonal target-group
   backgrounds measured occurrence-only AUC 0.472 (chance = 0.5).»
```

**Problemet er ikke mengde, det er skjevhet.** Forekomster måler hvor folk går.
Ti ganger flere punkter fra samme kilder multipliserer skjevheten.

## Fellen, demonstrert

2. august testet jeg om forekomsttetthet forutsier de 26 menneskeanbefalte
stedene fra valideringen:

| Trekk | AUC |
|---|---:|
| Antall funn innen 3 km | 0,671 |
| **Antall ulike år** | **0,685** |
| Antall ulike arter | 0,683 |

Det ser bedre ut enn modellens egen score (0,654 skogmatchet). **Det er
sirkulært.** 23 av de 26 anbefalte stedene nevner parkering, kollektiv eller
merket sti i adkomstbeskrivelsen:

> «Parkering ved Linderudkollen eller buss til Solemskogen»
> «Start fra Hellasgården, Björkhagen eller annen skiltet inngang»

Testen målte altså om forekomster klumper seg der folk kan parkere. Det gjør de.
Begge sider av sammenligningen måler tilgjengelighet.

**Dette er verdt å huske som mønster:** et tall som ser lovende ut, fra en test
som ikke kontrollerer for den ene tingen man vet er en konfund, er verdiløst.
Den eksisterende 0,472-målingen var strengere enn min.

## Testen som faktisk avgjør

**Innsatskorrigert tetthet mot target-group background.**

Idéen: sammenlign soppobservasjoner mot observasjoner av *andre* organismegrupper
fra de samme plattformene og de samme rutene. Registrerer folk fugl, planter og
insekter der også, er høy sopptetthet bare menneskelig nærvær. Er sopp
**overrepresentert i forhold til den generelle registreringsinnsatsen** akkurat
der, er det signal.

### Framgangsmåte

1. **Hent bakgrunnen.** For hver rute vi allerede har soppfunn i: hent antall
   GBIF-observasjoner av ikke-sopp (fugl, karplanter, insekter) i samme rute,
   samme årsspenn. GBIF-API-et tar `taxonKey` + `geometry` + `year`.
2. **Regn ut forholdstallet** per rute: `sopp / (sopp + bakgrunn)`. Det er
   andelen av registreringsinnsatsen som gikk til sopp.
3. **Test mot fasiten** i `docs/validering-romlig-signal.md`: forutsier
   forholdstallet de 26 anbefalte stedene bedre enn rå tetthet gjorde?
4. **Kontroller på nytt** for skog, som i den forrige valideringen — og denne
   gangen også for tilgjengelighet, siden vi nå vet at fasiten er skjev der.

### Beslutningsregelen, satt på forhånd

- **AUC over 0,60 med p under 0,05, skogmatchet** → skjevhetskorrigeringen
  virker. Da er hele rørledningen som ble skissert verdt å bygge, og
  poengmodellen hans (sesonger, uavhengige rapportører, ferskhet) er riktig
  utformet.
- **AUC rundt 0,50** → forekomster er menneskelig nærvær, punktum. Da sparer vi
  måneder, og Mycelets ærlige styrke forblir **når**, ikke **hvor**.

Regelen skrives ned nå, før testen kjøres, nettopp for at resultatet ikke skal
kunne tolkes i etterkant.

### Innsats

Én dag. Vi har soppunktene; det som mangler er bakgrunnen. Ingen ny lagring, ingen
ny rørledning — testen kjøres mot GBIF-API-et og valideringsapparatet som allerede
finnes i `docs/validering-romlig-signal.md`.

## Hvis testen består: det som er riktig i planen

- **Skillet rå/bearbeidet.** Råpunkter i bakgrunnen, rangerte områder i kartet.
- **Deduplisering.** Artsobservasjoner publiseres også gjennom GBIF; uten
  `occurrenceID`-basert dedup teller vi samme funn to ganger.
- **Poengmodellen.** Sesonger, uavhengige rapportører og ferskhet er nettopp de
  trekkene som kan skille en ekte flekk fra en p-plass. **NB:** rapportør-feltet
  har vi ikke i dag — `species_occurrences` lagrer ikke `recordedBy`. Det må
  hentes på nytt hvis modellen skal bruke det.
- **Presisjon utad.** Eksakt punkt internt, 250–500 m sone i appen. Samme
  prinsipp som søkeområdet i PR #121.

## Uansett utfall: dette står fast

- **Artportalens skjuling av sensitive arter skal respekteres, ikke omgås.**
- **SLU-vilkårene** krever korrekt kildehenvisning, og API-innhold kan inneholde
  personopplysninger — da får den som sammenstiller et eget personvernansvar.
- **GBIF** krever at dataeier, datasett-ID og lisens beholdes ved
  videreformidling. Vi lagrer allerede `license` og `dataset_key` per rad.
- **iNaturalist «obscured»** er et tilfeldig punkt i en 0,2°-rute, ikke funnstedet.
  Utelates eller behandles som svært upresist.
- **Forumdata:** ingen navn, brukernavn eller profilbilder lagres. Bare
  plattform, kildeadresse, dato, tolket sted, koordinat, presisjon og art.
