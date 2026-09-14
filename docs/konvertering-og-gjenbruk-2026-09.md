# Konvertering og gjenbruk, september 2026

> Skrevet 14. september 2026 (kveld) på grunnlag av et anonymisert databaseuttrekk samme dag, kodegjennomgang og ti motprøvde påstander. Tallene er små. Les alt med nevner.

## 1. Hva tallene sier

| Steg | Tall | Andel av forrige | Forbehold |
|---|---|---|---|
| Installasjon (Apple Ads, 7 dager til 11.9) | 125 | | Bare annonseinstallasjoner; totalen ligger i App Store Connect og er ikke hentet |
| Konto | 40 per uke (78 i september) | 32 % | Ingenting måles mellom installasjon og konto |
| Bekreftet e-post | 66 av 78 | 85 % | Alle 12 ubekreftede fikk e-posten sendt (egen SMTP via Resend siden 31.8) |
| Logget inn | 59 av 78 | 89 % | 7 bekreftet uten å logge inn, alle før PR #260 |
| Første bruk (minst én bruksdag) | 45 av 78 | 76 % | 14 logget inn uten bruksdag, 8 av dem før målingen startet 5.9 |
| Kom tilbake (senere dag) | 15 av 45 | 33 % | 9 av 13 andre bruksdager er dagen etter; ingen etter dag 5 |
| Så tilbudsarket | 18 av 18 | 100 % | Vises til alle som når forsiden siden 11.9 kl. 22:16 |
| Så prissiden | 6 av 18 | 33 % | Teller alle prisbesøk, ikke bare arkets knapp. 95 %-intervall 16 til 56 % |
| Prøveperiode | 2 av 26 | 8 % | Basis er tiden etter at arket kom. 95 %-intervall 0,9 til 25 % |

Det som kan sies:

- Prøveraten kan ikke leses på to uker. Ved 80 nye registrerte er 5 til 6 prøver forventet uten å endre noe. Først 11 eller flere skiller seg fra i dag.
- Norge og Sverige kan ikke skilles: ingen konto har land eller språk, selv om annonsene kjører likt.
- Det som kan leses på 50 til 80 nye brukere: app-registrert til innlogget, kom tilbake, ark til pris, varsel slått på.
- Begge prøvene startet 3 til 4 minutter etter registrering. Stripe-prøven er alt satt til å avsluttes, så 19.9 gir ingen belastning. Bare App Store-prøven (21.9) gir et datapunkt, og det må leses i RevenueCat: dagsrapporten teller «trialing» som betalende, og en avbrutt Apple-prøve blir «active» i databasen.

## 2. Diagnosen

**Lekkasje 1: To av tre installasjoner lager aldri konto, og ingen vet hvorfor.**
Første skjerm i skallet er `/soppforhold`: hardkodet norsk, Norge først, uten brukerens sted, også for svenske «kantarell»-installasjoner (`public/landing/index.sv.html` sender dit). Alt butikken viser ligger bak konto (`/map` står i `PROTECTED_PATHS` i `src/lib/supabase/middleware.ts`). Skjemaet i `src/app/auth/register/page.tsx` krever brukernavn, visningsnavn, e-post, passord og vilkår; brukernavnet utledes uansett av `src/lib/auth/ensure-profile.ts`. Bruksdager skrives bare for innloggede, så alt før konto er mørkt.

