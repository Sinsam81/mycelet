# Lanseringsrevisjon — inventar

> Kartlagt mot commit `95b23fd` (= produksjon). Del 5 i `docs/lanseringsrevisjon.md`.
> Ikke ut fra filnavn og ikke ut fra dokumentasjon — ut fra hva koden gjør.

## 1. Flater (56)

Det som betyr mest her er siste kolonne: håndheves betalingsmuren på **serveren**, eller er den bare skjult i klienten?

| Sti | Type | Innlogging | Betaling | Håndheves |
|---|---|---|---|---|
| `/admin` | admin | krever_moderator | ingen | server |
| `/admin/audit-log` | admin | krever_moderator | ingen | server |
| `/admin/forum-trust` | admin | krever_moderator | ingen | server |
| `/admin/prediction` | admin | krever_moderator | ingen | server |
| `/api/admin/verified-foragers` | api | krever_moderator | ingen | server |
| `/api/billing/checkout` | api | krever_innlogging | ingen | server |
| `/api/billing/portal` | api | krever_innlogging | ingen | server |
| `/api/billing/status` | api | krever_innlogging | ingen | server |
| `/api/findings` | api | krever_innlogging | ingen | server |
| `/api/health` | api | apen | ingen | ikke_relevant |
| `/api/health/predictions` | api | apen | ingen | ikke_relevant |
| `/api/identify` | api | krever_innlogging | gratis_begrenset | server |
| `/api/me/delete` | api | krever_innlogging | ingen | server |
| `/api/me/deletion-warning` | api | krever_innlogging | ingen | server |
| `/api/me/export` | api | krever_innlogging | ingen | server |
| `/api/me/extend-retention` | api | krever_innlogging | ingen | server |
| `/api/mushroom-day` | api | apen | ingen | ikke_relevant |
| `/api/mushroom-forecast` | api | apen | ingen | ikke_relevant |
| `/api/places` | api | apen | ingen | ikke_relevant |
| `/api/prediction` | api | apen | gratis_begrenset | server |
| `/api/prediction/grid` | api | krever_innlogging | gratis_begrenset | server |
| `/api/prediction/species-spots` | api | krever_innlogging | kun_betalende | server |
| `/api/revenuecat/webhook` | api | cron_hemmelighet | ingen | server |
| `/api/spot-feedback` | api | krever_innlogging | ingen | server |
| `/api/stripe/webhook` | api | cron_hemmelighet | ingen | server |
| `/auth/callback` | api | apen | ingen | ikke_relevant |
| `/api/cron/backfill-occurrence-weather` | cron | cron_hemmelighet | ingen | server |
| `/api/cron/generate-tiles` | cron | cron_hemmelighet | ingen | server |
| `/` | side | apen | ingen | ikke_relevant |
| `/auth/forgot` | side | apen | ingen | ikke_relevant |
| `/auth/login` | side | apen | ingen | ikke_relevant |
| `/auth/register` | side | apen | ingen | ikke_relevant |
| `/auth/reset` | side | apen | ingen | ikke_relevant |
| `/calendar` | side | apen | ingen | ikke_relevant |
| `/datakilder` | side | apen | ingen | ikke_relevant |
| `/forum` | side | apen | ingen | ikke_relevant |
| `/forum/[id]` | side | apen | ingen | server |
| `/forum/moderation` | side | krever_moderator | ingen | server |
| `/forum/new` | side | krever_innlogging | ingen | begge |
| `/forum/reports` | side | krever_innlogging | ingen | server |
| `/identify` | side | apen | gratis_begrenset | server |
| `/identify/result` | side | apen | ingen | server |
| `/kjopsvilkar` | side | apen | ingen | ikke_relevant |
| `/kontakt` | side | apen | ingen | ikke_relevant |
| `/landing/index.html + /landing/index.sv.html` | side | apen | ingen | ikke_relevant |
| `/landing/sanketips/fem-forvekslinger.html, /landing/sanketips/les-terrenget.html, /landing/sanketips/sopp-etter-regn.html` | side | apen | ingen | ikke_relevant |
| `/manifest.json + /sw.js` | side | apen | ingen | ikke_relevant |
| `/map` | side | krever_innlogging | gratis_begrenset | begge |
| `/mine-steder` | side | krever_innlogging | ingen | server |
| `/personvern` | side | apen | ingen | ikke_relevant |
| `/pricing` | side | apen | ingen | server |
| `/profile` | side | krever_innlogging | ingen | server |
| `/sikkerhet` | side | apen | ingen | ikke_relevant |
| `/species` | side | apen | ingen | ikke_relevant |
| `/species/[id]` | side | apen | ingen | ikke_relevant |
| `/vilkar` | side | apen | ingen | ikke_relevant |

**Fordeling.** auth: {'apen': 29, 'krever_innlogging': 17, 'krever_moderator': 6, 'cron_hemmelighet': 4}

betaling: {'ingen': 50, 'gratis_begrenset': 5, 'kun_betalende': 1}

håndheving: {'ikke_relevant': 24, 'begge': 2, 'server': 30}


## 2. Tall og påstander (59)

Hvert tall appen viser, sporet til der det beregnes. Kolonnen som gjør inventaret nyttig er den siste:
*under hvilken omstendighet ville dette vært feil uten at en eneste test feilet?*

### Kartets hovedtall «X/100» (soppforhold i området) i pillen og i panelet

- vises: `src/components/map/HotspotPanel.tsx:89 (pille), :112 (utvidet)`
- beregnes: `src/app/api/prediction/route.ts:264 (konfidensvektet snitt over kollapsede ruter) ELLER src/components/map/MushroomMap.tsx:1384 (klientsnitt) ELLER src/lib/prediction/cell-score.ts:155 (fallback-pathen)`
- kan være feil hvis: TRE ulike kodeveier fyller samme felt. Panelet viser serverens snitt når /api/prediction har svart, klientens eget snitt når den ikke har (MushroomMap.tsx:1378-1414), og fallback-scoren når det ikke finnes fliser. De regner på ulike datasett og ulike områder. Ingen test sammenligner de tre. Brukeren ser ett tall bytte verdi ved panorering uten at noe er galt i noen enkelt funksjon.
- bevises ved: Kall /api/prediction?lat=&lon=&radiusKm=15 og get_prediction_tiles_in_bounds for nøyaktig samme bounds samtidig, og sammenlign score-feltet med det klienten regner ut. Krev at de er like innen ±2.

### Klientsidens snittscore når /api/prediction ikke har svart

- vises: `src/components/map/HotspotPanel.tsx:89 via src/components/map/MushroomMap.tsx:1384`
- beregnes: `src/components/map/MushroomMap.tsx:260 (`cells.slice(0, 80)`) + :1384`
- kan være feil hvis: RPC-en sorterer score DESC (supabase/migrations/003_phase2_satellite_scaffold.sql:58) og klienten tar de FØRSTE 80 rutene. I et tett område er snittet da et snitt over de 80 BESTE rutene, ikke over området. Systematisk for høyt, og feilen vokser med hvor mange ruter som er i bildet. Ingen test dekker >80 ruter.
- bevises ved: select count(*) from prediction_tiles where tile_date=current_date and center_lat between ... — hvis antall ruter (etter kollaps) > 80 i et vanlig kartutsnitt, er tallet biased. Sammenlign avg(score) over alle ruter mot avg over topp 80.

### «Best nå: {art} {score}/100» i sirkel-tooltipen på kartet

- vises: `src/components/map/MushroomMap.tsx:213-220`
- beregnes: `src/lib/prediction/collapse-tiles.ts:58 (beste art per rute) + navneoppslag src/components/map/MushroomMap.tsx:1317-1335`
- kan være feil hvis: Navneoppslaget `.from('mushroom_species').select(...)` på linje 1318-1320 har INGEN .limit() → PostgREST kapper på 1000 rader. Vokser katalogen forbi 1000, mangler navnet for arter med høy id, og tooltipen faller stille tilbake til «Soppforhold {score}/100» — altså akkurat den ukvalifiserte påstanden hele 1. august-fiksen fjernet. Ingen feil, ingen test.
- bevises ved: select count(*) from mushroom_species; og select max(id) from mushroom_species. Hvis count nærmer seg 1000, eller hvis en flis peker på en species_id som ikke er i de første 1000 radene, er navnet borte.

### «Best nå: {art}» i panelet (leadingSpecies)

- vises: `src/components/map/HotspotPanel.tsx:66-73 og :133`
- beregnes: `src/app/api/prediction/route.ts:321-339 (`hotspotsFull[0].speciesId`)`
- kan være feil hvis: Serveren velger arten fra den beste ruta i en ±15 km boks rundt kartsenteret (radiusKm-default i src/lib/hooks/usePrediction.ts:13), mens sirklene på kartet er kollapset over det SYNLIGE utsnittet. Zoomer brukeren inn kan panelet navngi kantarell mens sirklene under peker på steinsopp — begge «riktige», om ulike områder.
- bevises ved: Kall /api/prediction med radiusKm=15 og RPC-en med kartets faktiske bounds for samme senter, og sjekk om species_id for topp-ruta er den samme.

### Tilstandsetiketten «Svake / Moderate / Gode / Svært gode forhold»

- vises: `src/components/map/HotspotPanel.tsx:92 og :148, tabell :24-29`
- beregnes: `src/lib/utils/prediction.ts:127-132 (scoreToCondition), og for verdikt-teksten src/lib/utils/prediction-explanation.ts:541-547`
- kan være feil hvis: Etiketten er en ren funksjon av tallet, så den arver ALLE feilene i tallet. Klienten regner ut sin egen etikett på src/components/map/MushroomMap.tsx:1396 fra et annet snitt enn serverens. Terskelen 55 er hardkodet to steder (prediction.ts:129 og prediction-explanation.ts:544) — flyttes den ett sted, sier pillen «gode» og popupen «brukbare» om samme tall.
- bevises ved: Ingen DB-spørring trengs: kjør scoreToCondition og verdictText på 0..100 og krev identiske bøttegrenser.

### «Miljø: X · Historikk: Y · Sesong: Z» under Vis tekniske detaljer

- vises: `src/components/map/HotspotPanel.tsx:196-198`
- beregnes: `src/app/api/prediction/route.ts:272-283 (fliser) / src/lib/prediction/cell-score.ts:165 (fallback)`
- kan være feil hvis: På flis-veien er `historical` ALLTID 0, fordi src/app/api/cron/generate-tiles/route.ts:143-155 aldri sender recent30d/recent365d inn i computeCellPrediction. «Historikk: 0» vises altså i et område med hundrevis av funn. Og når panelet bygges på klienten er alle tre hardkodet til 0 (src/components/map/MushroomMap.tsx:1397-1401) rett ved siden av en ekte score.
- bevises ved: select components->>'history' from prediction_tiles limit 50 — hvis alle er 0 eller null, er tallet dekorasjon. Sammenlign med get_findings_in_bounds for samme rute.

### Værtallene i «Hvorfor»-linjene: «12°C», «34mm regn siste 14 dager», «81 % luftfuktighet»

