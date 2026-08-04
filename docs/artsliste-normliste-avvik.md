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

## Hva som gjenstår

- [ ] Kontroller alle 52 matsopp mot normlisten
- [ ] Avgjør nivå for piggsoppene: `Hydnum repandum` står som «Piggsopp», men
      Artsdatabanken bruker «blek piggsopp» (art) / gruppa inneholder flere
      svært like arter. Dette er en **produktbeslutning** om hvilket nivå appen
      skal operere på, ikke en ren navnefeil.
- [ ] Vurder en `matstatus`-kolonne skilt fra `edibility`: normlisten skiller
      mellom «matsopp», «matsopp etter avkoking» og «ikke matsopp», og hulriske
      og skjeggriske hører i midtkategorien. I dag ligger det i
      `conditionally_edible` + fritekst.
- [ ] 25 av 52 matsopp mangler fortsatt forvekslingsdata — se
      [kalibrering-restanse.md](kalibrering-restanse.md) for kontekst.
