# Produksjonsutrullinger — 13. juli 2026

Alle utrullinger fulgte rekkefølgen: lokal verifisering → PR-kontroller → én merge → vent på produksjonsbygg → `/api/health` → `npm run qa:prod`. Databasemigrasjoner ble ikke kjørt.

| UTC | Endring | PR / commit | Produksjonskontroll | Resultat |
|---|---|---|---|---|
| ca. 08:39 | Mobilarket for registrering av funn fikk høydegrense og egen rulling | [#71](https://github.com/Sinsam81/mycelet/pull/71), head `e7f043935d91d8d4801a8631ac1d9f9bf0eb345b`, merge `b28c8a8f89ac242f25a12683842617044f76647a` | Vercel grønn; `/api/health` HTTP 200 og `status: ok`; database og audit-logg grønne; 26/26 produksjonsprøver | Live, ingen rollback |
| 08:55 | Svenske artsnavn og svensk/norsk/latinsk søk i kjerneflatene | [#72](https://github.com/Sinsam81/mycelet/pull/72), head `f664f9cab14bd53dac90f8e710bbc79fffe2e2cc`, merge `2a52495278ce130bd1bd6ccd121299bdc273f419` | Vercel grønn 08:55:38; `/api/health` HTTP 200 og `status: ok` 08:55:46; 26/26 produksjonsprøver; produksjons-HTML bekreftet «Vit flugsvamp» på svensk og «Hvit fluesopp» på norsk | Live, ingen rollback |
| 09:10 | Kartkontroller ryddet, sekundærverktøy under «Mer», bunnarkfilter og oversatt GPS-feil | [#73](https://github.com/Sinsam81/mycelet/pull/73), head `d4eeca521e3384dcd978c3c61c47b601514ab1d7`, merge `e3fee2b2afa9a1f669e72d3aa04753854a04254f` | Vercel grønn 09:10:36; `/api/health` HTTP 200 og `status: ok` 09:11:08; sikkerhetshoder intakte; 26/26 produksjonsprøver; lokal NO/SE kartregresjon 2/2 | Live, ingen rollback |

## Sluttstatus

- Siste runtime-commit på `main`: `e3fee2b2afa9a1f669e72d3aa04753854a04254f`.
- Produksjon: frisk.
- Rollbacks: 0.
- Databasemigrasjoner brukt i produksjon: 0.
- Rapportpakken ligger i en separat dokumentasjons-PR og er med vilje ikke en ny runtime-utrulling.