- vises: `src/components/prediction/PredictionExplanation.tsx via src/components/map/HotspotPanel.tsx:166; tekstene i src/lib/utils/prediction-explanation.ts:189-205`
- beregnes: `src/lib/weather/index.ts:279-290 (Frost), :508-519 (SMHI), :603-615 (Open-Meteo)`
- kan være feil hvis: Luftfuktighet faller tilbake til konstanten NEUTRAL_HUMIDITY_PCT = 75 (src/lib/weather/index.ts:62, brukt :282 og :511) når stasjonen mangler sensor. Appen skriver da «75 % luftfuktighet — moderat» som om det var en måling. Temperatur, nedbør og fuktighet hentes dessuten fra TRE FORSKJELLIGE stasjoner (src/lib/weather/index.ts:254-263) som kan ligge titalls km fra hverandre — setningen presenterer
- bevises ved: Logg sourceId per element fra Frost-svaret og avstanden fra brukerens punkt til hver stasjon. Vis den. Og skill nullbar fuktighet fra 75 i WeatherSummary.

### Regnvinduet «siste 14 dager» / «siste 7 dager» i forklaringen

- vises: `src/lib/utils/prediction-explanation.ts:197-199 → HotspotPanel`
- beregnes: `pickRain src/lib/utils/prediction-explanation.ts:321-332; summering src/lib/weather/windows.ts:24-44`
- kan være feil hvis: Vinduene telles i ANTALL MÅLINGER, ikke i kalenderdager — dokumentert i src/lib/weather/windows.ts:16-21. En stasjon med hull gir en «14-dagers» sum som i virkeligheten spenner over 25 dager. Etiketten er da feil selv om summen er riktig.
- bevises ved: For en gitt stasjon: sammenlign length(precipDailyMm) mot (max(referenceTime)-min(referenceTime)) i dager. Avvik = etiketten lyver.

### Forsidens ringtall «X av 100 · vær + sesong»

- vises: `src/components/home/MushroomDayCard.tsx:164-169 (og aria-label :149)`
- beregnes: `src/lib/prediction/mushroom-day.ts:71-94, kalt fra src/app/api/mushroom-forecast/route.ts:104-119`
- kan være feil hvis: Svaret caches i minnet per serverinstans med nøkkel lat/lon avrundet til 2 desimaler + dato + språk (src/app/api/mushroom-forecast/route.ts:69), TTL 30 min (:36). To brukere ~1 km fra hverandre deler tall; samme bruker kan få to ulike tall ved refresh fordi Vercel ruter til en annen instans. Ingenting feiler.
- bevises ved: Kall /api/mushroom-forecast to ganger med lat forskjøvet 0.009° og se om score er identisk. Og kall samme URL 10 ganger og se om svaret varierer.

### «🍄 Perfekt soppdag i dag!» og den grønne ringfargen

- vises: `src/components/home/MushroomDayCard.tsx:172 (tittel), :48-56 (colorFor)`
- beregnes: `src/lib/prediction/mushroom-day.ts:100-121 (`optimal`-porten)`
- kan være feil hvis: Fukt-vetoet krever soilMoistureIndex >= 0.55, men indeksen er null for OpenWeather (src/lib/weather/index.ts:549) OG for alle prognosedager (src/app/api/mushroom-forecast/route.ts:153-163). Vetoet slår seg da stille av: en fremtidsdag kan tegnes skogsgrønn «optimal» mens I DAG, med samme vær, tegnes grå. Søylene i samme strek motsier hverandre.
- bevises ved: Sjekk om weather.soilMoistureIndex er null for prognosedagene i payloaden, og om noen dag med optimal=true har soilMoistureIndex=null.

### De sju søylene i 7-dagersprognosen (score per dag)

- vises: `src/components/home/MushroomDayCard.tsx:193-210 (tooltip `${d.score}/100` på :198) og src/components/map/PlaceForecastStrip.tsx:106-125`
- beregnes: `src/app/api/mushroom-forecast/route.ts:135-171`
- kan være feil hvis: Dag 0 og dag 1-6 kjøres fortsatt gjennom ulike innganger: fremtidsdagene får minTemp7dC: null, maxTemp7dC: null og ingen soilMoistureIndex (:158-159). Og for leverandører uten daglig serie brukes en lineært nedskalert proxy (:146-151) i stedet for de faktiske vinduene. Samme terskeltabell, ulikt datagrunnlag — nøyaktig samme klasse feil som klippet som allerede ble fikset.
- bevises ved: Mat inn konstant vær i 7 dager og krev at alle sju søyler får identisk score. Det er testen som ville fanget både det gamle og det gjenværende avviket.

### «Best {dag}: {score}/100» i stedsprognosen

- vises: `src/components/map/PlaceForecastStrip.tsx:88`
- beregnes: `src/components/map/PlaceForecastStrip.tsx:70 (`bestIndex`)`
- kan være feil hvis: Sammenligningen er streng `>`, så ved uavgjort vinner laveste indeks. På en flat uke peker «beste dag» derfor alltid på i dag — en påstand om fremtiden som i virkeligheten er en uavgjort-regel. Brukeren planlegger turen etter den.
- bevises ved: —

### Søylehøyden i forsidens prognosestripe

- vises: `src/components/home/MushroomDayCard.tsx:202`
- beregnes: `samme linje: `height: ${Math.max(10, d.score)}%``
- kan være feil hvis: Gulvet på 10 gjør at score 10, 5 og 0 tegnes helt like. Det visuelle understøtter ikke tallet i tooltipen, og brukeren leser grafen, ikke tooltipen. (PlaceForecastStrip.tsx:109 gjør en annen mapping — 10-34 px — så de to stripene i samme app har ulik skala.)
- bevises ved: —

### Flush-banneret: «Forholdene er modne nå» / «Regn på vei — sopp om ~N dager»

- vises: `src/components/home/MushroomDayCard.tsx:186-191 og src/components/map/PlaceForecastStrip.tsx:129-134`
- beregnes: `src/lib/prediction/flush.ts:155-252, `daysUntil` beregnes :236`
- kan være feil hvis: «~N dager» = første prognosedag der kumulativ nedbør passerer 8 mm (SOAK_MM, flush.ts:58) pluss en slekts-lag. Forsidewidgeten sender ingen artskontekst (src/app/api/mushroom-forecast/route.ts:175-185), så laggen er alltid FLUSH_LAG_DAYS = 8 (flush.ts:56) — et håndsatt tommelfingertall presentert som et konkret antall dager. Konstantene er aldri kalibrert mot spot_feedback, slik filhodet selv sier
- bevises ved: select found_at, ... from spot_feedback join værhistorikk — mål faktisk lag fra 8mm-regn til «ja, fant sopp». Uten den spørringen er 8 en gjetning.

### «{count} matsopper i sesong» og «{count} giftige å passe på» på forsiden

- vises: `src/app/page.tsx:175-178`
- beregnes: `src/app/page.tsx:125-143, sesongtesten :67-70`
- kan være feil hvis: Filteret er MÅNEDSGROVT på season_start/season_end-kolonnene og tar ingen hensyn til breddegrad — mens prediksjonsmotoren for de samme artene bruker empiriske fenologikurver (src/lib/prediction/phenology.ts:45-57). En bruker i Finnmark får Oslos sesongliste, og forsiden kan si «i sesong» om en art kartet samtidig kaller «utenom artens sesong».
- bevises ved: select id, season_start, season_end from mushroom_species; sammenlign mot phenologyFactor(id, brukerens lat, dagens doy) for de 70 artene som har kurve. Avvik = to sannheter i samme app.

### «toppsesong» vs «i sesong» per art på forsiden

- vises: `src/app/page.tsx:208`
- beregnes: `src/app/page.tsx:123-124 (atPeak)`
- kan være feil hvis: peak_season_start/end er nullbare. Er de NULL, faller arten stille ned til «i sesong» — som er visuelt identisk med «vi har sjekket, den er ikke på topp». Manglende data og negativt svar ser helt like ut.
- bevises ved: select count(*) from mushroom_species where peak_season_start is null or peak_season_end is null.

### «Dine funn»: antall funn og antall arter på forsiden

- vises: `src/app/page.tsx:253 og :257`
- beregnes: `src/app/page.tsx:148-160`
- kan være feil hvis: Spørringen har `.limit(1000)` (:153). En bruker med mer enn 1000 funn ser nøyaktig 1000, og artsantallet regnes over den kuttede mengden — mens /profile viser det ekte tallet fra get_user_stats. De to sidene i samme app motsier hverandre uten at noe feiler.
- bevises ved: select count(*) from findings where user_id=? and is_negative_observation=false; sammenlign med det forsiden viser.

### Profilens fire tellere: Funn / Arter / Innlegg / Likes

- vises: `src/app/profile/page.tsx:125-128`
- beregnes: `supabase/migrations/029_prediction_feedback_context.sql:96-100 (get_user_stats)`
- kan være feil hvis: total_likes_received summerer den DENORMALISERTE kolonnen forum_posts.likes_count, som vedlikeholdes av en trigger (supabase/migrations/001_initial_schema.sql:266-280). Enhver innsetting/sletting som omgår triggeren — eller en trigger som feiler én gang — gir permanent drift. Ingenting regner tallet på nytt fra post_likes.
- bevises ved: select p.id, p.likes_count, (select count(*) from post_likes l where l.post_id=p.id) from forum_posts p where p.likes_count <> (select count(*) ...) — skal gi null rader.

### «Medlem siden {måned år}»

- vises: `src/app/profile/page.tsx:118`
- beregnes: `src/app/profile/page.tsx:97-99, fra profiles.created_at`
- kan være feil hvis: Datoen er profilradens opprettelse, ikke kontoens. Profilen lages av src/lib/auth/ensure-profile.ts etter registrering; en bruker hvis profil ble etterfylt (den kjente feilklassen «konto uten profil») får en «medlem siden» som er senere enn da de faktisk registrerte seg.
- bevises ved: Sammenlign profiles.created_at mot auth.users.created_at for samme id.

### Likes- og kommentartellerne på forumkort

- vises: `src/components/forum/PostCard.tsx:64-65; også src/app/profile/page.tsx:195`
- beregnes: `triggere i supabase/migrations/001_initial_schema.sql:243-256 (comments) og :266-280 (likes)`
- kan være feil hvis: Triggeren teller ALLE kommentarrader, mens visningen filtrerer bort skjulte (src/lib/hooks/useForum.ts:298 og :321, `is_hidden=false`). Et moderert innlegg viser «5 kommentarer» og lister tre. Samme gjelder blokkerte brukeres innhold via policyene i migrasjon 032.
- bevises ved: select p.id, p.comments_count, (select count(*) from comments c where c.post_id=p.id and c.is_hidden=false) — differansen er det brukeren opplever som feil.

### AI-treffprosenten «{X}% bildelikhet»

