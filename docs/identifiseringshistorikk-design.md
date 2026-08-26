# Identifiseringshistorikk → «lagre som funn»

> **Status: GODKJENT OG BYGGET (2026-08-26).** Alle sju beslutningene under er
> låst som beskrevet, med bildestørrelse valgt for **Supabase Free**.
> Gjenstår før det virker i produksjon: **migrasjon 055 må kjøres i
> Supabase-dashboardet** (founder-oppgave), og deploy må godkjennes.
> Kilde til hvorfor: konkurranseanalysen (Artsorakel-seksjonen). Artsorakel-brukerne
> ber eksplisitt om «lagring av funn / mine arter med bilde og koordinater» — appen
> deres har hverken kart, funnlagring eller posisjon. Mycelet har alt sammen, men
> AI-resultatet dør i det brukeren lukker fanen: det lever kun i `sessionStorage`.

## 0. Hva som faktisk avgjøres her

| # | Beslutning | Min anbefaling |
|---|------------|----------------|
| 1 | Historikk i egen tabell, eller utvide `ai_identifications`? | **Egen tabell.** Se § 2 — dette er den viktigste linja i hele dokumentet. |
| 2 | Lagrer historikken bildet, eller bare metadata? | **Bildet** (ett bilde per identifisering), i en **privat** bøtte. |
| 3 | Hvilken bildestørrelse? | Avhenger av Supabase-planen — **se § 4, dette er det eneste spørsmålet jeg trenger svar på fra deg.** |
| 4 | Eksakt eller grovkornet posisjon? | **Eksakt**, eier-låst, i eksporten, med retensjon. Samme regel som `/mine-steder`. |
| 5 | Hvor lenge beholdes historikken? | **12 måneder**, så auto-slett. Det du vil beholde, lagrer du som funn. |
| 6 | Gratis eller premium? | **Gratis.** Dette er brukerens egne data — samme begrunnelse som GPX-eksporten. |
| 7 | «Lagre som funn» — ny knapp, eller tilbake til resultatsiden? | **Tilbake til resultatsiden.** Se § 5 — dette er sikkerhetskjernen. |

---

## 1. Dagens tilstand

- AI-resultatet lever kun i `sessionStorage['identifyResult']` (`src/app/identify/page.tsx:150`).
  Lukker du fanen, er identifiseringen borte for alltid.
- `ai_identifications` (migrasjon 020) lagrer **kun** `user_id` + `created_at`. Den er en
  ren kvoteteller: RLS er på med **null policyer**, så bare tjenesterollen ser den —
  med vilje, slik at ingen kan slette rader for å nullstille sin egen dagskvote.
  Derfor er den spesialbehandlet i `/api/me/export` (leses med admin-klienten).
- Bildet lastes opp til Storage **kun** hvis brukeren trykker «Lagre som funn».
  Identifiseringer som ikke blir funn, koster i dag null lagring.

## 2. Grunnprinsippet: historikk og kvoteteller må ALDRI være samme tabell

Dette er den ene fella i hele oppgaven, og den er lett å gå i.

Historikken må kunne **slettes av brukeren** (både fordi det er åpenbar UX, og fordi
GDPR art. 17 gjør sletting til en rettighet). Kvotetelleren må **ikke** kunne slettes
av brukeren — hele poenget med migrasjon 020 var at gratisbrukere ikke skal kunne
nullstille «5 AI-identifiseringer per døgn» selv.

Legger vi historikkfeltene på `ai_identifications` og gir eier-RLS med DELETE, har vi
i samme slengen gitt bort ubegrenset AI-bruk på vår regning hos Kindwise. Legger vi
historikken der uten DELETE, har brukeren en historikk de ikke får slette.

**Løsning: to tabeller, helt frakoblet.**

- `ai_identifications` — røres ikke. Regnskapsraden (kvote + kostnad). Tjenesterolle.
- `identifications` — NY. Brukerens innhold. Eier-RLS, full sletterett.

Ett Kindwise-kall skriver én rad i hver. Sletter brukeren historikkraden, står
kvoteraden igjen — den inneholder bare bruker-id og et tidspunkt, og bør uansett få
en kort retensjon (se § 6.4).

## 3. Skjema — migrasjon `055_identification_history.sql`

