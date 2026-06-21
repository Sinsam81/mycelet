# QA-sjekkliste — full produktevaluering

Dette er fasiten for Mycelets hovedautomatisering: **«full produktevaluering»**.
Hver kjøring driver alle kjerneflyt mot suksesskriteriene under og **rapporterer**
brudd (+ forslag til fiks for godkjenning). Den **deployer aldri** til live-appen.

- **Hvordan kjøre:** `npm run qa` (lokalt, mot `http://localhost:3000`)
- **Bare live-røyktest:** `npm run qa:prod` (kun lesing, trygg mot mycelet.com)
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
- [ ] Ingen ukjente JS-feil i konsollen ved kartlasting.
- [ ] 🖐️ Native: «Finn meg» fungerer i iOS-appen (Capacitor Geolocation, ikke `navigator.geolocation`).

## 2. AI-soppkjenner (`/identify`)

- [ ] `/identify` laster (innlogget) med opplastingsfelt/kamera-CTA.
- [ ] Sikkerhetsadvarsel vises (aldri spis basert på AI alene; lenke til soppkontroll).
- [ ] Ingen krasj når siden åpnes uten bilde.
- [ ] 🖐️ Manuell (kvote-/kostnadsavhengig): last opp ett kjent soppbilde → får forslag + forvekslings-sjekk (look-alike). Kjøres sjelden, ikke i hver loop (Kindwise-kreditter).

## 3. Prediksjon / «Lovende steder»

- [ ] `GET /api/prediction?lat=59.91&lon=10.75` svarer 200 med gyldig JSON (eller dokumentert 502 hvis ingen værkilde — da er det en infra-sak, ikke en kodefeil).
- [ ] `GET /api/prediction?lat=57.71&lon=11.97` (svensk punkt) svarer 200 (SMHI-ruting fungerer).
- [ ] `GET /api/mushroom-day?lat=59.91&lon=10.75` svarer 200 med score + tittel.
- [ ] Forsiden viser «Soppforhold i dag»-måleren uten å be om posisjon uoppfordret.

## 4. Kalender (`/calendar`)

- [ ] `/calendar` laster og viser sesong-innhold («i sesong»-seksjon).
- [ ] 12-måneders-rutenettet rendrer.
- [ ] Åpner **ikke** en uoppfordret posisjons-prompt (skal være stille opt-in).

## 5. Forum

- [ ] `/forum` laster og viser feed (eller tom-tilstand) — ingen 500 (RLS-rekursjon-regresjon).
- [ ] En enkelt tråd `/forum/[id]` åpner og viser innlegget (Next 16 `params`-regresjon).
- [ ] `/forum/new` laster skjema (innlogget).
- [ ] 🖐️ Manuell (skriver til prod): poste innlegg + laste opp bilde fungerer ende-til-ende.

## 6. Innlogging + glemt passord

- [ ] `/auth/login` har e-post- + passordfelt og «Logg inn»-knapp.
- [ ] «Glemt passord?»-lenken går til `/auth/forgot`.
- [ ] `/auth/forgot` har e-postfelt + «Send lenke»-knapp.
- [ ] `/auth/register` laster med skjemafelt.
- [ ] **Innlogging fungerer**: testbruker logger inn via skjemaet og lander innlogget (ikke feilmelding).
- [ ] Beskyttede sider redirecter uinnlogget til `/auth/login`: `/profile`, `/map`, `/mine-steder`, `/forum/new`, `/admin`.

## 7. Betaling-gating (web vs native)

App Store-regel 3.1.1: native-appen får **ikke** vise ekstern betaling/Google-login.

- [ ] **Web** `/pricing`: viser begge planer (Premium **79**, Sesongpass **249**) og «Velg …»-kjøpsknapper.
- [ ] **Web** `/auth/login`: viser «Fortsett med Google».
- [ ] **Native (simulert)** `/pricing`: kjøpsknappene er **skjult** (ingen «Velg Premium»/«Velg Sesongpass»).
- [ ] **Native (simulert)** `/auth/login`: «Fortsett med Google» er **skjult**.
- [ ] 🖐️ Manuell: bekreft i ekte iOS-app før hver App Store-innsending.

## 8. Artssider

- [ ] `/species` laster og viser artskort med lenker.
- [ ] En art `/species/[id]` åpner og viser detaljer (navn + fare-/spiselighet-info).
- [ ] Artsbilder lastes (ikke ødelagte `<img>`).

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

Hver gang Sindre melder en bug:
1. Fiks den meldte buggen.
2. **Auditér hele appen for søsken** av samme bug-klasse (samme antakelse/mønster andre steder).
3. Fiks søsknene + verifiser med `npm run build` (rydd iCloud-dupefiler først — se under).
4. Deploy **først når Sindre sier ok**.

Eksempel som beviste verdien (2026-06-20): svensk-kart-bug → søsken var Göteborg-region-ruting-bug. Begge var Norge-sentriske antakelser.

## Gotchas

- **iCloud-dupefiler** gir falske `tsc`-feil. Rydd før verifisering:
  `find .next \( -name "* 2.ts" -o -name "* 2.tsx" -o -name "* 2.d.ts" \) -delete`
- `npm run qa` starter dev-serveren automatisk hvis den ikke kjører (og gjenbruker en som allerede kjører).
- Authed-tester **hoppes over** hvis testbrukeren ikke er satt opp ennå (kjør `npm run qa:setup`).
- Dev-serveren bruker prod-Supabase (ingen staging) → hold authed-tester **lesende**. Skrive-flyt er manuelle (🖐️).
