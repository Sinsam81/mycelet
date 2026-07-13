# Kjerneforbedringer — prioritert

Prioriteringen bruker verdi ÷ innsats og holder fast ved to regler: sikkerhetsreglene for identifisering skal ikke svekkes, og den sterke «når»-valideringen skal fremheves uten å overselge «hvor».

## 1. Kart

### Implementert

- **[Høy verdi / middels innsats] Progressiv visning av verktøy.** Primærflaten er redusert til artsøk, funn, lovende steder og «Mer». Live i PR #73.
- **[Høy verdi / lav innsats] Mobilfilter som bunnark.** Gir mer kartflate og tydelig lukking. Live i PR #73.
- **[Middels verdi / lav innsats] Oversatt GPS-feil og svenske artsnavn.** Live i PR #73.
- **[Høy verdi / lav innsats] Skjema som faktisk kan brukes på liten mobil.** Live i PR #71.

### Foreslått

1. **[Høy / middels] Del `MushroomMap.tsx` etter UI-ansvar, ikke Leaflet-lag.** Start med `MapPrimaryControls`, `MapToolsPanel` og `OfflinePanel`; behold lag/ref-logikk i hovedkomponenten. Det reduserer vedlikeholdsrisiko uten å endre kartmotor.
2. **[Middels / middels] «Finn bilen» + enkel GPX-eksport.** Stor feltverdi, men krever tydelig privat lokal lagring og ingen deling av rå koordinater.
3. **[Middels / høy] Svensk offisiell bakgrunn/ortofoto.** Valider lisens, CSP, service-worker og offline-mal sammen. Ikke endre bare ett ledd i tile-koblingen.
4. **[Lav nå / svært høy] MapLibre/vector.** Utsatt; gir ikke nok kortsiktig verdi i forhold til risiko.

## 2. Artskatalog

### Implementert

- **[Høy / lav] Lokalisert primærnavn og svensk søk** i katalog, artsside, startside, kalender og kart. Live i PR #72/#73.
- Norsk fulltekstsøk/rangering ble beholdt; svensk søker eksplisitt i svensk/norsk/latin.
- Fire enhetstester dekker valg, reserve og sortering av navn.

### Foreslått

1. **[Høy SE / middels + fagarbeid] Svenske innholdsfelt** for beskrivelse, habitat, gift/symptomer og skillekjennetegn. Importer bare fagkontrollert tekst og vis norsk tydelig som reserve.
2. **[Middels / lav] Vis «svensk tekst mangler»** når en svensk bruker får norsk reserve, slik at språkblandingen ikke ser ut som en feil.
3. **[Middels SE / lav–middels] Lokaliser funn- og forumrelasjoner.** Bruk et klient-/serverkart fra `species_id` eller utvid lesende selects; ikke endre `public_findings`-maskeringen uten full sikkerhetsgjennomgang.
4. **[Middels / høy] Pulje 2 til 100 arter**, men bare med samme kvalitet på giftighet og kritiske forvekslingsarter.

## 3. Kalender og «når»-opplevelse

### Implementert

- **[Middels SE / lav] Lokalisert artsnavn** i sesongkort og helårstabell. Live i PR #72.
- Eksisterende geolokasjonsmønster ble bekreftet som godt: bruk allerede gitt tillatelse, ellers opt-in.

### Foreslått

1. **[Svært høy / lav–middels] Fremhev «beste dag denne uken».** Bruk eksisterende 7-dagersvarsel/flushdata og vis én tydelig toppdag på startside og kalender.
2. **[Høy / middels] «Modne nå / neste flush»-varsel i appen.** Start in-app; e-post/push krever samtykke og driftsoppsett.
3. **[Middels / lav] Forklar regional sesongjustering** med én kort tekst og mulighet til å nullstille posisjonstilpasning.

Dette er produktets mest troverdige konkurransefortrinn: timing AUC er omtrent 0,89. Prioriter dette før ny romlig markedsføring.

## 4. Prediksjon

### Verifisert

- Produksjonsprøver for Oslo/Frost-ruting og Göteborg/SMHI-ruting er grønne.
- Ingen skåringsfunksjon, regionruting eller romlig påstand ble endret.

### Foreslått

1. **[Høy drift / lav] Håndter SMHIs store stasjonsrespons uten mislykket Next-cache.** Hent parameter 5 uten fetch-cache, reduser til nødvendige stasjonsfelt og cache den lille verdien separat; legg til test for fetch-policy.
2. **[Middels UX / lav] Ikke retry varig 502 fire ganger.** Retrying bør være for nettverks-/5xx-feil som faktisk er midlertidige, ikke alle eksplisitte provider-unavailable-svar.
3. **[Høy modellverdi / høy] Fyll weather-at-find-time-tabellen og valider før ny modellendring.** Ikke juster produksjonsvekter uten positiv Brier skill og region-splitt.
4. **[Svært høy innsats] Bias-korrigert SDM.** Kun neste romlige hovedprosjekt dersom full pipeline slår target-group-background. Ikke lov bedre «hvor» før det.

## 5. Identifisering

### Verifisert

- Sikkerhetsvarsel, deaktivert reserveflyt, bildeoptimalisering/EXIF-fjerning og resultatrecovery er intakte.
- Kritiske sikkerhetsinvarianter og API-rangering ble ikke endret; alle relaterte tester er grønne.

### Foreslått

1. **[Høy UX/personvern / lav] Gjør posisjon opt-in.** Følg kalenderens mønster. Posisjon er bare kontekst og bør ikke konkurrere med kamera-tillatelsen ved sidelast.
2. **[Høy identitetskvalitet / lav] Veiled til tre vinkler:** hatt, underside og stilkbasis. Be om mer bildegrunnlag, men behold «AI er ikke spiselighetsfasit» uendret.
3. **[Middels / middels] Lokal bildekvalitetskontroll** for uskarpt/mørkt bilde før API-kall, uten å tolke art eller giftighet.

## 6. Forum

### Verifisert

- Feed, detalj, postskjema, rapport- og moderatorflater laster i begge språk på mobil.
- Flagget kode kompilerer, og uinnlogget `/forum/new` er beskyttet i produksjon.

### Foreslått før åpning

1. **[Høy / grunnlegger] Avklar moderator, responstid og eskalering for farlig artsråd.** Ikke slå på navigasjonsflagget uten ansvarlig person.
2. **[Middels / lav kode] Lokaliser `/admin/forum-trust`** og legg til lesende e2e for trust-/rapportliste.
3. **[Høy tillit / middels] Seed ekspertmodell og synlige retningslinjer.** Skill tydelig mellom fellesskapsprat og verifisert artskontroll.

## Anbefalt neste koderekkefølge

1. SMHI-cachevarsel + 502-retry-policy, i to små PR-er.
2. Identifisering med opt-in-posisjon.
3. «Beste dag denne uken» på startside/kalender.
4. Svensk innholdsmodell etter at faglig eier/oversettelsesprosess er valgt.
5. RevenueCat og retention-jobber som egne lanseringsprosjekter, ikke blandet med UX-arbeid.
