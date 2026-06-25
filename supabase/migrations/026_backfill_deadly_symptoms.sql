-- 026: Backfill the blank `symptoms` field on 6 toxic/deadly species.
--
-- Pre-launch audit finding (safety-content, MEDIUM): 6 original-seed toxic/deadly
-- species have a populated toxin_info but a BLANK symptoms field, so their
-- species page omits the poisoning-symptom line (the red deadly/toxic banner,
-- toxin_info and Giftinformasjonen number still render — this is enrichment, not
-- a hidden danger). The two DEADLY ones (Hvit fluesopp, Spiss giftslørsopp) lack
-- the critical delayed-onset warning. Matched by norwegian_name and only written
-- where symptoms is currently blank, so this is safe to re-run.

UPDATE mushroom_species SET symptoms =
  'Symptomfritt intervall 6–24 t, deretter kraftig oppkast/diaré og en tilsynelatende bedring før akutt leversvikt. At du føler deg frisk betyr IKKE at du er trygg — ring Giftinformasjonen 22 59 13 00 straks ved mistanke.'
  WHERE norwegian_name = 'Hvit fluesopp' AND (symptoms IS NULL OR trim(symptoms) = '');

UPDATE mushroom_species SET symptoms =
  'Symptomer kan komme først 2–3 uker etter inntak: tørste, kvalme, hodepine og nyresvikt. Det lange symptomfrie intervallet betyr IKKE at du er trygg — ring Giftinformasjonen 22 59 13 00 ved mistanke.'
  WHERE norwegian_name = 'Spiss giftslørsopp' AND (symptoms IS NULL OR trim(symptoms) = '');

UPDATE mushroom_species SET symptoms =
  'Forvirring, uro eller sløvhet, kvalme og oppkast 0,5–3 t etter inntak. Ring Giftinformasjonen 22 59 13 00.'
  WHERE norwegian_name = 'Rød fluesopp' AND (symptoms IS NULL OR trim(symptoms) = '');

UPDATE mushroom_species SET symptoms =
  'Kan utløse en livstruende immunreaksjon (hemolyse) ved gjentatt inntak — oppkast, magesmerter og deretter nyresvikt. Ring Giftinformasjonen 22 59 13 00.'
  WHERE norwegian_name = 'Pluggsopp' AND (symptoms IS NULL OR trim(symptoms) = '');

UPDATE mushroom_species SET symptoms =
  'Kraftig kvalme, oppkast og magesmerter innen noen timer. Lukter karbol/blekk og gulner i stilkbasen ved trykk.'
  WHERE norwegian_name = 'Karbol-sjampinjong' AND (symptoms IS NULL OR trim(symptoms) = '');

UPDATE mushroom_species SET symptoms =
  'Oppkast, diaré og magesmerter noen timer etter inntak. Svært bitter smak.'
  WHERE norwegian_name = 'Svovelsopp' AND (symptoms IS NULL OR trim(symptoms) = '');
