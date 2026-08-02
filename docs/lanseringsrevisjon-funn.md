# Lanseringsrevisjon — funn

> Kjørt 1.–2. august 2026 etter protokollen i `docs/lanseringsrevisjon.md`.
> **Grunnlag: commit `95b23fd`, som er nøyaktig det produksjon kjørte.** Null drift mellom main og prod.
> Avløser `technical-audit.md` og `risk-register.md` (1. august).

## Hvordan tallene ble til

| Steg | Antall |
|---|---:|
| Rå funn fra sveipet | 188 |
| Kritisk/høy sendt til motbevis | 55 |
| Overlevde motbeviset | 50 |
| Forkastet | 5 |
| Nedgradert av motbeviset | 23 |
| **Etter korreksjon: kritisk** | **5** |
| **Etter korreksjon: høy** | **24** |
| Middels/lav (ikke motbevist) | 133 |

**Ingen oppdiktede henvisninger.** Hver fil:linje i kritisk/høy ble åpnet og kontrollert. Det var
hovedsvakheten ved forrige revisjon, der tre av 39 funn siterte filer som aldri har eksistert.

### Hvilken teknikk fant hva

| Teknikk | Bekreftede funn |
|---|---:|
| 1 · sammenlignet UI mot database | 17 |
| 3 · kjørte ruta mot ekte data | 15 |
| kjørte et verktøy | 8 |
| 4 · leste konsumenter side om side | 5 |
| 2 · rendret komponenten | 2 |
| 6 · **leste koden** | **2** |
| 5 · muterte testen | 1 |

Kodelesing fant 2 av 50. Protokollens premiss holdt.

---

# 🔴 Kritisk

## K1. Grønnkremle: begge sikkerhetsmekanismene svikter for samme art

**`supabase/migrations/017_expand_species_catalog.sql:385`** + **`src/app/species/[id]/page.tsx:168`** · teknikk 1 · før beta · under en time

Grønnkremle (*Russula aeruginea*) er en grågrønn kremle som vokser under bjørk. Databasen har en
ferdigskrevet advarsel for den:

> «Mild og god matkremle. **OBS: hold den klart adskilt fra grønn fluesopp** (som har skiver med ring og volva…)»

Den teksten vises aldri. Og arten har **null** `look_alikes`-rader.

To uavhengige sikkerhetsmekanismer — advarselsteksten og forvekslingskortet — svikter samtidig,
av to helt ulike grunner. En bruker som slår opp arten får en side uten ett ord om at grønn
fluesopp finnes og ser lik ut på avstand.

**Tiltak.** Legg inn `look_alikes`-rad Grønnkremle → *Amanita phalloides* med `danger_level='critical'`,
og fjern betingelsen i K2. Begge deler er under en time. **Den mykologiske vurderingen av hvilke
par som mangler må gjøres av en soppsakkyndig** — se `lanseringsrevisjon-beslutning.md`.

## K2. 45 ferdigskrevne sikkerhetsadvarsler rendres aldri

**`src/app/species/[id]/page.tsx:168`** · teknikk 1 · før beta · under en time

Artssiden rendrer `edibility_notes` **kun** når `species.edibility === 'conditionally_edible'`.
Men 45 arter merket `edible` har skrevet, kvalitetssikret og deployet `edibility_notes` i
produksjonsdatabasen. Ingen av dem vises.

Blant det som er usynlig akkurat nå:

| Art | Skjult tekst |
|---|---|
| Grønnkremle | «hold den klart adskilt fra **grønn fluesopp**» |
| Vintersopp | «forveksles med **dødelig flatklokkehatt** — vær helt sikker» |
| Snøballsjampinjong | «unge, hvite eksemplarer må holdes klart adskilt fra **dødelig grønn/hvit fluesopp**» |
| Vårfagerhatt | «forveksles med **giftig giftrødskivesopp** — sjekk at skivene er hvite» |
| Nellikhatt | «vokser på plen sammen med **giftig hvit trakttsopp**» |
| Parasollsopp | «**VIKTIG**: se forvekslingsarter — unngå små eksemplarer og sopp i knop» |
| Sjampinjong | «må skilles fra **giftige hvite Agaricus og Amanita**» |
| Gråmusserong | «flere grå musseronger er **giftige**» |
| Vorterøyksopp | «spiselig **kun** mens kjøttet er HELT hvitt» |

Brukeren ser i stedet et grønt «Spiselig»-merke og en utelukkende positiv beskrivelse.

**Tiltak.** Fjern `edibility`-betingelsen og rendre `edibility_notes` for alle spiselighetsklasser.
Behold amber-boksen for `conditionally_edible`, bruk en nøytral notatboks for `edible`.

## K3. Forvekslingsadvarselen mangler for over halvparten av matsoppene — og appen sier «alltid»

**`src/app/api/identify/route.ts:452`** · teknikk 1 · før beta

```
24 av 45 spiselige arter har NULL forvekslingsrader
Grønn fluesopp (den dødeligste) er koblet til bare 1 art
Butt giftslørsopp — dødelig — er koblet til 0
```

Ruta setter `dangerousLookAlikes` kun når det finnes rader. Flagget `safetyDataIncomplete`
fanger bare *spørrefeil*, ikke tomme data. For de 24 artene får brukeren **verken advarsel eller
forbehold** — et rent resultat som leses som «ingen farlige forvekslinger finnes».

Koden navngir selv feilmodusen, men bare for feil-tilfellet:

> *«Uten denne beskjeden ville skjermen sett ut som en art helt uten farlige forvekslinger — den mest villedende tilstanden appen kan vise.»*

Markedsføringen lover det motsatte, tre steder:

> «Bilde inn, artsforslag ut — **alltid** med giftighet og farlige forvekslingsarter tydelig merket.»

**Tiltak.** Skill tre tilstander i stedet for to: *data finnes og er tomme* · *data mangler for
arten* · *spørringen feilet*. Bare den første har lov til å vise ingenting. Til datagrunnlaget er
komplett bør «alltid» ut av markedsføringsteksten.

## K4. Sikkerhetsprosaen på artssidene finnes bare på norsk

**`src/app/species/[id]/page.tsx:278`** · teknikk 3 · før beta · 2–4 dager + soppsakkyndig

Databasen har `swedish_name` for alle 72 arter, men **ingen** svenske kolonner for `description`,
`toxin_info`, `symptoms`, `edibility_notes` eller for `look_alikes.difference_description`.

Det betyr at de 14 kritiske forvekslingstekstene — den ene setningen som forteller hvordan man
skiller en dødelig tvilling fra en matsopp — vises på **norsk** for en svensk bruker, med den
dødelige artens **norske navn** i seg.

**Tiltak.** Svenske kolonner + `pickLocalizedText(row, felt, locale)`. Oversettelsen må gjøres av
noen som kan svensk sopp-terminologi, ikke maskinoversettes. Ved forrige gjennomgang av svenske
artsnavn viste **fire av 26** seg å være feil, og tre av dem var navnet på en *annen* art.

## K5. «Lagre kartområde» laster ned tomt hav fra Nordishavet

**`src/lib/utils/offlineMap.ts:72`** · teknikk «kjørte verktøy» · før beta · 1–2 timer

Linje 72 deler på `π` der Web Mercator krever `2π` — faktoren ½ mangler, fordi
`ln((1+sin φ)/(1−sin φ))` er *to ganger* `atanh(sin φ)`.

Jeg lastet ned begge flisene for Oslo på zoom 12:

| | flis-y | nedlastet |
|---|---:|---:|
| Det koden regner ut | 335 | **854 bytes** — tomt hav |
| Det Leaflet faktisk viser | 1191 | **111 250 bytes** — Oslo |

Hver nordisk breddegrad havner på 80–86 °N. Tromsø regner ut y = −384 og klemmes til Nordpolen.

En Premium-kunde trykker «Lagre kartområde», får kvitteringen «Område lagret. 550 kartfliser
klare offline» — og har lastet ned tomme havfliser. I skogen uten dekning er nettopp de flisene
det som mangler.

**Testen som skulle fanget det** (`offlineMap.test.ts:14`) sjekker `tile.y >= 0`. Det er sant for
enhver breddegrad, også feil. Ren kulisse — teknikk 5 i protokollen.

**Tiltak.** `const y = Math.floor(((1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2) * n);`
og en test som sammenligner mot en kjent riktig flis, ikke mot null.

> **Merk om metoden.** To agenter var uenige om dette funnet. Motbevis-agenten forkastet det og
> skrev at «offline-nedlastingen henter riktige fliser». Min egen måling avgjorde det — 854 mot
> 111 250 bytes — og kallkjeden `cacheMapTilesForArea → getTileUrlsForBounds → latLngToTile` er
> bekreftet. Den forkastelsen tok også med seg et App Store-funn som hvilte på den; begge er
> gjeninnsatt.

---

# 🟠 Høy

## H0. Migrasjon 033 ble aldri kjørt i produksjon

**`supabase/migrations/033_lock_prediction_tiles_rpc.sql`** · teknikk 1 · før innsending · 5 minutter

Den offentlige anon-nøkkelen henter fortsatt **763 fliser / 500 kB** — hele Nordens forhåndsberegnede
raster — i ett kall. PR #103 er ute i koden, men `REVOKE`-en er aldri limt inn i SQL-editoren.

Alle andre migrasjoner **er** kjørt (verifisert: 034-kolonnene, omdøpingene, audit-loggen,
`billing_webhook_events`, `swedish_name`). 033 er den eneste som ikke etterlater et skjemaobjekt
å sjekke mot — derfor den eneste som kunne bli glemt uten at noe merket det.

`get_findings_in_bounds` og `get_occurrences_in_bounds` er også anon-kallbare. Førstnevnte
returnerer **kun `display_*`** — ingen rå koordinater, ingen private funn — så personvernmodellen
holder. Sistnevnte er GBIF-data, som er åpne per definisjon.

**Tiltak.** Kjør `033_lock_prediction_tiles_rpc.sql` i SQL-editoren. Og innfør en sjekk som fanger
migrasjoner uten skjemaspor — en `applied_migrations`-tabell, eller en helsesjekk som prøver
kallet som anon og feiler hvis det lykkes.

### H1. SMHI-adapteren leverer ALDRI data — hele Sverige kjører i skjul på Open-Meteo, og «Kilder»-linja mister værkilden

**`src/lib/weather/index.ts:496`** · teknikk kjørte verktøy · før beta · 3-5 timer

**Hva teknikken ga.** Direkte kall mot SMHI (parameter 5, stasjon 71420 Göteborg A): HTTP 200, 131 daglige verdier, men punktene har formen {from,to,ref,value,quality} — det finnes INGEN `date`-nøkkel på døgnparametrene (5 nedbør, 19 min-temp, 20 maks-temp). Bare timesparametrene (1 temp, 6 fukt) har `date`. Koden gjør `Number(p?.date)` på linje 496 (og 434, 452) → NaN → alle punkter filtreres bort → `precipDaily.length===0` → linje 506 `return null`. Verifisert mot prod-bygget på :3111: GET /api/prediction?lat=57.71&lon=11.97 → "weatherSource":"open_meteo"; lat=59.33&lon=18.07 → "open_meteo"; lat=67.86&lon=20.23 → "open_meteo". Ingen svensk koordinat gir "smhi". Motbevisforsøk: (a) SMHI nede? Nei — 200 på alle fem parameterlister, 233/624/182/220/220 aktive stasjoner. (b) Feil i mitt oppsett? Jeg kjørte kodens egen filterlogikk mot det ekte svaret: 0 av 131 punkter overlever. (c) Nøkkelmangel lokalt? SMHI krever ingen nøkkel. (d) Testene dekker det? src/lib/weather/__tests__/index.test.ts:108-111 lager mock-punkter med `date` — en form SMHI ikke returnerer for parameter 5/19/20. Derfor er suiten grønn og

**For brukeren.** Ingen svensk bruker har fått svensk stasjonsvær. Alle svenske tall (score, 7-dagersstripe, flush) kommer fra en modell-API appen aldri navngir. Samtidig: HotspotPanel.tsx:31-35 mangler nøkkelen `open_meteo` i WEATHER_SOURCE_LABEL, så «Kilder:»-linja dropper værleverandøren helt for svenske brukere; /datakilder krediterer SMHI (som ikke brukes) og nevner ikke Open-Meteo (som brukes) — Open-Meteo er CC-BY og krever navngivelse.

**Tiltak.** Les `ref` (eller `from`) for døgnparametrene i sumWithinDays (:434), extremeWithinDays (:452) og precipDaily (:496); behold `date` for time-parametrene. Erstatt testfixturen på :108-111 med et ekte SMHI-svar per parametertype, og skru fiksen av igjen for å bekrefte at testen blir rød. Legg `open_meteo: 'Open-Meteo'` i WEATHER_SOURCE_LABEL og Open-Meteo inn i SOURCES i src/app/datakilder/page.tsx.

