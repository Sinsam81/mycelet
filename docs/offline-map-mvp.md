# Offline-kart MVP

## Hva som er implementert
- PWA-grunnlag:
  - `public/manifest.json`
  - `public/sw.js`
  - SW-registrering i `src/components/layout/Providers.tsx`
- Kartvisning:
  - Bruker kan lagre nåværende kartområde lokalt i nettleser.
  - Flisene hentes fra bakgrunnskartet brukeren faktisk ser på (Terreng fra
    Kartverket, Kart fra OpenStreetMap eller Satellitt), ikke alltid
    Kartverket: Terreng er blankt utenfor Norge, så står det laget på over et
    område utenfor Norge, lagres OpenStreetMap i stedet.
  - Hvilke zoomnivåer som lagres, bestemmes av `offlineZoomLevels` i
    `src/lib/utils/offlineMap.ts` — ikke lenger `z-1`, `z`, `z+1` i den
    rekkefølgen:
    - Nivået brukeren ser på hentes FØRST. Det er det offline-siden tegner, så
      det er det som bør være komplett hvis nettet dør midt i lagringen.
    - Deretter oversikten (ett nivå ut, men aldri grovere enn nivå 8), og til
      slutt detaljene (ett nivå inn).
    - Aldri dypere enn bakgrunnskartet har ekte fliser for (`MAX_NATIVE_ZOOM`:
      18 hos Kartverket, 19 for OpenStreetMap og satellitt — de samme tallene
      kartlagene bruker som `maxNativeZoom`). Kartet kan stå på zoom 19–20 ved å
      forstørre nivå 18; da er det nivå 18 som lagres, og det er det nivået
      området huskes med.
  - Hver flis har 15 s frist, og lagringen gir opp etter tolv frister på rad.
  - Trenger området flere enn 550 fliser (`MAX_TILES_PER_SAVE`), avvises
    lagringen før noe er hentet (`OfflineAreaTooLargeError`), og brukeren blir
    bedt om å zoome inn. Før ble lista bare kuttet ved taket, og det som falt
    bort var nivået brukeren så på.
  - Ble ikke én eneste flis lagret, avvises lagringen (`NoTilesCachedError`):
    området legges ikke i lista, og ingen eldre områder kastes ut for å gi
    plass til et tomt. `MushroomMap.tsx` sjekker i tillegg selv at minst én
    flis kom ned før lista røres.
  - Kom noen fliser ned og andre ikke, lagres området, men kvitteringen sier
    hvor mange som mangler og at kartet kan ha hull (`offlineSavedPartial`).
    «Klare offline» loves bare når alle kom ned.
  - Lista holder åtte områder. Det niende skyver det eldste ut, med flisene.
  - Lagrede områder kan åpnes igjen i kartet eller slettes. Sletting fjerner
    også flisene, men bare dem ingen av de gjenværende områdene deler:
    `removeOfflineAreaTiles(area, behold)` må få områdene som blir igjen. To
    lagrede områder som overlapper, eier de samme flis-URL-ene, og uten
    `behold` tok slettingen av det ene med seg kartet til det andre.
- Gating:
  - Offline-lagring er tilgjengelig kun for betalende brukere (Premium/Sesongpass).
  - **Sperren er KUN i klienten, og det er en bevisst avgjørelse — ikke en glipp.**
    `hasOfflineAccess = billing.data?.capabilities.paid` sjekkes i
    `src/components/map/MushroomMap.tsx` før `cacheMapTilesForArea` kjøres.
    Alle andre premiumfunksjoner håndheves på serveren
    (`/api/prediction/grid`, `/api/prediction/species-spots`, `/api/identify`,
    og grovkorningen i `/api/prediction`); denne kan ikke være det, fordi det
    ikke finnes noe serverkall å håndheve i: flisene hentes rett fra
    cache.kartverket.no / OpenStreetMap / ArcGIS til `caches` i nettleseren, og
    ingen Mycelet-server er involvert. Service workeren gjør derfor heller ingen
    betalingssjekk.
  - Alternativet ville vært å proxye flisene gjennom et autentisert
    Mycelet-endepunkt. Det er valgt bort: det koster båndbredde per flis, gir en
    tregere kartopplevelse for alle, og måtte vurderes mot Kartverkets og OSMs
    bruksvilkår for videreformidling. Kostnaden ved omgåelse er null kroner for
    oss (flisene er andres), og den krever devtools — det er ikke en trussel som
    forsvarer den prisen.
  - **Konsekvens for markedsføring:** offline-kart kan stå som en betalt
    funksjon (`messages/{nb,sv}.json`: `premiumFeature3`), men skal ikke være
    det eneste argumentet for å betale. Blir den det, må gaten flyttes til
    serveren først.