```sql
CREATE TABLE IF NOT EXISTS identifications (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Hva AI-en sa (toppforslaget løftet ut for lista + sortering)
  top_suggestion_name    TEXT NOT NULL,                 -- latinsk navn fra Kindwise
  top_species_id         INT REFERENCES mushroom_species(id) ON DELETE SET NULL,
  top_probability        SMALLINT,                      -- 0-100
  suggestions            JSONB NOT NULL,                -- hele topp-3, som ruta returnerte
  safety_data_incomplete BOOLEAN NOT NULL DEFAULT FALSE,

  -- Hvor (eksakt, eier-låst — se § 4.3)
  latitude               DOUBLE PRECISION,
  longitude              DOUBLE PRECISION,

  -- Bilde
  image_path             TEXT,      -- sti i den PRIVATE bøtta, ikke en offentlig URL
  image_count            SMALLINT NOT NULL DEFAULT 1,   -- hvor mange bilder som ble analysert

  -- Kobling til funn
  finding_id             UUID REFERENCES findings(id) ON DELETE SET NULL,
  saved_at               TIMESTAMPTZ
);

CREATE INDEX idx_identifications_user_time ON identifications (user_id, created_at DESC);
```

**Hvorfor `suggestions` lagres i sin helhet, selv om vi beriker på nytt ved lesing:**
resultatsiden trenger `similarImages` (Kindwise-CDN-URLer) og forslagsrekkefølgen for å
kunne rendres identisk fra historikken. Radstørrelse blir 2–6 KB — neglisjerbart mot bildet.

**Hvorfor `finding_id` er `ON DELETE SET NULL` og ikke CASCADE:** sletter brukeren funnet,
skal ikke identifiseringen forsvinne med det. Raden blir da bare «ikke lagret» igjen, og
kan lagres på nytt. Det er riktig oppførsel, ikke et hull.

**Hvorfor ikke `is_zone_finding` / `visibility` her:** historikkraden er alltid privat.
Delingsnivået velges først i det den blir et funn — og skal velges der, hver gang (§ 5).

## 4. Bilder, kostnad og retensjon

### 4.1 Lagrer vi bildet i det hele tatt? Ja.

En historikkliste uten ditt eget bilde er nesten verdiløs: fire kantarell-oppføringer fra
samme helg er ikke til å skille fra hverandre. Det er dessuten nøyaktig dette
Artsorakel-brukerne klager på («bilde og koordinater»).

Vi lagrer **ett** bilde per identifisering — bilde 1 (oversikt/hatt). De to andre
(underside, stilk) er sikkerhetskritiske i selve identifiseringsøyeblikket, men ikke for
gjenkjenning i en liste, og dagens lagre-flyt bruker allerede bare bilde 1.
`image_count` lagres likevel, så kortet ærlig kan si «3 bilder ble analysert».

### 4.2 Hva det koster — og hvorfor 640 px

Estimat per bilde (soppfoto, JPEG):

| Størrelse | Ca. filstørrelse | 1 000 identifiseringer/mnd | Steady state ved 12 mnd retensjon | Rom innenfor 1 GB |
|-----------|------------------|----------------------------|------------------------------------|-------------------|
| 1500 px q0,85 (= dagens funnfoto) | ~450 KB | 0,45 GB/mnd | ~5,4 GB | ~2 200 bilder |
| 1024 px q0,80 | ~180 KB | 0,18 GB/mnd | ~2,2 GB | ~5 500 bilder |
| **640 px q0,72 ← valgt** | **~60 KB** | **0,06 GB/mnd** | **~0,7 GB** | **~17 000 bilder** |

Supabase-priser, verifisert mot supabase.com/pricing 2026-08-26:

| | Free | Pro ($25/mnd) |
|---|---|---|
| Fillagring | **1 GB** | 100 GB, deretter $0,0213/GB |
| Egress | 5 GB | 250 GB, deretter $0,09/GB |
| Databasestørrelse | 500 MB | 8 GB |
| Sikkerhetskopier | **Ingen** | Daglig, 7 dagers historikk |
| Databaselogger | 1 dag | 7 dager |

Prosjektet står på **Free**. Derfor 640 px: 1 GB deles med `finding-images` og
`forum-images`, og 1500 px-varianten ville spist hele taket etter ~2 200
identifiseringer. 640 px gir rundt 17 000 og er fortsatt et fullt brukbart
bilde i alle appens visninger.

