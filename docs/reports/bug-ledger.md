# Feilregister

## Fikset og live

| ID | Alvor | Feil og reproduksjon | Rotårsak | Status |
|---|---|---|---|---|
| B-01 | Høy | Åpne kartet på 390 × 844, trykk `+`, velg sone og fyll sonefeltene. Arket går over toppen; overskrift/første felt kan ikke nås. | Absolutt bunnark uten høydegrense eller egen rulling. | Fikset i [#71](https://github.com/Sinsam81/mycelet/pull/71), live. |
| B-02 | Høy UX | Åpne kartet på mobil. Filter, søk, funn, lovende steder, premium, offline, Leaflet-kontroller og flytende handlinger konkurrerer samtidig. | Alle kapabiliteter var presentert som primære og alltid synlige. | Fikset med progressiv visning i [#73](https://github.com/Sinsam81/mycelet/pull/73), live. |
| B-03 | Middels | Avslå posisjon eller la GPS gå ut på tid. Engelsk `User denied Geolocation`/`Timeout expired` ligger permanent over kartet. | Rå `GeolocationPositionError.message` ble rendret direkte. | Fikset med oversatt, kortvarig melding i [#73](https://github.com/Sinsam81/mycelet/pull/73), live. |
| B-04 | Høy SE | Velg svensk og åpne katalog/art 16. UI er svensk, men primærnavnet er `Hvit fluesopp`; svensk katalogsøk på `Vit flugsvamp` gir ikke treff. | Alle visningsflater brukte `norwegian_name`; søke-RPC-en kjenner ikke `swedish_name`. | Fikset i [#72](https://github.com/Sinsam81/mycelet/pull/72), kartflater fullført i [#73](https://github.com/Sinsam81/mycelet/pull/73), live. |
| B-05 | Middels | Svensk startside viser norske navn i sesong/fare/siste funn. | View og komponenter eksponerte bare norsk navn. | Fikset ved å koble funn til lokalisert artskart i [#72](https://github.com/Sinsam81/mycelet/pull/72), live. |

## Åpent — kode som kan gjøres senere

| ID | Alvor | Feil og reproduksjon | Rotårsak / forslag | Status |
|---|---|---|---|---|
| B-06 | Middels UX | Åpne `/identify` uten tidligere posisjonstillatelse. Nettleseren kan be om sted før brukeren har valgt bilde eller bedt om kontekst. | `useGeolocation()` kjøres ved mount. Gjør posisjon opt-in, eller les bare en tillatelse som allerede er gitt. | Ikke endret; foreslått. |
| B-07 | Middels drift | Kjør svensk prediksjon lokalt. Next logger at SMHI parameter 5-responsen på ca. 2,28 MB ikke kan legges i 2 MB fetch-cache. | Hele SMHI-stasjonskatalogen caches via Next. Hent uten fetch-cache og cache en slank stasjonsliste separat, med test for fetch-policy. | Ikke endret; prediksjonen svarer fortsatt 200. |
| B-08 | Lav drift | Når norsk værleverandør mangler lokalt, prøver TanStack Query prediksjonskallet fire ganger og lager støy/ventetid. | Standard retry behandler varig 502 som midlertidig nettfeil. Slå av eller begrens retry for eksplisitte 4xx/502-feil. | Ikke endret. Produksjonsprøven for Oslo er grønn. |
| B-09 | Lav | `/admin/forum-trust` viser hardkodet `Forum trust admin` i begge språk. | Tekst ligger ikke i next-intl. | Ikke endret; før forumlansering. |
| B-10 | Middels SE | Svensk artsside har svensk navn, men norske beskrivelser, gift-/symptomtekst, habitat og skillekjennetegn. | Skjemaet har ikke fullt sett kuraterte svenske innholdsfelt. | Krever innholdsmodell + faglig oversettelse. Ikke maskinoversatt. |
| B-11 | Lav utvikling | Next advarer om feil workspace-root i denne nestede worktree-en på grunn av to lockfiler. | Next velger hovedrepoets rot. `next dev --webpack` var nødvendig for korrekt lokal visning. | Lokal utviklerfotgun; produksjonsbygg er grønt. |
| B-15 | Middels SE | Popups for egne/fellesskapets funn og foruminnlegg koblet til funn kan fortsatt vise norsk artsnavn i svensk UI. | `public_findings` og forumselectene eksponerer bare `norwegian_name`; kartets eksterne forekomstlag ble lokalisert, men disse relasjonene ble ikke utvidet. | Ikke endret; løs med lokalt artskart eller trygg view/query-utvidelse uten å røre koordinatmaskeringen. |

## Åpent — risiko eller grunnleggerhandling

| ID | Alvor | Funn | Hvorfor ikke endret | Status |
|---|---|---|---|---|
| B-12 | Kritisk beredskap | `primary_image_url` og `swedish_name` finnes i prod, men ikke i migrasjon 001; migrasjon 012/015+ bruker dem. Ren sekvensiell replay kan stoppe før en ny 029 nås. | Anvendte migrasjoner 001–028 må ikke omskrives, og ingen migrasjon kan kjøres autonomt i prod. En symbolsk 029 løser ikke rekkefølgefeilen. | Grunnlegger/DB-plan: velg dokumentert bootstrap eller ny baseline, test mot tom database, ta backup, kjør manuelt. |
| B-13 | Middels QA | Betalt kart/offline/portal kunne ikke brukes interaktivt i produksjon. | Ingen lesende QA-konto eller eksisterende innlogget produksjonsøkt var tilgjengelig. Å opprette bruker ville skrive til prod. | Grunnlegger bør stille en dedikert QA-konto til rådighet uten betalings- eller skrivehandlinger. |
| B-14 | Middels forsyningskjede | `npm audit --omit=dev` rapporterer to moderate PostCSS-funn inne i Next; foreslått automatisk «fix» nedgraderer Next til 9.3.3. Full audit finner i tillegg dev-only Vitest/Vite/esbuild/tar-funn. | Den foreslåtte prod-fiksen er en farlig hovedversjonsnedgradering. Dev-avhengigheter bør oppgraderes i egen PR med full regresjon. | Akseptert midlertidig; overvåk Next-utgivelse og oppgrader kontrollert. |

## Forventet, ikke feil

- Lokal norsk prediksjon returnerte 502 når arbeidskopien manglet en tilgjengelig norsk værleverandør. Produksjonens Oslo-prøve svarte som forventet.
- Midlertidige svarte kartrektangler under hot reload var Leaflet-fliser som fortsatt lastet. Kartverket-flisene ble komplette etter kort venting; regiontestene var grønne.
- `/identify/result` uten sessionStorage viser kort lasting og går tilbake til `/identify`; dette er trygg gjenoppretting, ikke krasj.
