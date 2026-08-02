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
4. Lagringsbruk og rydd-funksjon i offline-skallet.
5. Egne funn (fra `localStorage`) tegnet oppå det offline kartet.