Prisen for valget er ærlig og synlig i UI-et: lagrer du et funn **med én gang**,
får funnet det fulle bildet fra økta. Lagrer du det **senere fra historikken**,
er det denne mindre kopien som følger med.

Tallene bor i `src/lib/identifications/config.ts` (`HISTORY_IMAGE_MAX_DIM`,
`HISTORY_IMAGE_QUALITY`). Går prosjektet over til Pro, er det de to som skal opp
— ingenting annet i designet endrer seg.

> **Sidenotat, ikke en del av denne funksjonen:** det sterkeste argumentet for
> Pro er ikke lagringsplass, det er at Free **ikke har sikkerhetskopier i det
> hele tatt** — for en live app med betalende kunder, én database, ingen
> staging, og migrasjoner som limes inn for hånd. Se samtalen 2026-08-26.

### 4.3 Posisjon: eksakt, ikke grovkornet

Historikkraden er en **funn-kladd**. Grovkorner vi posisjonen her, får et funn som
lagres fra historikken en dårligere posisjon enn et som lagres med én gang — og
presisjonen på egne steder er selve kjernen i «Mine steder».

Eksakt posisjon er også konsistent med resten av appen: `/mine-steder` viser brukerens
egne eksakte koordinater i dag. Beskyttelsen ligger i at raden er eier-låst og **aldri**
er med i noe view, noen RPC eller noe offentlig lag. `display_location`-triggeren gjelder
ikke fordi ingenting her noen gang vises for andre.

Forskjellen fra `spot_feedback`-problemet (den mest presise dataen vi lagrer, og den var
lenge usynlig for brukeren og manglet i eksporten) er nettopp at denne er **synlig,
slettbar og eksportert** fra dag én.

### 4.4 Privat bøtte + signerte URL-er

Ny bøtte `identify-history`, **`public = false`**.

`finding-images` og `forum-images` er offentlige, og `src/lib/storage/upload-path.ts`
dokumenterer allerede at det er en kjent svakhet vi ikke kan rulle tilbake uten å bryte
lagrede URL-er. Her starter vi på nytt — da gjør vi det riktig med én gang:

- `storage.objects`-policyer: SELECT/INSERT/UPDATE/DELETE kun når
  `bucket_id = 'identify-history' AND (storage.foldername(name))[1] = auth.uid()::text`.
- Lesing skjer via `createSignedUrl` (60 min) fra serverkomponenten.
- CSP trenger ingen endring: `img-src` har allerede `https://*.supabase.co`.
- Sti: `${user_id}/${identification_id}.jpg` — brukermappa er det
  `deleteUserStorageObjects` nøkler på ved kontosletting.

### 4.5 Retensjon: 12 måneder

Historikken er et **mellomlager**, ikke et arkiv. Det du vil beholde, lagrer du som funn —
og funn beholdes så lenge kontoen finnes. 12 måneder gir deg «hva fant jeg i fjor på
denne tida» én sesong tilbake, og setter et hardt tak på lagringskostnaden.

Ny cron `/api/cron/purge-identifications` (daglig, `vercel.json`): sletter først
Storage-objektet, så raden, for alt eldre enn 12 måneder. Rekkefølgen er ikke tilfeldig —
sletter vi raden først og filsletting feiler, står bildet igjen uten at noe peker på det.

## 5. Sikkerhet: «lagre som funn» gjenbruker resultatsiden 100 %

**Dette er den viktigste designbeslutningen etter § 2.**

Bekreftelses-porten på resultatsiden er ikke bare avkrysningsboksen. Boksen får sin
mening av det som står rundt den: `SafetyWarning`, `LookAlikeCheck` (den farlige
tvillingen), `ReferencePhotos`, «ikke en spiselighetsgaranti»-banneret og artsvelgeren.
En «Lagre som funn»-knapp rett i historikklista — selv med avkrysningsboks — ville vært
en **svekkelse** av porten, fordi bekreftelsen da gis uten at forvekslingsadvarselen er
vist. Det ville også vært en ny, parallell lagre-kodesti som kunne drive fra hverandre.

**Derfor: knappen i historikklista er en lenke, ikke en lagring.**

```
/identifiseringer  →  «Lagre som funn»  →  /identify/result?id=<uuid>
```

