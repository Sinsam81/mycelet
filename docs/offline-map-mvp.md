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

## Begrensninger i MVP
- Kun nettleser-cache (ikke server-synk av offline-områder).
- Ingen bakgrunnsnedlasting uten at appen er aktiv.
- Flise-cache avhenger av nettleserens quota/policy.

## Neste forbedringer
1. Synk av offline-områder per bruker (Supabase-tabell).
2. Eksplisitt progresjon per område (x/y tile-progress).
3. Mulighet for å velge zoomintervall manuelt.
4. Dedikert offline-skjerm med lagringsbruk og rydd-funksjon.
