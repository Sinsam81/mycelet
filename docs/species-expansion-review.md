# Artsutvidelse 36 → 72 — gjennomgangsark

> Bygget natt til 10. juni 2026. **Ingenting er live ennå.** Migrasjonen
> `supabase/migrations/017_expand_species_catalog.sql` er skrevet og
> strukturvalidert, men ikke kjørt. Les gjennom spiselighet-kolonnen under
> (særlig giftsoppene), så setter vi det live sammen.

## Hva som er gjort i natt
- **36 nye arter** valgt, kuratert (navn, sesong, habitat, beskrivelse, spiselighet, forvekslinger).
- **Alle 36 latinske navn verifisert EXACT mot GBIF** (ingen skrivefeil, alle ekte arter).
- **Alle 36 bilder** er artikkel-hovedbildet fra Wikipedia (HTTP-200-sjekket) — mer pålitelig enn å gjette filnavn.
- **11 forvekslingsadvarsler** skrevet, inkl. de fire klassiske dødelige forvekslingene.
- `verified=false` på alle — venter på din/ekspertens godkjenning, akkurat som de 36 eksisterende.

## ⚠️ Hva du må gjøre i morgen (kort)
1. **Les spiselighet-kolonnen under** — særlig de 13 gift-/uspiselige (~15 min).
2. Si fra om noe skal endres, så retter jeg.
3. Si **kjør** → jeg limer migrasjonen i Supabase **for deg** (jeg har service-tilgang) eller gir deg SQL-en, og kjører GBIF-funn-import for de nye artene.

---

## ☠️ DEL A — Gift / dødelig / uspiselig (les nøye)

| Norsk | Latin | Merking | Nøkkel-kjennetegn |
|---|---|---|---|
| Grønn fluesopp | *Amanita phalloides* | **deadly** | Olivengrønn hatt, hvite skiver, ring + volva (pose). Verdens farligste. |
| Flatklokkehatt | *Galerina marginata* | **deadly** | Liten brun, klynger på bartreved, brunt sporepulver. Amatoksiner. |
| Steinmorkel | *Gyromitra esculenta* | **deadly** | Hjernelignende vårsopp under furu. «Falsk morkel». |
| Butt giftslørsopp | *Cortinarius orellanus* | **deadly** | Oransjebrun slørsopp, orellanin → nyresvikt (svært forsinket). |
| Panterfluesopp | *Amanita pantherina* | toxic | Brun m/hvite flekker, sokkel ved base. Likner rødnende fluesopp. |
| Brun fluesopp | *Amanita regalis* | toxic | Mørk brun «rød fluesopp» i barskog. |
| Hvit trakttsopp | *Clitocybe dealbata* | toxic | Kritthvit traktsopp på plen. Muskarin. Likner nellikhatt. |
| Rødnende trådsopp | *Inocybe erubescens* | toxic | Fiberhatt som rødner, vår–sommer. Høyt muskarin. |
| Giftkremle | *Russula emetica* | toxic | Knallrød, BRENNENDE skarp smak. Smaksregelen. |
| Giftrødskivesopp | *Entoloma sinuatum* | toxic | Stor lysegrå m/ROSA skiver. Likner sjampinjong/vårfagerhatt. |
| Potetrøyksopp | *Scleroderma citrinum* | toxic | Hard «potet», mørk inni. Likner røyksopp/trøffel. |
| Rødnende fluesopp | *Amanita rubescens* | **conditionally_edible** | Spiselig KUN gjennomstekt; rødner. Likner panterfluesopp → frarådes nybegynnere. |
| Tegltoppsopp | *Hypholoma lateritium* | inedible | Teglrød knippesopp på stubber. Likner svovelsopp. |

## 🍴 DEL B — Spiselige (rask sjekk)

| Norsk | Latin | Type | Norsk | Latin | Type |
|---|---|---|---|---|---|
| Brunstokket rørsopp | *Imleria badia* | edible | Vintersopp | *Flammulina velutipes* | edible¹ |
| Lerkesopp | *Suillus grevillei* | edible | Snøballsjampinjong | *Agaricus arvensis* | edible¹ |
| Sildekremle | *Russula xerampelina* | edible | Blåtutt | *Lepista nuda* | edible (stekes) |
| Grønnkremle | *Russula aeruginea* | edible | Vårfagerhatt | *Calocybe gambosa* | edible¹ |
| Gulkremle | *Russula claroflava* | edible | Vorterøyksopp | *Lycoperdon perlatum* | edible (hvit inni) |
| Gulnende kremle | *Russula decolorans* | edible | Nellikhatt | *Marasmius oreades* | edible¹ |
| Gul trompetsopp | *Craterellus lutescens* | edible | Grovriske | *Lactarius trivialis* | cond. (forvelles) |
| Gråmusserong | *Tricholoma portentosum* | edible¹ | Sammenvokst fåresopp | *Albatrellus confluens* | edible |
| Frostvarsler | *Hygrophorus hypothejus* | edible | Sherryhatt | *Hygrophorus camarophyllus* | edible |
| Ametystsopp | *Laccaria amethystina* | edible | Blek kantarell | *Cantharellus pallens* | edible |
| Blomkålsopp | *Sparassis crispa* | edible | Svovelriske | *Lactarius scrobiculatus* | inedible (skarp) |
| Judasøre | *Auricularia auricula-judae* | edible | | | |

¹ = har en farlig forvekslingsart koblet (se under).

## 🔗 Forvekslinger som er koblet (med advarselstekst i appen)
- **Vintersopp / Honningsopp ↔ Flatklokkehatt** (kritisk — vedsopp)
- **Spiss/Vanlig morkel ↔ Steinmorkel** (kritisk — vårmorkler)
- **Snøballsjampinjong ↔ Grønn fluesopp** (kritisk — sjekk volva)
- **Nellikhatt ↔ Hvit trakttsopp** (kritisk — plen)
- **Vårfagerhatt ↔ Giftrødskivesopp** (rosa skiver = gift)
- **Rødnende fluesopp ↔ Panterfluesopp** (rødner = ok)
- **Vorterøyksopp ↔ Potetrøyksopp** (hvit inni = ok)
- **Storkremle/Gulkremle ↔ Giftkremle** (smaksregelen)

---

## Ærlige forbehold
- **72, ikke 100.** Jeg prioriterte 36 *sikre, fullverifiserte* arter framfor å fylle opp til 100 med usikker spiselighet-data. Anbefaler en **pulje 2** senere for de siste ~28 — heller det enn å gjette på sikkerhetsdata.
- **Bildene** er artens Wikipedia-hovedbilde — nesten alltid riktig, men det ene jeg ikke kan se. Et raskt blikk på artssidene etter publisering er lurt.
- **Prediksjon:** nye slekter (Imleria, Galerina, Tricholoma …) bruker generisk scoring til vi evt. lager slekts-profiler (`species-scoring.ts`) — en grei v1.1-forbedring. Giftsoppene trenger det ikke.
- **GBIF-funn:** importeres for de nye artene først etter at migrasjonen er kjørt (jeg gjør det i morgen).
