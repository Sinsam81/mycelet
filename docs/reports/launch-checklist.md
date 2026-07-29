# Lanseringssjekkliste

## Vurdering

- **Kontrollert web-lansering:** ja. Produksjonen er frisk, betaling er live, offentlige hovedflyter består og prediksjonsdata er ferske.
- **Stor betalt trafikklansering:** ikke helt. Distribuert rate limiting, overvåking og backupvalg bør ferdigstilles først.
- **App Store-lansering:** nei. Native IAP/RevenueCat og sandbox-godkjenning mangler.
- **Suksessgaranti:** nei. Produktet har et reelt timing-signal og et tydelig nordisk fokus, men marked, onboarding, retensjon og feltbevis avgjør kommersiell suksess.

## P0 — før App Store / bred lansering

1. **[founder action]** Opprett produkter i App Store Connect: månedlig premium og sesongpass; legg inn avtaler, skatt og bank.
2. **[code — doable]** Integrer RevenueCat Capacitor SDK, native kjøpsflate og webhook til eksisterende `billing_subscriptions`. Behold samme entitlement-kilde som Stripe.
3. **[founder action]** Lever RevenueCat-/Apple-nøkler og utfør sandbox-kjøp, gjenoppretting, fornyelse, kansellering og refusjon.
4. **[founder action]** Ferdigstill App Store-metadata, skjermbilder, aldersmerking, personvernopplysninger og review-notater om AI-sikkerhet.
5. **[code — doable]** Sett retention warning/purge Edge Functions i faktisk tidsplan og verifiser dry-run/logg før sletting.
6. **[founder action]** Juristgjennomgang av personvern/vilkår, signer databehandleravtaler og etabler 72-timers bruddvarslingsrutine.
7. **[founder action]** Velg Supabase backup/PITR-plan. Under gjennomgangen var PITR av og ingen synlig backup kunne listes.

## P1 — før trafikkspike

8. **[founder action]** Opprett Upstash/Vercel KV-konto og Sentry-prosjekt med nøkler/budsjett.
9. **[code — doable]** Flytt rate limiting fra minne til distribuert lager med fail-closed regler på dyre endepunkter.
10. **[code — doable]** Koble Sentry med PII-skrubbing, release-SHA og alarmer for 5xx, cron-feil, Stripe/RevenueCat og prediksjonsferskhet.
11. **[code — done]** Daglig prediksjonscron, fem-regioners ferskhetshelse og 29/29 prod-smoke er live.
12. **[code — done]** Uvaliderte romlige boost er fjernet; modellversjon og kilde lagres i feedback.
13. **[founder action]** Definer lanseringsdashbord: aktivering, turplanlegging, konvertering, D7/D30-retensjon, refundering og andel besøk med feedback.

## P2 — gjør prediksjonen til en varig fordel

14. **[code — done]** Historisk værimport for SMHI/Frost og streng temporal/lokal holdout-audit er live.
15. **[code — doable]** Bygg ut til 500+ profiler per kjerneart/region og reserver ny testperiode.
16. **[founder action]** Skaff Skogsstyrelsen REST/WMS-konto for rasterdata.
17. **[code — doable]** Implementer feature-flagget Skogsstyrelsen-adapter med CORINE-fallback; aktiver bare ved målbar SE-løft.
18. **[code — done]** Positive og negative besøk kan lagres med vær/habitat/modellkontekst uten offentlig negativvisning.
19. **[code — doable]** Kalibrer først ved minst 100 feedbackrader; vurder reelle sannsynligheter ved 500+ og positiv Brier skill.
20. **[founder action]** Markedsfør «beste dag/flush i Norden» som hovedløfte. Unngå «vi vet nøyaktig hvor soppen er».

## Kontinuerlig release-sjekk

21. **[code — done]** Hver endring: typecheck → Vitest → build → én PR → Vercel ferdig → `/api/health` → prediksjonsferskhet → `qa:prod`.
22. **[code — doable]** Legg til alarm når en region mangler dagens fliser etter cron-vinduet.
23. **[founder action]** Månedlig gjennomgang av feil, refunderinger, support, feedbackdekning og modellversjon; stopp kampanjer ved sikkerhets-/driftsavvik.
