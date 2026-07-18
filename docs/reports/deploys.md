# Deploylogg

Alle kodeendringer ble verifisert med typecheck, full Vitest-suite og produksjonsbygg før merge. PR-ene ble sluppet sekvensielt. Sluttstatus 14. juli 2026: `/api/health` = 200/ok, `/api/health/predictions` = 200/ok, fem av fem regioner ferske og `qa:prod` = 29/29.

| PR | Merge-SHA | Produksjonsresultat |
|---|---|---|
| [#71 Mobil funnskjema](https://github.com/Sinsam81/mycelet/pull/71) | `b28c8a8` | Vercel ferdig; mobil 390×844 verifisert, kumulativ prod-QA bestått |
| [#72 Svenske artsnavn](https://github.com/Sinsam81/mycelet/pull/72) | `2a52495` | Vercel ferdig; svensk katalog/søk verifisert, kumulativ prod-QA bestått |
| [#73 Mobilkart](https://github.com/Sinsam81/mycelet/pull/73) | `e3fee2b` | Vercel ferdig; NO/SE kart-QA 2/2, kumulativ prod-QA bestått |
| [#75 Romlig validering](https://github.com/Sinsam81/mycelet/pull/75) | `7c37a24` | Helse og produksjonsrøyk bestått |
| [#76 Ærlig scoring](https://github.com/Sinsam81/mycelet/pull/76) | `1150b8e` | Helse ok; 26/26 prod-QA; Bergen fallback gikk fra 58 til evidensærlig 35 |
| [#77 Flisferskhet](https://github.com/Sinsam81/mycelet/pull/77) | `551ce0a` | Full batch 763 fliser; fem regioner ferske; 27/27 prod-QA |
| [#78 Feltfeedback](https://github.com/Sinsam81/mycelet/pull/78) | `55262fe` | Migrasjon 029 verifisert; helse/ferskhet ok; 28/28 prod-QA; begge API-er avviser uautorisert |
| [#79 Værimport](https://github.com/Sinsam81/mycelet/pull/79) | `76cd5a7` | Helse/ferskhet ok; 28/28 prod-QA; 1 000 komplette SE-profiler |
| [#80 Norsk backfill](https://github.com/Sinsam81/mycelet/pull/80) | `75585d5` | Helse/ferskhet ok; 29/29 prod-QA; uautorisert = 401; 125 NO-profiler kontrollert innlest |
| [#81 Værvalidering](https://github.com/Sinsam81/mycelet/pull/81) | `fc8ef83` | Helse/ferskhet ok; 29/29 prod-QA; 1 664-raders holdout-audit fullført |
| [#82 Sluttrapporter](https://github.com/Sinsam81/mycelet/pull/82) | `19873cd` | Helse/ferskhet ok; fem regioner ferske; 29/29 prod-QA; produksjonsforside uten konsollfeil |
| [#83 SMHI-stasjonscache](https://github.com/Sinsam81/mycelet/pull/83) | `9bc1830` | Helse/ferskhet ok; fem regioner ferske; Göteborg bruker SMHI; 29/29 prod-QA |

## Databaseendring

`029_prediction_feedback_context.sql` ble anvendt i produksjon før PR #78 ble merget. Sikkerhetsnett:

1. Additiv SQL gjennomgått.
2. To transaksjonskjøringer med eksplisitt rollback.
3. Førkontroll: 10 funn, 5 offentlige, 0 negative og 0 spot-feedback.
4. Kun migrasjon 029 kjørt gjennom Management API; ikke `db push`.
5. Etterkontroll: seks nye feedbackkolonner, `visited_at`-krav/default, indeks, offentlig negativfilter og korrigert statistikkfunksjon.

Ingen rollback av kode eller database var nødvendig.

## 2026-07-19 — PR #86: Fix NO/SE border misclassifying the Swedish Bohuslän coast
- **Commit:** squash-merge of `fix/bohuslan-border-strip` (post-merge main HEAD).
- **What:** `noSeBorderLon` refined — 11.0°E south of Iddefjorden (58.9°N), steep rise to 11.48°E by 59.1°N. Strömstad/Grebbestad/Fjällbacka/Koster now → SE (OSM basemap + SMHI weather); Halden/Tistedal/Fredrikstad/Sarpsborg verified still NO. Found while live-debugging the founder's grey-map report from Sweden.
- **Verify pre-merge:** 297/297 vitest, typecheck, production build green.
- **Verify post-deploy:** `/api/health` → ok; live probe Strömstad (58.9366, 11.1706) flipped `weatherSource: met_frost` → `smhi`; `qa:prod` 29/29 passed.
- **Rollback:** none needed.
- **Note:** PR #85 (WebKit Swedish-tile CSP fix, 2026-07-18) shipped after the previous log entry and is not logged above — noted here for a complete audit trail.

## 2026-07-19 — PR #87: sw.js byte-bump to force reinstall (stale-CSP service workers)
- **What:** Version comment + `STATIC_CACHE` v1→v2 in `public/sw.js`. Root cause: a service worker runs under the CSP captured when its script was fetched; PR #85 widened the header but `sw.js` bytes were unchanged since 07-13, so devices that installed during 07-13→07-18 kept the narrow snapshot → their SW fetch of OSM tiles still threw → grey Swedish map even after #85. Founder confirmed grey map persisting on Mac Chrome + iPhone Safari.
- **Verify pre-merge:** typecheck, 297/297 tests, build green.
- **Verify post-deploy:** live sw.js serves v2; browser test confirmed new worker installed + activated (`mycelet-static-v1` cleaned up, `mycelet-map-tiles-v1` preserved); Strömstad renders 12/12 OSM tiles under the new worker; `/api/health` ok.
- **Rollback:** none needed.
