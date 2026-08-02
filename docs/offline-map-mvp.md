# Offline-kart MVP

## Hva som er implementert
- PWA-grunnlag:
  - `public/manifest.json`
  - `public/sw.js`
  - SW-registrering i `src/components/layout/Providers.tsx`
- Kartvisning:
  - Bruker kan lagre nåværende kartområde lokalt i nettleser.
  - Området forsøker å cache kartfliser (Kartverket) for zoomnivå `z-1`, `z`, `z+1`.
  - Lagrede områder kan åpnes igjen i kartet eller slettes.
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
    er uten nett (nett først — en påkoblet bruker får alltid den ferske siden).
  - Statisk, åpen og uten serverdata. Den viser bare det nettleseren allerede
    har: områder fra `localStorage` og fliser fra `mycelet-map-tiles-v1`.
    Derfor gjenskaper den ikke problemet fra PR #102, der precaching av det
    auth-gatede `/map` i praksis lagret en omdirigering til innlogging.
  - Viser lagret område som flisrutenett + GPS-posisjonen din, teller ærlig
    hvor mange fliser som faktisk ligger der, og sier tydelig at
    artsinformasjon og forvekslingsvarsler IKKE finnes uten nett.
  - Egen tekstkopi i `nb`/`sv` (next-intl finnes ikke utenfor React-bunten),
    styrt av samme `MYCELET_LOCALE`-cookie.

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
