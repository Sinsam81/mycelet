-- ⚠️ SIKKERHETSRETTING (2026-09-05): KRITTØSTERSSOPP ER IKKE MATSOPP I MYCELET
--
-- Pleurocybella porrigens sto som `conditionally_edible`. Den klassen vises i
-- appen som «Spiselig — giftig rå» med overskriften «krever tilberedning» —
-- et løfte om at steking gjør soppen trygg. Artens egen tekst sier det
-- motsatte: «Koking eller steking fjerner ikke risikoen», og notatet åpner med
-- «IKKE ANBEFALT». Merket og teksten motsa hverandre på samme side, i
-- biblioteket, kalenderen og forvekslingssjekken.
--
-- Årsaken er strukturell: normlistens «Spiselig med merknad» (merknad om
-- nedsatt nyrefunksjon) og «Spiselig etter avkoking» havner i samme klasse hos
-- oss (src/lib/species/normliste.ts), og merkets ordlyd antar alltid det siste.
-- Honningsopp og stankmorkel ble flyttet til `inedible` av nøyaktig samme
-- grunn i migrasjon 047: en advarsel som ikke forsvinner med koking hører ikke
-- hjemme under «giftig rå».
--
-- `inedible` er den minste konsistente flyttingen (Svampkonsulenterna i
-- Sverige har strøket den som matsopp; NSNF fører den som «Spiselig*» med
-- nyremerknad, ikke som giftig). `toxic` ville lagt den blant «giftige å passe
-- på» på forsiden, som er en annen påstand enn den kildene gir. Hele det
-- opprinnelige notatet beholdes — det er bra — med et tydelig førstesetning.
--
-- Funnet kom fra en ekstern gjennomgang 2026-09-05 og er verifisert mot
-- databaseraden og NSNFs normliste før endringen.
-- Vaktbikkje: `npm run kontroller:spiselighet` (scripts/kontroller-spiselighet.mjs)
-- finner denne typen motsigelse i hele artslista.

UPDATE mushroom_species
SET
  edibility = 'inedible',
  edibility_notes =
    'IKKE MATSOPP I MYCELET. Dette er ikke en «giftig rå»-sopp: steking eller '
    || 'koking fjerner ikke risikoen. '
    || regexp_replace(edibility_notes, '^IKKE ANBEFALT\.\s*', '')
WHERE latin_name = 'Pleurocybella porrigens'
  AND edibility = 'conditionally_edible';