Resultatsiden får én ny ting: hvis `?id=` finnes, hydreres den fra databasen i stedet
for `sessionStorage`. Resten av siden — porten, artsvelgeren, delingsnivå-velgeren,
forvekslingssjekken — er nøyaktig den samme koden.

Konsekvenser, med vilje:

- `src/app/identify/__tests__/lagre-porten.test.ts` skal fortsatt være grønn **uten at
  én linje i den endres**. Designet legger ikke til noe `setAcknowledged`-kallsted
  (testen krever nøyaktig 1) og ikke noe nytt `handleSave`-kallsted (testen krever
  nøyaktig 2). Blir den testen rød, er designet brutt.
- Bekreftelsen huskes aldri. Lagrer du samme identifisering fra historikken, krysser
  du av på nytt. Det er poenget.
- Delingsnivå-velgeren er synlig, som i dag, og starter på husket lokalt valg.

⚠️ **Navnefelle:** API-ruta må hete `/api/identifications/[id]` — **ikke**
`/api/identify/history`. Porttesten hevder at resultatsidens kildekode ikke inneholder
strengen `/api/identify` (GPS-redningen skal aldri brenne en ny AI-kvoteenhet).
`/api/identifications` inneholder ikke den strengen; `/api/identify/history` gjør det,
og ville slått ut porttesten som falsk positiv.

### 5.1 Ferske sikkerhetsdata, ikke frosne

Ved hydrering fra historikken kjører `/api/identifications/[id]` **berikelsen på nytt**
mot `mushroom_species` og `look_alikes` for de lagrede arts-id-ene, i stedet for å stole
på JSON-en fra den gangen. To grunner, begge harde:

1. **Sikkerhet.** Vi kuraterer forvekslingsarter løpende (migrasjonene 048/049/050 la til
   data på 14 matsopper). En rad fra i fjor kunne ellers vist «ingen farlige
   forvekslingsarter» for en art vi siden har ført inn en dødelig tvilling på.
2. **Språk.** Artsnavn kommer fra databasen, ikke fra meldingskatalogen. Frossen JSON
   ville servert norske navn til en svensk bruker — nøyaktig fella CLAUDE.md advarer mot.
   `getSpeciesDisplayName(species, locale)` må kjøre ved lesing.

`safetyDataIncomplete` settes på nytt av samme berikelse. Feiler den, sier siden fra —
akkurat som i dag.

## 6. GDPR

### 6.1 Art. 15 — eksport

`/api/me/export`: nytt datasett `identifications`, lest med **øktklienten** (i motsetning
til `ai_identifications`, som må gå via admin fordi den ikke har policyer). Bump
`schemaVersion` 3 → 4.

Bildene må også være med, ellers er eksporten ufullstendig for nettopp den datatypen som
er mest personlig. Funn-bilder er nåbare i dag fordi `finding-images` er offentlig; vår
bøtte er privat, så en bar sti er ikke et svar. Hver rad får derfor et
`imageSignedUrl` (7 dagers gyldighet) ved siden av `image_path`, og `_notes` sier
eksplisitt at lenkene utløper.

Fail-closed-regelen gjelder som for alle andre: feiler spørringen, får brukeren en 500
og ingen fil — aldri en delvis fil som utgir seg for å være komplett.
`src/app/api/me/export/__tests__/route.test.ts` utvides: `identifications` inn i
`queriedWithSession`-listen og i «feiler lukket»-tabellen.

### 6.2 Art. 17 — sletting

- **Rader:** `ON DELETE CASCADE` mot `auth.users` tar dem i steg 2 av `/api/me/delete`.
  Ingen anonymiserings-unntak — dette er rene persondata uten forskningsverdi
  (i motsetning til negative observasjoner).
- **Bilder:** legg `'identify-history'` til `USER_IMAGE_BUCKETS` i
  `src/lib/storage/delete-user-objects.ts`. Det er hele jobben — steg 1c i slette-ruta
  rydder Storage før auth-brukeren fjernes, og funksjonen er idempotent.
- **Kvittering:** ny teller `identifications` i `counts`.
- **Enkeltrad:** `DELETE /api/identifications/[id]` — sletter Storage-objektet **først**,
  så raden. Feiler filslettingen, avbryter vi og sier fra, i stedet for å slette raden og
  etterlate bildet. Samme fail-closed-holdning som resten av kontoflaten.

### 6.3 Tekstene som må oppdateres