- vises: `src/components/identify/IdentifyResult.tsx:50-52`
- beregnes: `src/app/api/identify/route.ts:276 — `Math.round(suggestion.probability * 100)`, rått fra Kindwise`
- kan være feil hvis: Listen sorteres om etter sesong og nærfunn (src/app/api/identify/route.ts:485-493 → src/lib/utils/identify-ranking.ts:68-87), men prosenten som VISES er ikke rørt. Øverste forslag kan derfor stå med lavere prosent enn det under. Ingenting i UI-et forklarer omsorteringen, så tallet ser ut som en rangering det ikke lenger er.
- bevises ved: Kjør rankOrder på et sett der seasonFactor=0.45 for det mest sannsynlige forslaget; sjekk om resultatlisten er synkende i probability. Den er den ikke.

### Spiselighetsmerket på et AI-forslag (giftig/dødelig/ikke matvurdert)

- vises: `src/components/identify/IdentifyResult.tsx:80-86`
- beregnes: `src/app/api/identify/route.ts:350-354 (DB overstyrer leverandøren) med fallback mapEdibility :540-550`
- kan være feil hvis: Feiler artsoppslaget (route.ts:313-326) beholdes Kindwise sitt eget edibility-felt som merke. safetyDataIncomplete settes, men merket rendres uansett — og synonymreserven (:337-348) kjører bare for binomialer. Et forslag kan altså bære et spiselighetsmerke som ikke kommer fra den kuraterte katalogen, uten at merket ser annerledes ut.
- bevises ved: select latin_name, synonyms_text, edibility from mushroom_species — sjekk at alle navn Kindwise faktisk returnerer treffer enten latin_name eller synonyms_text.

### «Kan forveksles med {navn}» — og STILLHETEN når linjen mangler

- vises: `src/components/identify/IdentifyResult.tsx:103-107; artssiden src/app/species/[id]/page.tsx:211-218`
- beregnes: `src/app/api/identify/route.ts:396-402`
- kan være feil hvis: Spørringen henter bare danger_level in ('high','critical') (:402). En dødelig forvekslingsart feilkategorisert som 'medium' gir null advarsel. Og en art som simpelthen aldri er kuratert i look_alikes ser identisk ut med en som er sjekket og funnet trygg. Dette er den ene påstanden der stillhet er farligst.
- bevises ved: select s.id, s.norwegian_name from mushroom_species s where not exists (select 1 from look_alikes la where la.species_id=s.id) — alle disse viser «ingen advarsel» uten at noen har vurdert dem.

### «{count} funn i nærheten» på AI-forslaget

- vises: `src/components/identify/IdentifyResult.tsx:96-100`
- beregnes: `src/app/api/identify/route.ts:463-483`
- kan være feil hvis: «Nærheten» er en BOKS på ±0.25° (≈28 km nord-sør, ≈14 km øst-vest på 60°N), ikke en radius — og den teller maskerte display-koordinater som er tilfeldig forskjøvet for `approximate`-funn (supabase/migrations/005_zone_findings.sql:32-35). Tallet er både en annen geometri og en annen posisjon enn ordet «nærheten» lover.
- bevises ved: select count(*) from public_findings where ST_DWithin(...) med ekte 10 km radius, sammenlignet med bokstellingen.

### Prisene «79 kr/mnd», «249 kr», «21 kr/mnd med Sesongpass»

- vises: `src/app/pricing/page.tsx:91, :108, :110; src/app/page.tsx:412`
- beregnes: `src/lib/billing/plans.ts:19-32; SEASON_PER_MONTH src/app/pricing/page.tsx:46`
- kan være feil hvis: Beløpene er hardkodede konstanter i appen, mens Stripe belaster det Price-objektet sier — resolveTierByPriceId (plans.ts:46-51) mapper bare id-er, aldri beløp. Endres prisen i Stripe-dashboardet annonserer siden fortsatt det gamle beløpet og INGENTING feiler. På native erstattes tallet av App Store-prisen (pricing/page.tsx:441), så de to kanalene kan vise ulik pris for samme produkt.
- bevises ved: Stripe API: GET /v1/prices/{STRIPE_PRICE_PREMIUM_MONTHLY} og {STRIPE_PRICE_SEASON_PASS}, sammenlign unit_amount mot 7900 og 24900. Og RevenueCat-tilbudets priceString.

### «5 AI-identifikasjoner per døgn» i prisplanen

