# Artslista mot NSNFs normliste — et hull vi ikke visste om

**Skrevet 2026-08-04.** Bakgrunn: vi fikk videresendt en ekstern gjennomgang av
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

**Utløst av spørsmålet:** *«Kan vi ikke bare sette de vi er usikre på som
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

**Stankmorkel** er tilfellet det ble spurt om, i ren form: ikke på normlisten, og
vårt eget notat sa «noen reagerer selv etter koking». Da skal den ikke bære
matsoppmerke.

### Rettet i migrasjon 065 (2026-09-05)

| art | før | etter | hvorfor |
|---|---|---|---|
| **Krittøsterssopp** | `conditionally_edible` | `inedible` | Merket «Spiselig — giftig rå» lovet at steking hjelper; artens egen tekst sa «Koking eller steking fjerner ikke risikoen» og frarådet den. NSNFs merknad gjelder nyrefunksjon, ikke tilberedning. |

Samme feil som honningsopp og stankmorkel, en måned senere, og av samme
strukturelle grunn: «Spiselig med merknad» og «Spiselig etter avkoking» er én
klasse hos oss, og merkets ordlyd antar alltid den siste. Fra nå finnes en
vaktbikkje: `npm run kontroller:spiselighet` leser hele artslista og sier fra
når merke og tekst motsier hverandre (regler og tester i
`src/lib/species/spiselighetskontroll.ts`). Kjør den etter hver artsendring.

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
- [x] ~~**Forvekslingsdataene er nå det største hullet.**~~ — **tettet 2026-08-04**,
      se eget avsnitt nedenfor. 24 → 45 av 48 matsopper har nå forvekslingsdata.

---

# Forvekslingsdataene — og de to reglene som kom ut av dem

**Gjort 2026-08-04**, migrasjon `048`, `049` og `050`.

Dette var viktigere enn spiselighetsklassene, og grunnen tåler å gjentas:

> **Ingen blir forgiftet fordi en database har feil kategori. Folk blir forgiftet
> fordi de tok feil sopp.**

## Hullet var delvis et KATALOGHULL

24 matsopper manglet forvekslingsdata. 14 lot seg fylle direkte (`048`). De sju
siste kunne ikke fylles — **ikke fordi det manglet dokumenterte forvekslinger, men
fordi dobbeltgjengerne ikke fantes i katalogen.**

Verst for gråmusserong: alle dens forvekslinger er musseronger, og gråmusserong var
appens **eneste** Tricholoma. Den mest etterspurte matmusserongen sto uten en eneste
rad — ikke fordi den er trygg, men fordi det ikke fantes noe å peke på.

`049` legger inn åtte arter som låser opp de sju: pantermusserong, gallemusserong,
såpemusserong, brungul musserong, lakrisriske, klubbetraktsopp, brunkjøttbukkesopp
og krittøsterssopp. Klasse og norsk navn fra normlisten, svenske navn fra Dyntaxa.

## ⚠️ REGEL 1: en felttest kan dømme et funn ute — aldri frikjenne det

Dette er den dyrest kjøpte lærdommen i hele artsarbeidet. Forvekslingstekstene tok
**tre motprøverunder**, og feilen var den samme hver gang — den flyttet seg bare:

| runde | formuleringen som ble stoppet |
|---|---|
| 1 | «mild smak = gråmusserong» — den **giftige** pantermusserongen smaker også mildt og lukter mel |
| 2 | «bare hatt, skiver og voksested kan frikjenne» |
| 2 | «hvitt betyr hulriske, vannklart betyr lakrisriske» |
| 2 | «gir ingen forgiftning hvis du holder deg unna alkohol» |
| 2 | hvitt sporeavtrykk lest som **bekreftelse** på blå ridderhatt |

Alle leses av en nybegynner som «da er jeg trygg».

**Hvorfor frikjennelse er farligere enn utelatelse:** utelater vi en advarsel, står
brukeren igjen med sin egen usikkerhet — en trygg tilstand, for da lar folk soppen
stå. Frikjenner vi feil, har vi *erstattet* usikkerheten med falsk trygghet.

```
ALLTID  «ser du X, er funnet ute»
ALDRI   «ser du Y, er du trygg»
```

Regelen er kode: `finnFrikjennendeFormuleringer()` i
[`src/lib/species/forvekslingstekst.ts`](../src/lib/species/forvekslingstekst.ts),
med en test som kjører mot **selve migrasjonstekstene**.

## ⚠️ REGEL 2: en alvorlig advarsel må ende i noe brukeren kan GJØRE

Og den regelen fant med én gang at den ikke var fulgt i det som allerede **sto i
produksjon**: **17 av 22** kritiske og høye advarsler manglet handlingsråd — blant
dem grønnkremle mot grønn fluesopp, morklene mot sandmorkel, og honningsopp mot
flatklokkehatt.

Tekstene beskrev faren presist. De sa bare aldri hva man skulle gjøre med den.
`050` legger til «Ved tvil — la den stå.» på alle som mangler det, idempotent.

De eldre migrasjonsfilene er **ikke** redigert — de er kjørt i produksjon, og å endre
dem ville vært en løgn om hva som faktisk ble kjørt. Testen har derfor et
dokumentert unntak for filer før `048`, med en egen test som vokter at `050` finnes.

## Det som fortsatt står åpent

- **Tre arter har bevisst ingen rad:** frostvokssopp, blomkålsopp og judasøre har
  ingen dokumentert forveksling verdt å vise. Tomt er riktigere enn oppspinn, og
  appen sier allerede eksplisitt at fravær av advarsel ikke betyr trygghet.
- **Motprøven avviste 17 av 35 foreslåtte par.** Blant dem: «ingen andre risker har
  oransje melkesaft» (vår egen katalog motbeviser det), og et par der den oppgitte
  kilden handlet om grønnkremle, ikke nøttekremle. **Ikke ta imot forvekslingsdata
  uten å etterprøve kjennetegnene mot kilde.**
- **Ikke tving inn en forveksling for å fylle en tom rubrikk.** Motprøven stoppet
  et forsøk på å bruke våre to rustbrune giftslørsopper som forveksling for blå
  ridderhatt. De er ikke lilla, og paret ville lært brukeren et falskt kjennetegn.

<details>
<summary>Den opprinnelige beskrivelsen av hullet (for kontekst)</summary>

24 av 51 matsopp har
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

</details>
