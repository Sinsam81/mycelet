-- 071: Soppregistreringer, samme dato som før — er det mindre sopp i år, og hvor?
--
-- Bakgrunn (16.–17. sep 2026): rå GBIF-tall for 2026 så ut som 55–60 % av
-- 2023–25. Det var nesten bare etterslep: folk legger funn inn i
-- Artsobservasjoner uker og måneder etter turen. Midt i september fantes bare
-- 57–74 % av et års august-registreringer; ~95 % er inne ved nyttår. Et
-- ferskt tall mot ferdige tall fra tidligere år ser alltid ut som en nedgang.
--
-- Metoden: tell tidligere år SLIK DE STO PÅ SAMME DATO.
--   · Artsobservasjoners funn-id (GBIF catalogNumber, datasett
--     b124e1e0-4755-430f-9eab-894f25a9b59c, ~82–87 % av norske soppfunn)
--     stiger i den rekkefølgen funnene ble lagt inn (sjekket på 2 700 poster).
--   · snapshot = datasettets pubDate i GBIF (ny utgave omtrent ukentlig).
--   · For år Y er grensen T_Y den høyeste id-en blant postene med
--     modified = Y-MM-DD (MM-DD = snapshot). Kontroll: minste id blant funn
--     gjort dagen etter ligger like over T_Y (2023: 32 960 925 → 32 961 196).
--   · I år telles alt i utgaven; 2023–25 bare id ≤ T_Y. normal = snittet av
--     de tre, prosent = i år / normal.
--   · Vinduer: 'sesong' = 1. august → snapshot − 7 dager; 'uke' = de sju
--     dagene som slutter samme dag. Siste uka før utgaven er knapt lagt inn.
--   · Fylker: GBIFs GADM 3.6-fylker (19) slått sammen til de 15 fra 2024,
--     aldri stateProvince. 'Norge' er hele landet (country=NO).
--   · gruppe: 'alle' = alle sopp (taxonKey 5); 'storsopp' = ordenene
--     Agaricales, Boletales, Russulales og Cantharellales.
--
-- Verifisert mot tørrkjøringen 1. aug–7. sep 2026 (utgave 12. sep): Norge
-- alle 13 943 mot normal 15 184 (92 %), storsopp 86 %; alle 15 fylker innen
-- ±5 poeng av den uavhengige utregningen.
--
-- tynt = normal under 50, eller de tre årene spriker mer enn tre ganger
-- (største > 3 × minste) — da hviler normalen på noen få personer.
--
-- DETTE ER REGISTRERINGSAKTIVITET, IKKE SOPPMENGDE. Tallene vises bare i
-- eierens dagsrapport, med forbeholdet, aldri for kunder.
--
-- Én rad per snapshot, vindu, område og gruppe (64 per utgave), skrevet i ÉN
-- upsert når hele utgaven er regnet ut — finnes en rad for en snapshot, er
-- utgaven ferdig. Skrives bare av /api/cron/soppregistreringer (service role).

create table if not exists soppregistreringer (
  snapshot   date not null,
  vindu      text not null check (vindu in ('sesong', 'uke')),
  fra        date not null,
  til        date not null,
  omrade     text not null,
  gruppe     text not null check (gruppe in ('alle', 'storsopp')),
  antall     integer not null check (antall >= 0),
  normal     numeric,
  prosent    integer,
  tynt       boolean not null,
  per_aar    jsonb not null default '{}'::jsonb,
  grenser    jsonb not null default '{}'::jsonb,
  hentet_at  timestamptz not null default now(),
  primary key (snapshot, vindu, omrade, gruppe)
);

alter table soppregistreringer enable row level security;
-- Ingen policyer med vilje: kun service role.

comment on table soppregistreringer is 'Soppregistreringer i Artsobservasjoner (via GBIF) i år mot 2023–25 talt slik de sto på samme dato (funn-id ≤ grensen for utgavens dato). Registreringsaktivitet, ikke soppmengde. Kun eierens dagsrapport.';
comment on column soppregistreringer.snapshot is 'GBIF-utgavens pubDate (Artsobservasjoner-datasettet).';
comment on column soppregistreringer.antall is 'Registreringer i år i vinduet, slik utgaven står.';
comment on column soppregistreringer.normal is 'Snittet av de tre foregående årene, talt på samme dato.';
comment on column soppregistreringer.prosent is 'antall / normal × 100, avrundet. NULL når normalen er 0.';
comment on column soppregistreringer.tynt is 'normal < 50, eller største år > 3 × minste år.';
comment on column soppregistreringer.per_aar is 'Tidligere års tall på samme dato: {"2023": n, "2024": n, "2025": n}.';
comment on column soppregistreringer.grenser is 'Grensene som ble brukt: {"2023": {"dato": "2023-09-12", "id": 32960925}, …}.';

notify pgrst, 'reload schema';
