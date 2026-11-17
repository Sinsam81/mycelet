# QA-sjekkliste — full produktevaluering

Dette er fasiten for Mycelets hovedautomatisering: **«full produktevaluering»**.
Hver kjøring driver alle kjerneflyt mot suksesskriteriene under og **rapporterer**
brudd (+ forslag til fiks for godkjenning). Den **deployer aldri** til live-appen.

- **Hvordan kjøre:** `npm run qa` (lokalt, mot `http://localhost:3000`)
- **Bare live-røyktest:** `npm run qa:prod` (kun lesing, trygg mot mycelet.com)
  - `qa:prod` kjører tilfellene i *din egen* utsjekk mot produksjonen. Et tilfelle skrevet for kode som ikke er deployet ennå, feiler der til deployen er gjort — det er ikke en feil i appen. For en utgivelse er det derfor kjøringen etter deployen som teller.
- **Førstegangsoppsett:** `npm run qa:setup` (lager testbruker — se [Testbruker](#testbruker))
- **Automatikken:** kjøres via `/loop` — se [Loop-oppsett](#loop-oppsett)

Hver flyt under har **automatiske sjekker** (Playwright, kjøres av `npm run qa`) og
noen **manuelle sjekker** (krever fysisk enhet, f.eks. iOS-appen) som loopen ikke
kan dekke. Manuelle er merket 🖐️.

---

## 1. Kart + posisjon (NO/SE-ruting)

Dette er bug-klassen som rammet oss i prod (svensk kart blankt, fast i Oslo, død «Finn meg»).

- [ ] Kartsiden `/map` laster (innlogget) og Leaflet-lerretet vises (`.leaflet-container`).
- [ ] Karttiler lastes (minst én `img.leaflet-tile` blir synlig — ikke blankt kart).
- [ ] **Norsk posisjon** (Oslo ~59.91, 10.75): kartet sentrerer i Norge, Kartverket «Terreng»-laget er aktivt.
- [ ] **Svensk posisjon** (Göteborg ~57.71, 11.97): kartet auto-bytter til OSM-laget (Kartverket har ingen tiler i Sverige → må ikke være blankt).
- [ ] «Finn min posisjon»-knappen finnes og er klikkbar, og recentrer kartet (ikke fast i Oslo).
- [ ] «Beste steder»-knappen finnes; klikk laster nåler eller en lås-/oppsalg-notis (gratis vs premium).
- [ ] Artssøk-feltet («Hvilken sopp vil du finne …») finnes.
- [ ] Funn-lagets filterchips vises (spiselighet, sesong og årsfilteret «Alle år / Siste 5 år / Siste 10 år»); å velge «Siste 5 år» gir ikke JS-feil (virker både med og uten migrasjon 054 via klient-fallback).
- [ ] Ingen ukjente JS-feil i konsollen ved kartlasting.
- [ ] 🖐️ Native: «Finn meg» fungerer i iOS-appen (Capacitor Geolocation, ikke `navigator.geolocation`).
- [ ] «Legg til funn» måler posisjonen på nytt når skjemaet åpnes og tilbyr både «der du står» og «der kartet står» når de er forskjellige — appen velger aldri i stillhet (`map-geo.e2e.ts`; skjemaet åpnes og avbrytes, ingenting lagres).
- [ ] Kartet åpner med «Kun mine funn» på, og kontrollene oppå kartet tar imot trykk i hele 44 px-flaten (`map-geo.e2e.ts`).
- [ ] 🖐️ Offline-skallet (`/offline`) er på svensk når nettleseren eller telefonen står på svensk, også når språkvelgeren aldri er brukt, og på norsk ellers. Et valg i språkvelgeren vinner over nettleserens språk.
- [ ] 🖐️ Manuell (skriver til prod): «Meld funnet» og «Blokker brukeren» fra popupen til en annens funn. Popupen blir stående mens skjemaet er åpent (også når kartet flytter seg for å vise den), teksten er på riktig språk, og etter blokkering forsvinner den brukerens funn fra kartet uten ny innlasting. Opphev blokkeringen fra profilen etterpå.

## 2. AI-soppkjenner (`/identify`)

- [ ] `/identify` laster (innlogget) med opplastingsfelt/kamera-CTA.
- [ ] Sikkerhetsadvarsel vises (aldri spis basert på AI alene; lenke til soppkontroll).
- [ ] Ingen krasj når siden åpnes uten bilde.
- [ ] 🖐️ Kindwise direkte, uten appen: `PLANTID_API_KEY=… node scripts/sjekk-kindwise.mjs [bilde.jpg]` — trinn 1 (`usage_info`) er gratis og bekrefter nøkkel + kreditter; trinn 2 sender rutens eksakte kropp og prøver varianter hvis den avvises. Bruk dette FØRST når appen sier «Identifikasjon feilet» — det skiller feil nøkkel i Vercel fra en parameter Kindwise avviser.
- [ ] 🖐️ Manuell (kvote-/kostnadsavhengig): last opp ett kjent soppbilde → får forslag + forvekslings-sjekk (look-alike). Kjøres sjelden, ikke i hver loop (Kindwise-kreditter).
- [ ] 🖐️ Samme kjøring: et giftig, dødelig eller ukjent forslag har grå sesongpille og aldri «Topp-sesong», og et forslag som ikke er mat viser aldri en matsopp som «Farlig dobbeltgjenger». I appen sier posisjonslinja på resultatsiden «Posisjonen telefonen målte …», ikke «da du trykket «Identifiser»», og en posisjon som er mer enn ti minutter gammel gir spørsmålet om hvor funnet skal lagres.
- [ ] 🖐️ Manuell lagringsflyt (skriver til prod — kjøres sjelden): bekreftelses-boksen må krysses AKTIVT (aldri forhåndskrysset), delingsnivå-velgeren er synlig og starter på forrige lokalt lagrede valg (nullstilles ved utlogging), ved manglende GPS vises notis + «Hent posisjonen min» som henter posisjon UTEN ny AI-identifisering, og etter lagring lander man på `/map?mine=1` med «Kun mine funn» på (automatisert lese-sjekk av landingen finnes i `e2e/map-geo.e2e.ts`).

### 2b. Identifiseringshistorikk (`/identifiseringer`)

- [ ] `/identifiseringer` laster (innlogget) og viser lista, eller tom-tilstanden «Ingen identifiseringer ennå» — **ikke** feilkortet.
- [ ] Utlogget: `/identifiseringer` sender til `/auth/login?redirect=/identifiseringer` (gating på sidenivå, så den virker også lokalt der middleware ikke kjører).
- [ ] Hver rad viser miniatyr (eller 🍄-plassholder), artsnavn på riktig språk, dato og posisjon.
- [ ] «Lagre som funn» er en LENKE til `/identify/result?id=…` — lista skal aldri lagre selv. Klikk den: resultatsiden viser samme bilde, samme forvekslingssjekk, **umerket** bekreftelsesboks og synlig delingsnivå-velger.
- [ ] En allerede lagret rad viser «Lagret som funn» + «Se i kartet», og resultatsiden tilbyr da ikke lagring på nytt.
- [ ] 🖐️ Sletting (skriver til prod): «Slett» spør om bekreftelse, raden forsvinner etter `router.refresh()`, og bildet er borte fra `identify-history`-bøtta.
- [ ] Bildene ligger i en PRIVAT bøtte: en signert URL fra lista skal virke, men samme sti uten signatur skal gi 400/403.
- [ ] `GET /api/me/export` har med `identifications` og `_manifest.imageLinksComplete`, og `schemaVersion` er 7 (tallet testen i `src/app/api/me/export/__tests__/route.test.ts` låser — øker hver gang eksporten får et nytt datasett).

## 3. Prediksjon / «Lovende områder»

- [ ] `GET /api/prediction?lat=59.91&lon=10.75` svarer 200 med gyldig JSON (eller dokumentert 502 hvis ingen værkilde — da er det en infra-sak, ikke en kodefeil).
- [ ] `GET /api/prediction?lat=57.71&lon=11.97` (svensk punkt) svarer 200 (SMHI-ruting fungerer).
- [ ] `GET /api/mushroom-day?lat=59.91&lon=10.75` svarer 200 med score + tittel.
- [ ] Forsiden viser «Soppforhold i dag»-måleren uten å be om posisjon uoppfordret.

## 4. Kalender (`/calendar`)

- [ ] `/calendar` laster og viser sesong-innhold («i sesong»-seksjon).
- [ ] 12-måneders-rutenettet rendrer.
- [ ] Åpner **ikke** en uoppfordret posisjons-prompt (skal være stille opt-in).
- [ ] Giftige og dødelige arter står i sin egen røde blokk (april–november), aldri under den nøytrale overskriften og aldri med topp-merke (`smoke.e2e.ts`).
- [ ] Utenfor september–oktober sier siden hva som kommer neste (`smoke.e2e.ts`).

## 5. Forum

- [ ] `/forum` laster og viser feed (eller tom-tilstand) — ingen 500 (RLS-rekursjon-regresjon).
- [ ] En enkelt tråd `/forum/[id]` åpner og viser innlegget (Next 16 `params`-regresjon).
- [ ] `/forum/new` laster skjema (innlogget).
- [ ] 🖐️ Manuell (skriver til prod): poste innlegg + laste opp bilde fungerer ende-til-ende.
- [ ] 🖐️ Manuell (skriver til prod, når migrasjon 076 er kjørt): en kommentar og en like fra en annen konto endrer tallene på noen andres innlegg, og et spørsmål som har fått svar, forsvinner fra «Ubesvarte». Før 076 flyttet bare forfatterens egne kommentarer og likes tallene.

### 5b. Moderasjon (`/forum/moderation`)

Ingen av disse kjøres av `npm run qa`: de skriver til prod eller krever moderator-rolle. Reglene står i `docs/forum-trust.md`.

- [ ] 🖐️ Utlogget: `/forum/moderation` sender til `/auth/login` (gating på sidenivå — virker også lokalt). Innlogget uten rolle: «Du har ikke tilgang», ingen konsoll.
- [ ] 🖐️ Meld et testinnlegg fra en annen konto → rapporten står under «Åpne» med utdrag, forfatter og årsak på riktig språk — og uten noe om hvem som meldte.
- [ ] 🖐️ «Skjul innhold»: innlegget er borte fra `/forum` for alle, rapporten er løst, og `/admin/audit-log` har en rad `moderation.hide`. «Vis igjen» under «Alle» får det tilbake, og rapporten er åpen igjen.
- [ ] 🖐️ `/admin`: kortet «Rapporter — venter» viser samme tall som banneret i konsollen (ny *og* gjennomgått teller) og er en lenke dit; linja om skjulte innlegg har også lenke.
- [ ] 🖐️ Med en åpen rapport: dagsrapporten (morgen) og kveldsvarselet (18:00 UTC) har «⚠️ N åpne rapporter — frist i dag/i morgen kl. …» i emnelinja og øverst, med lenke til konsollen. Klokkeslettet er norsk tid og stemmer med meldingstidspunktet + 24 t. «Behandle den nå» når neste e-post ville kommet for sent, ellers «før det»; rødt og «over døgnfristen» når den eldste er over 24 t.
- [ ] 🖐️ Uten åpne rapporter: bare raden «Åpne rapporter i forumet 0» i dagsrapporten, og **ingen** e-post om kvelden.

## 6. Innlogging + glemt passord

- [ ] `/auth/login` har e-post- + passordfelt og «Logg inn»-knapp.
- [ ] «Glemt passord?»-lenken går til `/auth/forgot`.
- [ ] `/auth/forgot` har e-postfelt + «Send lenke»-knapp.
- [ ] `/auth/register` laster med skjemafelt.
- [ ] **Innlogging fungerer**: testbruker logger inn via skjemaet og lander innlogget (ikke feilmelding).
- [ ] Beskyttede sider redirecter uinnlogget til `/auth/login`: `/profile`, `/map`, `/mine-steder`, `/forum/new`, `/admin`. Sjekk **adressen nettleseren ender på**, ikke HTTP-statusen: `/map`, `/mine-steder`, `/profile` og `/identifiseringer` har `loading.tsx`, så lokalt (der middleware ikke kjører) svarer siden 200 med skjelettet og sender deg videre fra klienten. `curl -I` viser da 200 selv om gatingen virker.
- [ ] 🖐️ Glemt passord fra **appen** (skriver til prod, sender e-post): be om lenke i iOS-appen, åpne e-posten — lenka går til `/auth/reset?token_hash=…` og virker i Safari selv om den ble bestilt i appen. Nytt passord lagres, og en konto laget i appen får beskjed om å åpne appen igjen. (Supabases egen lenke var en PKCE-kode som bare virker i nettleseren som ba om den.)

## 7. Betaling-gating (web vs native)

App Store-regel 3.1.1: native-appen får **ikke** vise ekstern betaling/Google-login.

- [ ] **Web** `/pricing`: Sesongpass **først** («Anbefalt», **249** kr, «Tilsvarer ca. 21 kr per måned», fornyelsesdato), så Premium (**99**), så Gratis — med «Velg …»-kjøpsknapper. `?plan=season_pass` gir passet fokus.
- [ ] **Innlogget, 390×844** (`sesongpass.e2e.ts`): prøvearket leder med «Prøv Sesongpass gratis i 7 dager» og sier BEGGE datoene («Fra ca. <i dag + 7 d> koster passet 249 kr per år, og det gjelder da til <den + 1 år>»), «Heller måned for måned? 99 kr per måned» som synlig alternativ. Gratisuka loves på en plan bare når butikken gir den på akkurat den planen (nett: Stripe på begge, og bare når `/api/billing/status` svarer `kanFaaProve` — samme sjekker som checkout; app: RevenueCat per produkt). Fornyelseslinja står bare på kort som kan kjøpes (aldri på «Aktiv plan» — statuskortet har den ekte datoen), og `?plan=premium` ringer bare Premium.
- [ ] **Web** `/auth/login`: viser «Fortsett med Google».
- [ ] **Native (simulert)** `/pricing`: kjøpsknappene er **skjult** (ingen «Velg Premium»/«Velg Sesongpass»).
- [ ] **Native (simulert)** `/auth/login`: «Fortsett med Google» er **skjult**.
- [ ] 🖐️ Manuell: bekreft i ekte iOS-app før hver App Store-innsending.
- [ ] 🖐️ I iOS-appen er fristen for å avslutte prøven 24 timer før den slutter, aldri prøveslutt (Apple trekker i løpet av det siste døgnet før): prøvearkets vilkår sier «senest 24 timer før prøveperioden er over», fornyelseslinja på kortet på `/pricing` «avslutt senest 24 timer før den slutter» («Avslutt senest 24 timer før prøven slutter» når appen ikke kjenner prøvens lengde). På nett er prøveslutt fristen: arket sier «om du ikke avslutter før <dato>», kortet «Første belastning <dato>».
- [ ] 🖐️ Løftet om lovende områder følger måneden (innlogget gratisbruker, nett): fra november til juni sier prøvearket (alle varianter unntatt «begrenset», som kartet viser etter et gratissøk på ⭐ Lovende) ikke «Alle 12 lovende områder», men at forholdene ofte er for svake til at kartet kaller noe lovende, og Premium-punktet på forsiden og `/pricing` slutter på «når forholdene tillater det». Juli–oktober står «Alle 12». «Begrenset» sier hele året bare grenser, aldri et antall: tittelen er planens (som de andre variantene, ingen «Se alle 12 …»), og teksten «Gratis viser opptil 3 lovende områder. Sesongpass og Premium viser opptil 12 …»; banneret over kartet og knappen under sier «Premium viser opptil 12» / «Se opptil 12 …», og popupen på hvert område «… og opptil 12 områder», uten løfte om gratisuke (popupen kan ikke spørre butikken; knappen under kartet gjør det).

## 8. Artssider

- [ ] `/species` laster og viser artskort med lenker.
- [ ] En art `/species/[id]` åpner og viser detaljer (navn + fare-/spiselighet-info).
- [ ] Artsbilder lastes (ikke ødelagte `<img>`).
- [ ] Søket finner en art på det svenske navnet og i flertall («kantareller», «morkler») (`smoke.e2e.ts`).
- [ ] `/species` og `/calendar` har egen tittel og kanonisk adresse; en artsside beholder sin egen tittel med «— Mycelet» (`smoke.e2e.ts`).
- [ ] **Forvekslingstreneren** `/species/forvekslinger` laster utlogget og viser sikkerhetslinja, Giftinformasjonen og enten «Start en runde» eller tom-tilstanden. Én runde: to kort med «Foto: …» under hvert bilde før svaret, og «Slik skiller du dem» pluss lenker til begge artssidene etter (`smoke.e2e.ts`, bare lesing — fremdriften ligger i nettleseren).
- [ ] 🖐️ Treneren på svensk: navn og merker på svensk, ingen norsk skilletekst — bare en merknad om at teksten står på artssiden. Lange navn («Snøballsjampinjong») brytes, kuttes ikke, på 360 px.
- [ ] 🖐️ En art som bare finnes som en annens forveksling (f.eks. grønn fluesopp): forvekslingskortene vises fra den andre siden, uten faregrad på kortet. En matsopp uten egne rader (piggsopp) har forbeholdet over kortene.
- [ ] 🖐️ En artsside for en matsopp (f.eks. kantarell): metabeskrivelsen i sidekilden og i delingskortet er den nøytrale setningen — navn, latinsk navn og sesong — og sier aldri «spiselig» eller «matsopp». Sesongkurven er grå, lik for matsopp og giftsopp.

### 8b. Områdesidene og soppvarselet (`/soppforhold/[omrade]`)

- [ ] Norsk område: `<article lang="nb">`, `og:locale` `nb_NO`, og varselboksen er selve påmeldingsskjemaet med riktig område og `retur` (`smoke.e2e.ts`). Svensk område sier selv at innholdet er svensk (`sv_SE`).
- [ ] **Skjemaet sendes aldri inn av en test.** Påmeldingen skriver til prod og sender e-post; testene leser bare feltene.
- [ ] `/api/soppvarsel/av` og `/api/soppvarsel/bekreft`: GET uten navigering gir en side med én knapp og ingen omdirigering, HEAD svarer 200 uten å gjøre noe (`public-api.e2e.ts`).
- [ ] 🖐️ Manuell (skriver til prod, sender e-post): meld deg på fra en områdeside med en egen testadresse, bekreft fra e-posten i en vanlig nettleser, og meld av fra lenka i neste varsel. Kvitteringen lander på samme områdeside (`?status=…#varsel`) på sidens språk.

### 8c. Egne funn på `/mine-steder`

Alt her skriver til prod — kjøres for hånd med testbrukeren, aldri i `authed`-prosjektet. Automatisert er bare at siden laster innlogget (`authed-flows.e2e.ts`).

- [ ] 🖐️ Et stedskort åpnes og viser funnene sine. «Endre deling» tilbyr omtrentlig, sone og privat — aldri det eksakte punktet. Etter en endring er omtrentlig grået ut med tidspunktet det kan velges igjen (24 t), mens privat alltid går.
- [ ] 🖐️ «Sone-funn» tilbys ikke for et funn som ikke alt er sone, så lenge migrasjon 075 ikke er bekreftet kjørt; for et sone-funn står rutestørrelsen som tekst, ikke som glidebryter.
- [ ] 🖐️ Rette notatet lagres og vises etterpå; et notat som ikke er endret, gir ingen lagring.
- [ ] 🖐️ Slette fra kortet (to trinn) → funnet havner under «Nylig slettet» med antall dager igjen; «Gjenopprett» får det tilbake på samme sted på kartet.
- [ ] 🖐️ Alt over på både norsk og svensk; feilmeldingene er på leserens språk.

## 9. Datakilder + helse

- [ ] `/datakilder` laster og krediterer kildene (overskrift «Datakilder»).
- [ ] `GET /api/health` svarer 200 `{status:'ok'}` (eller 503 `degraded` — rapporter hvilken sjekk feilet).
- [ ] `GET /api/health?fast=1` svarer raskt 200 (uten DB-sjekk).

---

## Testbruker

Mest av appen er innlogging-gated (`PROTECTED_PATHS` i `src/lib/supabase/middleware.ts`).
Loopen trenger derfor en dedikert QA-bruker.

- **Opprett (én gang):** `npm run qa:setup`
  - Lager (idempotent) en bekreftet bruker via Supabase admin-klienten (bruker `SUPABASE_SERVICE_ROLE_KEY` fra `.env.local`).
  - Skriver `QA_TEST_EMAIL` + `QA_TEST_PASSWORD` til `.env.local` automatisk (hopper over hvis de finnes).
- **Brukeren** er en helt vanlig gratis-konto. Skrive-tester er **av** som standard, så loopen er ikke-destruktiv mot prod-databasen.
- **Slette:** kjør `npm run qa:setup -- --delete` hvis du noen gang vil rydde den bort.

## Loop-oppsett

Loopen kjøres via `/loop`-ferdigheten og lar **Claude** lese resultatet, diagnostisere
og foreslå fiks. Den **deployer aldri** selv.

Lim dette i Claude Code for å starte den (selv-tempo, ingen fast intervall):

```
/loop Kjør full produktevaluering for Mycelet: `npm run qa`.
Les docs/qa-sjekkliste.md som fasit. Hvis noe feiler: diagnostiser rotårsaken,
foreslå en konkret fiks og vent på min godkjenning. ALDRI deploy til live-appen.
Hvis alt er grønt: rapporter kort «alt grønt» og avslutt.
```

Eller for et fast intervall (f.eks. hver morgen mens du jobber): `/loop 1h <samme prompt>`.

## Recent-feedback sweep (fast vane)

Hver gang eieren melder en bug:
1. Fiks den meldte buggen.
2. **Auditér hele appen for søsken** av samme bug-klasse (samme antakelse/mønster andre steder).
3. Fiks søsknene + verifiser med `npm run build` (rydd iCloud-dupefiler først — se under).
4. Deploy **først når eieren sier ok**.

Eksempel som beviste verdien (2026-06-20): svensk-kart-bug → søsken var Göteborg-region-ruting-bug. Begge var Norge-sentriske antakelser.

## Gotchas

- **iCloud-dupefiler** gir falske `tsc`-feil. Rydd før verifisering:
  `find .next \( -name "* 2.ts" -o -name "* 2.tsx" -o -name "* 2.d.ts" \) -delete`
- `npm run qa` starter dev-serveren automatisk hvis den ikke kjører (og gjenbruker en som allerede kjører).
- Authed-tester **hoppes over** hvis testbrukeren ikke er satt opp ennå (kjør `npm run qa:setup`).
- Dev-serveren bruker prod-Supabase (ingen staging) → hold authed-tester **lesende**. Skrive-flyt er manuelle (🖐️).
