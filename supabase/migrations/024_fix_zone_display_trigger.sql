-- 024: Fire set_display_location on EVERY findings update (not just the
-- original visibility/latitude/longitude column list).
--
-- Pre-launch audit finding (RLS/data-exposure, MEDIUM): the trigger was created
-- once in 001 as `BEFORE INSERT OR UPDATE OF visibility, latitude, longitude`.
-- Migration 005 only did CREATE OR REPLACE FUNCTION, which does NOT change a
-- trigger's UPDATE OF column list. So an owner PATCH that flips is_zone_finding
-- / zone_precision_km does not re-stamp display_*, leaving the precise coordinate
-- exposed through public_findings for a public zone finding. No in-app path hits
-- this today (zone mode is only set at INSERT), but it is a latent hole and a
-- trap for any future "edit finding" UI. Recreate the trigger without the column
-- filter (the function is cheap + idempotent) and backfill existing zone rows.

DROP TRIGGER IF EXISTS findings_set_display_location ON findings;
CREATE TRIGGER findings_set_display_location
  BEFORE INSERT OR UPDATE ON findings
  FOR EACH ROW EXECUTE FUNCTION set_display_location();

-- Re-stamp display_* for existing zone rows the old trigger may have left stale.
-- A no-op self-update fires the (now-corrected) BEFORE UPDATE trigger.
UPDATE findings SET updated_at = updated_at WHERE is_zone_finding = true;