- Offline-skallet `/offline` (`public/offline/index.html` + `offline-map.js`):
  - Den ENESTE siden som kan åpnes uten dekning. Precaches av `public/sw.js`,
    og service workeren svarer med den når en navigasjon feiler fordi enheten
    er uten nett, eller når nettet ikke har svart på ti sekunder (nett først —
    et svar som rekker fram vinner alltid, og ingen gammel side vises).
  - Den precaches for ALLE besøkende, ikke bare dem med lagrede kart. Derfor
    sier den hvorfor den vises: «Du er uten nett», «Offline-kart» (åpnet
    direkte) eller «Nettet svarer ikke» når den står i stedet for en annen
    side mens enheten er påkoblet. Fristen gjelder bare første forsøk: laster
    brukeren samme adresse på nytt innen et halvt minutt, eller trykker «Prøv
    å laste appen på nytt» (når som helst), venter service workeren på nettet
    uten frist, så en side på tregt nett kan lastes.
  - Statisk, åpen og uten serverdata. Den viser bare det nettleseren allerede
    har: områder fra `localStorage` og fliser fra `mycelet-map-tiles-v1`.
    Derfor gjenskaper den ikke problemet fra PR #102, der precaching av det
    auth-gatede `/map` i praksis lagret en omdirigering til innlogging.
  - Viser lagret område som flisrutenett + GPS-posisjonen din, teller ærlig
    hvor mange fliser som faktisk ligger der, og sier tydelig at
    artsinformasjon og forvekslingsvarsler IKKE finnes uten nett.
  - Egen tekstkopi i `nb`/`sv` (next-intl finnes ikke utenfor React-bunten).
    Språket velges etter samme regel som `getUserLocale` i
    `src/i18n/locale.ts`, så skallet snakker samme språk som siden det står i
    stedet for: `MYCELET_LOCALE`-cookien først, ellers svensk når svensk står
    blant nettleserens språk (`navigator.languages`, som Accept-Language bygges
    av), ellers norsk. Cookien alene holdt ikke: bare språkvelgeren setter den,
    og de fleste svenske brukerne har aldri trengt den, fordi appen er svensk
    for dem via Accept-Language. De fikk derfor et norsk skall, også når nettet
    bare var tregt. `offline-shell.test.ts` sammenligner regelen med
    `getUserLocale` selv.

## Begrensninger i MVP
- Kun nettleser-cache (ikke server-synk av offline-områder).
- Ingen bakgrunnsnedlasting uten at appen er aktiv.
- Flise-cache avhenger av nettleserens quota/policy.
- Offline-skallet viser bakgrunnskart + posisjon. Funn, prediksjonslag,
  artsbibliotek og søk er ikke tilgjengelig uten nett — markedsføringstekst må
  holde seg til det (`faqOfflineA` i `messages/{nb,sv}.json`).

## Neste forbedringer
1. Synk av offline-områder per bruker (Supabase-tabell).
2. Eksplisitt progresjon per område (x/y tile-progress).
3. Mulighet for å velge zoomintervall manuelt.
4. ~~Lagringsbruk og rydd-funksjon~~ — gjort i kartets offline-panel:
   `navigator.storage.estimate()` viser bruken, «Tøm kartcachen» tømmer
   `mycelet-map-tiles-v1`, og «Slett» på et område fjerner nå faktisk flisene
   (`removeOfflineAreaTiles`). Står igjen: samme visning i offline-skallet, og
   et tak med LRU-utkasting i `public/sw.js` — service workeren cacher hver flis
   brukeren panorerer forbi, ikke bare de lagrede områdene, så cachen kan vokse
   uten at noen har trykket «Lagre».
5. Egne funn (fra `localStorage`) tegnet oppå det offline kartet.