- vises: `messages/nb.json → Pricing.freeFeature1, rendret i src/app/pricing/page.tsx:82`
- beregnes: `håndhevingen ligger i src/lib/billing/plans.ts:6 (FREE_DAILY_AI_LIMIT) og src/app/api/identify/route.ts:184`
- kan være feil hvis: «5» i salgsteksten er en LITERAL i meldingskatalogen, ikke interpolert fra konstanten (til forskjell fra kvoteteksten på pricing/page.tsx:396 som bruker aiDailyLimit). Endres grensen, endres håndhevingen og ikke markedsføringen — og motsatt vei ser ingen det.
- bevises ved: grep etter tallet 5 i messages/*.json mot FREE_DAILY_AI_LIMIT. De må komme fra samme sted.

### «AI-kvote: {limit} per døgn» og den underforståtte gjenstående bruken

- vises: `src/app/pricing/page.tsx:396; src/app/profile/page.tsx:147`
- beregnes: `grense src/lib/billing/plans.ts:6; forbruk telles i src/app/api/identify/route.ts:149-182`
- kan være feil hvis: Telleren skrives BEST EFFORT ETTER at leverandørkallet er betalt (src/app/api/identify/route.ts:246-259) — en feilende insert logges bare som warn, og brukeren har da reelt flere identifikasjoner igjen enn grensen sier. Er migrasjon 020 ikke kjørt, teller koden i stedet LAGREDE FUNN (:171-182), en helt annen størrelse. Appen viser aldri «X av Y brukt», så avviket er usynlig for brukeren.
- bevises ved: select count(*) from ai_identifications where user_id=? and created_at > now()-interval '24 hours'; sammenlign mot antall faktiske Kindwise-kall i leverandørloggen.

### Abonnementsstatus og «Fornyes/utløper {dato}»

- vises: `src/app/pricing/page.tsx:388-394; src/app/profile/page.tsx:142-144`
- beregnes: `src/lib/billing/subscription.ts:25-36 + hasPaidAccess src/lib/billing/plans.ts:39-44`
- kan være feil hvis: current_period_end er kun så fersk som siste Stripe-/RevenueCat-webhook. En tapt webhook lar raden stå, og siden oppgir en fornyelsesdato som allerede er passert — samtidig som hasPaidAccess (plans.ts:43) da returnerer false og tilgangen forsvinner. Brukeren ser «Aktiv · fornyes 12. juli» og mister funksjoner.
- bevises ved: Stripe: subscription.current_period_end mot billing_subscriptions.current_period_end for hver betalende bruker. Og select * from billing_webhook_events order by created_at desc — hull i sekvensen.

### At kartets flis-score i det hele tatt finnes — dekningen er 5 norske regioner og 7 arter

- vises: `underforstått overalt flis-tallet vises, src/components/map/HotspotPanel.tsx:89`
- beregnes: `src/lib/prediction/tile-regions.ts:10-16 (Oslo, Trondheim, Bergen, Stavanger, Innlandet) og src/app/api/cron/generate-tiles/route.ts:31-39 (7 latinske navn)`
- kan være feil hvis: Utenfor de fem boksene finnes ingen fliser, og /api/prediction bytter stille til fallback-formelen (route.ts:399-588) som regner annerledes. Ingenting i UI-et sier hvilken vei tallet kom fra, og en svensk bruker får ALLTID fallback. To brukere sammenligner tall som ikke er samme størrelse.
- bevises ved: select distinct metadata->>'region', count(*) from prediction_tiles where tile_date=current_date group by 1; og select distinct species_id.

### Konfidensen som vekter snittet, og «Snitt-konfidens» i admin

- vises: `src/app/admin/prediction/page.tsx:198; brukes usynlig i src/app/api/prediction/route.ts:245`
- beregnes: `src/app/api/cron/generate-tiles/route.ts:163 — hardkodet `confidence: 70``
- kan være feil hvis: Den er en KONSTANT. «Konfidensvektet snitt» er derfor et helt vanlig snitt, og admin-tallet er alltid 70. Både koden og admin-siden presenterer det som en målt størrelse. Alt ser riktig ut fordi 70/100 = 0.7 > 0.2-gulvet, så vektingen er matematisk gyldig og meningsløs.
- bevises ved: select distinct confidence from prediction_tiles — én rad = 70 beviser det.

### «{count} sterke områder markert på kartet»

- vises: `src/components/map/HotspotPanel.tsx:170-173 (melding HotspotPanel.hotspotsMarked)`
- beregnes: `src/components/map/HotspotPanel.tsx:59 ← data.hotspots.length, fylt i src/app/api/prediction/route.ts:294-305 eller src/components/map/MushroomMap.tsx:260`
- kan være feil hvis: hotspots er ALLE ruter i utsnittet, ikke ruter over en terskel. Et område der hver eneste rute scorer 8 rapporterer «20 sterke områder markert». Ordet «sterke» er ren pynt — det finnes ingen filtrering bak det.
- bevises ved: Sammenlign hotspots.length mot hotspots.filter(s => s.score >= 55).length i samme svar.

### «{count} lovende steder innen {km} km»

- vises: `src/components/map/MushroomMap.tsx:459-465 (meldinger topSpotsGeneric / topSpotsForSpecies, messages/nb.json:1026)`
- beregnes: `radius-loopen src/components/map/MushroomMap.tsx:395-443; scoringen src/app/api/prediction/grid/route.ts:246-300`
- kan være feil hvis: Søkeområdet er en lat/lng-BOKS med halvbredde radiusKm, ikke en sirkel. Et hjørne ligger opptil 1,41 × radius unna. Popupen for samme nål skriver ut sin egen haversine-avstand (src/components/map/MushroomMap.tsx:353) — så brukeren kan lese «~48 km nordøst» under en melding som nettopp sa «innen 35 km».
- bevises ved: For hvert returnerte punkt: haversineKm(origin, punkt) <= usedRadius. Kravet holder ikke i dag.

### «~X,X km {retning}» i topp-sted-popupen

- vises: `src/components/map/MushroomMap.tsx:353`
- beregnes: `haversineKm src/components/map/MushroomMap.tsx:52-60, bearingLabel :62-72, origo valgt :386-387`
- kan være feil hvis: Origo er `searchedPlace ?? GPS ?? kartsenter`. Lander GPS-fixen ETTER at brukeren søkte et sted (eller motsatt), måles avstandene fra et annet punkt enn brukeren tror — og nålene ble generert rundt enda et punkt. Tallet er internt konsistent og refererer til feil sted.
- bevises ved: —

### «{count} arter i sesong — bilde på lovende sted for hver»

- vises: `src/components/map/MushroomMap.tsx:623 (melding speciesInSeasonCount)`
- beregnes: `src/app/api/prediction/species-spots/route.ts:143-153`
- kan være feil hvis: Kandidatene filtreres og deretter `.slice(0, MAX_SPECIES = 8)` på en spørring UTEN .order() (:136-141). Både antallet og HVILKE arter som vises er et vilkårlig utvalg som Postgres kan endre mellom to kall. Meldingen påstår at tallet er «arter i sesong» — det er det ikke; det er min(8, arter-med-bilde-i-sesong-som-fikk-score>0).
- bevises ved: select count(*) from mushroom_species where primary_image_url is not null and <i sesong> and edibility in ('edible','conditionally_edible') — sammenlign med tallet i toasten.

### «Kilder: MET (vær) · NIBIO/CORINE (skog) · Artsdatabanken (funn)» i topp-sted-popupen

- vises: `src/components/map/MushroomMap.tsx:359, teksten i messages/nb.json:1019`
- beregnes: `INGEN STEDER — det er en statisk streng`
- kan være feil hvis: Været kan komme fra SMHI eller fra den nøkkelfrie Open-Meteo-reserven (src/lib/weather/index.ts:99), skogdata kan være null for cellen, og nærfunn kan være null. Popupen påstår proveniens den aldri har sjekket. Dette er en opphavsrettslig/attribusjonspåstand, ikke bare kosmetikk.
- bevises ved: Sammenlign strengen mot data.weatherSource, forest.source og nearbyOccurrences i samme svar.

### Panelets «Kilder: {credit}»-linje

- vises: `src/components/map/HotspotPanel.tsx:178`
- beregnes: `sourceCredit src/components/map/HotspotPanel.tsx:39-49, oppslagstabell :31-35`
- kan være feil hvis: WEATHER_SOURCE_LABEL mangler nøkkelen `open_meteo` (som src/lib/weather/index.ts:604 faktisk returnerer). Serverte Open-Meteo dataene, forsvinner værkilden helt fra kredittlinjen — og /datakilder lister aldri Open-Meteo (src/app/datakilder/page.tsx:20-75). Vi bruker en CC-BY-kilde uten å navngi den, og feilen er en manglende nøkkel i et objekt.
- bevises ved: Kall /api/prediction fra et punkt der MET_FROST_CLIENT_ID ikke gjelder, les weatherSource i svaret, og se etter «Kilder:»-linjen i panelet.

### «{tiles} fliser • zoom {zoom}» for et lagret offline-område

- vises: `src/components/map/MushroomMap.tsx:1789`
- beregnes: `cacheMapTilesForArea src/lib/utils/offlineMap.ts:136-180; taket MAX_TILES_PER_SAVE = 550 på :133`
- kan være feil hvis: `cached` teller fliser som ALLEREDE lå i cachen pluss nye, og listen er kappet til 550 (uniqueTileUrls :128-134). Et stort område lagrer stille bare de første 550 flisene og melder «550 fliser klare offline». Brukeren tror hele området virker uten dekning — og oppdager det i skogen.
- bevises ved: getTileUrlsForBounds(bounds, zoom).length uten slice, mot area.cachedTiles. Differansen er det som mangler offline.

### Funn-knappens teller «Skjul funn ({count})»

- vises: `src/components/map/MushroomMap.tsx:1582`
- beregnes: `setOccCount src/components/map/MushroomMap.tsx:729 etter klientfiltrering :705-711; RPC-en kalles med p_limit: 3000 på :648`
- kan være feil hvis: get_occurrences_in_bounds har LIMIT uten ORDER BY (supabase/migrations/013_species_occurrences.sql:41-50). I et tett område er både tallet og punktene et VILKÅRLIG utvalg på 3000 av potensielt mange flere — og utvalget kan endre seg mellom to panoreringer til samme sted. Tallet leses som «så mange funn er registrert her».
- bevises ved: select count(*) from species_occurrences where latitude between ... — sammenlign med de 3000 som vises.

### Datoen på et registrert GBIF-funn i popupen («aug. 2019» / «2019»)

- vises: `src/components/map/MushroomMap.tsx:726`
- beregnes: `formatFound src/components/map/MushroomMap.tsx:682-692`
- kan være feil hvis: YYYY-01-01 tolkes som «kun år». Et ekte funn 1. januar degraderes stille til årstall, og enhver annen upresis dato som er lagret med dag 1 (f.eks. månedspresis) skrives ut som en spesifikk måned den ikke er. Regelen gjetter presisjon ut fra verdien.
- bevises ved: select observed_at, <original GBIF eventDate-presisjon> from species_occurrences — presisjonen burde vært en egen kolonne, ikke utledet.

### «🍂 Kun i sesong nå»-filteret på funnlaget

- vises: `src/components/map/MushroomMap.tsx:1724`
- beregnes: `inSeasonMonth src/components/map/MushroomMap.tsx:696-703`
- kan være feil hvis: Filteret ser på OBSERVASJONENS måned ±1 mot i dag — altså «ble funnet på denne tiden av året», ikke «arten er i sesong». En art med kuratert sesong filtreres på sine historiske funndatoer i stedet. Etiketten «i sesong nå» er derfor en annen påstand enn den samme frasen betyr på forsiden og i kalenderen.
- bevises ved: —

### «I sesong nå (måned)» i kalenderen + «~N uker senere enn Sør-Norge»

- vises: `src/components/calendar/SeasonNow.tsx:118-131 og :107-112`
- beregnes: `src/lib/utils/season-region.ts:17-49`
- kan være feil hvis: Forskyvningen er en eksplisitt UVALIDERT heuristikk — 4 dager per breddegrad, klemt til [-14, +35] (season-region.ts:19) — lagt oppå månedsgrove sesongkolonner. Etiketten oppgir et konkret antall uker som modellen aldri er testet mot. Filhodet innrømmer det; UI-et gjør ikke.
- bevises ved: Regresjon av funndato mot breddegrad i species_occurrences (316k daterte funn finnes allerede — src/lib/prediction/phenology-data.ts bygges av dem). Stigningstallet er svaret.

### Sesonglinjen på artssiden («august – oktober»)

- vises: `src/app/species/[id]/page.tsx:188`
- beregnes: `formatSeason src/app/species/[id]/page.tsx:15-25, leser season_start/season_end rått`
- kan være feil hvis: Den skriver ut de kuraterte månedene uten breddegrad og uten fenologikurve, mens prediksjonsmotoren for samme art bruker den empiriske kurven (src/lib/prediction/phenology.ts:45-57 → src/lib/utils/species-scoring.ts:391-398). Artssiden kan si «august – oktober» mens kartet samtidig sier «utenom artens sesong» om samme art samme dag.
- bevises ved: —

### «{count} arter» i overskriften på /species

- vises: `src/app/species/page.tsx:47`
- beregnes: `src/lib/hooks/useSpecies.ts:42-56 — `.limit(200)` på :45`
- kan være feil hvis: Ikke-søk-grenen kapper på 200 rader. Passerer katalogen 200 arter, oppgir overskriften 200 som katalogens størrelse. Søkegrenen bruker en helt annen kilde (RPC-en search_species, :38) med egen sortering og eget tak, så tallet hopper mellom de to veiene.
- bevises ved: select count(*) from mushroom_species; mot tallet i overskriften.

### Fenologikurvene som styrer «i sesong»-multiplikatoren

- vises: `indirekte i hver artsspesifikk score og i flush-bannerets «Utenom artens sesong»`
- beregnes: `src/lib/prediction/phenology.ts:45-57, oppslag i src/lib/prediction/phenology-data.ts (70 arter, nøklet på DB-id som streng)`
- kan være feil hvis: Kurvene er nøklet på NUMERISK species_id. Blir katalogen re-seedet eller id-er omfordelt, får art 12 art 12s gamle kurve — en helt annen arts sesong, brukt som fasit, uten at noe feiler. Motsatt: nye arter uten kurve faller stille tilbake på månedslogikken, så to arter i samme liste scores med to ulike modeller. Ingen test binder kurve-id mot latinsk navn.
- bevises ved: select id, latin_name from mushroom_species where id in (kurvenøklene) — og sammenlign mot artslisten scripts/generate-phenology.mjs faktisk kjørte på. Kurvefilen burde vært nøklet på latin_name.

### Fargekoden 🟢/🔴/grå på funnmarkører

- vises: `src/components/map/MushroomMap.tsx:1044-1046`
- beregnes: `samme linjer, fra public_findings.edibility (supabase/migrations/005_zone_findings.sql:44-53)`
- kan være feil hvis: Funn uten species_id (bruker skrev species_name_override) får grå «ukjent»-farge — visuelt identisk med en art hvis edibility-kolonne faktisk ER 'unknown'. «Vi vet ikke hvilken art» og «arten er uklassifisert» tegnes likt.
- bevises ved: —

### «Sone ±{km} km» på et sonefunn

- vises: `src/components/map/FindingPopup.tsx:39-43`
- beregnes: `supabase/migrations/005_zone_findings.sql:23-30 (grid-snapping)`
- kan være feil hvis: Triggeren SNAPPER til et rutenett med side zone_precision_km, så det ekte punktet kan ligge opptil halve ruta unna i hver akse — en KVADRATISK celle, ikke en sirkel med radius km. Popupen faller dessuten tilbake på `?? 5` (FindingPopup.tsx:41) når kolonnen er null, og oppgir da 5 km som om det var brukerens valg. Dette er en personvernpåstand: brukeren tror de deler grovere enn de gjør.
- bevises ved: select latitude, longitude, display_latitude, display_longitude, zone_precision_km from findings where is_zone_finding — mål faktisk avvik mot det som står i popupen.

### «{finds} funn på {places} steder» og per sted «{finds} funn, {species} arter», «{seasons} sesonger»

- vises: `src/app/mine-steder/page.tsx:129, :182, :184`
- beregnes: `groupFindings src/app/mine-steder/page.tsx:56-95; spørringen `.limit(1000)` på :114`
- kan være feil hvis: Kappet på 1000 funn. Og navnløse steder bøttes på koordinater avrundet til 2 desimaler (:66) — ~1,1 km nord-sør, men bare ~0,6 km øst-vest på 60°N. «Antall steder» er derfor en funksjon av avrundingen, ikke av geografien: to reelle steder smelter sammen, og ett sted som ligger på en rutegrense splittes i to.
- bevises ved: select count(*) from findings where user_id=? and is_negative_observation=false; og klynge de samme punktene med en ekte avstandsterskel (f.eks. 300 m) og sammenligne antall grupper.

### Koordinatene i «Åpne i kart» for et av Mine steder (5 desimaler)

- vises: `src/app/mine-steder/page.tsx:196`
- beregnes: `løpende gjennomsnitt av rå latitude/longitude, src/app/mine-steder/page.tsx:91-92`
- kan være feil hvis: Punktet er TYNGDEPUNKTET av alle funn i bøtta, skrevet ut med 5 desimaler (≈1 meter). Presisjonen som påstås er tre størrelsesordener finere enn størrelsen som beskrives — og tyngdepunktet av to funn på hver sin side av en myr peker midt i myra.
- bevises ved: —

### Koordinatforhåndsvisningen når du lagrer et funn

- vises: `src/components/map/AddFindingSheet.tsx:328-335`
- beregnes: `applyOffset src/components/map/AddFindingSheet.tsx:88, skyveren :316-326`
- kan være feil hvis: Den viser den FORSKJØVEDE koordinaten med 5 desimaler som om det var det som lagres — men triggeren kan randomisere (approximate) eller grid-snappe (sone) den én gang til før andre ser den (supabase/migrations/005_zone_findings.sql:23-39). Brukeren tar en personvernbeslutning på en tredje verdi enn den som faktisk publiseres.
- bevises ved: —

### «Skog her (NIBIO): granskog, bonitet 17»

- vises: `src/lib/utils/prediction-explanation.ts:506-510 → panelet`
- beregnes: `src/app/api/prediction/route.ts:268-270 — den HØYEST SCORENDE flisa som har skogdata`
- kan være feil hvis: Setningen sier «her», men beskriver den beste 500-meterscellen i en 30 km bred boks. Er brukeren i en by, kan «Skog her» beskrive en granskog to mil unna. Bonitetstallet er en ekte NIBIO-verdi — for et annet sted enn det brukeren peker på.
- bevises ved: Sammenlign forest-objektet i svaret mot getForestProperties({lat, lon}) for nøyaktig brukerens punkt.

### Admin: «Betalende»

- vises: `src/app/admin/page.tsx:276`
- beregnes: `fetchBilling src/app/admin/page.tsx:141-151`
- kan være feil hvis: Den sjekker tier + status, men IKKE current_period_end — i motsetning til hasPaidAccess (src/lib/billing/plans.ts:39-44) som resten av appen bruker. En rad med utløpt periode og status 'active' teller som betalende her og som gratis overalt ellers. Omsetningstallet i dashbordet er høyere enn virkeligheten.
- bevises ved: select count(*) from billing_subscriptions where tier<>'free' and status in ('active','trialing') and (current_period_end is null or current_period_end > now()) — mot tallet på siden.

### Admin: «Mest registrerte arter»

- vises: `src/app/admin/page.tsx:299-311`
- beregnes: `fetchTopSpecies src/app/admin/page.tsx:172-190`
- kan være feil hvis: `.limit(1000)` UTEN order by (:173). Filhodet påstår «up to 1000 recent findings» (:36) — det er ikke recent, Postgres returnerer 1000 vilkårlige rader. Rangeringen er over et udefinert utvalg og kan endre seg mellom to sidelastinger uten at noe er endret.
- bevises ved: select species_id, count(*) from findings group by 1 order by 2 desc limit 5 — mot listen på siden.

### Admin: «Brukere totalt» / «Nye denne uka»

- vises: `src/app/admin/page.tsx:273-275`
- beregnes: `c('profiles') src/app/admin/page.tsx:222-224`
- kan være feil hvis: Den teller profiles, ikke auth.users. Feiler profilopprettelsen ved registrering (den kjente «konto uten profil»-feilklassen, src/lib/auth/ensure-profile.ts), underrapporterer tallet registreringer permanent — og feilen er usynlig fordi tellingen selv alltid lykkes.
- bevises ved: select count(*) from auth.users; mot select count(*) from profiles.

### Admin prediksjon: «Snitt-score», «Høy score (≥70)», «Snitt-konfidens»

- vises: `src/app/admin/prediction/page.tsx:190-198`
- beregnes: `src/app/admin/prediction/page.tsx:127-130, over `tiles` som er hentet med .order('score', desc).limit(limit) (:104-105)`
- kan være feil hvis: Utvalget er TOPP-N fliser sortert på score (default 150, maks 500). «Snitt-score» er derfor snittet av de BESTE flisene og alltid langt over den ekte middelverdien. Region-filteret brukes dessuten i JS ETTER limit (:117-119), så velger du «Bergen» får du snittet av de Bergen-flisene som tilfeldigvis lå blant de 150 høyeste på landsbasis.
- bevises ved: select avg(score), count(*) from prediction_tiles where tile_date=current_date and metadata->>'region'='Bergen' — mot tallet på siden.

### /api/health/predictions «status: ok / degraded»

- vises: `src/app/api/health/predictions/route.ts:40-46 (operasjonell påstand, overvåkes)`
- beregnes: `src/lib/prediction/tile-freshness.ts:12-25`
- kan være feil hvis: expectedDate er UTC-datoen (route.ts:16) mens jobben går 01:15 UTC og appen serverer norske brukere; og en region der INGEN celle fikk skogdata skriver null rader (src/app/api/cron/generate-tiles/route.ts:190-194) — den regionens tileDate blir stående på gårsdagen for alltid og rapporterer degraded uten at noe kan fikses ved å kjøre jobben igjen.
- bevises ved: select metadata->>'region', max(tile_date), count(*) from prediction_tiles where source='hybrid' group by 1.

### Retensjonsbanneret: «slettes {dato}, om {N} dager»

- vises: `src/components/layout/RetentionWarningBanner.tsx:92`
- beregnes: `src/components/layout/RetentionWarningBanner.tsx:73-79`
- kan være feil hvis: daysRemaining regnes i NETTLESEREN mot enhetens klokke (`Date.now()`). Feil klokke på telefonen gir feil nedtelling på en juridisk bindende beskjed om kontosletting. Datoen kommer fra account_deletion_warnings.scheduled_deletion_at, som slettejobben ikke nødvendigvis treffer nøyaktig.
- bevises ved: select scheduled_deletion_at from account_deletion_warnings; mot når purge-jobben faktisk kjører (cron-definisjonen i migrasjon 011).

### Stedsnavnet og posisjonen i søkeforslagene

- vises: `src/components/map/MushroomMap.tsx:1543-1560; brukt i src/components/map/PlaceForecastStrip.tsx:81-83`
- beregnes: `src/lib/utils/place-search.ts:52-93 (Photon) med Norge-only-reserve :102-121, valgt :138-151`
- kan være feil hvis: Er Photon utilgjengelig, faller søket stille tilbake på Kartverket med fuzzy=true — som filens eget hode dokumenterer svarer på «Uppsala» med «Oppsal, Hjartdal». Brukeren får da et NORSK sted med et svensk navn, og hele prognosestripen og prediksjonen regner på feil land. Ingen indikasjon i UI-et på hvilken kilde som svarte.
- bevises ved: Legg kilde ('photon'|'kartverket') på PlaceResult og logg andelen kartverket-treff. Er den >0 for svenske søk, ser brukere gale steder.

### Artsnavnet i seg selv, for svenske lesere

- vises: `overalt: src/components/map/FindingPopup.tsx:24, src/app/page.tsx:203, src/components/forum/PostCard.tsx:33, kartets tooltips`
- beregnes: `src/lib/utils/species-name.ts:17-23`
- kan være feil hvis: Mangler swedish_name, rendres det NORSKE navnet stille til en svensk leser (:21, `swedishName || norwegianName`). Det er visuelt umulig å skille fra et korrekt svensk navn — og CLAUDE.md dokumenterer at flere svenske soppnavn skiller seg med ett ord fra navnet på en ANNEN art. En manglende rad blir dermed en potensiell artsforveksling, ikke en manglende oversettelse.
- bevises ved: select count(*) from mushroom_species where swedish_name is null or trim(swedish_name)=''; og krysssjekk hver swedish_name mot SLU Artdatabanken/Dyntaxa.

### «Områder som matcher habitat og værvindu — ingen garanti for at det er sopp der»

- vises: `src/components/map/HotspotPanel.tsx:180-182`
- beregnes: `statisk tekst; det den forsøker å dekke ligger i src/lib/prediction/collapse-tiles.ts:25-28 (ærlig romlig AUC ≈0,52)`
- kan være feil hvis: Forbeholdet er KVALITATIVT mens tallet ved siden av er kvantitativt, med to desimalers autoritet. Modellens egne notater sier den romlige delen er nær myntkast; brukeren ser «68/100 Gode forhold» og en setning med liten grå skrift. Ingen test kan fange en formulering — men avstanden mellom det appen VET og det den VISER er den samme feilklassen som 1. august.
- bevises ved: —


## 3. Soppsikkerhet (43 flater)

| Hvor | Hva det sier | Kan overses? | Begge språk |
|---|---|---|---|
| `src/app/identify/page.tsx:130-139 — rød sikker` | «⚠️ Bruk aldri appen til å avgjøre om en sopp er spiselig. AI-identifikasjon er kun et hje | Ja i praksis — den er alltid synlig på /identify, men bruker | ja |
| `src/app/identify/result/page.tsx:142 — alltid-` | «Dette er AI-forslag, ikke en bekreftelse på at soppen er trygg å spise. Få den alltid vur | Nei for den øverste linja, men den er lys amber, liten skrif | ja |
| `src/components/identify/SafetyWarning.tsx (mon` | «ADVARSEL: Mulig giftig sopp. Denne soppen kan være giftig eller dødelig. AI gir kun sanns | Nei — den rendres alltid (enten danger- eller caution-varian | ja |
| `src/components/identify/SafetyWarning.tsx:40-5` | «AI-resultatet er ikke en spiselighetsgaranti. Resultatet er kun en sannsynlig art — ikke  | Nei, men den ser bevisst mindre alvorlig ut enn den røde, og | ja |
| `src/components/identify/IdentifyResult.tsx:80-` | For giftig/dødelig/uspiselig/ukjent: full EdibilityBadge («Giftig», «Dødelig giftig», «Usp | Merket står på hvert kort, kan ikke lukkes. Men bare de tre  | ja |
| `src/components/identify/IdentifyResult.tsx:50-` | F.eks. «94 % bildelikhet» / SV «94 % bildlikhet». | Nei — men den har ingen forklaring eller info-ikon. | ja |
| `src/components/identify/IdentifyResult.tsx:103` | «⚠️ Kan forveksles med {navn} — sjekk nøye før du spiser.» SV: «Kan förväxlas med {namn} — | Ja — den finnes ofte ikke, og tomheten er usynlig for bruker | ja |
| `src/app/identify/result/page.tsx:151-158 — saf` | «⚠️ Vi klarte ikke å hente sikkerhetsdataene for disse forslagene akkurat nå. At det ikke  | Nei når den utløses (role="alert", tykk amber ramme). | ja |
| `src/components/identify/LookAlikeCheck.tsx:90-` | To fotokort side ved side: «DITT FORSLAG» (artsnavn + EdibilityBadge) mot «FARLIG DOBBELTG | Motsatt problem — den er umulig å overse, og det grønne merk | ja |
| `src/app/identify/result/page.tsx:175-188 — obl` | «Jeg forstår at dette ikke er en spiselighetsgaranti, og jeg spiser aldri sopp uten å få d | Ja — hele skjemaet kan hoppes over ved å bare lukke siden el | ja |
| `src/components/ui/EdibilityBadge.tsx — selve m` | Bare ett ord, uten kontekst: «Spiselig» (grønn bg-emerald-600), «Betinget spiselig» (amber | Nei — det er merket som ALLTID vises. Det er fraværet av for | ja |
| `src/app/species/page.tsx — artslisten /species` | Filter «Spiselighet: Alle / Spiselig / Giftig / Dødelig», deretter et rutenett av SpeciesC | Det finnes ingenting å overse — advarselen mangler helt på d | ja |
| `src/app/species/[id]/page.tsx:116-118 — spisel` | Artsnavn, latinsk navn, deretter EdibilityBadge alene under tittelen — f.eks. «Kantarell / | Nei, men det finnes ingen motvekt på siden. | ja |
| `src/app/species/[id]/page.tsx:121-166 — giftba` | «DØDELIG GIFTIG — IKKE SPIS» (hvit tekst på mørkerød) / «GIFTIG — IKKE SPIS», + «Toksin:», | Nei — den ligger rett under tittelen. | nei |
| `src/app/species/[id]/page.tsx:168-178 — banner` | «Betinget spiselig — krever tilberedning» + edibility_notes, f.eks. for morkler: «Spiselig | Nei når edibility='conditionally_edible'. | nei |
| `src/app/species/[id]/page.tsx:168 — betingelse` | INGENTING. Feltet edibility_notes rendres aldri for arter merket 'edible'. Dette er eneste | Kan ikke ses i det hele tatt — teksten er skrevet, kvalitets | nei |
| `src/app/species/[id]/page.tsx:220-287 — «Se og` | Kort med bilde, fareetikett («Fare: Kritisk/Høy/Middels/Lav», kritisk = hvit på rød), Edib | Ja — den ligger under hele siden og krever scrolling; på mob | nei |
| `src/app/species/[id]/page.tsx:211-218 — lookAl` | «⚠️ Vi klarte ikke å hente forvekslingsartene for denne arten akkurat nå. At det ikke står | Nei (role="alert"). | ja |
| `src/components/map/MushroomMap.tsx:1044-1050 +` | Ingen tekst — bare farge: grønn (#059669) for edible, rød (#dc2626) for toxic/deadly, grå  | Fargen er hele budskapet — det finnes ingen advarsel å overs | ja |
| `src/components/map/FindingPopup.tsx — popup fo` | Bilde, artsnavn (f.eks. «Kantarell»), latinsk navn, brukernavn + dato, evt. sone-info og n | Det finnes ingen advarsel i popupen i det hele tatt. | ja |
| `src/components/map/MushroomMap.tsx:653-727 — p` | «<b>Artsnavn</b><br/><span farget>Spiselig</span><br/>Registrert funn · sep. 2019 … Artsda | Ingen advarsel finnes i popupen. | ja |
| `src/components/map/MushroomMap.tsx:1699-1703 —` | «Alle» / «🟢 Spiselige» / «🔴 Giftige». SV: «Alla» / «🟢 Ätliga» / «🔴 Giftiga». | Nei — det er selve kontrollen. | ja |
| `src/components/map/MushroomMap.tsx (MushroomMa` | «<b>Vis registrerte funn</b> — ekte soppfunn, fargekodet etter spiselighet (🟢 spiselig, 🔴  | Ja — det er en engangs-onboarding med «Skjønner!»-knapp som  | ja |
| `src/components/map/MushroomMap.tsx:487-495 og ` | Nedtrekk med «🍄 {artsnavn}», deretter en grønn chip «🍄 Lovende steder for {art}» og nåler  | Ingen advarsel vises på denne stien i det hele tatt. | ja |
| `src/components/map/HotspotPanel.tsx (HotspotPa` | «Områder som matcher habitat og værvindu — ingen garanti for at det er sopp der.» og «Best | Disclaimeren er liten grå tekst under panelet; artsnavnet st | ja |
| `src/components/map/AddFindingSheet.tsx — funnr` | «Velg art (valgfritt)», «Søk art», «Beskriv funnet», «Delingsnivå», «Lagre funn». SV tilsv | Det finnes ingen advarsel å overse. | ja |
| `src/app/page.tsx:173-179 og 214-224 — sesongop` | «4 matsopper i sesong · 8 giftige å passe på», liste over matsopper med «toppsesong»/«i se | Advarselslinja vises bare når det faktisk finnes giftige art | ja |
| `src/app/page.tsx:313-320 — sikkerhetsnoten und` | «Kun et tips om hva som er i sesong — aldri spis sopp basert på appen alene.» + lenke «Sje | Ja — den er lett å scrolle forbi og er typografisk nedtonet. | ja |
| `src/app/page.tsx:324-342 — «Vær obs — giftige ` | Rød ramme, liste over giftige/dødelige arter i sesong med latinsk navn og EdibilityBadge,  | Vises bare når det finnes giftige arter i sesong; ligger et  | ja |
| `src/app/page.tsx:344-378 — «Siste funn fra fel` | Liste over andre brukeres funn: bilde, artsnavn, sted, «for 3 dager siden», og til høyre e | Ingen advarsel finnes i denne seksjonen. | ja |
| `src/app/calendar/page.tsx + src/components/cal` | Artskort med bilde, navn og EdibilityBadge, «Topp-sesong»-merke, samt en 12-måneders tabel | Det finnes ingen advarsel å overse. | ja |
| `src/app/profile/page.tsx:169 — brukerens egne ` | Funnliste med artsnavn og EdibilityBadge. | Ingen advarsel på flaten. | ja |
| `src/app/forum/* + src/components/forum/* — hel` | Ingenting om sikkerhet. Kategoriene er «Funn / Spørsmål / Tips / Diskusjon». Nytt innlegg  | Advarselen finnes ikke på flaten i det hele tatt; den ligger | ja |
| `src/lib/utils/forumBadge.ts:21-45 + PostCard/C` | Merker ved brukernavnet: «Ekspert» (blå), «Verifisert plukker» (grå), «Fellesskapsverifise | Merket er alltid synlig; motforbeholdet finnes ingen steder  | nei |
| `src/app/sikkerhet/page.tsx — sikkerhetssiden (` | «Akutt: mistanke om soppforgiftning — Ring Giftinformasjonen 22 59 13 00 — døgnåpent. Ring | Ja — siden er en destinasjon man må klikke seg til fra bunnl | ja |
| `messages/{nb,sv}.json → Safety-namespacet (poi` | NB: Giftinformasjonen +4722591300 / «22 59 13 00», nød 113, controlUrl soppognyttevekster. | Ikke relevant — dette er datalaget bak advarslene. | ja |
| `src/components/onboarding/OnboardingIntro.tsx ` | «Identifiser trygt — Ta bilde av et funn og få artsforslag med tydelige advarsler om gifti | Ja — hele introen har en «Hopp over»-knapp, og den vises kun | ja |
| `src/components/landing/LandingPage.tsx (Landin` | «Identifiser trygt — Ta bilde og få AI-forslag — alltid med tydelige advarsler om giftige  | Landingssiden er første møte for nye brukere; safetyBody lig | ja |
| `public/landing/index.html og public/landing/in` | NO: «3 Identifiser trygt — Ta bilde og få artsforslag fra AI — alltid med giftighetsmerkin | Sikkerhetsseksjonen ligger nederst, etter priser; «alltid»-p | ja |
| `content/sanketips/*.md → public/landing/sanket` | Grundig, kildebelagt tekst med eksplisitte forbehold, f.eks.: «Bildegjenkjenning — vår ege | Ja — de nås kun via «Sanketips» i landingssidens toppmeny. | nei |
| `messages/{nb,sv}.json → Vilkar.serviceNatureBo` | «DENNE PUNKT ER DEN VIKTIGSTE I HELE AVTALEN … Du skal ALDRI plukke, tilberede eller spise | Ja — vilkårene aksepteres ved registrering uten at teksten v | ja |
| `messages/{nb,sv}.json → Metadata.description /` | «Finn mer sopp: live soppvarsel, prediksjonskart med lovende steder, AI-identifikasjon og  | Vises i Google-treff og delingskort; ikke i appen. | ja |
| `src/app/api/identify/route.ts:225 — språkparam` | Ingen synlig tekst i dag: feltet suggestion.description hentes på norsk uansett brukerens  | Ikke synlig i dag. | nei |


## 4. Penger (23 flyter)

| Flyt | Status | Håndheves på server |
|---|---|---|
| Stripe checkout (web) — /api/billing/checkout | **ferdig** | Ja. Krever innlogget bruker (401), rate limit 5/min, krever immediateDeliveryCon |
| Stripe webhook — /api/stripe/webhook (entitlement-skriving) | **delvis** | Ja for det den håndterer: signaturverifisering mot STRIPE_WEBHOOK_SECRET, dedup  |
| Kansellering via Stripe (web) | **ferdig** | Ja. /api/billing/portal lager Stripe Billing Portal-sesjon (401 uten bruker, 10/ |
| Kansellering av Apple-abonnement (IAP) | **delvis** | Ja for konsekvensen: RevenueCat CANCELLATION = kun auto-fornyelse av, status for |
| Refusjon — Stripe (web) | **ikke_implementert** | Nei. Ingen håndtering av charge.refunded eller charge.dispute.created noe sted i |
| Refusjon — Apple/IAP | **ferdig** | Ja. CANCELLATION med cancel_reason='CUSTOMER_SUPPORT' mappes til revoke (status  |
| Prøveperiode | **ikke_implementert** | Ingenting å håndheve — det finnes ingen prøveperiode. Checkout setter aldri tria |
| Sesongpass (249 kr/år) | **ferdig** | Ja. Selges nå som årlig auto-fornyende Stripe-abonnement (mode alltid 'subscript |
| Sesongpass som engangskjøp (legacy payment-mode) | **delvis** | Ja, men med hardkodet sesongslutt: mode==='payment' gir tier season_pass, status |
| IAP-kjøp via Apple (RevenueCat SDK i native shell) | **ferdig** | Kjøpet skjer hos Apple; tilgang gis først når RC-webhooken skriver raden — klien |
| RevenueCat webhook — /api/revenuecat/webhook | **ferdig** | Ja. Timing-safe Authorization-sammenligning (SHA-256-digest), 503 hvis REVENUECA |
| Gjenoppretting av kjøp (Restore purchases) | **delvis** | Nei — restore er rent klientside. restoreIapPurchases() leser lokale entitlement |
| Synk web ↔ mobil (kryssleverandør-eierskap) | **delvis** | Ja på selve rad-eierskapet: metadata.provider avgjør hvem som eier raden; Stripe |
| Google Play / Android IAP | **ikke_implementert** | Ingenting å håndheve. isIapAvailable() krever NEXT_PUBLIC_REVENUECAT_APPLE_KEY,  |
| Premium: ubegrenset AI-identifikasjon | **ferdig** | Ja. /api/identify krever innlogging, 20/min burst, og for !capabilities.paid tel |
| Premium: full prediksjonsdetalj (faktorer + hotspots) | **ferdig** | Ja. /api/prediction grovkorner alle modellfaktorer via toFreeFactor og kutter ho |
| Premium: heatmap-raster (/api/prediction/grid) | **ferdig** | Ja. 403 med upsell for !paid i full raster-modus; i 'top'-modus kappes gratisbru |
| Premium: artsspesifikke beste steder (/api/prediction/specie | **ferdig** | Ja. Hard 403 med upsell for alle som ikke er betalende. |
| Premium: offline-kart | **delvis** | NEI — kun klientside. hasOfflineAccess kommer fra /api/billing/status i React-st |
| Prediksjonsfliser lest direkte fra kartet (RPC) | **ferdig** | Bevisst ingen betalingsmur: anon mistet EXECUTE i migrasjon 033, men innlogget g |
| Selvtildeling av premium i databasen | **ferdig** | Ja. RLS på billing_subscriptions gir brukeren kun SELECT på egen rad; all skrivi |
| Avstemming / reconciliation mellom betalingsleverandør og da | **ikke_implementert** | Finnes ikke. Eneste cron i vercel.json er generate-tiles. Entitlement-tilstanden |
| Manuell tildeling av premium (founder-pass, kundeservice) | **ikke_implementert** | Ingen kodesti. Ingen admin-endepunkt skriver billing_subscriptions — grunnlegger |

**Hull:**

- KAN MISTE TILGANG (alvorligst): i customer.subscription.*-grenen utledes tier utelukkende av resolveTierByPriceId(priceId) mot STRIPE_PRICE_PREMIUM_MONTHLY/STRIPE_PRICE_SEASON_PASS. Matcher ikke price_id env-verdien, returneres 'free' — og raden skrives med tier 'free' + status 'active', som gir has
- KAN MISTE TILGANG: past_due gir umiddelbart tap av premium (hasPaidAccess krever active/trialing), uten grace-periode, mens Stripe fortsatt kjører dunning i opptil ~3 uker og kunden ofte betaler. RevenueCat-siden har eksplisitt grace-håndtering (BILLING_ISSUE + grace_period_expiration_at_ms) — asymm
- KAN MISTE TILGANG: ingen avstemmingsjobb. Faller en webhook-levering permanent ut (Stripe gir opp etter ~3 døgn, RevenueCat etter 5 forsøk), finnes ingen mekanisme som noensinne oppdager eller reparerer det. current_period_end passerer og kunden blir gratisbruker uten at noe logges som feil. vercel.
- KAN MISTE TILGANG: 'Gjenopprett kjøp' kan ikke reparere databasen. restoreIapPurchases() leser kun lokale Apple-entitlements og poller /api/billing/status; det finnes ingen server-kall mot RevenueCats REST-API. Er raden aldri skrevet (webhook tapt, TRANSFER-ACK, eller REVENUECAT_WEBHOOK_AUTH var bor
- KAN MISTE TILGANG: RevenueCat TRANSFER-hendelser ACKes uten å skrive noe (kun log.warn 'transfer_needs_review'). Bytter en kunde Supabase-konto eller Apple-ID, følger ikke abonnementet med til den nye kontoen, og den gamle kontoen beholder en betalt rad. Krever manuell oppfølging som ingen blir vars
- KAN MISTE TILGANG: hvis REVENUECAT_WEBHOOK_AUTH mangler i miljøet svarer ruta 503 på ALT. RevenueCat prøver 5 ganger og gir så opp — Apple-kunder betaler og får aldri tilgang, uten spor i databasen. Variabelen er ifølge docs/launch-critical-path.md:36 satt i Vercel, men den mangler både i .env.local
- KAN MISTE TILGANG (stille): resolveUserIdFromCustomer returnerer null når kunden ikke finnes i billing_subscriptions, og hendelsen hoppes da over uten feil eller logg. Et abonnement opprettet direkte i Stripe Dashboard (kundeservice, migrering) gir dermed ingen tilgang og ingen varsel. src/app/api/s
- DOBBELTBELASTNING: web-checkout blokkerer kjøp når brukeren allerede har en betalt plan (409, checkout/route.ts:98-111), men IAP-siden har ingen tilsvarende sperre — verken i klient eller server. Pricing-siden viser kjøpsknapp for enhver plan som ikke er 'current', også i native, og RevenueCat-'gran
- GRATIS TILGANG: refusjon på Stripe fjerner ikke premium. Verken charge.refunded eller charge.dispute.created håndteres — kunden får pengene tilbake og beholder tilgangen ut perioden. RevenueCat-siden håndterer det motsatte tilfellet korrekt (CUSTOMER_SUPPORT → revoke).
- GRATIS TILGANG: REVENUECAT_ALLOW_SANDBOX=1 står fortsatt PÅ i produksjon (må stå på gjennom App Review) — sandbox-kjøp gir ekte premium så lenge den står. Fjerning er notert som etterlansering-oppgave i docs/neste-okt.md:65, ikke som en gate. src/app/api/revenuecat/webhook/route.ts:137-143
- GRATIS TILGANG: offline-kart er kun skjult i klienten. hasOfflineAccess er React-state fra /api/billing/status, og flisene hentes direkte fra Kartverket/OSM/ArcGIS til Cache Storage — ingen server-sti å håndheve på. Dette er den eneste premiumfunksjonen som er 100 % klientgatet. src/components/map/M
- GRATIS TILGANG (fail-open): telleren for gratis AI-kvote skrives etter kallet og logger kun warn ved feil. Feiler inserten (eller mangler service-role-nøkkelen), øker ikke forbruket og gratisbrukeren får ubegrenset AI. Samme mønster i lesestien: manglende tabell (42P01) faller tilbake på gammel find
- GRATIS TILGANG (smal): guessTierFromProductId gir premium til ethvert produkt-id som inneholder 'premium' eller 'month', og season_pass til 'season'/'sesong'/'säsong'. Brukes både i RC-webhooken (server) og i native-klienten. Krever gyldig webhook-hemmelighet for å utnyttes, men det betyr at en feil
- TILGANG UTEN UTLØP: hasPaidAccess returnerer true når current_period_end er null. SDK-en er pinnet til apiVersion '2024-06-20' (src/lib/stripe/server.ts:14), men webhook-payloadens felter styres av API-versjonen satt på webhook-endepunktet i Stripe Dashboard. Står endepunktet på 2025+ (der current_p
- TESTHULL: ingen av de to webhook-rutene har tester. Kun de rene funksjonene er testet (plans, checkout-write, revenuecat-mapping). Stripe-webhooken — den som håndterer ekte betalende kunder i dag — har null testdekning, inkludert tier-utledningen som er den farligste linjen i pengearkitekturen. e2e/
- DOKUMENTASJONSDRIFT: docs/CODEX-HANDOVER.md:48, 161, 207 og 439 sier at RevenueCat/IAP 'is not yet in the code' og at native billing er 'view-only'. Det er feil siden commit a116d95 (PR #90) — koden, SPM-avhengigheten og webhooken er på main. Dokumentet oppgir også feil produkt-id-er (no.mycelet.app
- OPERASJONELT: ingen pruning av billing_webhook_events (migrasjon 007 har ingen retention, og prune-cronen er ikke deployet). Tabellen vokser ubegrenset og er samtidig idempotensnøkkelen for begge leverandører.
- DØD KODE MED FEIL SEMANTIKK: payment-mode-grenen i Stripe-webhooken gir sesongpass med hardkodet slutt 30. november, mens checkout alltid oppretter subscription-mode. Grenen kan ikke nås fra dagens kjøpsflyt, men vil gi feil periodeslutt hvis en engangs-price noen gang legges inn. src/app/api/stripe
- IKKE VERIFISERBART HERFRA (krever Sindre/dashboards): at STRIPE_PRICE_*-verdiene i Vercel matcher price-id-ene på faktiske aktive abonnement; at migrasjon 033 er kjørt i prod; at Stripe-webhookens API-versjon er 2024-06-20; at Stripe Billing Portal er konfigurert til å tillate kansellering; om noen 


## 5. Posisjonspersonvern (35 veier)

| Vei | Eksakt/grov | Bevis |
|---|---|---|
| Mobil-GPS (useGeolocation) → AddFindingSheet → POST /api/findings → fi | **eksakt** | src/components/map/AddFindingSheet.tsx:164 sender `adjusted.lat/lng`; src/app/ap |
| Brukerens manuelle «Juster posisjon (meter)» → applyOffset() før lagri | **grovkornet** | src/components/map/AddFindingSheet.tsx:88-95 — offset legges på med FAST kurs 45 |
| AI-identifisering → sessionStorage → /api/findings med visibility hard | **eksakt** | src/app/identify/result/page.tsx:97-113 sender `payload.location.latitude/longit |
| findings INSERT/UPDATE → trigger set_display_location() → display_lati | **grovkornet** | supabase/migrations/005_zone_findings.sql:10-44 — private → NULL; is_zone_findin |
| public_findings-viewet → display_lat/display_lng for visibility='publi | **eksakt** | supabase/migrations/029_prediction_feedback_context.sql (gjeldende view): `WHEN  |
| public_findings → approximate / sone / private | **maskert** | Samme view: approximate/sone → display_*-kolonnene (±500 m hhv. grid); private f |
| Anon/authenticated → direkte SELECT på findings-tabellen (PostgREST) | **maskert** | 015_lock_down_location_data.sql:22-26 dropper «Offentlige funn er synlige for al |
| Kart i nettleseren → supabase.rpc('get_findings_in_bounds') med anon-n | **grovkornet** | src/components/map/MushroomMap.tsx:1064; RPC-en er `RETURNS SETOF public_finding |
| Eierens egne sider: /mine-steder | **eksakt** | src/app/mine-steder/page.tsx:106-114 — `.select('id, location_name, latitude, lo |
| GDPR-dataeksport /api/me/export → findings.select('*') | **eksakt** | src/app/api/me/export/route.ts:72 — `supabase.from('findings').select('*').eq('u |
| /api/prediction (fallback-vei) → hotspots bygget fra funn i området | **grovkornet** | src/app/api/prediction/route.ts:411 henter via get_findings_in_bounds (maskert v |
| /api/prediction (flis-vei) → hotspots fra prediction_tiles | **maskert** | route.ts:287-296 bygger hotspots av `tile.center_lat/center_lng`. Flisene genere |
| /api/identify → nærhetstelling av funn rundt brukeren | **maskert** | src/app/api/identify/route.ts:467-476 spør `public_findings` på `display_lat/dis |
| Opplastet bilde → Kindwise (mushroom.kindwise.com) | **maskert** | Bildet reenkodes alltid via canvas før det forlater enheten: src/lib/utils/image |
| Brukerposisjon → Kindwise (regional vekting av artsforslag) | **grovkornet** | src/app/api/identify/route.ts:209 `coarsenLocation(body.latitude, body.longitude |
| Funnets RÅ koordinat → MET Norway Frost (værsnapshot ved lagring + pre | **eksakt** | src/app/api/findings/route.ts:41-44 kaller `fetchWeatherSummary({ lat: finding.l |
| Funnets/punktets koordinat → SMHI (Sverige) | **maskert** | src/lib/weather/index.ts:463-479 — SMHI-adapteren henter STASJONSLISTER og regne |
| Koordinat → OpenWeather (regionen 'other') | **eksakt** | src/lib/weather/index.ts:530 — `https://api.openweathermap.org/data/2.5/forecast |
| Koordinat → Open-Meteo (siste fallback) | **eksakt** | src/lib/weather/index.ts:575-576 — `latitude: lat.toFixed(4)`. Fire desimaler er |
| Funnets RÅ koordinat → NIBIO SR16 WMS (skogdata ved lagring + prediksj | **eksakt** | src/app/api/findings/route.ts:41-45 kaller `getForestProperties({ lat: finding.l |
| Koordinat → Kartverket høydedata (geonorge) | **eksakt** | src/lib/terrain/index.ts:19 — `https://ws.geonorge.no/hoydedata/v1/punkt?koordsy |
| Koordinat → CORINE / EEA (arealdekke, SE og øvrige) | **eksakt** | src/lib/corine/index.ts:33 — `geometry: {x: query.lon, y: query.lat, ...}` med f |
| Koordinat → SGU (svensk jordart) | **eksakt** | src/lib/slu/jordart.ts:76 — `items?bbox=${lon-d},${lat-d},${lon+d},${lat+d}`, en |
| «Fant du sopp her?» → POST /api/spot-feedback → spot_feedback.latitude | **eksakt** | src/app/api/spot-feedback/route.ts:72-76 — `latitude: Number(lat.toFixed(5))` (~ |
| Klient → /api/prediction, /api/prediction/grid, /api/prediction/specie | **eksakt** | src/lib/hooks/usePrediction.ts:19-28 (`?lat=&lon=&radiusKm=`), src/components/ho |
| Applikasjonslogger (createRequestLogger + log.*) | **maskert** | src/lib/log/request.ts:57-63 binder kun `route: url.pathname` — query-strengen l |
| Google Analytics 4 | **maskert** | src/lib/analytics.ts:trackPageView bygger `page_location` fra `window.location.o |
| Bilde → Supabase Storage-bøtte 'finding-images' → offentlig URL lagret | **maskert** | EXIF strippet (src/lib/utils/image.ts). Bøtta er `public = true` (019_storage_bu |
| Foruminnlegg med finding_id → embed av findings-raden | **maskert** | src/lib/hooks/useForum.ts:32 velger `finding:finding_id(id,species_id,species_na |
| Adminflater og moderasjon | **maskert** | src/app/admin/page.tsx:173 bruker service-rollen, men henter kun `species_id,spe |
| Service worker / offline-cache | **maskert** | public/sw.js:66 — `if (url.pathname.startsWith('/api/')) return false;`. Bare Ka |
| species_occurrences (GBIF) → get_occurrences_in_bounds, offentlig lesb | **eksakt** | 013_species_occurrences.sql:29 `FOR SELECT USING (true)` + GRANT til anon; 014 g |
| Kontosletting /api/me/delete → hva som skjer med rå koordinater | **usikkert** | src/app/api/me/delete/route.ts:153-175 sletter eksplisitt positive funn og priva |
| Auto-sletting av inaktive kontoer (Edge Function purge-inactive-accoun | **eksakt** | supabase/functions/purge-inactive-accounts/index.ts:27-36: «positive findings an |
| Latent: gjentatt UPDATE på et 'approximate'-funn → ny tilfeldig jitter | **usikkert** | 024_fix_zone_display_trigger.sql:15-17 gjorde triggeren `BEFORE INSERT OR UPDATE |


## 6. Eksterne kilder (31)

Skillet som betyr noe: brukes den **faktisk i produksjon**, eller finnes bare koden?

| Kilde | Til hva | I bruk? | Hvis nede | Dekning |
|---|---|---|---|---|
| MET Norway Frost (frost.met.no) | Observert vær siste 14 døgn for Norge (temp, | **ja_i_produksjon** | Faller stille til Open-Meteo (keyless). Faller også  | NO |
| MET Norway Locationforecast 2.0 (api.met.no) | 7-døgns fremover-varsel — «soppforhold»-stri | **ja_i_produksjon** | fetchDailyForecast returnerer null → ruta svarer 502 | Global (MET dekk |
| SMHI Öppna data (opendata-download-metobs.smhi.se) | Skulle vært observert vær for Sverige (param | **kode_finnes_men_ubrukt** | VIKTIGSTE FUNN: adapteren leverer ikke i produksjon. | SE |
| Open-Meteo (api.open-meteo.com) | Keyless siste-utvei-vær, ment kun som sikker | **ja_i_produksjon** | Er i praksis ENESTE værkilde for hele Sverige i dag  | Global |
| OpenWeather (api.openweathermap.org) | Gammel fallback for regioner utenfor Norden. | **kode_finnes_men_ubrukt** | Ingen. Bevis for at den ikke er aktiv i prod: fallba | Global (teoretis |
| NIBIO SR16 (wms.nibio.no/cgi-bin/sr16) | Treslag, bonitet og volum per punkt via WMS  | **ja_i_produksjon** | Verifisert live: Nannestad gir forest.source="sr16", | NO (Fastlands-No |
| CORINE Land Cover via EEA ArcGIS (image.discomap.eea.europa.eu) | Skogtype (311/312/313 → lauv/bar/blandet) fo | **ja_i_produksjon** | Verifisert live: punkt i indre Norrland gir forest.s | SE (og pan-europ |
| AR5 / AR50 (NIBIO arealressurs) | Ingenting. Nevnt i én kommentarblokk i src/l | **kun_dokumentert** | Ingen — ingen kode kaller AR5. | NO (ville vært) |
| SGU Jordarter 25k–100k (api.sgu.se) | Ment som svensk jordart/dreneringssignal (mo | **kode_finnes_men_ubrukt** | Ingen. Eneste importør av getSwedishSoilDrainage er  | SE |
| Lantmäteriet | Ingenting. Null referanser i src/, scripts/  | **kun_dokumentert** | Ingen. Svensk bakgrunnskart er OpenStreetMap, ikke L | SE (ville vært) |
| Skogsstyrelsen / SLU Skogliga grunddata | Ingenting i kode. Omtalt som ønsket oppgrade | **kun_dokumentert** | Ingen. | SE (ville vært) |
| Kartverket Høydedata (ws.geonorge.no/hoydedata/v1/punkt) | Ekte terrenghøyde → terrengfaktoren i modell | **ja_i_produksjon** | Verifisert indirekte live: norske punkter gir terren | NO |
| Kartverket Stedsnavn (ws.geonorge.no/stedsnavn/v1/navn) | Reserve-geokoder for stedsnavnsøk, bak Photo | **kode_finnes_men_ubrukt** | Kalles kun hvis Photon kaster eller gir tomt svar. I | NO |
| Photon / Komoot (photon.komoot.io) | Primær stedsnavnsøk på kartet (OSM-basert),  | **ja_i_produksjon** | Verifisert live: /api/places?q=Uppsala og ?q=Hamar g | NO + SE (filtrer |
| Kartverket cache (cache.kartverket.no WMTS topo) | «Terreng»-bakgrunnskartet (standardlaget) og | **ja_i_produksjon** | Blankt/grått bakgrunnskart; markører og heatmap ligg | NO — kartet bytt |
| OpenStreetMap-fliser (tile.openstreetmap.org) | «Kart»-laget, og de facto bakgrunnskart for  | **ja_i_produksjon** | Blankt bakgrunnskart — mest merkbart i Sverige, der  | Global |
| Esri / ArcGIS World Imagery (server.arcgisonline.com) | «Satellitt»-bakgrunnslaget + offline-cache.  | **ja_i_produksjon** | Satellittlaget blir blankt. MERK: dette er satellitt | Global |
| GBIF / Artsdatabanken (api.gbif.org) | To ting, begge batch: (1) 327 298 forekomstr | **ja_i_produksjon** | Ingen ved nedetid — api.gbif.org kalles ALDRI i runt | NO + SE (importe |
| Kindwise / Plant.id mushroom API (mushroom.kindwise.com) | AI-bildeidentifikasjon — hele /identify-flyt | **ja_i_produksjon** | Nøkkel mangler/plassholder → 503 «AI-identifikasjon  | Global |
| Kindwise similar-images CDN (mushroom-id.ams3.cdn.digitaloceanspaces.com) | Referansefoto i forvekslingskortet (LookAlik | **ja_i_produksjon** | Brutt bilde i forvekslingskortet; teksten og giftadv | Global |
| Sentinel / Copernicus satellittdata + NDVI/NDWI | INGENTING. Tre spor finnes, alle tomme: (1)  | **stub** | Ingen. Ingen kode skriver noen gang 'sentinel_batch' | — |
| Stripe (api.stripe.com, js.stripe.com, checkout.stripe.com) | All web-betaling: checkout, kundeportal, web | **ja_i_produksjon** | Checkout starter ikke → brukeren kommer ikke videre  | Global (NOK-pris |
| RevenueCat (native IAP + webhook) | Kjøp i iOS-appen (Apple forbyr Stripe in-app | **kode_finnes_men_ubrukt** | Ingen i dag — isIapAvailable() krever både native sh | iOS (Apple), Goo |
| Supabase (Postgres + PostGIS, Auth, Storage, RLS, Edge Functions) | Alt persistent: brukere, funn, artskatalog,  | **ja_i_produksjon** | Totalt havari: innlogging, kart, arter, funn, betali | Irrelevant — én  |
| Wikimedia Commons (upload.wikimedia.org) | Hvert eneste artsbilde i appen — både listev | **ja_i_produksjon** | Verifisert mot prod-databasen: 72 av 72 arter hotlin | Global |
| Vercel (hosting + cron) | Kjører hele Next-appen, og vercel.json planl | **ja_i_produksjon** | Verifisert: /api/health/predictions viser fresh:true | — |
| Google Analytics 4 (googletagmanager.com / google-analytics.com) | Bruksstatistikk, måle-ID G-0ZYHPZ2KM4. Laste | **ja_i_produksjon** | Ingen brukersynlig effekt — skriptet lastes ikke ute | Global |
| Resend (api.resend.com) | E-post om forestående sletting av inaktive k | **kode_finnes_men_ubrukt** | Kan ikke verifiseres herfra. sendEmail() KALLES i de | — |
| Supabase Auth e-post (innebygd mailtjeneste) | Passord-tilbakestilling og registreringsbekr | **ja_i_produksjon** | Brukere kommer ikke inn igjen etter glemt passord. K | Global |
| Apple App Store / Google Play | Distribusjon av native-skallet (Capacitor 8, | **kode_finnes_men_ubrukt** | Ingen i dag — ingen publisert app. Alle native-veier | — |
| GitHub (GITHUB_TOKEN i .env.local) | Kun utviklerverktøy (gh CLI / PR-flyt). Inge | **kode_finnes_men_ubrukt** | Ingen for appen. Merk at token-et ligger i .env.loca | — |

**Fordeling:** {'ja_i_produksjon': 19, 'kode_finnes_men_ubrukt': 8, 'kun_dokumentert': 3, 'stub': 1}

