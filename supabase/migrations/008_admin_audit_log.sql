-- ============================================
-- Migration 008: Append-only admin audit log
-- ============================================
--
-- Records who-did-what-to-whom for sensitive operations: admin role changes,
-- account self-deletion (GDPR Art. 17), and any future admin actions.
--
-- Design choices worth knowing about:
--
--   * actor_id and target_user_id are plain UUIDs WITHOUT foreign keys to
--     auth.users. Audit logs must outlive their subjects — if a user is
--     deleted (cascading from auth.users) we still need their UUID in the
--     log for forensic cross-reference. ON DELETE SET NULL would defeat
--     the purpose.
--
--   * UPDATE and DELETE are blocked by triggers on this table — even for
--     the service role. Audit logs are append-only by construction. To
--     drop or alter the table later you'll need to disable the triggers
--     temporarily.
--
--   * RLS lets moderators/admins read but never write. Writes go through
--     the service-role admin client (bypasses RLS). No anon/authenticated
--     can insert.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Plain UUIDs (no FK) so the log persists across user deletions.
  actor_id UUID,
  action TEXT NOT NULL,
  target_user_id UUID,
  target_resource TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON admin_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON admin_audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON admin_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON admin_audit_log(created_at DESC);

-- Append-only enforcement: block UPDATE and DELETE for everyone, including
-- the service role. To rotate or maintain the table, drop these triggers
-- first.
CREATE OR REPLACE FUNCTION admin_audit_log_block_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only — UPDATE/DELETE not permitted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS admin_audit_log_no_update ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_update
  BEFORE UPDATE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_block_modification();

DROP TRIGGER IF EXISTS admin_audit_log_no_delete ON admin_audit_log;
CREATE TRIGGER admin_audit_log_no_delete
  BEFORE DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION admin_audit_log_block_modification();

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Moderators and admins can read the audit log (SELECT only).
DROP POLICY IF EXISTS "Moderators can read audit log" ON admin_audit_log;
CREATE POLICY "Moderators can read audit log" ON admin_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM moderator_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'moderator')
    )
  );

-- No INSERT policy. The service-role admin client bypasses RLS, so writes
-- happen through that path only. anon/authenticated cannot insert.
