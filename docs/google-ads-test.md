# Google Ads-test: «soppkart» — september 2026

Skrevet 2026-09-03. Dette er hele oppskriften for én liten, tidsavgrenset test.
Den erstatter ikke konklusjonen i `docs/vekstplan.md` («ikke bruk penger på
annonser») — den kjøper tallene som mangler i den konklusjonen.

## Hva testen skal svare på

Vekstplanen regnet med tre anslag som ingen har målt: klikkpris 10–20 kr,
~500 klikk per betalende kunde, og at «soppkart» i det hele tatt søkes på.
Etter fire uker skal disse tre være tall, ikke gjetninger:

| Spørsmål | Hvor svaret står |
|---|---|
| Hvor mange søker på «soppkart» og de andre ordene i Norge? | Google Ads → Keyword Planner (før testen), og Visninger (under testen) |
| Hva koster ett klikk? | Google Ads → Gj.sn. CPC |
| Hvor mange klikk blir en registrert bruker? | Dagsrapporten på e-post → «Hvor de registrerte kom fra» → raden `google/soppkart-test` |
| Betaler noen av dem? | Samme rad, siste tall |

## Rammen — ikke overskrid den

- **Maks 1 500 kr totalt.** Dagsbudsjett 40 kr, 4 uker. Sett en sluttdato i kampanjen.
- **Kun Søk-nettverket, kun Norge, kun eksakt match.**
- **Trafikken går til www.mycelet.com, aldri til App Store.** Apple tar 30 % av en årskunde.
- **Start nå.** September er toppsesong, og det er nå folk søker. En test i oktober måler et annet marked.

Med 40 kr/dag og 12–18 kr per klikk blir det 2–3 klikk om dagen, rundt 80–125 klikk
totalt. Det er nok til å se om kanalen er død eller lever, ikke nok til å finstille noe.

## Steg 0 — sporingen (Claude, gjort)

Fra og med denne grenen settes cookien `mycelet_kilde` ved forsidebesøk som
kommer via en merket lenke, den følger med til registreringen, og dagsrapporten
teller registrerte og betalende per kilde. Se `src/lib/analytics/kilde.ts`.
Uten dette hadde du bare visst hva klikkene kostet, ikke hva de ble til.

Cookien settes bare på forsiden. Annonsen må derfor peke til `/`, ikke til en
artikkel.

## Steg 1 — konto og Keyword Planner (Sindre, ~30 min, koster ingenting)

1. Gå til ads.google.com og opprett konto med post@mycelet.com.
2. Google vil lede deg inn i en «smart kampanje» med en gang. **Ikke lag den.**
   Se etter en liten lenke nederst: «Bytt til ekspertmodus» / «Opprett konto
   uten kampanje». Velg den. Smart-kampanjer bruker brede søkeord og
   Displaynettverket, og lar seg ikke styre.
3. Fyll inn betalingsopplysninger selv (Claude gjør ikke det).
4. Verktøy → Planlegging → **Søkeordplanlegger** → «Finn søkevolum og prognoser».
   Lim inn, ett per linje, sted = Norge, språk = norsk:

   ```
   soppkart
   soppkart norge
   soppvarsel
   sopp app
   soppapp
   når kommer kantarellen
   når kommer soppen
   sopp i nærheten
   kantarell kart
   soppsesong
   ```

5. Noter gjennomsnittlig månedlig søkevolum og «Bud øverst på siden (lavt/høyt)»
   for hvert ord. Send tallene til Claude — de går inn i vekstplanen uansett hva
   du bestemmer.

**Beslutningsregel før du bruker en krone:** er samlet volum for de fem ordene i
Steg 3 under ~300 søk i måneden, dropp kampanjen. Da får du ikke nok klikk til å
lære noe, og du har allerede fått det viktigste svaret gratis: etterspørselen er
for liten til at det er verdt å jage ordet, i annonser eller i SEO.

## Steg 2 — kampanjeinnstillinger

Ny kampanje → mål: «Opprett kampanje uten mål» → type: **Søk**.

| Innstilling | Verdi | Hvorfor |
|---|---|---|
| Nettverk | Bare Google Søk. **Fjern haken** for Søkepartnere og Displaynettverket | Begge står på som standard og sluker budsjettet |
| Sted | Norge. Under «Alternativer for sted»: **«Tilstedeværelse: personer i eller jevnlig i…»** | Standardvalget inkluderer folk i utlandet som har vist «interesse» for Norge |
| Språk | Norsk | |
| Budsjett | 40 kr per dag | |
| Budgivning | «Klikk» → **sett maks CPC-grense til 15 kr** | Uten tak byr Google det den vil |
| Sluttdato | 4 uker fra start | Testen skal stoppe av seg selv |
| Målgruppesegmenter, utvidelser | Hopp over | |

Etter opprettelse: Innstillinger → **«Automatisk bruk av anbefalinger» → slå av alt.**
Google vil ellers legge til brede søkeord og skru på ting du nettopp skrudde av.

## Steg 3 — søkeord (eksakt match, én annonsegruppe)

Skriv dem nøyaktig slik, med klammer. Klammene betyr «bare dette søket og nære varianter».

```
[soppkart]
[soppkart norge]
[soppvarsel]
[sopp app]
[soppapp]
```

