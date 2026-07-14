# Mycelet — autonom gjennomgang

Sist oppdatert: 14. juli 2026.

## Kort konklusjon

Mycelet er teknisk klar for en kontrollert web-lansering. Produksjonen er frisk, dagens prediksjonsfliser finnes for alle fem regioner, og siste produksjonsrunde består 29 av 29 offentlige ende-til-ende-tester. Ingen deploy måtte rulles tilbake.

Produktet er ikke ferdig med å bevise presis *stedsprediksjon*. Det sterke, validerte salgsargumentet er *når* brukeren bør dra: fenologi/flush har temporal AUC 0,882. Korrigert romlig rangering ligger fortsatt bare rundt AUC 0,52–0,54. Appen bør derfor selges som en nordisk turplanlegger med artsvis sesong- og værsignal, ikke som en garanti for nøyaktige funnsteder.

## Dette er endret og live

- Mobilkartet er ryddet: færre primærkontroller, avanserte/premium-verktøy bak «Mer» og mobilvennlig filterark.
- Skjemaet for å registrere funn holder seg innenfor mobilkartet og kan rulles.
- Svenske artsnavn og søk brukes konsekvent i svensk grensesnitt.
- Romlig validering er gjort lekkasjeresistent med målgruppebakgrunn og geografiske blokker.
- Uvaliderte forekomst-boost og koordinatbasert pseudo-habitat er fjernet fra live-poeng.
- Daglig flisgenerering er gjenopprettet, og egen helsesjekk overvåker ferskhet i fem regioner.
- Positive, negative og AI-bekreftede felthendelser lagrer modell-, vær- og habitatkontekst for senere kalibrering. Negative observasjoner vises ikke offentlig.
- Historisk værgrunnlag er utvidet til 1 664 rader: 1 000 svenske kjerneartsprofiler, 125 norske kjerneartsprofiler og 539 eksisterende norske profiler.
- Værvalideringen bruker nå eldre 70 % til trening, nyeste 30 % til test og bakgrunner fra samme år/nærområde når mulig.

PR-er: [#71](https://github.com/Sinsam81/mycelet/pull/71), [#72](https://github.com/Sinsam81/mycelet/pull/72), [#73](https://github.com/Sinsam81/mycelet/pull/73), [#75](https://github.com/Sinsam81/mycelet/pull/75), [#76](https://github.com/Sinsam81/mycelet/pull/76), [#77](https://github.com/Sinsam81/mycelet/pull/77), [#78](https://github.com/Sinsam81/mycelet/pull/78), [#79](https://github.com/Sinsam81/mycelet/pull/79), [#80](https://github.com/Sinsam81/mycelet/pull/80) og [#81](https://github.com/Sinsam81/mycelet/pull/81).

## Database

Migrasjon `029_prediction_feedback_context.sql` var nødvendig for treningskontekst. Den ble først kjørt og rullet tilbake to ganger i transaksjon, deretter anvendt alene via Supabase Management API etter brukerens uttrykkelige tillatelse. Ingen andre produksjonsmigrasjoner ble kjørt. Fjern migrasjonshistorikk er fortsatt tom for 001–028, så `supabase db push` må ikke brukes.

## Viktigste modellresultat

| Signal | Resultat | Beslutning |
|---|---:|---|
| Artsvis sesong/fenologi | AUC 0,882 | Behold som hovedverdi |
| Korrigert romlig fullmodell | AUC 0,521 | Ikke markedsfør som presis lokasjon |
| Habitat innen kjente skogceller | AUC 0,536 | Svakt, men mulig grunnlag for mer data |
| Forekomsttetthet alene | AUC 0,471 | Fjernet som poengboost |
| Kantarell temperatur, nyeste 30 % holdout | AUC 0,623 | Lovende, trenger større NO/SE-utvalg |
| Traktkantarell jordfuktighet, holdout | AUC 0,666 | Lovende, trenger større NO/SE-utvalg |

Ingen nye værvekter er satt live. De fleste andre arts-/værsignalene var nær tilfeldig eller svakere; en universell oppjustering ville derfor redusert troverdigheten.

## Det som fortsatt avgjør lansering

1. App Store er blokkert av RevenueCat/IAP-integrasjon, produkter og sandbox-test.
2. Retention/purge-jobbene må settes live før lagringspolicyen kan kalles operativ.
3. Distribuert rate limiting og feilovervåking bør på plass før større betalt trafikk.
4. Juridisk gjennomgang, databehandleravtaler og hendelsesrutine krever grunnlegger.
5. Svensk skogstruktur kan forbedres med Skogsstyrelsens 10×10 m-data, men REST/WMS-raster krever konto. CORINE beholdes til ny adapter har slått baseline.
6. Modellen trenger ekte feltfeedback, særlig «letet, fant ikke», før sannsynligheter kan kalibreres.

Detaljer: [deploylogg](deploys.md), [UX-audit](ux-audit.md), [buglogg](bug-ledger.md), [kjerneforbedringer](core-improvements.md), [modellrapport](prediction-model.md) og [lanseringssjekkliste](launch-checklist.md).

