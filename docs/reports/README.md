# Teknisk dagsrapport — 13. juli 2026

## Kortversjonen

Mycelet er fortsatt friskt i produksjon. Tre avgrensede endringer er verifisert, slått sammen og rullet ut én om gangen:

1. Registreringsarket for funn kan nå rulles på små mobilskjermer og skjuler ikke lenger overskrift eller første felt.
2. Svenske brukere får kuraterte svenske artsnavn i katalog, artssider, startside, kalender og kart, og kan søke på svenske navn. Norsk brukes som reserve når svensk navn mangler.
3. Kartet er ryddet: søk og tre primærvalg er synlige, avanserte/premium-verktøy ligger under «Mer», offline-panelet vises bare når brukeren ber om det, og mobilfilteret er et rullbart bunnark. Rå engelske GPS-feil er erstattet av en kort, oversatt melding.

Alle tre produksjonsutrullingene bestod helsesjekk og 26/26 lesende produksjonsprøver. Ingen utrulling ble rullet tilbake. Ingen databasemigrasjon ble opprettet eller kjørt.

## Dette ble levert live

| Område | Resultat | PR |
|---|---|---|
| Registrer funn på mobil | Arket holder seg innenfor kartet og kan rulles | [#71](https://github.com/Sinsam81/mycelet/pull/71) |
| Svenske artsnavn og søk | Kuratert svensk primærnavn med norsk reserve | [#72](https://github.com/Sinsam81/mycelet/pull/72) |
| Kart-UX | Progressiv visning av verktøy, ryddigere mobilkontroller og oversatt GPS-feil | [#73](https://github.com/Sinsam81/mycelet/pull/73) |

Se [deploys.md](./deploys.md) for SHA-er og kontrollresultater.

## Verifisert grunnlinje

- TypeScript: grønn.
- Vitest: 27 testfiler og 266 tester grønne etter endringene.
- Produksjonsbygg: 45 ruter bygget.
- Produksjonsprøve: 26/26 grønne etter hver utrulling.
- Kartets regionregresjon: Oslo bruker Kartverket; Göteborg bytter til OSM og viser ikke blankt kart (2/2).
- Mobilmatrise i norsk og svensk: alle kjente offentlige, autentiserings-, forum- og adminruter ble åpnet uten horisontal overflyt eller nettleserfeil.
- Sikkerhetshoder: håndhevende CSP, HSTS, `DENY`, `nosniff` og streng referrer-policy er fortsatt på plass.

Innlogget gratis/premium ble gjennomgått i kode, men kunne ikke testes ende-til-ende i produksjonsnettleseren fordi denne arbeidskopien ikke har en lesende QA-konto. Jeg opprettet ikke en testbruker mot produksjonsdatabasen, i tråd med skriveforbudet. Offentlig web/native betalingsgating bestod produksjonsprøvene.

## Viktigst som fortsatt gjenstår

1. **App Store/IAP:** RevenueCat-integrasjon, produkter, webhook, sandboxkjøp og innsending. Dette er den største kommersielle lanseringsblokkeringen.
2. **Skjemadrift:** `mushroom_species.primary_image_url` og `swedish_name` finnes i produksjon, men mangler fra den historiske migrasjonskjeden. En vanlig ny `029` alene løser ikke ren replay fordi eldre migrasjoner refererer til kolonnene før `029` kjøres. Dette trenger en bevisst bootstrap/replay-beslutning og manuell databasehåndtering.
3. **GDPR-retensjon:** tabell og endepunkt finnes, men purge-/varslingsjobbene er ikke satt i drift.
4. **Produksjonsharding:** distribuert rate limiting og Sentry med PII-rensing mangler.
5. **Svensk innhold:** mange artsbeskrivelser, gifttekster, habitattekster og skillekjennetegn er fortsatt norske. De bør oversettes og fagkontrolleres; jeg maskinoversatte ikke sikkerhetskritisk innhold.
6. **Driftsnøkler og juss:** MET Frost-klient-ID, databehandleravtaler, personverngjennomgang og rutine for avviksvarsling.

Full rekkefølge og ansvar står i [launch-checklist.md](./launch-checklist.md).

## Beslutninger som kan reverseres

- **Kart:** Jeg valgte progressiv visning i eksisterende Leaflet-kart fremfor å splitte hele komponenten eller starte MapLibre-migrering. Alternativet ville gitt større risiko uten å løse mobilklagen raskere.
- **Svenske navn:** Jeg viser bare kuraterte `swedish_name`-verdier og bruker norsk reserve. Alternativet, automatisk oversettelse, ble avvist fordi feil navn eller gifttekst er en sikkerhetsrisiko.
- **GPS-feil:** Rå leverandør-/nettlesertekst er erstattet av én lokal oversatt toast. Detaljert feil beholdes ikke permanent på kartet fordi den dekket kart og navigasjon.
- **Database:** Jeg skrev ikke en symbolsk `029` som gir falsk trygghet om ren replay. Rotproblemet ligger før migrasjon 012/015 og må løses som en eksplisitt bootstrapstrategi uten å omskrive allerede kjørte migrasjoner.
- **Rapport-PR:** Rapportene leveres i en egen PR uten runtime-endring og blir ikke auto-merget av meg. Dermed er deployloggen endelig og omfatter alle faktiske produksjonsutrullinger i arbeidet.

## Ingen tilbakerullinger

Ingen produksjonskontroll feilet, og ingen commit ble tilbakeført.