**Forsøkt motbevist med:** Den sterkeste innvendingen: «open_meteo» i svaret beviser ikke at `date`-nøkkelen er årsaken. fetchSmhi returnerer null på fem andre steder også (stasjonsliste tom/timeout, ingen aktiv temp- eller nedbørsstasjon, temperatureC===null). Hvis SMHI-stasjonslistene f.eks. timet ut lokalt (parameter/5.json er stor, hentes med cache:'no-store' og WEATHER_TIMEOUT_MS), ville vi sett nøyaktig samme «open_meteo» uten at linje 496 var involvert — og da ville


### H2. Samme poengsum, motsatt dom: dagens søyle tegnes gul, morgendagens lavere søyle tegnes grønn

**`src/app/api/mushroom-forecast/route.ts:158`** · teknikk 3 · kjørte ruta · før beta · 2-4 timer

**Hva teknikken ga.** GET /api/mushroom-forecast?lat=59.79&lon=10.65 (Nesodden) → today {score:83, optimal:false}; days[1] søn {score:75, optimal:true}; days[3] tir {score:83, optimal:true}. Oslo: today {65,false}, søn {65,true}, man {65,true}. Aritmetisk bevis for Nesodden: 83 kan bare settes sammen som 35(sesong aug)+20(regn≥20mm)+20(temp 15°C)+8(fukt 65-79) — altså score≥65 ✓, måned 8 i [6,11] ✓, regn≥15 ✓. Da er `moistNow` det ENESTE som kan gjøre optimal=false (mushroom-day.ts:112). Bekreftes uavhengig av at regn-linja mangler i `reasons` — det filteret (mushroom-day.ts:117) fjerner regn-linjer kun når moistNow er false. Ruta sender soilMoistureIndex for dag 0 (:115) men objektet for dag 1-6 (:154-160) inneholder den ikke i det hele tatt → undefined → vetoet er strukturelt inert for fremtidsdager. Motbevisforsøk: «kanskje marka faktisk blir fuktigere i morgen» — nei, vetoet kjøres aldri for de dagene, uansett vær.

**For brukeren.** MushroomDayCard.tsx:202 og PlaceForecastStrip.tsx:118 farger søylene på `optimal`. På Nesodden i dag er 83-søylen (i dag) gul og 75-søylen (søndag) grønn, side om side, med tallene skrevet over. Brukeren planlegger turen til den DÅRLIGERE dagen fordi den er den eneste grønne.

**Tiltak.** Beregn soilMoistureIndex fremover: `series` finnes allerede på route.ts:101 (observert + prognose). Kjør computeSoilMoistureIndex på series.slice(0, obsLen+i) og send den inn for hver prognosedag — samme målestokk som dag 0. Alternativt fjern vetoet fra dag 0 så alle sju dagene bedømmes likt. Test: konstant vær i sju dager må gi sju identiske {score, optimal}.

**Forsøkt motbevist med:** "Vetoet er ikke inert — det er bevisst inaktivt for prognosedager, og de grønne fremtidsdagene er fysisk berettiget: marka er tørr i dag, men prognoseregnet fukter den opp, så morgendagen ER faktisk bedre enn i dag selv med lavere poengsum. Kommentaren i mushroom-day.ts:110 sier eksplisitt «Null or undefined (OpenWeather, forecast days) leaves the veto inert» — altså dokumentert design, ikke bug. I tillegg: kanskje i dag har optimal=false av en h


### H3. «Skog her (SR16): granskog, bonitet 20» beskriver en skog 15,5 km unna

**`src/app/api/prediction/route.ts:268`** · teknikk 1 · UI mot database · før innsending · 2-3 timer

**Hva teknikken ga.** GET /api/prediction?lat=59.91&lon=10.75 → forest {source:"sr16", forestType:"gran", volumePerHa:428, productivity:20}. Jeg fant igjen nøyaktig den flisa i prediction_tiles: center 59.78/10.65 med samme components.forest — haversine fra brukerens punkt: 15,5 km. Elverum (60.88/11.30): flisa ligger 7,9 km unna. Bergen (60.39/5.32): 2,3 km. route.ts:268-270 velger den HØYEST SCORENDE flisa i hele ±15 km-boksen som har skogdata, ikke flisa brukeren står i. Teksten er prediction-explanation.ts:207 `Skog her (${source}): ${forest}, bonitet ${productivity}`.

**For brukeren.** En bruker i Oslo sentrum får en ekte, presis NIBIO-måling («bonitet 20», «428 m³/ha») presentert med ordet «her» om et sted 15 km unna. Tallets presisjon får brukeren til å stole på en romlig påstand modellen ikke bærer — den romlige delen har ærlig AUC 0,52.

**Tiltak.** Slå opp getForestProperties({lat, lon}) for brukerens eget punkt (det gjøres allerede på fallback-veien, route.ts:423), eller endre teksten til «Beste skog i området (~N km herfra)» med avstanden regnet ut og skrevet.

