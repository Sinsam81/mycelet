# Artslista mot NSNFs normliste — et hull vi ikke visste om

**Skrevet 2026-08-04.** Bakgrunn: Sindre videresendte en ekstern gjennomgang av
artslista. Den inneholdt én påstand som viste seg å være en **sikkerhetsfeil i
produksjon**.

## Feilen

`Laccaria amethystina` (ametystsopp) sto som `edible`, med notatet:

> «Spiselig liten skogsopp. Lite kjøtt, men lett å kjenne igjen på den fiolette
> fargen.»

Appen viste altså grønt «Spiselig»-merke og oppfordret til plukking.

Norges sopp- og nyttevekstforbunds normliste sier
[«Ikke matsopp» med merknaden «Tar opp arsen»](https://soppognyttevekster.no/normlisten/ametystsopp/).

Rettet i migrasjon `046` til `inedible` — ikke `toxic`, siden arten ikke er akutt
giftig. Den akkumulerer arsen og skal ikke spises.

## Det egentlige problemet

**Spiseligheten i artslista er aldri systematisk kontrollert mot normlisten.**

45 arter står som `edible` og 7 som `conditionally_edible`. Vi fant én feil, og
vi fant den ved et tilfelle — fordi noen sendte inn en gjennomgang, ikke fordi vi
sjekket.

Det finnes ingen grunn til å tro at ametystsoppen er den eneste. Normlisten
endres over tid (arter tas av når ny kunnskap kommer), og lista vår er bygget
fra andre kilder.

**Dette bør gjøres før åpen lansering.** Det er 52 arter å slå opp, og NSNF har
dem alle på `soppognyttevekster.no/normlisten/<art>/`.

## Metode når det skal gjøres

Ikke spør en språkmodell. To uavhengige modeller gikk gjennom den samme lista på
25 arter og var **uenige med hverandre** på fire punkter — og den ene fant på et
navn («Ametystlakssopp») som ikke finnes hos Artsdatabanken.

Bruk kilden:

- **Spiselighet:** NSNFs normliste, én side per art.
- **Norske navn:** Artsdatabankens navn, som publiseres via GBIFs
  `vernacularNames` med språkkode `nob`/`nno`. Eksempel:

  ```
  GET https://api.gbif.org/v1/species/match?name=Imleria%20badia
  GET https://api.gbif.org/v1/species/{usageKey}/vernacularNames
  ```

Den samme oppslaget avslørte sju uoffisielle norske navn, rettet i `046`.

---

# Kontrollen ble gjort — 2026-08-04

**Utløst av Sindres spørsmål:** *«Kan vi ikke bare sette de vi er usikre på som
uspiselig istedenfor å ta sjansen på å si at de er spiselig hvis vi ikke er
sikre?»*

Svaret er ja — men vi var ikke **usikre**, vi var **ukontrollerte**. Alle 72
artene sto med `verified = false` og `data_source = 'mvp_curated'`. «Usikker»
betyr at kildene spriker; «ukontrollert» betyr at vi ikke har sett etter. Riktig
svar på det andre er å se etter.

Å gardere i blinde ville dessuten kostet noe ekte: setter appen «usikker» på
kantarell, lærer folk at feltet er støy og slutter å lese det — også den dagen
det står noe som betyr noe.

## Metoden som faktisk virket

Indekssiden `soppognyttevekster.no/normlisten/` bærer **hele lista strukturert i
HTML** — 218 arter med kategori, norsk navn, latinsk navn og merknad i egne
`<p>`-klasser. Den kan parses og sammenlignes maskinelt mot hele artslista på ett
minutt. Det er langt bedre enn å slå opp én art om gangen.

```
curl -s https://soppognyttevekster.no/normlisten/ -o nl.html
# hver art: <p class="normlistestatus ..."> <h2 class="norwegianname"> <p class="latinname">
```

66 av 72 arter matchet — på latinsk navn, norsk navn, slektsoppføring
(`Armillaria spp.`) eller seksjonsoppføring (`Agaricus seksjon Arvenses`, som
dekker alle tre sjampinjongene våre).

## HOVEDFUNNET: avvikene pekte ikke samme vei

Av 6 avvik ville **3 gjort appen mer forsiktig og 3 mindre**. En regel som «følg
normlisten» ville altså svekket tre advarsler — blant dem sandmorkelen, som har
tatt liv i Norden.

> **Følg normlisten når den er strengere enn oss. Behold vårt når vi er
> strengere enn den.**

Regelen ligger nå i kode: `reconcileWithNormliste()` i
[`src/lib/species/normliste.ts`](../src/lib/species/normliste.ts), med en test
som beviser at den aldri kan gjøre en art friere enn den står.

### Rettet i migrasjon 047 (alle mot mer forsiktighet)

| art | før | etter | normlisten sier |
|---|---|---|---|
| **Falsk kantarell** | `edible` | `inedible` | «Ikke matsopp — kan gi mage-/tarmreaksjon» |
| **Honningsopp** | `conditionally_edible` | `inedible` | «Ikke matsopp — kan gi kraftig allergiske reaksjoner» |
| **Rødskrubb** | `edible` | `conditionally_edible` | «Giftig som rå. Krever varmebehandling i minst 15 minutter» |
| **Stankmorkel** | `conditionally_edible` | `inedible` | *står ikke på lista* |

**Falsk kantarell var den alvorligste.** Notatet vårt sa allerede «kan gi mild
GI-reaksjon hos enkelte» — vi visste om risikoen og ga den grønt merke likevel.
Og det er nøyaktig den soppen nybegynnere plukker i den tro at det er kantarell:
appen bekreftet feilen de nettopp hadde gjort.

**Honningsopp** er verdt å forstå: NSNF har en egen kategori for «giftig rå, må
varmes» (der blodrørsopp står). De har bevisst latt være å plassere honningsopp
der, fordi allergireaksjonene ikke forsvinner med koking. Vår gamle verdi la
arten i nettopp den båsen normlisten holdt den utenfor.

**Stankmorkel** er tilfellet Sindre spurte om, i ren form: ikke på normlisten, og
vårt eget notat sa «noen reagerer selv etter koking». Da skal den ikke bære
matsoppmerke.

### Bevisst IKKE fulgt — vi er strengere

| art | vi | normlisten | hvorfor vi blir stående |
|---|---|---|---|
| **Sandmorkel** | `deadly` | «Giftig» | Gyromitrin har tatt liv. NSNF reserverer «Meget giftig» for amatoksinsoppene, så «Giftig» er ikke et signal om mildhet. |
| **Giftkremle** | `toxic` | «Ikke matsopp» | Ingen plukker den som mat uansett — for streng koster ingenting, for mild kan koste noe. |
| **Svovelriske** | `inedible` | «Spiselig etter avkoking» | Ville vært en **oppgradering mot spiselig** — den ene retningen som kan skade noen. |

⚠️ **Ikke «rett» disse senere.** De står i `DELIBERATE_DIVERGENCES` med
begrunnelse, og en test feiler hvis noen gjør dem mildere.

### Navnretting: Steinmorkel → Sandmorkel

Artsdatabanken (GBIF `vernacularNames`, `nob`/`nno`) gir ett norsk navn for
*Gyromitra esculenta*: **sandmorkel**. «Steinmorkel» var en oversettelse av
svensk *stenmurkla*.

Ikke pedanteri: den er den **dødelige forvekslingsarten for begge morklene
våre**. Slår noen opp «sandmorkel» — navnet i enhver norsk soppbok og på ethvert
soppkontrollbord — skal de finne den.

### Taksonomi flagget, ikke rørt: rødskrubben

Raden er internt inkonsistent:

```
norwegian_name = 'Rødskrubb'             -> hører til Leccinum versipelle
latin_name     = 'Leccinum aurantiacum'  -> heter «eikeskrubb» (Artsdatabanken)
swedish_name   = 'Aspsopp'               -> hører til L. aurantiacum
```

Migrasjon `030` (linje 95-96) så halve dette og rettet det svenske navnet, men
lot det norske stå. **Spiselighetsfiksen er robust mot hvilken art raden mener** —
NSNF fører rødskrubb, ospeskrubb og svartskrubb *alle* som «Spiselig med
merknad». Å bytte latinsk navn ville derimot røre GBIF-treff, sesongvinduer og
det svenske navnet. Egen beslutning, ikke en sikkerhetsretting.

## `verified` betyr nå noe

Feltene `verified` og `data_source` var døde — hele lista sto `mvp_curated` /
`false`, og ingenting i appen leser dem. Etter 047:

| `data_source` | antall | betydning |
|---|---|---|
| `nsnf_normliste_2026` | 63 | kontrollert, samsvarer |
| `nsnf_normliste_2026_vi_er_strengere` | 3 | kontrollert, vi avviker bevisst |
| `ikke_pa_normlisten_egen_vurdering` | 6 | står ikke på lista |

Neste gang noen spør «hvilke er ukontrollerte?» ligger svaret i dataene.

De seks som ikke står på normlisten (spiss morkel, stankmorkel, broket kremle,
tegltoppsopp, sildekremle, blek kantarell) er ikke fordømt av det — normlisten er
en **pensumliste på 218 arter, ikke et komplett register**. Men klassen er vår
egen vurdering, og nå er det synlig.

## Hva som gjenstår

- [x] ~~Kontroller alle 52 matsopp mot normlisten~~ — **gjort 2026-08-04**, alle
      72 arter, se over. Migrasjon `047`.
- [ ] Avgjør nivå for piggsoppene: `Hydnum repandum` står som «Piggsopp», men
      Artsdatabanken bruker «blek piggsopp» (art) / gruppa inneholder flere
      svært like arter. Dette er en **produktbeslutning** om hvilket nivå appen
      skal operere på, ikke en ren navnefeil.
- [x] ~~Vurder en `matstatus`-kolonne skilt fra `edibility`~~ — **vurdert og
      avvist 2026-08-04.**

      Alle sju artene i `conditionally_edible` har allerede notater som sier
      det: «Må kokes minst 15 min – rå er den giftig» (honningsopp), «Spiselig
      KUN gjennomstekt» (rødnende fluesopp), «aldri rå» (hulriske), «Må
      forvelles og saltlegges» (skjeggriske), «Må stekes godt» (begge morkler),
      «Noen reagerer selv etter koking» (stankmorkel).

      En ny enum-verdi ville flyttet informasjon som allerede finnes, og rørt
      database, typer, merker, filtre, AI-resultat og kartfarger uten å fortelle
      brukeren noe nytt.

      **DEN EKTE LUKEN LÅ ET ANNET STED.** `edibility_notes` vises bare på
      artsdetaljsiden. Målt fravær i `/species`, i kalenderen (`SeasonNow`,
      `YearTable`) og i `IdentifyResult` — skjermen der noen står med soppen i
      hånda og skal bestemme seg. Der sto merket «Betinget spiselig» helt alene,
      uten å si hva betingelsen var.

      Rettet ved å la etiketten bære advarselen: **«Spiselig — giftig rå»**.
      Én streng, fire skjermer, ingen skjemaendring. Se `EdibilityBadge.tsx`.

      **Lærdom:** spør alltid HVOR sikkerhetsinformasjonen vises, ikke bare om
      den finnes. Notatet var riktig hele tiden — det var bare usynlig der det
      betydde mest.
- [ ] **Forvekslingsdataene er nå det største hullet.** 24 av 51 matsopp har
      ingen forvekslingsrad i det hele tatt, og én dødelig art (butt
      giftslørsopp) har ingen matsopp som peker på seg.

      Dette er viktigere enn spiselighetsklassene, og grunnen er verdt å skrive
      ned: **ingen blir forgiftet fordi en database har feil kategori — folk blir
      forgiftet fordi de tok feil sopp.** Merket svarer på «er kantarell
      spiselig?», der svaret er trygt ja. Det farlige øyeblikket er «*er dette*
      kantarell?», og det spørsmålet svarer bare forvekslingsdataene på.

      12 kritiske par er dekket i dag (sjampinjong → hvit fluesopp, grønnkremle →
      grønn fluesopp, traktkantarell → spiss giftslørsopp, vintersopp →
      flatklokkehatt, morkel → sandmorkel). Mangler: gråmusserong (høyest
      prioritet), blomkålsopp, blå ridderhatt, broket kremle, fåresopp,
      granmatriske, furumatriske, gul trompetsopp, gulrød kremle, hulriske,
      judasøre, lerkesopp, nøttekremle, piggsopp, rødgul piggsopp, sandsopp,
      sildekremle, skjeggriske, sotvokssopp, frostvokssopp, franskbrødsopp,
      svartbrun rørsopp, blek kantarell, østerssopp.

      **Sjekk også** at giftsjampinjong (*Agaricus xanthodermus*, «Giftig» hos
      NSNF) er dekket som forveksling for alle tre sjampinjongene våre — i dag
      peker bare sjampinjong på karbol-sjampinjong.