- `/personvern` **§ 5 (lagringstid)**: ny linje «AI-identifiseringer: historikken beholdes
  i 12 måneder, deretter slettes rad og bilde automatisk. Du kan slette enkeltoppføringer
  når som helst.» — **både `nb` og `sv`**.
- `/personvern` `collectImagesDesc`: står i dag «Bilder lagres også på din profil for
  funn-historikken din». Må utvides til å si at bildet lagres i identifiseringshistorikken
  **også når du ikke lagrer den som funn**. Det er en reell utvidelse av hva vi lagrer,
  og den kan ikke skje stille.
- `docs/retention-policy.md`: ny rad i TL;DR-tabellen.
- Behandlingsgrunnlag: art. 6(1)(b), avtale — dette er en kjernefunksjon i tjenesten,
  ikke samtykkebasert. Ingen ny grunnlagsdiskusjon.

### 6.4 Bonus mens vi er inne: retensjon på `ai_identifications`

Migrasjon 020 foreslår det selv i en kommentar («a retention job can DELETE rows older
than ~2 days — only the last 24h is ever read»). Samme cron kan ta den. Reduserer
GDPR-flaten gratis. Valgfritt, men billig.

## 7. RLS og rettigheter

```sql
ALTER TABLE identifications ENABLE ROW LEVEL SECURITY;
-- SELECT / INSERT / UPDATE / DELETE: auth.uid() = user_id (WITH CHECK på skriv,
-- så ingen kan omadressere en rad til en annen bruker)
REVOKE ALL ON identifications FROM anon;
GRANT SELECT, INSERT, DELETE ON identifications TO authenticated;
GRANT UPDATE (finding_id, saved_at, image_path) ON identifications TO authenticated;
```

Kolonne-rettigheten på UPDATE er den presise varianten: RLS kan ikke begrense hvilke
kolonner som skrives, så uten den kunne en bruker skrive om `top_suggestion_name` på sin
egen rad. Harmløst i praksis (ingenting utleder sikkerhet fra historikken), men gratis å
gjøre riktig.

⚠️ **Kjent forbehold:** gjenopprettings-blokka etter `DROP SCHEMA public CASCADE`
(CLAUDE.md) gjør `GRANT ALL ON ALL TABLES`, som ville utvidet UPDATE tilbake til alle
kolonner. Skal noteres i migrasjonen slik at den som en gang må kjøre den blokka, vet det.

## 8. Skriveflyt og UI

### 8.1 Hvem skriver raden

1. **`/api/identify`** (server, øktklient) skriver historikkraden rett etter et vellykket
   Kindwise-kall — samme sted og samme «best effort, men logg synlig»-mønster som
   kvotetelleren. Ruta returnerer `identificationId` i svaret. At serveren skriver den,
   betyr at historikken ikke kan gå tapt fordi klienten kræsjet.
2. **Klienten** re-koder bilde 1 med `reencodeImageForUpload()` (finnes allerede) og
   laster det opp til `identify-history/${userId}/${identificationId}.jpg`, og setter
   `image_path`. Best effort: feiler det, får raden ingen miniatyr og lista viser en
   plassholder — identifiseringen er ikke tapt.
3. **Ved lagring som funn** settes `finding_id` + `saved_at`, og bildet flyttes/kopieres
   inn i `finding-images` (som må være offentlig — funn kan deles).

> Teknisk forbehold å verifisere ved bygging: `supabase-js` v2 støtter kopiering på tvers
> av bøtter (`copy(from, to, { destinationBucket })`) fra storage-js 2.7. Er den ikke
> tilgjengelig i den versjonen som faktisk installeres, er reserven en
> nedlast-og-last-opp på serveren ved lagring. Det skjer bare på lagre-stien, så
> kostnaden er liten uansett.

### 8.2 Siden

Ny side **`/identifiseringer`** — egen side, ikke en fane under `/mine-steder`.
Begrunnelse: «Mine steder» er gruppert etter *sted*, historikken er kronologisk etter
*hendelse*, og de fleste oppføringene har aldri blitt et sted. Å blande dem svekker begge.

- Serverkomponent, leser egne rader via RLS, minter signerte bilde-URL-er på serveren.
- Beskyttes **både** via `PROTECTED_PATHS` i `src/lib/supabase/middleware.ts` **og** en
  `redirect()` på sidenivå — middleware kjører ikke i Turbopack dev, så uten
  side-gatingen kan `npm run qa` ikke teste den lokalt (QA-gotcha-en i CLAUDE.md).
