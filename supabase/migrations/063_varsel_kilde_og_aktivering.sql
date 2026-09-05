-- 063: Måling på varselpåmeldinger — hvor de kom fra, og om de ble brukt.
--
-- Strategien (docs/strategi-2026-2027.md, uke 1 A): partnerplasseringer og
-- presse kan ikke vurderes uten at hver påmelding vet hvor den kom fra, og
-- uten at vi ser om abonnenten faktisk åpnet områdets prognose etterpå.
--
--   kilde            samme format som user_metadata.kilde («bergen-snf/host-2026»,
--                    «sok:google.no»); NULL = direkte/ukjent. Første besøk vinner.
--   forste_apnet_at  første MENNESKELIGE klikk fra et varsel til områdesiden
--                    (aktivering): minst ti minutter etter utsendingen.
--   sist_apnet_at    siste klikk uansett (også e-postskannere).
--
-- Klikkene registreres av /api/soppvarsel/klikk, som deretter sender leseren
-- videre. E-postskannere følger GET-lenker ved levering; derfor avgjøres
-- skanner/menneske i klikkøyeblikket, ikke i rapporten.

alter table alert_subscriptions
  add column if not exists kilde text,
  add column if not exists forste_apnet_at timestamptz,
  add column if not exists sist_apnet_at timestamptz;