**Lekkasje 2: 21 av 59 app-registrerte (36 %) fikk aldri en bruksdag.**
10 bekreftet aldri e-posten, 5 bekreftet uten å logge inn (alle før #260 lukket Safari-stien), 6 logget inn uten å få bruksdag. Porten sender brukeren ut av appen: Mail, Safari, tilbake, tast alt på nytt. Men sløyfen er ikke hele forklaringen. Nettkohortene i juli og august mistet like mye (30 og 38 %). 5 av 12 ubekreftede har en bekreftet søsterregistrering innen tre minutter (feilstavet adresse), og 6 av 12 er Outlook/Hotmail-adresser (søppelpost). Purremail til 16 mottakere 11.9 ga null.

**Lekkasje 3: 30 av 45 kom bare én gang, og appen gir ingen grunn til å komme igjen.**
Forsidekortet (`src/components/home/MushroomDayCard.tsx`) starter alltid på Oslo ved kald åpning: det spør `navigator.permissions.query`, som svarer «prompt» i skallet, og faller til `DEFAULT` 59.91/10.75 merket «Sør-Norge», på svensk «Södra Norge». Knappen «Min posisjon» virker, men må trykkes hver gang. Andre åpning er identisk med første. Den eneste serverdrevne grunnen til å komme tilbake er e-postvarselet, som 2 av 78 septemberkontoer har; det ligger nederst på `/profile`. Tilbudsarket (`src/components/billing/ProvGratisVedStart.tsx`) legger seg 800 ms etter forsiden oppå velkomstintroen (z-1100 over z-100), før kortet har data, og selger «ubegrenset AI» først (0 rader i `ai_identifications` på sju dager) og «alle 12 områder», det laget modellen er svakest på.

## 3. Formelen

En installasjon fra annonsen må se sitt eget område på sitt eget språk innen ett minutt, uten konto. Kontoen må lages uten å forlate appen, og ha et formål: «Følg Bergen, vi sier fra når det snur.» Forsiden må vise brukerens område ved hver åpning, ikke Oslo, og noe må være nytt fra dag til dag. Tilbudet beholdes på dag 0 (begge kjøpene kom da), men etter introen og etter første personlige tall, med det validerte først og butikkprisen synlig; arkets andre visning spares til dagen området faktisk snur. Betaling er første belastning etter påminnelse, aldri en overraskelse.

Prinsippet: Mycelet er bevist god på NÅR, per område. Hver skjerm som viser feil område, eller selger HVOR, lekker. Alt dømmes på mellomsteg med nevner, én endring om gangen, annonsene urørt til 28.9.

## 4. Tiltak

### Denne uka (til sammen under tre dager)

**1. Nullbyggsjekkene (eieren ca. 1 time, Claude 0,15 dag).** (a) App Store Connect, Analytics: installasjoner og økter per dag, nevneren alt annet mangler. (b) App Store Connect, Sesongpass årlig: finnes 7-dagers introtilbud i både Norge og Sverige? Bare månedlig er bevist. (c) Eieren trykker knappen i varsel-e-posten fra 8. eller 12.9 nå: settes `forste_apnet_at`, virker røret. (d) Stripe: slå på e-post før prøveslutt. (e) Bytt norsk skjermbilde 1 til områdesiden, så bilde 1 = tittel = første skjerm. *Måles:* skriftlige svar i strategiloggen 16.9.

**2. Tett målehullene (0,75 dag).** Utløser på «tilbud»-raden (`src/app/api/me/bruksdag/route.ts` blanker `omrade` for alt annet enn områdesider). Land/språk i `user_metadata` ved registrering (`src/lib/hooks/useAuth.ts`), kilde «web:direkte» på nett. Rad «prøve til første belastning» i `src/lib/rapport/dagsrapport.ts`. Anonym dagsteller for utlogget første skjerm i skallet (migrasjon 070, én setning i `/personvern`). *Hvorfor:* uten dette kan verken 3, 5 eller 6 leses. *Måles:* alle nye tilbud-rader har utløser, over 90 % av nye kontoer har land.

**3. Forsidekortet viser ditt område (1 dag).** Bytt posisjonsstien i `MushroomDayCard.tsx` og `src/components/calendar/SeasonNow.tsx` til Capacitor-laget (`getCurrentPositionOnce`, `Geolocation.checkPermissions`), som nesten alle kartbrukere alt har gitt tillatelse til. Husk område lokalt (`mycelet:omrade-v1`, skrevet av kartets GPS-treff). Svensk standard = Stockholm. Ny ren `nearestRegion(lat, lng)` over `PREDICTION_TILE_REGIONS` med avstandsetikett utenfor de 22 boksene. Skriv `omrade` = «egen» eller «standard» på hjem-raden. *Hvorfor:* den ene flaten som vises ved hver åpning, viser feil sted. *Måles:* kom tilbake blant app-registrerte etter 17.9 (basis 12 av 53, 23 %); andel hjem-rader med «egen».

**4. Arket etter introen, riktig rekkefølge, sant prøveløfte (1 dag).** `ProvGratisVedStart.tsx` venter på `ONBOARDING_DONE_EVENT` og på at kortet har data (som `CookieNotice`). Rekkefølge i `messages/nb.json` og `sv.json`: 12 områder med begrunnelse, offline-kart, AI sist. `MushroomMap.tsx` sender variant, så «3 av 12» bare brukes ved «begrenset». `IapOffer` i `src/lib/native/purchases.ts` får `harProve` fra Apples `introPrice`, så «7 dager gratis» bare vises når Apple gir den. Stripe: `customer.subscription.trial_will_end` sender e-post via Resend. *Måles:* ark til pris per utløser (basis 6 av 18), ingen refusjoner.

### De neste to ukene

**5. Konto uten å forlate appen (0,25 dag + 1 til 1,5 dag).** Først: fjern brukernavn og visningsnavn fra skjemaet. Deretter ett av to. (a) «Confirm email» av i Supabase. Forutsetninger fra motprøven: registreringssiden må bruke full sidelast som innloggingssiden (PR #191), fordi WKWebView synker øktkapslene asynkront; de 19 ubekreftede kontoene må håndteres først (med automatisk bekreftelse gir ny registrering på en ubekreftet adresse økt uten passordsjekk); varselkjøringen i `src/app/api/cron/soppvarsel/route.ts` (linje 400) må gates på `email_confirmed_at`; test flere kaldstarter på ekte telefon. (b) 6-sifret kode i appen (`verifyOtp`), beholder verifisert adresse, krever malbytte. *Måles:* ikke «minst én bruksdag» (blir mekanisk ~90 %), men kom tilbake blant de neste 50 til 60 app-registrerte: over 30 % betyr at porten kostet ekte brukere, under 22 % at de fleste var feiladresser.

**6. Ett trykk «Følg {område}» på forsiden (1 dag).** Kort under forsidekortet som kaller `PUT /api/me/soppvarsel` med området fra tiltak 3, kilde «hjem-ett-trykk», forhåndsvalg i `SoppvarselCard.tsx`. Samtykket forblir eksplisitt. Betinget av at 1c viser at røret virker. *Måles:* minst 16 av neste 80 nye kontoer slår på (fra 3 %); tell også app- og områdesidebesøk innen 7 dager etter varsel som aktivering.

**7. Første skjerm på riktig språk (0,5 dag nå).** `src/app/soppforhold/page.tsx` bruker `getUserLocale()`, svensk kopi, Sverige først for svensk, «Nå: kantarell» per kort (`leadingSpecies` hentes alt), hovedhandling øverst. Større «Hvor plukker du?» (1,5 dag) først når 2 gir tall for utlogget skjerm.

**8. Sesongpass først med butikkpris i skallet (0,75 dag), betinget.** Bare etter at 1b bekrefter introtilbud på begge produkter. Ellers Sesongpass med pris og gratisuke bare på Premium. «≈ X kr/mnd» regnes fra Apples pris, aldri fra `plans.ts`.

**9. «I dag mot i går» og omslag-utløser (2 til 3 dager, hvis tid).** `yesterday` per region i `/api/prediction/regions` fra `region_daily_scores`, piler på `BestRegionsCard` og områdesidene, regionskalaen, aldri punktskalaen. Ny utløser «omslag» i `provetilbud.ts` for arkets andre visning; pensjoner timer og andre-dag (0 av 7 til pris).

### Vinteren

- **Telefonvarsler (push).** Eieren: APNs-nøkkel (.p8) i Apple Developer, capability på App ID og i Xcode, miljøvariabler i Vercel som «Config», TestFlight på ekte telefon, App Review. Claude: `@capacitor/push-notifications` (sync bare i hovedmappa), migrasjon `push_enheter`, `/api/me/push-enhet`, APNs-klient på Node http2, samme løkke og karantene som e-posten, tekst i `/personvern` og GDPR-eksport. Ca. 5 dager. Bygges når minst 30 følger et område og e-posten beviselig leveres.
- **Sign in with Apple i 1.0.2** (2 dager + eierens Apple-oppsett + gjennomgang). Måles på installasjon til konto.
- **Artsvarsel «Mine arter»** (5 dager): eneste betalte evne som treffer «kantarell»-intensjonen og det validerte signalet. Spør de tunge brukerne først.
- **Ett-trykks kjøp fra arket** (2 dager) etter at ark til pris per utløser er lest.
- **Oktober:** pause i stedet for oppsigelse (Stripe), vinn-tilbake-tilbud i App Store Connect.

## 5. Ikke bygg nå

- Hard betalingsmur eller NÅR-prognosen/varselet bak Premium: distribusjonen hviler på at kjernen er gratis.
- Prisendring, svensk pris, 14 dagers prøve: n = 2 kan ikke lese det; 99/249 står gjennom læringsrunden.
- Nedtelling, kunstig knapphet, tilbud på push: det rivalene får 1-stjerner for.
- Flere purre-e-poster til aldri-innloggede: 16 mottakere ga null.
- A/B-infrastruktur: 40 registreringer i uka gir aldri signifikans.
- Kartet uten konto: dyreste flate, selger den svakeste delen; revurder om 5 og 7 ikke løfter installasjon til konto over 45 % innen 28.9.
- Flere utløsere på kartarket, mikro-kompass, områdekartotek, reaktivering av augustkohorten (24 brukere, 2 aktive).
- Å røre Apple Ads midt i vinduet: de 40 registreringene i uka er målestokken.

## 6. Påstander som ble testet

| Påstand | Utfall | Det som gjelder |
|---|---|---|
| Forsidekortet får aldri posisjon i skallet | Korrigert | Kald åpning gir alltid Oslo (også i Safari). Knappen virker, men må trykkes hver gang |
| «Confirm email» av gir økt og forsiden uten ny binær | Avkreftet | Grenen har aldri kjørt i skallet og bruker `router.push` (kappløpet fra #191); 19 ubekreftede kontoer må håndteres; varselkjøringen sender uansett |
| 25 av 59 stoppet i sløyfen; over 80 % bruksdag beviser det | Avkreftet | Dobbelttelling: 15 av 59. Målet blir mekanisk. Nettkohortene mistet like mye; #260 flyttet ingenting |
| Supabase-malen er standard, «åpne appen»-siden vises aldri | Avkreftet | Byttet 11.9; siden vises (bekreftet i data). Spørsmålet er om folk logger inn etterpå |
| 0 av 9 varselåpninger skyldes leveranse eller måling | Korrigert | Måler klikk, ikke åpning. 2 av 9 er eierens; 2 av 7 eksterne var i appen på varseldagen |
| Introtilbud finnes på begge produkter | Uverifisert | Bare månedlig bevist. Én introperiode per gruppe; appen leser ikke `introPrice` |
| Ark til pris når 45 % på 60 visninger | Avkreftet | 45 % ligger i basisintervallet. Begge kjøpte etter 3 til 4 minutter; 0 av 12 som avslo gikk til pris senere |
| Minst 5 av 80 prøver er et signal | Avkreftet | Basis er 2 av 26 (7,7 %); 5 er forventet uansett; 11 trengs |
| Innebygd avsender med 2 e-poster i timen forklarer ubekreftede | Avkreftet | Resend-SMTP siden 31.8; alle 12 fikk e-post; feilstaving og søppelpost forklarer mer |
| Forsidekortet gir aldri annet enn Oslo i iOS-bygget | Avkreftet | Verifisert i simulator: knappen gir ekte posisjon. Kald start er Oslo |

## 7. Mål for 30. september

1. Kom tilbake blant app-registrerte etter 17.9: minst 30 % (basis 23 %), lest på minst 50 brukere.
2. Minst 16 av de neste 80 nye kontoene følger et område (varsel slått på), fra 3 %.
3. Gjenbruk i to ulike uker i septemberkohorten: fra 5 til minst 12.
4. Prøver: 11 eller flere av de neste 80 registrerte er et signal, 5 til 6 er status quo; App Store-prøven 21.9 lest som første belastning eller ikke.