**Forsøkt motbevist med:** Den sterkeste innvendingen er at valget av flis ikke spiller noen rolle: hvis skogdataene er tilnærmet ensartede innenfor ±15 km-boksen, beskriver «gran, bonitet 20» like godt stedet brukeren står på som flisa 15 km unna, og «her» leses da som «i området» — akkurat slik resten av panelet er rammet inn (HotspotPanel skriver «X steder markert innenfor søkeområdet»). Sekundært: at linja kunne vært død kode (kun bygget i fallback-stien eller gated ba


### H4. Kalenderen setter dødelig steinmorkel «i sesong nå» i august i Nord-Norge/Norrland, og fjerner kantarell og steinsopp

**`src/lib/utils/season-region.ts:19`** · teknikk 1 · UI mot database · før innsending · 1-2 dager for kurvebasert løsning; 10 minutter for nødbremsen (shift = 0)

**Hva teknikken ga.** Jeg bygget produksjonsmodulen med esbuild og kjørte de ekte funksjonene `seasonShiftDays` + `isInSeasonOn` for 1.8.2026 mot de 72 ekte radene i mushroom_species. Tromsø (69,65°N) gir shift = +35 d og lista «I sesong nå (august)» blir 12 arter: Brunskrubb, Sjampinjong, Vanlig morkel, Spiss morkel, Karbol-sjampinjong, Svovelsopp, Bleklodden steinsopp, STEINMORKEL (edibility=deadly), Rødnende trådsopp (toxic, med badge «TOPP-SESONG»), Judasøre, Vårfagerhatt (badge «TOPP-SESONG»), Nellikhatt. Kantarell, Steinsopp, Traktkantarell, Rødskrubb, Smørsopp m.fl. — 50 arter — faller UT. Kontroll mot ekte funndata (species_occurrences, service-role, kun lesing): Gyromitra esculenta nord for 64°N har 2 av 278 funn i august (0,7 %); topp er juni (146) og mai (111). Kantarell nord-bånd har kurveverdi 0,489 på 1. august (halve toppen), toppuke 34 = slutten av august. Selve premissen er også målt feil: av 38 arter med både sør- og nordkurve peaker 35 TIDLIGERE i nord (snitt −13,8 dager); bare de to vårmorklene peaker senere (+28/+35 d) — og det er nøyaktig de heuristikken dytter inn i august.

**For brukeren.** En bruker i Tromsø, Alta, Bodø eller Kiruna som har delt posisjon (eller bare har gitt geolokasjon til kartet før — SeasonNow.tsx:71-88 bruker den stille uten å spørre) åpner /kalender 1. august og får beskjed om at kantarell og steinsopp IKKE er i sesong, mens steinmorkel — appens egen `deadly`-art, som dreper via gyromitrin — står som kort med bilde under overskriften «I sesong nå (august)», og giftig rødnende trådsopp står med «Topp-sesong»-merke. Merket «Tilpasset din posisjon» gir dette autoritet. Native iOS-skallet er ikke rammet (ingen navigator.geolocation i WKWebView), men web på mobil og desktop er.

**Tiltak.** Fjern den breddegradsbaserte forskyvningen fra SeasonNow, eller snu den til å bruke den empiriske kurven som allerede finnes: `phenologyFactor(speciesId, lat, dayOfYear)` fra src/lib/prediction/phenology.ts gir en breddegradsbåndet kurve per art fra 316 542 daterte funn. Erstatt `isInSeasonOn(now, season_start, season_end, shift)` i SeasonNow.tsx:107 og :110-111 med en terskel på phenologyFactor (f.eks. >= 0,15), og fall tilbake til det håndkodede vinduet uten shift for de to artene uten kurve (id 59, 60). Inntil det er gjort: sett shift = 0 (én linje i season-region.ts:19) — da får nordlige b

**Forsøkt motbevist med:** Den sterkeste innvendingen er at kodestien er praktisk talt død for ekte brukere: `shift` er 0 som standard (SeasonNow.tsx:60), og den stille personaliseringen i useEffect (SeasonNow.tsx:73-92) krever BÅDE at `navigator.permissions.query({name:'geolocation'})` finnes OG at state allerede er `granted`. Commit 34d3d1d heter bokstavelig talt «Polish calendar and stop its unsolicited location prompt» — altså er dette et kjent, allerede adressert områ


### H5. Sesongvinduene er systematisk for smale — 28 % av alle piggsoppfunn og 12 % av alle kantarellfunn ligger i måneder appen kaller «utenom sesong»

**`src/app/calendar/page.tsx:81`** · teknikk 1 · UI mot database · før beta · 2 timer for datarettingen; 1-2 dager for kurvebasert visning

**Hva teknikken ga.** Rå månedsfordeling hentet direkte fra species_occurrences (327 298 rader totalt) og holdt mot season_start/season_end i mushroom_species. Andel funn UTENFOR appens vindu: Gulnende kremle (8-10) 39,6 % — juli alene 39 %. Piggsopp/Hydnum repandum (9-11) 37,5 % — august 28 % (1219 av 4315 funn). Rødgul piggsopp (9-11) 36,5 % — august 29 %. Svart trompetsopp (9-10) 26,0 % — august 20 %. Kantarell (7-9) 23,4 % — oktober 12 % (1037 av 8399). Sherryhatt (9-11) 22,6 % — august 21 %. Brun fluesopp (8-10) 20,9 % — juli 20 %. Gulkremle (8-10) 18,6 % — juli 16 %. Kontroll: Steinsopp 1,8 %, Traktkantarell 4,0 %, Fåresopp 5,4 % — vinduene er ikke gjennomgående gale, de gale er identifiserbare. Sjekket at tallene ikke er GBIF-sentinelstøy: bare 1,4 % av augustfunnene for piggsopp og 5,9 % av oktoberfunnene for kantarell ligger på den 1. i måneden (normal dagsandel ≈ 3,2 %). Live på localhost:3111: /calendar rendret 58 av 72 arter som «i sesong», /species-filteret «Kun i sesong nå» ga nøyaktig 58 — samme håndkodede tall begge steder.

**For brukeren.** En bruker som slår opp piggsopp i august får grå ruter i kalenderen og «Utenom sesong» i AI-resultatet, for en art der drøyt hver fjerde registrerte nordiske funn er gjort nettopp i august. Samme for kantarell i oktober. Appen selges på «når» — det er den validerte delen (AUC 0,89) — og det er nettopp «når» som er feil her. Effekten går begge veier i sikkerhetssammenheng: spiss giftslørsopp (dødelig, vindu 8-10) har 8 % av funnene i juli, da appen sier den ikke finnes.

**Tiltak.** Slutt å bruke season_start/season_end som fasit i visning. De fire visningsflatene (calendar/page.tsx:81, SeasonNow.tsx:107, useSpecies.ts:61, page.tsx:129) bør lese den samme empiriske kurven som prediksjonen allerede bruker. Minstetiltak hvis det blir for stort: korriger de ti verste radene i mushroom_species mot den faktiske månedsfordelingen — piggsopp 8-11, rødgul piggsopp 8-11, sherryhatt 8-11, svart trompetsopp 8-10, gulnende kremle 7-10, kantarell 7-10, brun fluesopp 7-10, gulkremle 7-10, sammenvokst fåresopp 7-10, blomkålsopp 8-11.

**Forsøkt motbevist med:** At season_start/season_end bare er kosmetiske månedsfelt som fargelegger en kalendertabell, mens appens faktiske og validerte «når»-motor (AUC 0,89) er den empiriske fenologien i src/lib/prediction/phenology.ts, bygget på de samme 316 542 daterte funnene. Hvis prediksjonen alltid overstyrer med fenologikurven, ville ingen bruker faktisk få vite at piggsopp er «utenom sesong» i august — funnet ville da være en tabellfarge uten produktkonsekvens. S


### H6. Kalendertabellen «Når hver art kan plukkes gjennom året» viser 6 dødelige og 11 giftige arter helt uten spiselighetsmerke

**`src/app/calendar/page.tsx:74`** · teknikk 2 · rendret komponenten · før innsending · 1-2 timer

**Hva teknikken ga.** Hentet den ekte serverrendrede siden fra produksjonsbygget (curl http://localhost:3111/calendar) og parset <table>-elementet: 72 rader, 89 634 tegn, og null forekomster av «Dødelig», «Giftig», «Spiselig», «deadly», «toxic», «edib», «bg-red» eller «amber» inne i tabellen. Radene inneholder kun lenken: <a href="/species/52">Grønn fluesopp</a> osv. Grønn fluesopp, Hvit fluesopp, Steinmorkel, Flatklokkehatt og Spiss giftslørsopp står alle der med sesongprikker; Grønn fluesopp har mørkegrønn «Topp-sesong»-prikk i august og september. Overskriften rett over er «Hele året» med undertittel «Når hver art kan plukkes gjennom året» (messages/nb.json:224, sv-varianten «När varje art kan plockas under året» på messages/sv.json:224). Til kontrast har lista «I sesong nå» over tabellen EdibilityBadge på hvert kort (SeasonNow.tsx:48).

**For brukeren.** Leseren får en tabell som med rene ord lover å vise når hver art kan plukkes, og der Amanita phalloides er markert med den kraftigste grønnfargen i legenden («Topp-sesong») i august. Legenden forklarer bare sesong, ikke spiselighet, så det finnes ingenting på flaten som skiller matsopp fra dødelig sopp. Dette er den ene feilklassen i appen som kan drepe.

**Tiltak.** To ting: (1) endre undertittelen fra «Når hver art kan plukkes gjennom året» til noe som beskriver fruktifisering, ikke plukking — f.eks. «Når hver art vokser gjennom året. Sier ingenting om spiselighet.» i begge kataloger; (2) legg EdibilityBadge (eller minst en fargeprikk med tekstlig tittel) i artskolonnen i calendar/page.tsx:74-78, samme komponent som SeasonNow allerede bruker.

**Forsøkt motbevist med:** Den sterkeste innvendingen er at brukeren aldri møter tabellen uten et spiselighetsmerke i nærheten: (a) rett OVER tabellen, på samme side, ligger «I sesong nå»-lista der de samme dødelige artene faktisk har rødt «Dødelig giftig»-merke (Amanita phalloides, A. virosa, Cortinarius rubellus — verifisert i HTML-en foran tabellen), og (b) hver radlenke går til /species/[id], som har en rød banner «Dødelig giftig — ikke spis». Tabellen påstår heller in


### H7. En utløpt abonnementsrad viser «Premium — Aktiv» og «Aktiv plan», og skjuler kjøpsknappen for planen brukeren ikke lenger har

**`src/app/pricing/page.tsx:342`** · teknikk 1 · UI mot database · før beta · 30 minutter kode + én DB-oppdatering

**Hva teknikken ga.** Produksjonsraden i billing_subscriptions for bruker 50d3c496-8842-4dc5-8719-613e023458e9 (lest 1. august 2026): tier='premium', status='active', current_period_end='2026-07-02T19:22:14+00:00' — altså utløpt for en måned siden. Abonnementet sub_1TdxtCDfYTPQys9uDUybOH2B finnes hverken i live- eller testkontoen (begge svarer 404), så ingen webhook vil noensinne rydde raden. Kjørte den ekte getBillingCapabilities på raden: {"tier":"premium","status":"active","paid":false,"aiDailyLimit":5}. Fordi isCurrent utledes av capabilities.tier (linje 342 → 431), ikke av capabilities.paid, gir det: premium-kortet «Aktiv plan»=true og kjøpsknapp=false (linje 480–486), «Din plan: Premium» (linje 388), samtidig som «AI-kvote: 5 per døgn» vises (linje 396) og «Administrer abonnement» er skjult (linje 398). Header.tsx:32/53 gir gull-badge «Premium». Samme utfall er garantert for alle tre manuelle sesongpassene når de utløper (2027-06-04, 2028-01-01, 2036-06-12) — simulerte det med utløpsdato i går: tier='season_pass', paid=false, kort viser fortsatt «Aktiv plan».

**For brukeren.** Brukeren blir fortalt at hen har Premium og at planen er aktiv, mens hen i praksis er på gratisnivå med 5 AI-kall i døgnet. Hen kan ikke kjøpe Premium på nytt — knappen finnes ikke — og har ingen «Administrer abonnement»-knapp heller. Eneste tilgjengelige handling er å kjøpe Sesongpass. Gjelder i dag for én ekte konto, og treffer med sikkerhet alle tre gavepass/demokontoer ved utløp.

**Tiltak.** Utled isCurrent og «Din plan»/badge av capabilities.paid, ikke av capabilities.tier: i src/app/pricing/page.tsx:342 sett currentTier = status?.capabilities.paid ? status.capabilities.tier : 'free'; gjør det samme i src/components/layout/Header.tsx:32 og src/app/profile/page.tsx:101/142. Rydd deretter den foreldreløse raden for bruker 50d3c496 (tier→'free', status→'canceled') — abonnementet ligger i en Stripe-konto som ikke lenger er i bruk.

**Forsøkt motbevist med:** At tilstanden er uoppnåelig for ekte Stripe-kunder: Stripe-webhooken holder raden i synk (customer.subscription.updated/deleted), så status ville blitt 'canceled'/'unpaid' i stedet for å bli stående 'active' med utløpt periode — og den ene raden som viser feilen er en foreldreløs testrad fra før live-lansering, ikke en betalende kunde. Sekundært: at getBillingCapabilities kunne nulle tier til 'free' ved utløp, eller at en cron/annen kjøpsinngang 


### H8. SMHI-adapteren returnerer alltid null — alle svenske værtall kommer i virkeligheten fra Open-Meteo

**`src/lib/weather/index.ts:495`** · teknikk 3 · kjørte ruta · før innsending · 1-2 timer inkl. test

**Hva teknikken ga.** Mot produksjonsbygget på :3111 svarte /api/mushroom-day med weatherSource="open_meteo" for Göteborg (57.71/11.97), Stockholm, Malmö, Kiruna og Sundsvall — 5 av 5. Oslo og Bergen ga "met_frost", så regionrutingen virker. SMHI er IKKE nede: GET https://opendata-download-metobs.smhi.se/api/version/latest/parameter/1.json ga HTTP 200 på 0,19 s (782 kB). Jeg replikerte adapteren mot ekte SMHI: stasjonslistene lastet på 300 ms, nærmeste stasjon ble funnet (Göteborg A, 71420), temperatur kom tilbake (18,8 °C), og nedbør kom tilbake med 131 døgnverdier. Feltnavnene i nedbørssvaret (period/latest-months) er «from, to, ref, value, quality» — det finnes INGEN «date». Kjørte appens eget filter fra linje 495-500 på det ekte svaret: precipDaily.length = 0 → linje 506 `if (precipDaily.length === 0) return null;` → fetchSmhi returnerer null → linje 86-89 faller videre til OpenWeather og deretter Open-Meteo. Fasit-nedbøren jeg regnet ut med riktig felt (`to`): 13,0 mm siste 7 døgn og 18,6 mm siste 14 døgn i Göteborg. Appen ville uansett fått 0/0/0 mm, fordi sumWithinDays (linje 434) og extremeWithinD

**For brukeren.** Hele Sverige — halve markedet — får soppforhold, 7-dagersstripe, flush-varsel og prediksjonsscore regnet på modelldata fra Open-Meteo i stedet for SMHIs stasjonsmålinger. Ingen feilmelding, ingen degradert-markering. Samtidig står det på den LIVE landingssiden at «varselet henter svenske værdata fra SMHI» (public/landing/index.html:491), i FAQ-en (messages/nb.json:1379: «Ja! Værdata fra SMHI») og som oppført kilde på /datakilder (src/app/datakilder/page.tsx:46). Påstanden er usann i dag.

**Tiltak.** Les nedbørs- og min/maks-punktene på `to` (eller `ref`) i stedet for `date` i src/lib/weather/index.ts:496, :434 og :452 — latest-months-formatet har intervall, ikke tidspunkt, mens latest-hour (temperatur) har `date`. Legg til en test som mater inn et ekte latest-months-svar og krever at precipDaily > 0. Til fiksen er ute: enten fjern SMHI-påstanden fra landingsside/FAQ/datakilder, eller la weatherSource vises i UI-et slik at det ikke kan avvike stille fra det som selges.

**Forsøkt motbevist med:** Den sterkeste innvendingen er at SMHI faktisk leverer et `date`-felt for parameter 5, og at `weatherSource="open_meteo"` for svenske punkter skyldes noe helt annet — en nettverksfeil under testkjøringen, en manglende stasjon, en timeout på 6 s, eller at SE i det hele tatt aldri rutes til fetchSmhi. I så fall ville linje 495-500 vært korrekt kode, og funnet ville hvile på én observasjon uten mekanisme. En beslektet innvending: enhetstesten `src/li


### H9. 10 av 16 kontoer i produksjon mangler profilrad — 7 av dem er bekreftede brukere som har logget inn og ikke kan lagre funn

**`src/app/api/findings/route.ts:73`** · teknikk 1 · UI mot database · før innsending · 2-3 timer + engangsskript

**Hva teknikken ga.** Supabase admin-API mot produksjon: 16 rader i auth.users, 6 rader i profiles. 10 kontoer uten profil, opprettet 22.–29. juli 2026, alle med provider=email og username satt i user_metadata. 7 av dem har email_confirmed_at OG last_sign_in_at (domener gmail.com ×4, yahoo.com, hotmail.com, interia.pl, btrr.no) — altså ekte folk som kom inn i appen. Bekreftet at fremmednøklene finnes i det UTRULLEDE skjemaet, ikke bare i migrasjonsfila: PostgREST svarte «findings_user_id_fkey using findings(user_id) and profiles(id)», «forum_posts_user_id_fkey», «comments_user_id_fkey». Uten profilrad feiler dermed innsettingen med 23503, og ruta svarer generisk 500 «Kunne ikke lagre funnet» (linje 73-76). public_findings-viewet INNER JOINer profiles (migrasjon 029, linje 81), så funnet ville uansett ikke vist seg. ensureProfile-reparasjonen (src/lib/auth/ensure-profile.ts, kalt fra useAuth.ts:58) landet først i dag (commit 12a8f21, 01.08.2026) — den reparerer bare ved NESTE passordinnlogging, og Supabase-sesjoner fornyer seg selv, så disse 10 kan bli stående ødelagt i det uendelige. Ingen av dem har abon

**For brukeren.** Sju personer som registrerte seg i juli har en konto de kan logge inn på, men appen svarer «Kunne ikke lagre funnet» hver gang de prøver å registrere et funn, og de kan ikke poste i forumet. De kan ikke registrere seg på nytt heller — e-posten er «allerede i bruk». De har ingen måte å forstå hva som er galt, og ingen vei ut uten å logge ut og inn igjen.

**Tiltak.** 1) Kjør en engangs-reparasjon som oppretter manglende profilrader fra user_metadata for de 10 kontoene (krever Sindre — service-role-skript, skriveoperasjon). 2) Legg profilopprettelsen i en `handle_new_user`-trigger på auth.users i stedet for i tre klientstier, så den ikke kan hoppes over. 3) I src/app/api/findings/route.ts:73: fang error.code === '23503' og svar med noe brukeren kan handle på, ikke en generisk 500.

**Forsøkt motbevist med:** "Allerede rettet." Commit 12a8f21 (ensureProfile ved passordinnlogging) ER en forfar til 95b23fd og kjører altså i produksjon, og /auth/callback har hatt en tilsvarende profiles-upsert siden 2822c97 (2026-06-09) — FØR alle de 10 kontoene ble opprettet 22.–29. juli. Hvis en reparasjon som allerede fantes dekket disse kontoene, er funnet en beskrivelse av en lukket feil. Sekundært: hvis findings.user_id peker på auth.users og ikke profiles i det UT


### H10. Fuktvetoet i 7-dagersstripen gjelder bare i dag — samme score får motsatt farge på nabodagen

**`src/app/api/mushroom-forecast/route.ts:153`** · teknikk 3 · kjørte ruta · før innsending · 2-3 timer

**Hva teknikken ga.** GET /api/mushroom-forecast?lat=59.91&lon=10.75 mot produksjonsbygget, ekte MET Frost-data: {01.08 score 65 optimal=false} {02.08 score 65 optimal=true} {03.08 score 65 optimal=true}. Tre identiske tall, motsatt dom. Göteborg samme kall: 02.08 score 73 optimal=false, mens Oslo 07.08 score 73 optimal=true. Årsak: assessMushroomDay setter `optimal = score >= 65 && inSeasonWindow && rain >= 15 && moistNow` (src/lib/prediction/mushroom-day.ts:112), og `moistNow` er `weather.soilMoistureIndex == null || >= 0.55` (linje 111). Ruta sender soilMoistureIndex for I DAG (linje 115), men objektet for prognosedagene (linje 153-160) inneholder bare temperatureC, humidityPct, regnvinduer, minTemp7dC: null, maxTemp7dC: null — ingen soilMoistureIndex. Vetoet er derfor permanent inert for alle seks fremtidsdager. Kodekommentaren på linje 108 innrømmer det selv: «Null eller undefined (OpenWeather, forecast days) leaves the veto inert.» Samme kall ga flush-status «building, daysUntil: 5, Det regnet nylig — gi det noen dager».

**For brukeren.** På forsiden males hver stolpe med colorFor(d.score, d.optimal) (src/components/home/MushroomDayCard.tsx:202, terskel :53). I dag i Oslo står tre like høye stolper ved siden av hverandre: i dag i oransje, søndag og mandag i skoggrønn — alle med tooltip «65/100». Rett over står flush-banneret og sier at soppen kommer om ~5 dager. Brukeren blir bedt om å dra ut på søndag på et grunnlag modellen selv ville avvist. Dette er WHEN-delen av modellen, den eneste delen som er validert (AUC 0,89) og det appen selger.

**Tiltak.** Fremskriv fuktbøtta gjennom prognosedøgnene og send soilMoistureIndex inn i assessMushroomDay-kallet på src/app/api/mushroom-forecast/route.ts:153 — computeSoilMoistureIndex kan kjøres på den sammenslåtte serien `series.slice(0, obsLen + i)` som allerede bygges på linje 139. Legg til en test som mater inn en tørr bøtte og krever optimal=false på dag 3.

**Forsøkt motbevist med:** At det observerte beviset ikke beviser mekanismen. «Samme score, motsatt dom» krever ikke fuktvetoet i det hele tatt: scoren gir +10 for `rain >= 10` (mushroom-day.ts:82), mens optimal-porten krever `rain >= 15` (linje 112). Hele intervallet 10–15 mm gir altså score 65 med optimal=false, og 15–20 mm gir score 65 med optimal=true — uten at soilMoistureIndex er involvert. Det ses direkte i to prognosedager ved siden av hverandre, der vetoet bevisel


### H11. Første trykk på «Kart» i bunnmenyen registreres som «Tillat analyse» — GA4-samtykke gitt ved bomtrykk, og hele bunnmenyen er død til notisen er besvart

**`src/components/layout/BottomNav.tsx:23`** · teknikk 3 · kjørte ruta · før beta · Inngår i fiksen over; e2e-testen ca. 1 time

**Hva teknikken ga.** Hit-testing av hvert bunnmeny-element mot elementFromPoint, på live www.mycelet.com 375x812: ["Hjem -> blocked by overlay", "Bibliotek -> Avvis analyse", "Kart -> Tillat analyse", "Kalender -> blocked by overlay"]. Identisk på localhost:3111 og på 430x932. På 1280x800 er alle fire «blocked by overlay». Geometri: notis h=268, top=544; nav h=71, top=741; begge z-index 50, og CookieNotice ligger etter Providers i src/app/layout.tsx, så den vinner. Motbevisforsøk: (1) «QA-fixturen skrur av notisen» — nøkkelen `mycelet:cookie-notice-dismissed-v1` finnes KUN i e2e/, aldri i src/; CookieNotice leser `mycelet:analytics-consent-v1` (src/lib/analytics.ts:1); (2) «ingen e2e-test klikker i bunnmenyen» — bekreftet, derfor grønn QA; (3) «kanskje bunnmenyen skjules på mobil» — nei, src/components/layout/PageWrapper.tsx:17 rendrer den på hver side uten breakpoint.

**For brukeren.** En førstegangsbruker på telefon som trykker «Kart» i bunnmenyen trykker i realiteten «Tillat analyse». GA4-skriptet lastes (src/components/analytics/Analytics.tsx:93), _ga-cookies settes og data sendes til Google — uten at brukeren har tatt stilling til noe. Trykk på «Bibliotek» gir motsatt: «Avvis analyse». Samtykke som oppstår av et navigasjonstrykk er ikke utvetydig og informert etter GDPR art. 4(11), og det lagrede valget er ikke etterprøvbart. I tillegg er hele hovednavigasjonen ubrukelig til notisen er besvart.

**Tiltak.** Samme endring som i funnet over: `pointer-events-none` på wrapperen i CookieNotice.tsx:66 og flytt notisen over bunnmenyen med `bottom-[calc(4.75rem+env(safe-area-inset-bottom))]`, nøyaktig som InstallPrompt.tsx:87. Legg samtidig inn en e2e-test som klikker hver bunnmeny-lenke MED cookie-notisen synlig — Playwright feiler da med «intercepts pointer events» hvis dette gjenoppstår.

**Forsøkt motbevist med:** At CookieNotice aldri rekker å ligge over bunnmenyen for en ny bruker: den rendrer ikke før onboarding er unnagjort (src/components/layout/CookieNotice.tsx:37-47), og en anonym førstegangsbruker på "/" blir av middleware skrevet om til den statiske landingssiden public/landing/index.html (src/lib/supabase/middleware.ts:112-116) — som IKKE har bunnmeny. Hvis notisen bare dukker opp der bunnmenyen ikke finnes, er hele bomtrykk-scenarioet konstruert


### H12. Fallback-grenen navngir ingen art — samme panel, samme 0-100-skala, to ulike størrelser for NO og SE

**`src/app/api/prediction/route.ts:587`** · teknikk 3 · kjørte ruta · før innsending · (b) 2-4 t, (a) 1-2 dager

**Hva teknikken ga.** Fire kall mot produksjonsbygget på localhost:3111 mot ekte data. Oslo (59.91/10.75): `source: prediction_tiles, score: 55, condition: good, leadingSpecies: {id:1, norwegianName:'Kantarell'}, habitat: {score:0.9, reasons:[...]}`. Göteborg (57.71/11.97): `source: computed_fallback, score: 28, condition: poor, leadingSpecies: null, habitat: null`. Stockholm (59.33/18.07): `computed_fallback, score 25, forest: null`. Kristiansand (58.15/8.00, altså Norge): `computed_fallback, score 41, leadingSpecies: null`. Årsak i koden: flisbanens retur (route.ts:394) har `leadingSpecies: leadingSpecies ?? undefined`; fallback-returen (route.ts:576-587) har ingen leadingSpecies-nøkkel i det hele tatt. src/lib/prediction/tile-regions.ts:10-16 viser at prediction_tiles bare genereres for Oslo, Trondheim, Bergen, Stavanger og Innlandet — ingen svensk region. Bekreftet i basen: `select tile_date` gir bare 2026-08-01, 763 rader.

**For brukeren.** HotspotPanel.tsx:60-72 har en eksplisitt kontrakt i kommentaren: «Uten artsfilter er scoren den BESTE arten i området nå ... Da må arten stå ved siden av tallet». Den kontrakten holder bare i fem norske bokser. For 100 % av svenske brukere og alle norske utenfor de fem boksene er `leadingName` tom streng, og pillen viser bare «28/100 svaga förhållanden» — et umerket tall som brukeren leser som en påstand om sopp generelt. Verre: tallene er ikke sammenlignbare. 55 i Oslo betyr «kantarell, beste art her»; 28 i Göteborg betyr «generelle miljøforhold, ingen art». Samme skala, samme farge, samme panel. En svensk bruker som sammenligner med en norsk venn sammenligner to forskjellige størrelser.

**Tiltak.** Fallback-grenen må enten (a) kjøre samme artskollaps som flisbanen — beregne score per kandidatart i sesong og returnere den beste med `leadingSpecies` — eller (b) merke svaret eksplisitt i UI-et: HotspotPanel må lese `data.source` og skrive «generelle forhold» framfor et bart tall når source er computed_fallback. (a) er riktig produkt, (b) er minimumsærlighet. Ikke la det stå som nå.

**Forsøkt motbevist med:** «Panelet merker allerede det generiske tilfellet ærlig, så dette er kosmetikk, ikke feil tall.» Argumentet: fallback-scoren ER en artsuavhengig forholdsscore (computeCellPrediction får species: null på route.ts:467, og cell-score.ts:129 setter speciesFit = null, altså ingen artsjustering og ingen fenologi). Når panelet mangler leadingSpecies skriver HotspotPanel.tsx:137 ut t('allSpecies') — «Alle arter» / «Alla arter» (messages/nb.json + sv.json,


### H13. Svensk bruker får to motstridende giftinformasjonsnumre på samme side, og det norske står øverst

**`src/app/species/[id]/page.tsx:142`** · teknikk 1 · UI mot database · før beta · 1–2 timer (én migrasjon + verifisering med curl på begge språk)

**Hva teknikken ga.** Sammenlignet det ruta viser med det som står i basen. Rendret HTML fra /species/16 med sv-cookie, sammenhengende: «Symtom: Symptomfritt intervall 6–24 t, … ring Giftinformasjonen 22 59 13 00 straks ved mistanke. Vid förtäring — ring Giftinformationscentralen 112 (akut) eller 010-456 67 00 omedelbart.» Rammen (Safety.poisonNumber i messages/sv.json) er riktig lokalisert til «112 (akut) eller 010-456 67 00». Nummeret som står FØRST kommer fra mushroom_species.symptoms i basen. Spørring mot produksjon: 9 av 17 giftige/dødelige arter har «Giftinformasjonen 22 59 13 00» hardkodet inne i symptoms — id 15 Röd flugsvamp, 16 Vit flugsvamp, 17 Toppig giftspindling, 18 Pluggskivling, 52 Lömsk flugsvamp, 53 Panterflugsvamp, 56 Gifthätting, 58 Orangebrun giftspindling, 59 Gifttrattskivling. Motbevisforsøk: (a) overstyrer den svenske rammen den norske teksten? Nei — begge rendres, i den rekkefølgen, i samme røde boks. (b) Er «22 59 13 00» ringbart fra Sverige? Nei — det står uten landskode, og lenken tel: bygges bare rundt rammens nummer, ikke rundt teksten.

**For brukeren.** En svensk bruker med mistanke om forgiftning leser tallet som står først i symptombeskrivelsen. 22 59 13 00 slått fra en svensk telefon når ingen. Nettopp den forsinkelsen er det symptomteksten er skrevet for å hindre — fem av de ni artene har et symptomfritt intervall på 6–24 timer eller opptil tre uker.

**Tiltak.** Fjern telefonnummeret fra mushroom_species.symptoms i alle 9 radene (migrasjon som stripper setningen «ring Giftinformasjonen 22 59 13 00 …» / «Ring Giftinformasjonen 22 59 13 00 …»). Den lokaliserte rammen på linje 145-160 i samme fil bærer allerede riktig nummer for begge språk. Dette er den billigste av de to kritiske fiksene og kan gjøres uten oversetter eller soppsakkyndig.

**Forsøkt motbevist med:** At funnet overdriver konsekvensen og derfor ikke er kritisk: den KORREKTE svenske teksten står i samme røde boks, ca. 100 tegn etter det norske nummeret («Vid förtäring — ring Giftinformationscentralen 112 (akut) eller 010-456 67 00 omedelbart»), og den ENESTE klikkbare tel:-lenken på hele siden er tel:112. En svensk bruker står altså aldri igjen uten et fungerende nummer — han får et mislykket oppringingsforsøk og leser så videre i samme avsnitt


### H14. Stripe-webhooken skriver current_period_end = null på hver abonnementshendelse → premium uten utløpsdato

**`src/app/api/stripe/webhook/route.ts:274`** · teknikk kjørte verktøy · før beta · 1-2 timer kode + 5 min i Stripe Dashboard

**Hva teknikken ga.** Lesende kall mot LIVE Stripe på det ekte abonnementet sub_1ThYAQPvIc25pUd2xpXqQhwp: uten Stripe-Version-header svarer kontoen med responsheader «Stripe-Version: 2026-05-27.dahlia» og top-level current_period_start/current_period_end = null (verdiene 1781282569/1783874569 ligger nå i items[0]). Med «Stripe-Version: 2024-06-20» ligger de på topnivå. GET /v1/webhook_endpoints viser at https://www.mycelet.com/api/stripe/webhook har api_version = null → Stripe rendrer leveransene i kontoens standardversjon (dahlia), ikke i SDK-ens pinnede 2024-06-20 (src/lib/stripe/server.ts:14). Kjørt mot ekte kildekode (esbuild-bundle av src/lib/billing/*): toIso(undefined) = null → raden webhooken skriver blir {"tier":"premium","status":"active","current_period_end":null} → getBillingCapabilities = {"tier":"premium","status":"active","paid":true,"aiDailyLimit":null}, hasPaidAccess('active','premium',null) = true (plans.ts:42 «if (!currentPeriodEnd) return true»). Motbevisforsøk: (a) endepunktet er ikke pinnet — api_version=null bekreftet via API; (b) stripe.webhooks.constructEvent (route.ts:150) verifi

**For brukeren.** Første kjøp får riktig utløpsdato. Fra og med første fornyelse, kortbytte eller oppsigelse settes utløpsdatoen til null, og raden blir aldri ugyldig av seg selv. En kunde som slutter å betale, blir refundert, eller hvis siste webhook-leveranse går tapt, beholder Premium for alltid. Kunden ser samtidig ikke lenger «Fornyes/utløper {dato}» på /pricing (page.tsx:391 rendrer linjen kun når feltet finnes), altså ingen opplysning om når neste trekk kommer. Kontekst fra produksjon: billing_subscriptions har 4 rader (3 manuelle grants + 1 utløpt rad fra en nedlagt Stripe-konto), live Stripe har 1 kunde og 1 kansellert+refundert abonnement — feilen rammer altså ingen i dag, men slår inn på den aller 

**Tiltak.** Les periodedatoene fra subscription.items.data[0] med fallback til topnivå, i begge grenene (route.ts:221-222 og 274-275), ELLER pinn webhook-endepunktet i Stripe Dashboard til 2024-06-20. Begge deler, helst. Legg samtidig inn en test som mater ruta en dahlia-formet payload.

**Forsøkt motbevist med:** At Stripe ikke faktisk leverer dahlia-rendret payload til dette endepunktet. Motargumentet har to ledd: (a) `api_version: null` på et webhook-endepunkt kunne bety at Stripe låser rendringen til versjonen som var kontostandard da endepunktet ble opprettet (dvs. en gammel versjon der `current_period_end` fortsatt ligger på topnivå), ikke til dagens kontostandard — da ville `subscription.current_period_end` være satt og feilen forsvinne; og (b) selv


### H15. Det finnes ingen Stripe Billing Portal-konfigurasjon — «Administrer abonnement» kan ikke lage en sesjon, så kunden har ingen vei til å si opp

**`src/app/api/billing/portal/route.ts:44`** · teknikk kjørte verktøy · før beta · 15 min i Dashboard + 30 min kode for feilmelding

**Hva teknikken ga.** GET /v1/billing_portal/configurations?limit=5 mot både LIVE- og TEST-nøkkelen returnerer 0 elementer (`live portal configurations: 0 []`, `test portal configurations: 0 []`). Ruta kaller stripe.billingPortal.sessions.create({customer, return_url}) uten `configuration`-parameter, altså mot standardkonfigurasjonen — som Stripe først oppretter når portalinnstillingene lagres i Dashboard. Motbevisforsøk: sjekket om en konfigurasjon kunne ligge i den andre modusen (nei, tom i begge); jeg opprettet IKKE en portalsesjon, siden det ville vært en skriving mot Stripe.

**For brukeren.** «Administrer abonnement» (pricing/page.tsx:398-408) er den ENESTE oppsigelsesveien i webappen. Slår den feil, får kunden «Kunne ikke åpne kundeside» (portal/route.ts:54-60) og må sende e-post for å si opp et løpende trekk. Det er brudd på angrerett-/oppsigelsesplikten og gir chargebacks i stedet for kanselleringer.

**Tiltak.** Sindre: Stripe Dashboard → Settings → Billing → Customer portal → sett opp og lagre (tillat kansellering, kortbytte, fakturahistorikk) i LIVE-modus. Deretter: logg inn som en konto med stripe_customer_id og trykk «Administrer abonnement» én gang og bekreft at Stripe-siden åpner. Legg på en tydelig feilmelding i ruta som skiller «portal ikke konfigurert» fra andre feil.

**Forsøkt motbevist med:** At `billing_portal/configurations` bare lister API-opprettede konfigurasjoner, slik at en Dashboard-standardkonfigurasjon kan finnes uten å vises i lista — eller at Stripe oppretter standardkonfigurasjonen lat, ved første `sessions.create`. Da ville tomt listesvar ikke bevise noe, og «Administrer abonnement» ville virke. Sekundært: at LIVE-nøkkelen i .env.local peker på en annen/begrenset konto enn den produksjon bruker, så jeg måler feil konto. 


### H16. Et utløpt eller ubetalt abonnement vises som «Aktiv plan» med gullmerke, og kjøpsknappen for den planen skjules — kunden kan verken bruke eller fornye

**`src/app/pricing/page.tsx:431`** · teknikk 1 · UI mot database · før beta · 2-3 timer

**Hva teknikken ga.** Hentet de faktiske radene i produksjons-Supabase og kjørte dem gjennom den ekte getBillingCapabilities. Ekte rad i dag (bruker 50d3c496…, tier=premium, status=active, current_period_end=2026-07-02, altså utløpt): capabilities = {"tier":"premium","status":"active","paid":false,"aiDailyLimit":5}. Rendringsreglene: Header.tsx:32 leser capabilities.tier og Header.tsx:50 gir GULL badge for alt som ikke er 'free' — uavhengig av paid. pricing/page.tsx:342 setter currentTier fra samme tier, :431 gjør isCurrent=true, :480 viser «Aktiv plan», :486 skjuler kjøpsknappen. :398 skjuler «Administrer abonnement» fordi paid=false. Motbevisforsøk: sjekket om status brukes noe sted i badge-/knappelogikken — det gjør den ikke; samme utfall for status 'canceled' og 'past_due'.

**For brukeren.** Brukeren ser gull-merket «Premium» i toppen og «Din plan: Premium — Aktiv», men blir møtt av gratisgrensene (5 AI-kall/døgn, 403 på heatmap). Det finnes ingen knapp noe sted til å kjøpe planen på nytt eller åpne Stripe-portalen. Ved past_due (mislykket kortbelastning) er dette akutt: kunden mister tilgangen samme sekund og kan ikke oppdatere kortet fra appen.

**Tiltak.** Bruk capabilities.paid, ikke capabilities.tier, som grunnlag for gullmerket (Header.tsx:50), «Aktiv plan» og skjuling av kjøpsknappen (pricing/page.tsx:431). Vis «Administrer abonnement» så lenge det finnes en stripe_customer_id, ikke bare når paid=true (:398). Legg til grace-periode for past_due, slik RevenueCat-siden allerede har (revenuecat.ts:198-214).

**Forsøkt motbevist med:** At tilstanden ikke er ekte-reachable, bare et testartefakt, og at brukeren uansett ikke er låst inne: (a) Stripe-abonnementet i den siterte raden finnes ikke i Stripe (verken live- eller testkontoen svarer på id-en), og metadata mangler `provider`-feltet som dagens webhook alltid skriver — altså en gammel/foreldreløs rad, ikke en levende kunde; (b) selv med tier=premium rendres Sesongpass-kortets kjøpsknapp fortsatt (isCurrent er false for det ko


### H17. Native-appen lar en kunde med aktivt Stripe-abonnement kjøpe den andre planen hos Apple — web blokkerer det samme med 409

**`src/app/pricing/page.tsx:486`** · teknikk 4 · konsumenter side om side · før innsending · 3-4 timer

**Hva teknikken ga.** Lest de to kjøpsveiene ved siden av hverandre. Web: /api/billing/checkout returnerer 409 «Du må avslutte den nåværende planen først» når existingCapabilities.paid er true (checkout/route.ts:98-111). Native: kjøpsknappen rendres for enhver plan der isCurrent er false (page.tsx:486, isCurrent er per plan, :431), og startIapPurchase går rett til Apple uten noe serverkall. RevenueCat-webhooken har ingen tilsvarende sperre: eierskapsvakten på route.ts:196 gjelder kun decision.kind !== 'grant', så et Apple-kjøp tar alltid over raden (upsert :203-221). I tillegg skjules «Administrer abonnement» i native (page.tsx:398), så Stripe-trekket kan ikke stoppes fra appen. Motbevisforsøk: Apple/RevenueCat forhindrer bare dobbeltkjøp av SAMME Apple-produkt — de vet ingenting om Stripe-abonnementet.

**For brukeren.** En kunde som betaler 79 kr/mnd på web, laster ned iOS-appen og kjøper Sesongpass til 249 kr i den — og betales for begge. Raden viser bare sesongpasset, så verken kunden eller appen ser dobbelttrekket, og oppsigelsesknappen for Stripe er skjult i native.

**Tiltak.** Sperr IAP-kjøp når /api/billing/status viser en aktiv Stripe-eid plan (metadata.provider==='stripe' og paid): skjul knappen og vis samme tekst som 409-svaret. Vis «Administrer abonnement» også i native når raden er Stripe-eid (Apple krever bare at Apple-abonnement administreres hos Apple).

**Forsøkt motbevist med:** Kodestien er ikke nåbar for noen kunde i dag: kjøpsknappen krever isNativePlatform() === true, altså Capacitor-skallet, og iOS-appen er ikke publisert. Hvis appen ikke finnes i App Store kan ingen «laste ned iOS-appen og kjøpe Sesongpass», og brukerpåvirkningen slik den er formulert (kunder som betaler dobbelt akkurat nå) er da usann. Sekundært: påstanden om at trekket ikke kan stoppes er for sterk — RevenueCat-webhooken lar `stripe_*`-kolonnene 


### H18. Apple App Review-demokontoens manuelle sesongpass blir overskrevet av reviewerens sandbox-kjøp og deretter revokert midt i vurderingen

**`src/app/api/revenuecat/webhook/route.ts:196`** · teknikk 1 · UI mot database · før innsending · 2-3 timer

**Hva teknikken ga.** Spørring mot produksjons-Supabase viser raden: user 562ab4f8…, tier=season_pass, status=active, current_period_end=2028-01-01, metadata={"note":"Apple App Review demo account","source":"manual_grant"}. Eierskapsvakten på route.ts:196 gjelder kun når decision.kind !== 'grant', så et INITIAL_PURCHASE tar alltid over raden, og upserten på :203-221 erstatter tier/status/current_period_end og setter metadata={provider:'revenuecat',…} — «manual_grant»-notatet forsvinner. Sandbox-porten på :141 slipper gjennom fordi REVENUECAT_ALLOW_SANDBOX=1 er satt i Vercel Production (docs/reports/deploys.md:70) og MÅ stå på gjennom review. Sandbox-abonnement har komprimert varighet (1 måned = 5 minutter) og auto-kanselleres etter 6 fornyelser → EXPIRATION → revoke (revenuecat.ts:184-195, status 'canceled'). Produksjonsprobe bekrefter at RC-webhooken er aktiv i prod: POST uten auth gir 401 «Ugyldig autorisasjon» (ikke 503), altså er REVENUECAT_WEBHOOK_AUTH satt.

**For brukeren.** Apple-reviewer logger inn på demokontoen, tester kjøpet i sandbox (som Apple gjør rutinemessig), og innen ~30 minutter utløper sandbox-abonnementet. Kontoen faller til gratis, det manuelle sesongpasset til 2028 er permanent borte, og reviewer møter betalingsmur på funksjonene metadataen sier er tilgjengelige → avvisning. Samme mekanisme gjelder Sindres egen founder-rad (8e23c7b6…, source manual_grant til 2036) hvis han tester IAP med den kontoen.

**Tiltak.** La grant hoppe over rader med metadata.source='manual_grant' (eller ta vare på det gamle passet i metadata og gjenopprett ved EXPIRATION). Enklere før innsending: gi App Review-demokontoen et pass som ikke er den samme raden IAP skriver til, eller bruk en egen konto til sandbox-testing og gi reviewer en konto som aldri kjøper.

**Forsøkt motbevist med:** At kjøpet aldri kan utløses mot demokontoen i det hele tatt — kontoen har allerede aktivt sesongpass, så /pricing skulle vise «aktiv plan» i stedet for en kjøpsknapp, og da blir det ingen INITIAL_PURCHASE, ingen overskriving og ingen senere EXPIRATION. Sekundært: at sandkasse-hendelser blir ACK-et og forkastet fordi REVENUECAT_ALLOW_SANDBOX ikke er satt i produksjon, eller at RC-webhooken ikke er skrudd på ennå (503, ikke 401).


### H19. PostgREST kutter hvert RPC-svar ved 1000 rader — kartet og prediksjonen ser 1000 av 82 089 GBIF-punkter, og 6 av 72 arter

**`src/components/map/MushroomMap.tsx:648`** · teknikk 1 · UI mot database · før innsending · 1–2 dager (ny aggregerende RPC + endre fire kallsteder + test som feiler når svaret treffer taket)

**Hva teknikken ga.** Produksjonens PostgREST-konfigurasjon har max_rows: 1000. Kall mot /rest/v1/rpc/get_occurrences_in_bounds med nøyaktig samme bbox kartet bruker for Sør-Norge (58,0–61,0 N, 5,0–12,0 Ø) og p_limit 3000 ga 1000 rader. Artsfordelingen i svaret: {1:6, 2:908, 22:17, 23:14, 24:50, 25:5} — altså 6 arter, og 908 av 1000 er art 2 (Steinsopp). Fasit fra basen for samme boks: 82 089 rader og 72 arter, der art 3 har 3203, art 55 har 3165, art 1 (Kantarell) har 3014, art 15 har 2746. Kantarell bidrar med 6 av sine 3014. 66 av 72 arter er helt fraværende i svaret. Alle fire kallstedene ber om mer enn taket: MushroomMap.tsx:648 p_limit 3000, api/prediction/route.ts:431 p_limit 4000, api/prediction/grid/route.ts:173 p_limit 4000, api/prediction/species-spots/route.ts:177 p_limit 4000. Ingen av dem ser at svaret er avkortet — PostgREST setter ingen feil, bare færre rader.

**For brukeren.** Observasjonslaget på kartet viser 1000 nåler der det finnes 82 000, og de nålene er praktisk talt én art. /api/prediction/species-spots ber uttrykkelig om alle arter (p_species_id: null) og grupperer per art for å gi hver art sitt eget «observasjoner nær her»-løft — 66 av 72 arter får da null observasjoner og dermed systematisk for lav score på sine beste steder. Dette er samme feilklasse som kartet som viste dårligste sopp per rute: hvert kodesteg er riktig, feilen ligger i en egenskap ved infrastrukturen som ikke står noe sted i koden.

**Tiltak.** To ting. (1) Sett en eksplisitt paginering eller aggreger i SQL i stedet for å hente rålisten: la get_occurrences_in_bounds returnere antall per rutecelle per art (GROUP BY), ikke 82 000 punkter — det er uansett det både okkurrens-kjernen og klyngelaget trenger. (2) Til kartlaget: hev max_rows for prosjektet ELLER hent i sider med Range-headere, og logg når returnert antall == taket slik at avkorting aldri igjen er stille. Verifiser med den samme bbox-en: antall distinkte species_id i svaret skal være 72, ikke 6.

**Forsøkt motbevist med:** To motargumenter var i spill. (1) «1000-taket er en artefakt av supabase-js-klienten eller av revisorens curl-oppsett, ikke av produksjonens PostgREST» — hvis taket ikke finnes server-side, faller hele funnet. (2) Selv om taket finnes: «kartet ber aldri om en boks stor nok til å treffe det». Boksen revisoren målte (58–61 N, 5–12 Ø = 3° × 7°) er hele Sør-Norge — et zoomnivå ingen bruker sitter på. Standard zoom er 11 (MushroomMap.tsx:1167) og geol


### H20. 10 av 16 kontoer mangler profilrad; de kan ikke lagre funn, poste, kommentere, like eller rapportere — alt brukerinnhold har fremmednøkkel mot profiles

**`src/lib/hooks/useAuth.ts:77`** · teknikk 1 · UI mot database · før innsending · 2–3 timer (én linje kode + backfill-skript + kontroll)

**Hva teknikken ga.** Spørring mot produksjon: auth.users = 16, public.profiles = 6, brukere uten profil = 10. Sju av dem har faktisk logget inn (last_sign_in_at satt). Alle ti er opprettet 2026-07-22 til 2026-07-29, alle med provider 'email', alle med username i user_metadata. Åtte av dem har bekreftet e-posten (email_confirmed_at satt 12–276 sekunder etter opprettelse) — og fikk likevel ingen profil. Kontoene fra 2026-07-30 og 2026-08-01 har profil. Fremmednøklene fra pg_constraint: findings.user_id → profiles(id), forum_posts.user_id → profiles(id), comments.user_id → profiles(id), post_likes.user_id → profiles(id), saved_posts.user_id → profiles(id), reports.reporter_id → profiles(id), blocked_users.blocker_id → profiles(id). Uten profilrad avvises hver eneste av disse innsettingene med 23503. Mekanismen: produksjonens auth-konfigurasjon har mailer_autoconfirm=false, altså påkrevd e-postbekreftelse; signUp i useAuth.ts:77–92 sender ingen emailRedirectTo (grep på emailRedirectTo i hele src gir null treff), så bekreftelseslenken går til site_url = https://www.mycelet.com — altså roten, ikke /auth/callba

**For brukeren.** Sju ekte kontoer i produksjon i dag kan logge inn, se appen, og så feile på hver eneste handling som skriver noe. Reparasjonen i useAuth.ts:58 (lagt inn 2026-08-01, commit 12a8f21, som ER i produksjon) løser det først neste gang de logger inn med passord — ingen av de sju har vært innom siden.

**Tiltak.** (1) Send emailRedirectTo: `${window.location.origin}/auth/callback?next=…` i supabase.auth.signUp i src/lib/hooks/useAuth.ts:78, slik at bekreftelseslenken faktisk treffer callback-ruta som allerede kaller ensureProfile. (2) Kjør et engangs-backfill med tjenestenøkkelen: insert i profiles for hver auth.users-rad uten profil, med username fra raw_user_meta_data->>'username' og suffiks ved kollisjon. (3) Verifiser etterpå at select count(*) from auth.users u where not exists (select 1 from profiles p where p.id=u.id) er 0.

**Forsøkt motbevist med:** At profilraden opprettes av en databasetrigger, ikke av appkoden. Nesten alle Supabase-prosjekter har en `handle_new_user`-trigger på `auth.users` som setter inn i `public.profiles` automatisk. Finnes den, er hele den siterte kodestien (signUp uten emailRedirectTo → site_url → statisk landingsside → ingen kodeveksling) irrelevant, fordi profilen aldri var avhengig av at klienten kom tilbake. Og da måtte differansen 16 vs 6 forklares på en annen m


### H21. Innebygd Supabase-e-post: maks 2 e-poster per time, engelske maler, og bekreftelse er påkrevd — over to registreringer i timen stopper nye brukere

**`src/lib/hooks/useAuth.ts:77`** · teknikk kjørte verktøy · før innsending · 2–4 timer (SMTP-oppsett, DNS-verifisering, maloversettelse)

**Hva teknikken ga.** Auth-konfigurasjonen lest fra produksjonsprosjektet via Supabase Management API: smtp_host = null (ingen egen SMTP, altså Supabases innebygde tjeneste), rate_limit_email_sent = 2, mailer_autoconfirm = false, mailer_allow_unverified_email_sign_ins = false. Malene er engelske: mailer_subjects_confirmation = "Confirm Your Signup", mailer_subjects_recovery = "Reset Your Password", mailer_templates_confirmation_content = "<h2>Confirm your signup</h2> … Follow this link to confirm your user". Appens språk er norsk og svensk.

**For brukeren.** Med påkrevd bekreftelse og to e-poster i timen for hele prosjektet: den tredje som registrerer seg i samme time får aldri bekreftelseslenken, og kommer ikke inn i det hele tatt. Glemt-passord deler samme kvote. På en lanseringsdag eller etter et Facebook-innlegg som treffer, er dette den eneste flaskehalsen som betyr noe. I tillegg får en norsk eller svensk bruker en engelsk e-post fra en app som ellers er helt lokalisert.

**Tiltak.** Koble på egen SMTP (Domeneshop-kontoen post@mycelet.com finnes allerede, eller Resend/Postmark) i Supabase Auth-innstillingene, hev deretter rate_limit_email_sent til minst 100, og skriv om mailer_templates_confirmation_content og mailer_templates_recovery_content til norsk med svensk variant. Krever Sindre: endringene gjøres i Supabase-dashbordet under Authentication → Emails og Rate Limits.

**Forsøkt motbevist med:** At e-postbekreftelse i praksis er AV i produksjon — koden selv antar det (kommentaren i src/app/auth/register/page.tsx:68: «With e-mail confirmation OFF, signUp returns an active session»), og hvis den er av sendes ingen bekreftelses-e-post, kvoten røres aldri av registrering, og hele funnet faller. Sekundært: at Google-innlogging gir en vei rundt e-post, og at det finnes egen SMTP (Sindre har smtp.domeneshop.no) slik at 2-per-time-taket ikke gje


### H22. Ingen side kan åpnes uten nett — løftet «kartet fungerer i skogen uten dekning» holder ikke i noe skall

**`public/sw.js:109`** · teknikk 3 · kjørte ruta · før beta · (A) 3-5 dager. (B) 2 timer

**Hva teknikken ga.** public/sw.js:109 `if (event.request.mode === 'navigate') return;` — service workeren avviser hver eneste HTML-navigasjon til nettverket, og isCacheableStaticRequest (linje 65-81) slipper bare gjennom stier som ender på .js/.css/.png/.svg/.jpg/.webp, så «/map» matcher ingenting. Precachen (linje 24) er `['/manifest.json','/icons/icon.svg','/icons/icon-maskable.svg']` — ingen side. Curlet produksjonsbygget på :3111: /offline → 404, /api/offline → 404. Det finnes altså ingen offline-fallbackside i web-appen. I det native skallet er fallbacken capacitor-www/index.html, som på linje 47 sier ordrett «Kartet og funnene trenger nett — prøv igjen når du har dekning» — appens egen offline-skjerm motsier markedsføringen. /map er dessuten auth-gatet (src/lib/supabase/middleware.ts:7), så selv siden krever en serverrunde. Curlet så løftene ut av det ekte produksjonsbygget: /pricing (nb) gir «Fungerer den uten dekning? — Med Premium kan du laste ned kartområder på forhånd, så kartet fungerer i skogen uten dekning» (messages/nb.json:1383) og /pricing med MYCELET_LOCALE=sv gir samme påstand på svens

**For brukeren.** Bruker slår av mobildata i skogen, åpner Mycelet, og får nettleserens feilside (web/PWA) eller «Ingen nettforbindelse akkurat nå» (iOS-skallet). Han har betalt 79 kr/mnd blant annet for den situasjonen. Løftet står live på både norsk og svensk i dag.

**Tiltak.** Velg én av to, ikke begge halvveis. (A) Bygg det: legg en offline-skallside i precachen, la fetch-handleren svare på navigate-forespørsler med den når nettverket feiler, og la den tegne Leaflet mot TILE_CACHE + funn fra IndexedDB. Da må teksten om ferske sikkerhetsopplysninger i sw.js:9-23 løses eksplisitt (vis dato på cachet innhold). (B) Skriv om løftet til det som faktisk leveres: «Kart du har sett fungerer videre mens appen er åpen — start appen mens du har dekning». Endre da messages/nb.json:1383, messages/sv.json:1383, featOfflineBody på linje 1345 i begge, og de tilsvarende avsnittene i

**Forsøkt motbevist med:** To motangrep, begge sjekket og begge avvist. (1) «Funnet hviler på en lesning markedsføringsteksten ikke sier»: FAQ-en lover strengt tatt bare at *nedlastede kartområder* tegnes uten dekning — ikke at appen kan startes kaldt uten nett. Flisecachen virker faktisk, så løftet kunne vært innfridd i den scenarioen funksjonen er laget for (appen allerede åpen, bruker panorerer i lagret område). (2) «Det finnes en annen offline-vei enn service workeren»


### H23. Ingen verifisert backup og ingen testet restore av produksjonsbasen, samtidig som den låste datalagringspolicyen påstår 30 dagers point-in-time-vindu

**`docs/retention-policy.md:24`** · teknikk 6 · leste koden · før innsending · 2 timer (Sindre) + 0,5 dag restore-test

**Hva teknikken ga.** docs/retention-policy.md er merket «Status: Låst 9. mai 2026 av Sindre. Tallene under er normative», og linje 24 lyder «| Backups (Supabase point-in-time) | **30 dager** (Supabase-default) | Recovery-vindu for ulykker |». Samme repo, docs/reports/bug-ledger.md:25: «Supabase viste ingen synlig logisk backup og PITR var av.» Og docs/reports/launch-checklist.md:18: «[founder action] Velg Supabase backup/PITR-plan. Under gjennomgangen var PITR av og ingen synlig backup kunne listes.» docs/professional-handoff.md:88 og :213 lister «Backup og restore-test» som utestående. Det finnes ingen backup-skript i scripts/, ingen backup-jobb i vercel.json (eneste cron er `/api/cron/generate-tiles`, «15 1 * * *»), og ingen restore-runbook i docs/. Motbevisforsøk: kunne PITR vært slått på siden buglogg-oppføringen? Det kan ikke avgjøres herfra — Supabase-planinnstillingen er ikke synlig gjennom REST-API-et. Det er nettopp poenget: ingen i repoet kan vise at den er på.

**For brukeren.** Én Supabase-instans, ingen staging, ekte betalende kunder og 034 migrasjoner som kjøres ved å lime SQL inn i dashboardet (CLAUDE.md sier dette eksplisitt). En feilkjørt migrasjon eller en `DROP SCHEMA` — som allerede har skjedd én gang, jf. gotchaen om tapte GRANTs — kan ikke rulles tilbake med noe som er dokumentert eller prøvd. Policydokumentet som mater /personvern § 5 lover et gjenopprettingsvindu ingen har verifisert eksisterer.

**Tiltak.** SINDRE MÅ SJEKKE (kan ikke avgjøres herfra): Supabase Dashboard → Project Settings → Database → Backups. Les av (a) om Point-in-Time Recovery er ON, (b) oppgitt vindu i dager, (c) datoen på siste vellykkede daglige backup. Er PITR av: slå den på eller korriger retention-policy.md:24 til det som faktisk gjelder — et normativt dokument får ikke love noe som ikke finnes. Deretter: kjør ÉN restore-test (Supabase kan restaurere til et nytt prosjekt), noter hvor lang tid den tok, og skriv resultatet i docs/reports/. En backup som aldri er gjenopprettet er en antakelse, ikke en backup.

**Forsøkt motbevist med:** Bevisføringen forveksler «ingen backup-kode i repoet» med «ingen backup». Supabase-backup er en dashboard-/plan-innstilling: på Pro-planen tas daglige backups automatisk, uten at det noensinne ville etterlate et skript i scripts/ eller en jobb i vercel.json. Fraværet av repo-artefakter er derfor null bevis. Da står bare én andrehåndslinje igjen (docs/reports/bug-ledger.md:25, skrevet 2026-07-14), og den kan for lengst være utdatert — Sindre kan h



---

## Middels og lav

Ikke motbevist (protokollen krever det kun for kritisk og høy). Behandle som hypoteser med fil:linje.

| # | Alvor | Funn | Fil |
|---|---|---|---|
| 1 | lav | «~N km {retning}» i topp-sted-popupen kan overstige radiusen banneret nettopp lovte | `src/components/map/MushroomMap.tsx:402` |
| 2 | lav | Spiselighetsfilteret dekker fire av seks verdier — 10 av 72 arter kan ikke isoleres i det hele tatt | `src/app/species/page.tsx:14` |
| 3 | lav | Giftig art er stavet feil i katalogen: «Hvit trakttsopp» med dobbel t | `supabase/migrations/017_expand_species_catalog.sql:97` |
| 4 | lav | Profilsiden viser den rå databasestatusen «active»/«canceled» i stedet for oversatt tekst | `src/app/profile/page.tsx:144` |
| 5 | lav | Checkout viser feltet «Legg til kampanjekode», men det finnes ingen kampanjekoder i live-Stripe | `src/app/api/billing/checkout/route.ts:133` |
| 6 | lav | Webhooken har en død gren som ville gitt et «Sesongpass» som utløper 30. november, ikke etter ett år | `src/app/api/stripe/webhook/route.ts:240` |
| 7 | lav | Prediksjonsrasteret dekker fem norske byområder og null av Sverige — svenske brukere treffer alltid  | `src/lib/prediction/tile-regions.ts:10` |
| 8 | lav | 22 GBIF-observasjoner er importert med søppelkoordinater, og de teller med i prediksjonen | `scripts/import-gbif-occurrences.mjs:201` |
| 9 | lav | next-intl kjører uten konfigurert timeZone og logger IntlError ENVIRONMENT_FALLBACK ved hver rendrin | `src/i18n/request.ts:8` |
| 10 | lav | Fem sider sender «X — Mycelet — Mycelet» som <title> — metaTitle inneholder allerede merkenavnet som | `messages/nb.json:572` |
| 11 | lav | forum/new leser norwegian_name rått — fire søsken-konsumenter av samme spørring bruker getJoinedSpec | `src/app/forum/new/page.tsx:235` |
| 12 | lav | moderator_roles-oppslaget svelger feilen i fire av fem konsumenter — en ekte admin får «ingen tilgan | `src/app/admin/page.tsx:80` |
| 13 | lav | Kartet og /api/prediction beregner soppforholdet på to forskjellige måter over to forskjellige områd | `src/components/map/MushroomMap.tsx:1384` |
| 14 | lav | Brukerens egen rapportoversikt formaterer datoer med hardkodet nb-NO | `src/app/forum/reports/page.tsx:33` |
| 15 | lav | Den svenske landingssiden lenker til tre norskspråklige artikler, og den ene sikkerhetsartikkelen er | `public/landing/index.sv.html:466` |
| 16 | lav | Stedssøket på kartet foreslår norske steder til svenske brukere | `messages/sv.json` |
| 17 | lav | Forumets rollemerker er hardkodet på norsk og går utenom next-intl | `src/lib/utils/forumBadge.ts:23` |
| 18 | lav | «Juster posisjon (meter)» flytter alltid punktet nøyaktig nordøst — forskyvningen er en konstant vek | `src/components/map/AddFindingSheet.tsx:90` |
| 19 | lav | Triggeren re-jitrer et «approximate»-funn ved HVER update — ufarlig i dag fordi appen ikke har noen  | `supabase/migrations/024_fix_zone_display_trigger.sql:16` |
| 20 | lav | Bildebøttene er public:true — tilgangskontrollen er «hemmelig URL», også for bilder knyttet til priv | `supabase/migrations/019_storage_buckets_for_images.sql:1` |
| 21 | lav | Sesjonscookien er lesbar fra JavaScript, mangler Secure-flagg og lever i 400 dager, mens CSP tillate | `src/lib/supabase/client.ts:4` |
| 22 | lav | Gratiskvoten for AI er aldri utløst i produksjon, og telleren skrives best-effort etter at kallet er | `src/app/api/identify/route.ts:249` |
| 23 | lav | Isolasjon mellom to innloggede brukere er ikke verifisert — protokollen forbyr innlogging, og RLS-po | `supabase/migrations/015_lock_down_location_data.sql:24` |
| 24 | lav | PII-maskeringen fanger ikke bindestrek-formen «Api-Key» som koden selv bruker, og maskerer ikke hemm | `src/lib/log/pii.ts:31` |
| 25 | lav | frostGet i historical-frost.ts er det eneste tredjepartskallet uten timeout — et hengende MET-kall b | `src/lib/weather/historical-frost.ts:49` |
| 26 | lav | Cron-hemmeligheten sammenlignes med !== mens RevenueCat-webhooken i samme kodebase bruker timingSafe | `src/app/api/cron/generate-tiles/route.ts:72` |
| 27 | lav | «Endre analysevalg» på personvernsiden er en død knapp i App Store-bygget | `src/app/personvern/page.tsx:350; src/components/analytic` |
| 28 | lav | Aldersgrensen er 13 år i vilkårene og 18 år i registreringsskjemaet | `messages/nb.json:1268-1269 (vilkår §8) og messages/nb.js` |
| 29 | lav | Tre dokumenter sier at /personvern har [FYLL INN]-plassholdere igjen — det har den ikke, på noen av  | `CLAUDE.md:95; docs/app-store-plan.md:79; docs/roadmap.md` |
| 30 | lav | STATIC_CACHE tømmes aldri mellom utrullinger — hver deploy legger igjen ~2 MB som aldri fjernes | `public/sw.js:38` |
| 31 | lav | App Store-metadataen oppgir produkt-ID-er som ikke finnes i App Store Connect | `docs/app-store-metadata.md:123` |
| 32 | middels | «3 sterke områder markert på kartet» står rett under «Moderate forhold» — ordet «sterke» har ingen t | `src/app/api/prediction/route.ts:294` |
| 33 | middels | Miljø / Historikk / Sesong: tre tall på tre ulike skalaer, ett er alltid 0, og de summerer ikke til  | `src/components/map/HotspotPanel.tsx:196` |
| 34 | middels | «Konfidensvektet snitt» er et vanlig snitt — konfidensen er hardkodet 70 for hver eneste flis | `src/app/api/cron/generate-tiles/route.ts:164` |
| 35 | middels | Flush-banneret sier «sopp om ~12 dager» rett over tre grønne søyler som sier at onsdag er en optimal | `src/lib/prediction/flush.ts:236` |
| 36 | middels | «Best {dag}» peker alltid på i dag når uka er flat — det er en uavgjort-regel, ikke en prognose | `src/components/map/PlaceForecastStrip.tsx:70` |
| 37 | middels | «75 % luftfuktighet — moderat» er ikke en måling, men en konstant som også gir +14 poeng i scoren | `src/lib/weather/index.ts:62` |
| 38 | middels | Svensk ramme, norsk innhold: kalenderen sier «Anpassat efter din position — ~4 uker senere enn Sør-N | `src/lib/utils/season-region.ts:45` |
| 39 | middels | CORINE tar første treff i svaret, ikke polygonet punktet ligger i — svensk skog blir «ingen skog» | `src/lib/corine/index.ts:48` |
| 40 | middels | 76 minutter hver natt kjører prediksjonen på fallback-formelen og helsesjekken melder «degraded» | `src/app/api/prediction/route.ts:141` |
| 41 | middels | Kartet tegner 270-meterssirkler på et raster med 3-7 km mellom målepunktene | `src/components/map/MushroomMap.tsx:199` |
| 42 | middels | Artssiden sier «Sesong aug – nov», kartet sier «Svake forhold 10/100» om samme art samme dag | `src/app/species/[id]/page.tsx:188` |
| 43 | middels | «Gratis viser forenklet heatmap. Oppgrader for full detalj» er ikke sant for innloggede gratisbruker | `src/app/api/prediction/route.ts:306` |
| 44 | middels | Fuktvetoet kan strukturelt aldri slå ut på dag 1-6 i prognosestripen, bare på dag 0 | `src/app/api/mushroom-forecast/route.ts:153` |
| 45 | middels | Soppforholdene hopper 13-22 poeng over natten ved månedsskiftet, med helt uendret vær | `src/lib/prediction/mushroom-day.ts:74` |
| 46 | middels | Fenologimotoren kaster all funndata fra desember til mars, så vintersopp får 0,11 i sin egen topp-se | `scripts/phenology-core.mjs:37` |
| 47 | middels | Habitat-filteret på svensk gir null treff når brukeren skriver appens eget eksempel | `messages/sv.json:766` |
| 48 | middels | Kalendertabellen er sortert på norsk artsnavn mens den viser svenske navn — 29 av 71 nabopar står i  | `src/app/calendar/page.tsx:26` |
| 49 | middels | Posisjonsmerket på kalenderen er hardkodet norsk tekst, og forsvinner helt for alle sør for 61°N så  | `src/lib/utils/season-region.ts:47` |
| 50 | middels | «Kun i sesong nå» på artssiden ignorerer breddegrad — samme bruker samme dag får 58 arter der og 12  | `src/lib/hooks/useSpecies.ts:61` |
| 51 | middels | Kartet siler bort artskandidater på det håndkodede vinduet før den empiriske kurven i det hele tatt  | `src/app/api/prediction/grid/route.ts:221` |
| 52 | middels | AI-resultatet merker riktig art «Utenom sesong» og nedrangerer den 30 %, basert på det samme for sma | `src/lib/utils/identify-ranking.ts:49` |
| 53 | middels | Kvotemuren ber brukeren oppgradere, men er en rød tekstlinje uten lenke — og appen viser aldri hvor  | `src/app/identify/page.tsx:167` |
| 54 | middels | Tallet 5 i AI-kvoten er hardkodet i språkfilene og kan drive fra FREE_DAILY_AI_LIMIT — prissiden vil | `messages/nb.json:597` |
| 55 | middels | Kartet overstyrer serverens gratis-grovkorning av hotspots med rådata hentet direkte fra RPC-en | `src/components/map/MushroomMap.tsx:1420` |
| 56 | middels | I iOS-appen viser priskortet Apples pris, mens FAQ-en og «tilsvarer 21 kr/mnd» rett ved siden av for | `src/app/pricing/page.tsx:441` |
| 57 | middels | Admin-panelet viser «Brukere totalt: 6» når det finnes 16 kontoer — og skjuler dermed de ødelagte ko | `src/app/admin/page.tsx:222` |
| 58 | middels | Stedssøket faller tilbake på Kartverkets fuzzy-søk når Photon gir null NO/SE-treff, og svarer med se | `src/lib/utils/place-search.ts:140` |
| 59 | middels | «Kun mine funn» på kartet skjuler brukerens egne private funn — /mine-steder viser dem | `src/components/map/MushroomMap.tsx:1079` |
| 60 | middels | Profilstatistikken teller innlegg og kommentarer som listene rett under ikke viser | `supabase/migrations/029_prediction_feedback_context.sql:` |
| 61 | middels | «Medlem siden» viser når profilraden ble laget, ikke når kontoen ble opprettet — feil måned for 2 av | `src/app/profile/page.tsx:97` |
| 62 | middels | Kartet sier «lovende steder innen 5 km» og lar popupen på samme sted si «~6,1 km» | `src/components/map/MushroomMap.tsx:402` |
| 63 | middels | /api/prediction svarer 200 med en soppscore når koordinatene mangler — tolker manglende parameter so | `src/app/api/prediction/route.ts:96` |
| 64 | middels | Provider-wrappingen som fikset den tomme kart-popupen er ikke dekket av én eneste test — den kan sle | `src/components/map/MushroomMap.tsx:1110` |
| 65 | middels | 404-siden er Next.js' engelske standardside — en svensk bruker får «This page could not be found» in | `src/app/layout.tsx:72` |
| 66 | middels | Appen har ingen error boundary noe sted — én komponent som kaster tar ned hele ruta til Next.js' eng | `src/app/layout.tsx:72` |
| 67 | middels | Serverens feilmeldinger er hardkodet norsk og vises rått i grensesnittet — en svensk bruker får nors | `src/app/api/prediction/species-spots/route.ts:119` |
| 68 | middels | Checkout-ruta sender rå unntakstekst og navnet på en miljøvariabel til nettleseren, og prissiden vis | `src/app/api/billing/checkout/route.ts:207` |
| 69 | middels | QA-fixturen setter en localStorage-nøkkel ingen kildekode leser — cookie-notisen har ligget over bun | `e2e/_setup/fixtures.ts:16` |
| 70 | middels | /map kaster og hele siden blir Next.js' engelske «Application error» hvis localStorage er blokkert — | `src/components/map/MushroomMap.tsx:772` |
| 71 | middels | Onboarding lover «et kart med over 300 000 registrerte funn», men kartet viser 5 som standard — lage | `src/components/map/MushroomMap.tsx:134` |
| 72 | middels | nearbyOccurrences finnes bare i fallback-svaret — GBIF-kreditt og «observasjoner nær her» mangler nø | `src/app/api/prediction/route.ts:394` |
| 73 | middels | species-spots svelger artsspørringens feil og svarer betalende kunde «Ingen arter med bilde er i ses | `src/app/api/prediction/species-spots/route.ts:136` |
| 74 | middels | Flisbanen serverer lagrede norske habitatbegrunnelser til svenske brukere; de tre andre prediksjonsr | `src/app/api/prediction/route.ts:392` |
| 75 | middels | Hardkodede norske feilstrenger i ruter som ellers oversetter — de vises ordrett som toast til svensk | `src/app/api/prediction/grid/route.ts:116` |
| 76 | middels | /api/health og /api/health/predictions er de eneste databaseberørende rutene uten rate limit — og de | `src/app/api/health/predictions/route.ts:16` |
| 77 | middels | «Mine steder» svelger funnspørringens feil og viser tom-tilstand — brukeren ser at stedene hans er b | `src/app/mine-steder/page.tsx:106` |
| 78 | middels | Norske skogsord limes inn i svenske setninger i prediksjonsforklaringen på kartet | `src/lib/utils/prediction-explanation.ts:518` |
| 79 | middels | Habitatbegrunnelsen fra de forhåndsgenererte flisene er alltid norsk, også når leseren har valgt sve | `src/app/api/prediction/route.ts:392` |
| 80 | middels | Betalende svensk kunde får feilmeldingen om planbytte i rå norsk tekst midt i kjøpsflyten | `src/app/api/billing/checkout/route.ts:105` |
| 81 | middels | Forumets funn-velger leser norwegian_name rått selv om spørringen henter swedish_name | `src/app/forum/new/page.tsx:235` |
| 82 | middels | Svensk tel:-lenke for giftinformasjon ringer 112 — det direkte GIC-nummeret er bare tekst | `messages/sv.json:1245` |
| 83 | middels | Svenske forvekslingstekster er halvlokaliserte: rammen er svensk, artsnavnet inne i «hur man skiljer | `src/app/species/[id]/page.tsx:278` |
| 84 | middels | /species og /calendar har null sikkerhetstekst og ingen vei til soppkontroll — kalenderen er den fla | `src/app/calendar/page.tsx:42` |
| 85 | middels | Andre brukeres ubekreftede artspåstander får et spiselighetsstempel fra katalogen — verification_sta | `src/app/page.tsx:367` |
| 86 | middels | GBIF-popupen på kartet skriver «Spiselig» alene i grønt — den mest kontekstløse spiselighetsdommen i | `src/components/map/MushroomMap.tsx:726` |
| 87 | middels | Traktkantarell advarer om spiss giftslørsopp, men ikke om butt giftslørsopp — som er i katalogen, dø | `supabase/migrations/017_expand_species_catalog.sql:385` |
| 88 | middels | Personvernerklæringen sier «aldri eksakt funn-sted», men public_findings returnerer rå latitude/long | `supabase/migrations/029_prediction_feedback_context.sql:` |
| 89 | middels | Fem funn — tre av dem private med rå koordinater — ligger igjen i produksjon uten eier, stikk i stri | `supabase/functions/purge-inactive-accounts/index.ts:36` |
| 90 | middels | get_prediction_tiles_in_bounds svarer fortsatt på den offentlige anon-nøkkelen — hele dagens raster  | `supabase/migrations/033_lock_prediction_tiles_rpc.sql:40` |
| 91 | middels | GDPR-eksporten erklærer «complete: true» og «all rows tied to your user_id», men utelater spot_feedb | `src/app/api/me/export/route.ts:141` |
| 92 | middels | AI-flyten låser synligheten til «approximate» uten å spørre og uten å nevne det — brukeren kan ikke  | `src/app/identify/result/page.tsx:106` |
| 93 | middels | Det eksakte punktet til et PRIVAT funn sendes ut til MET Frost, NIBIO, Kartverket og CORINE i det br | `src/app/api/findings/route.ts:42` |
| 94 | middels | Brukerens høypresise GPS-punkt går i query-strengen til tre egne ruter, og appen erklærer selv at se | `src/lib/hooks/usePrediction.ts:17` |
| 95 | middels | /forum/moderation og /forum/reports svarer 200 uten innlogging — de mangler i PROTECTED_PATHS og har | `src/lib/supabase/middleware.ts:7` |
| 96 | middels | anon kan lese hele profiles-tabellen inkludert varslingsinnstillinger og default_finding_visibility | `supabase/migrations/001_initial_schema.sql:321` |
| 97 | middels | Offline-kartlagring er en betalt funksjon som bare sperres i klienten | `src/components/map/MushroomMap.tsx:943` |
| 98 | middels | /map har ingen serverside auth-sjekk — gatingen henger utelukkende i middleware-matcheren | `src/app/map/page.tsx:14` |
| 99 | middels | Checkout-idempotensnøkkelen er et 5-minutters klokkevindu, ikke en varig operasjons-ID — to klikk me | `src/app/api/billing/checkout/route.ts:126` |
| 100 | middels | stripe.customers.create kalles uten idempotencyKey — to parallelle førstegangs-checkouts lager to St | `src/app/api/billing/checkout/route.ts:115` |
| 101 | middels | Offline-kart er den eneste premiumfunksjonen uten serverkontroll — den er kun skjult i klienten | `src/components/map/MushroomMap.tsx:943` |
| 102 | middels | Stripe-grenen mangler rekkefølge- og abonnements-eierskapsvern som RevenueCat-grenen har — en hendel | `src/app/api/stripe/webhook/route.ts:267` |
| 103 | middels | Ingen av de to webhook-rutene har én eneste test, og den ene relevante enhetstesten låser fast den f | `src/lib/billing/__tests__/plans.test.ts:19` |
| 104 | middels | Ingen avstemming mot Stripe eller RevenueCat — en tapt webhook-leveranse blir aldri oppdaget eller r | `vercel.json:3` |
| 105 | middels | De tre PostGIS-indeksene har aldri vært brukt — geo-spørringene bruker BETWEEN og treffer dem ikke;  | `supabase/migrations/013_species_occurrences.sql:23` |
| 106 | middels | Migrasjonene kan ikke kjøres i rekkefølge fra tom base — 012 og 017 skriver til mushroom_species.pri | `supabase/migrations/012_add_ten_more_species.sql:36` |
| 107 | middels | Prediksjonsrasteret dekker 109 ruter i fem norske byer og null i Sverige — svenske betalere får nøyt | `src/app/api/prediction/route.ts:174` |
| 108 | middels | Fem foreldreløse funn med eksakte koordinater ligger igjen etter en kontosletting som ikke gikk via  | `supabase/migrations/011_retention_policy_infrastructure.` |
| 109 | middels | anon og authenticated har CREATE på schema public, og fire SECURITY DEFINER-funksjoner mangler SET s | `supabase/migrations/014_occurrences_observed_at.sql:38` |
| 110 | middels | billing_subscriptions inneholder en Stripe-rad som ikke finnes i Stripe, og ingen fornyelseshendelse | `src/app/api/stripe/webhook/route.ts:249` |
| 111 | middels | /api/prediction svarer 500 med rå PostgreSQL-feiltekst på ugyldig speciesId — offentlig og uautentis | `src/app/api/prediction/route.ts:226` |
| 112 | middels | /api/prediction er den eneste koordinatruta uten områdesjekk: manglende koordinater gir 200 med en o | `src/app/api/prediction/route.ts:104` |
| 113 | middels | Revisjonsloggen kan ikke slettes av noen, og beholder IP-adressen til brukeren som nettopp slettet k | `supabase/migrations/008_admin_audit_log.sql:28-34 og :57` |
| 114 | middels | Erklæringen sier at bare ±500 m-observasjoner beholdes etter kontosletting; koden beholder også de e | `src/app/api/me/delete/route.ts:170-185; messages/nb.json` |
| 115 | middels | Landingssiden åpner en TLS-forbindelse til Google for hver utlogget besøkende, uten samtykke og uten | `public/landing/index.html:18; public/landing/index.sv.ht` |
| 116 | middels | Cookie-listen i erklæringen navngir en cookie appen ikke setter, og utelater en den faktisk setter | `messages/nb.json:546-555; src/lib/supabase/middleware.ts` |
| 117 | middels | Kartverket, OpenStreetMap og Esri (USA) mottar brukerens IP direkte fra nettleseren og er ikke nevnt | `src/lib/utils/offlineMap.ts:31-33; src/components/map/Mu` |
| 118 | middels | Erklæringen lover e-postvarsel før automatisk sletting av inaktive kontoer — utsendingen er ikke kon | `messages/nb.json:512-513; supabase/functions/purge-inact` |
| 119 | middels | Sletting av et offline-område frigjør null lagring, og flisecachen har verken tak, utløp eller noe s | `src/components/map/MushroomMap.tsx:935` |
| 120 | middels | Det finnes ingen svensk manifest-variant — en svensk bruker installerer en app som beskriver seg sel | `public/manifest.json:4` |
| 121 | middels | Alle strengene på native-siden er hardkodet norsk — offline-skjermen, kameraprompten og iOS-tillatel | `capacitor-www/index.html:2` |
| 122 | middels | PrivacyInfo.xcprivacy erklærer ikke bruksdataene og identifikatorene GA4 samler inne i app-webviewen | `ios/App/App/PrivacyInfo.xcprivacy:25` |
| 123 | middels | coarsen-location har 35 tester på hjelperen, men ingen test på at /api/identify faktisk kaller den — | `src/app/api/identify/route.ts:209` |
| 124 | middels | CI kjører bare hemmelighetsskanning — verken tsc, vitest, eslint eller next build gater en merge til | `.github/workflows/gitleaks.yml:1` |
| 125 | middels | Appen kjører uten feilrapportering, uten oppetidsovervåking og uten alarm når den daglige fliskjørin | `vercel.json:1` |
| 126 | middels | Betalte kontoer har verken daglig tak eller global kostnadsbrems på AI-kall — eneste brems er 20/min | `src/lib/billing/subscription.ts:34` |
| 127 | middels | Hver eneste side sender hele meldingskatalogen på 101 kB inn i HTML-en — innloggingssiden er 116 571 | `src/app/layout.tsx:73` |
| 128 | middels | Alle 31 sider laster ~1,0 MB rå (~290 kB gzip) JavaScript, og Next 16 med Turbopack skriver ikke len | `package.json:6` |
| 129 | middels | «Lovende steder» kan sende 392 ukachede tredjepartskall fra ett knappetrykk — det finnes ingen cache | `src/app/api/prediction/grid/route.ts:265` |
| 130 | middels | Høydeoppslaget går til Kartverkets norske DTM også for svenske koordinater — n² kall per prediksjons | `src/lib/terrain/index.ts:16` |
| 131 | middels | prediction_tiles vokser uten opprydding — 16 049 rader tilbake til 29. april, mens den låste policye | `docs/retention-policy.md:26` |
| 132 | middels | De romlige indeksene kan ikke brukes av spørringene kartet faktisk kjører — GIST-indeksene ligger på | `supabase/migrations/013_species_occurrences.sql:22` |
| 133 | middels | Ingen test rendrer noen komponent i en DOM — prosjektet har verken jsdom, happy-dom eller testing-li | `vitest.config.ts:12` |

---

## Forkastet av motbeviset

Fem funn overlevde ikke. Ingen av dem falt på en oppdiktet henvisning — alle fem falt på at
påstanden om konsekvens ikke holdt.

1. **«65 av 72 arter har ingen prediksjonsflis → kartlaget blir tomt.»** Falsifisert: sirklene
   forsvinner ikke. `selectSpeciesForSpots` kaller `generateTopSpots(id)`, som beregner live.
2. **«Ingen kundeportal-konfigurasjon i live-Stripe → `sessions.create` feiler.»** Beviset viste
   0 konfigurasjoner, men det samme gjaldt testmodus, der portalen virker. Slutningen holdt ikke.
3. **«Refusjon fjerner ikke web-tilgang.»** Rettighet utledes av abonnementsstatus, ikke av
   betalinger, og alle statusoverganger er abonnert på.
4. **«iOS-prosjektet registrerer ikke RevenueCat-pluginen.»** Fila er et gitignorert byggeartefakt
   som `cap sync ios` regenererer før Xcode åpnes.
5. **«App Store-beskrivelsen lover offline-bruk som ikke finnes.»** Forkastet fordi motbevis-agenten
   trodde K5 var feil. **Den tok feil — funnet er gjeninnsatt** (se merknaden under K5).

## Verifisert i orden

Ting jeg testet mot produksjon og som holdt. Verdt å skrive ned: det er like nyttig å vite hva
som er sjekket som hva som er galt.

| Sjekk | Metode | Resultat |
|---|---|---|
| Åpen redirect | 15 angrep mot `mycelet.com/auth/callback`, vert-sjekk | 0 lekkasjer |
| Sikkerhetsheadere | `curl -D -` mot produksjon | alle 6 til stede |
| CSP | samme | **enforcing**, ikke report-only |
| Beskyttede ruter | 5 ruter uten cookies, ekte middleware | 5 av 5 → 307 til login |
| Rå koordinater til anon | `get_findings_in_bounds` som anon | kun `display_*` |
| Private funn | 3 private i basen | 0 lekket |
| Arter uten svensk navn | spørring mot produksjon | 0 av 72 |
| Migrasjoner 008/030/034 | objektsjekk mot produksjon | alle kjørt |
| Språkvalg | cookie + `Accept-Language` mot produksjon | riktig side begge veier |
| Kvalitetsporter | typecheck, lint, test, `npm audit` | 0 feil, 752 tester, 0 sårbarheter |

**Falsk alarm jeg selv utløste:** mine tre første treff på åpen redirect var falske positive. Jeg
lette etter strengen `evil.com` i svaret i stedet for å se på verten — `%2f` er en *kodet*
skråstrek, så `mycelet.com/%2f%2fevil.com` er en sti på vårt eget domene. Samme feilklasse som en
gang tidligere i prosjektet, og grunnen til at protokollen krever at man går etter verten.
