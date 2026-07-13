# UX-revisjon

Revisjonen ble gjort på desktop og 390 × 844 mobil, på norsk og svensk. Alle kjente ruter ble åpnet; kart, lag, filter, artsøk, geolokasjon og skjema for funn ble i tillegg brukt interaktivt uten å sende data.

## Kartet

### Før

- Øverste kartområde hadde samtidig filterbrikke, langt artsøk, «Funn», «Lovende steder», premiumlenke og eventuelt betalte bilder/turmodus over to rader.
- Filterbrikken og artsøket konkurrerte om de samme pikslene på 390 px bredde.
- Et permanent, sammenfoldet offline-kort lå oppe til høyre i tillegg til Leaflet zoom/lag-kontroller.
- GPS-feil fra nettleseren ble vist rått på engelsk, for eksempel `User denied Geolocation` eller `Timeout expired`, i en permanent boks nederst til venstre.
- Åpent filter var et stort toppanel som dekket mye av kartet og konkurrerte med søk og lagkontroller.
- To flytende handlingsknapper, tilstandspillen og mobilnavigasjonen delte den nederste delen av skjermen.

### Endret i PR #73

- Synlig hovedhierarki er nå: artsøk → «Funn» → «Lovende steder» → «Mer».
- Premiumbilder, premiumlenke, offline-kart og flagget turmodus ligger under «Mer».
- Offline-panelet finnes ikke i DOM/visningen før brukeren velger det, og har en tydelig lukkeknapp.
- Sammenfoldet filter er ikonbasert på mobil, med et lite aktivt-tall; desktop beholder teksten.
- Åpent mobilfilter er et rullbart bunnark med lukkeknapp. Desktop får et avgrenset venstrepanel.
- GPS-feil er kortvarig og oversatt til norsk/svensk. Kartet forklarer at det fortsatt kan brukes.
- Svenske artsnavn kan søkes i både hovedsøket og filteret.

### Etterkontroll

- På 390 × 844 ligger filter, søk og Leaflet-kontrollene uten overlapp.
- Hovedradens tre knapper passer på én rad på svensk, som er den lengste av de to tekstvariantene.
- «Mer»-panelet og offline-panelet holder seg innenfor kartkortet.
- Filterarket kan rulles og har lukkekontrollen synlig.
- Oslo viste Kartverket-fliser; Göteborg byttet automatisk til OSM. Ingen tile-/service-worker-kode ble endret.
- Betalt gren ble kodegjennomgått: betalende får bildeverktøy + offline; gratis web får premiumlenke + offline-upsell. Interaktiv produksjonstest av en betalt konto gjenstår.

### Bevisst utsatt

- Oppdeling av `MushroomMap.tsx` i mindre kontroller/lag er teknisk ønskelig, men ikke nødvendig for å løse brukerklagen og ville økt risikoen vesentlig.
- MapLibre/vector-tiles er eksplisitt utsatt.
- «Finn bilen», GPX-eksport og Lantmäteriet-bakgrunnskart er produktforslag, ikke del av denne rettingen.

## Registrer funn

### Problem

I sonedeling på 390 × 844 ble arket omtrent 834 px høyt og startet rundt 87 px over kartet. Overskrift og første felt var utilgjengelige, og arket hadde ingen egen rulling.

### Endret i PR #71

Arket har `max-h-full`, vertikal rulling og kontrollert overscroll. Etter endringen var toppunktet inne i kartet, klienthøyden 704 px og innholdshøyden 832 px; overskrift, felter og avbrytknapp var tilgjengelige.

Alle fire delingsvalg ble lest og åpnet, men skjemaet ble ikke sendt fordi e2e-skriving mot produksjonsdatabasen er forbudt.

## Artskatalog, artsside, startside og kalender

### Problem

Svensk UI viste norske artsnavn. Svensk søkeplaceholder lovet svensk navn, men katalog-RPC-en søkte bare norsk/latin/engelsk beskrivelse. Det ga blant annet «Hvit fluesopp» på en ellers svensk side.

### Endret i PR #72 og #73

- Én navnefunksjon velger kuratert svensk navn i `sv`, norsk i `nb`, og faller tilbake til den andre verdien hvis primærverdien mangler.
- Katalogsøk på svensk treffer svensk, norsk og latin. Norsk beholder den gamle fulltekstrangeringen.
- Kort, bilder, artstittel, forvekslingsarter, kalender og startside bruker visningsnavnet.
- Svensk artsside viser norsk navn som sekundærnavn med flagg; norsk side viser svensk sekundærnavn.
- Kartets to artsøk og forekomstnavn bruker samme regel.

### Begrensning

Databasen har bare svenske navn for deler av katalogen. Manglende svensk navn vises derfor på norsk. Beskrivelse, giftinformasjon, symptomer, habitat og skillekjennetegn er fortsatt ofte norske. Det er bedre enn ukontrollert maskinoversettelse, men er ikke en ferdig svensk lanseringsopplevelse.

## Identifisering

### Bra

- Sikkerhetsvarsel er tydelig før bildevalg.
- EXIF/GPS fjernes før opplasting.
- AI-avslått tilstand har trygg reserve til katalog, kalender og soppkontroll.
- Resultatsiden uten sessionStorage går tilbake til identifiseringssiden uten krasj.

### Forslag

- Siden ber i dag om geolokasjon ved lasting selv om posisjon bare er valgfri kontekst. Endre til eksplisitt «Bruk posisjonen for bedre kontekst» eller bruk bare allerede gitt tillatelse. Dette reduserer tillatelsestretthet før kameraopplevelsen.
- Vurder en enkel tre-bilders veiledning (hatt, skiver/rør, stilkbasis) før et større redesign. Dette øker datakvalitet uten å svekke sikkerhetsreglene.

## Prediksjon og kalender

- Kalenderen ber ikke om posisjon automatisk; den bruker eksisterende tillatelse eller viser en opt-in-knapp. Dette er riktig mønster også for identifisering.
- «Når»-signalet bør løftes mer frem: vis navngitt beste dag i 7-dagersvarselet og neste forventede flush. Dette støttes av den sterke temporale valideringen.
- «Lovende steder» skal fortsatt beskrives forsiktig. Ingen ny tekst overdriver det svake romlige signalet.

## Forum

- Feed, detalj, ny post, moderering og rapportflater ble åpnet på mobil i begge språk.
- Forumet er fortsatt skjult fra navigasjonen. Det bør ikke åpnes bredt før moderatoransvar, rapport-SLA og ekspertmodell er bemannet.
- Adminsiden `/admin/forum-trust` har hardkodet engelsk tittel og bør lokaliseres før forumlansering.

## Auth, profil, kjøp og øvrige sider

- Login, registrering, glemt/nullstill passord, priser, juridiske sider og adminruter hadde ingen horisontal overflyt på 390 px.
- Produksjon sendte uinnloggede brukere fra profil, kart, forum/ny og admin til login som forventet.
- Web viser Stripe/Google; simulert native skjuler disse. Begge grener bestod produksjonsprøven.
- Betalt brukers faktiske portal, offline-lagring og bildeverktøy trenger en dedikert lesende QA-konto eller manuell grunnleggertest.