Hold det til disse fem. Legg eventuelt til `[når kommer kantarellen]` hvis
Keyword Planner viser at det har volum — det er et «når»-søk, som er det
Mycelet faktisk er best på.

## Steg 4 — negative søkeord (lim inn før du starter)

Sopp betyr også fotsopp, muggsopp og sopp i huset. Kampanjen er eksakt match, så
risikoen er mindre enn i vekstplanen, men Googles «nære varianter» slipper
likevel gjennom mer enn du tror. Kampanje → Søkeord → Negative søkeord → lim inn:

```
fotsopp
neglesopp
hudsopp
soppinfeksjon
underlivssopp
gjærsopp
candida
soppkrem
soppmiddel
soppdrepende
canesten
resept
reseptfri
apotek
salve
krem
kløe
symptomer
smitte
behandling
sopp i munnen
sopp i skrittet
øresopp
bleieutslett
muggsopp
råtesopp
hussopp
kjellersopp
taksopp
mugg
soppskade
soppsanering
plakat
poster
fototapet
dyrking
dyrkesett
gratis app
```

De tre siste gruppene er nye: søket «soppkart» gir i dag plakater fra Photowall
og dyrkesett — folk som ikke skal ha appen.

## Steg 5 — annonseteksten

Én responsiv søkeannonse. Google setter selv sammen overskrifter og
beskrivelser. Alle lengder er sjekket (overskrift ≤ 30 tegn, beskrivelse ≤ 90).

**Endelig nettadresse** (kopier nøyaktig, det er denne som gjør at registreringen kan spores):

```
https://www.mycelet.com/?utm_source=google&utm_medium=cpc&utm_campaign=soppkart-test
```

Visningsbane: `mycelet.com/soppkart`

**Overskrifter:**

```
Soppkart for Norge
Se soppforholdene der du bor
Værbasert soppvarsel
Mycelet – kart og soppvarsel
Når kommer kantarellen?
Gratis å prøve
Kart, vær og sesong samlet
Laget for norske skoger
```

Fest overskrift 1 («Soppkart for Norge») til posisjon 1, så den alltid vises på
et «soppkart»-søk. Resten lar du Google rotere.

**Beskrivelser:**

```
Kart over soppfunn, værdata og sesong for ditt område. Se om det er verdt turen i helga.
Mycelet regner på regn, temperatur og skogtype – og sier ærlig hva kartet ikke kan vite.
Gratis å prøve på mycelet.com. Ingen nedlasting nødvendig – virker rett i nettleseren.
Få varsel når forholdene snur der du bor. Sopptur med bedre timing og færre bomturer.
```

Ingen av dem lover funn, sier at noe er spiselig, eller selger kartet som mer
enn det er — det er anti-mønstrene fra konkurrentanalysen, og de gjelder også her.

## Steg 6 — ting Google kommer til å mase om. Svar nei.

- **Konverteringssporing / Google-tag / «forbedrede konverteringer»:** Nei.
  Landingssiden har ingen JavaScript, med vilje. Kampanjen vil vise 0
  konverteringer i Google Ads uansett — det er forventet. Dagsrapporten er
  fasiten.
- **Performance Max, Demand Gen, «utvid til Display»:** Nei.
- **Brede søkeord / «legg til foreslåtte søkeord»:** Nei.
- **Forbedret CPC / Smart budgivning:** Nei, det krever konverteringsdata vi ikke gir Google.
- **Consent Mode:** Ikke relevant, vi laster ikke Googles skript.

## Steg 7 — én gang i uka (10 minutter)

1. Google Ads → Søkeord → **Søketermer.** Det er listen over hva folk *faktisk*
   skrev. Alt som ikke er soppturer legges til som negativt søkeord.
2. Noter visninger, klikk, gjennomsnittlig CPC og totalkostnad.
3. Les dagsrapporten: raden `google/soppkart-test` under «Hvor de registrerte
   kom fra». Tre tall: registrerte totalt · siste 7 dager · betaler.
4. Send de fire tallene til Claude, som fører dem i tabellen nederst her.

## Steg 8 — beslutningen etter fire uker

Regn ut **kroner per registrert bruker** = totalkostnad / registrerte fra
`google/soppkart-test`.

| Utfall (av ~100 klikk) | Betyr | Gjør |
|---|---|---|
| 0–1 registrerte | Kanalen er død for dette produktet og denne siden | Stopp. Pengene gikk til et sikkert svar. |
| 2–5 registrerte (2–5 %) | Normalt for et ukjent merke. 300–750 kr per bruker, som må bli 241 kr i inntekt | Stopp. Vekstplanens regnestykke stemte. Ingen ny runde uten at forsiden konverterer bedre. |
| Over 5 registrerte (>5 %) | Anslaget om 500 klikk per kunde var for pessimistisk | Vurder én ny, større runde med bedre landingsside — men bare hvis minst én av dem betalte. |
| Under 100 visninger totalt | Ingen søker på disse ordene | Stopp. Og dropp «soppkart» som SEO-mål også. |

Uansett utfall: oppdater tabellen i `docs/vekstplan.md` med de målte tallene.

## Loggen

| Uke | Visninger | Klikk | Gj.sn. CPC | Kostnad | Registrerte (google/soppkart-test) | Betaler |
|---|---|---|---|---|---|---|
| Keyword Planner (før start) | | | | | | |
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