- Inngang fra tre steder: «Historikk»-lenke på `/identify`, ved siden av «Mine steder» på
  `/profile`, og en kryss-lenke fra `/mine-steder`.
- `robots.ts`: legges til i disallow-lista, som `/mine-steder`.

Per rad: miniatyr · artsnavn (løst på leserens språk) · spiselighetsmerke · dato ·
sannsynlighet · grov posisjon (3 desimaler, som `/mine-steder` gjør for navnløse steder).

Handlinger per rad:
- Ikke lagret + har posisjon → **«Lagre som funn»** (lenke til `/identify/result?id=…`).
- Ikke lagret + mangler posisjon → samme lenke; resultatsiden har allerede
  GPS-redningen, som er ærlig på at det er posisjonen der du **står nå**.
- Lagret → merke «Lagret som funn» + lenke til `/map?mine=1`.
- Alltid → **«Slett»** med bekreftelse.

Tom tilstand og feiltilstand må skilles — samme lærdom som `/mine-steder`: en
forbigående spørrefeil som rendres som «du har ingen identifiseringer ennå» leses som
at dataene er slettet.

### 8.3 i18n

Nytt namespace `Identifikasjonshistorikk` i `messages/nb.json` **og** `messages/sv.json`.
Alt av prosa som genereres serverside (feilsvar fra `/api/identifications/[id]`) må ta
`locale` eksplisitt — next-intl dekker ikke serverside-tekst.

## 9. Filer som endres

**Nytt**
- `supabase/migrations/055_identification_history.sql` (tabell + RLS + grants + bøtte + bøttepolicyer)
- `src/app/identifiseringer/page.tsx`
- `src/app/api/identifications/[id]/route.ts` (GET = hydrering med fersk berikelse, DELETE)
- `src/app/api/cron/purge-identifications/route.ts`
- Tester: RLS-/eier-invarianter, hydreringens ferske berikelse, sletterekkefølge (fil før rad)

**Endres**
- `src/app/api/identify/route.ts` — skriv historikkrad, returner `identificationId`
- `src/lib/hooks/useIdentify.ts` + `src/types/identify.ts` — bær `identificationId` videre
- `src/app/identify/page.tsx` — last opp historikkbildet
- `src/app/identify/result/page.tsx` — hydrer fra `?id=`; **porten røres ikke**
- `src/app/api/me/export/route.ts` (+ test) — nytt datasett, `schemaVersion` 4
- `src/app/api/me/delete/route.ts` — teller i kvitteringen
- `src/lib/storage/delete-user-objects.ts` — ny bøtte i `USER_IMAGE_BUCKETS`
- `src/lib/supabase/middleware.ts` — `PROTECTED_PATHS`
- `src/app/robots.ts`, `src/app/profile/page.tsx`, `src/app/mine-steder/page.tsx` — lenker
- `messages/nb.json`, `messages/sv.json` — nytt namespace + personvernstekst
- `vercel.json` — ny cron
- `docs/retention-policy.md`, `docs/qa-sjekkliste.md`

## 10. Status

Alt under er bygget, typesjekket, testet (1 687 tester grønne) og bygget med
`npm run build`.

| Steg | Status |
|------|--------|
| Migrasjon 055 skrevet | ✅ — **må kjøres i Supabase-dashboardet av eieren** |
| Skrivesti (rad + bilde) + `identificationId` fra `/api/identify` | ✅ |
| `/identifiseringer` med liste, sletting og lenker | ✅ |
| Hydrering av resultatsiden fra `?id=` med fersk sikkerhetsberikelse | ✅ |
| GDPR: eksport (schemaVersion 4 + signerte bilde-URL-er), sletting, personvernstekst | ✅ |
| Retensjonscron + `vercel.json` | ✅ |
| Tester som låser sikkerhetsinvariantene | ✅ |

**Rekkefølgen ved utrulling er ikke fri:** migrasjon 055 må være kjørt FØR koden
deployes. Uten tabellen svarer historikk-skrivingen med en feil (som svelges —
identifisering virker som før), men `/identifiseringer` ville vist tomt, og
GDPR-eksporten ville feilet lukket med 500 fordi datasettet ikke kan leses.
