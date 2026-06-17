# Svensk skogdata-oppgradering

Status nå: produksjon ruter Sverige til CORINE via `src/lib/forest`, som gir grov skogtype (`lauv`, `bar`, `blandet`) men ikke volum, bonitet, diameter, høyde eller biomasse. Det er nok til å unngå pseudo-støy, men ikke godt nok for NO/SE-paritet.

Anbefalt datakilde er Skogsstyrelsens **Skogliga grunddata**:

- Skogsstyrelsen beskriver kartprodukter for terreng, markfuktighet, trehøyde, volum, grunnflate, middelhøyde, middeldiameter og biomasse: https://www.skogsstyrelsen.se/skogligagrunddata
- REST-siden sier at tjenestene støtter ArcGIS Server REST-syntaks, og at Skogliga grunddata inneholder åpne geodata for volum, høyde, grunnflate, diameter og biomasse: https://www.skogsstyrelsen.se/rest
- Den engelske Skogsstyrelsen-siden sier at data kan brukes via FTP, REST API eller WMS, men at REST/WMS-bruk kan kreve brukerkonto: https://www.skogsstyrelsen.se/en/e-tjanster-och-kartor/karttjanster/forest-attribute-maps-and-laser-scanning/

Ikke bytt produksjonen blindt fra CORINE. Gjør dette i rekkefølge:

1. Skaff/avklar Skogsstyrelsen REST/WMS-tilgang og nøyaktige layer-endepunkter.
2. Lag `src/lib/skogsstyrelsen/` som returnerer samme `ForestProperties`-shape som NIBIO/CORINE.
3. Bruk feature flag/env (`SKOGSSTYRELSEN_ENABLED=1`) og fallback til CORINE ved feil.
4. Kjør `backtest:full-pipeline` med region-splitt. SE må forbedres mot CORINE før adapteren blir default.
5. Først etter validert SE-løft: oppdater `src/lib/forest` til å velge Skogsstyrelsen før CORINE.

Viktig begrensning: Skogliga grunddata gir bedre skogstruktur enn CORINE, men ikke nødvendigvis eksakt treslag på samme måte som NIBIO SR16. Habitatmodellen må derfor fortsatt måles mot target-group-bakgrunn før svenske kartpåstander skjerpes.
