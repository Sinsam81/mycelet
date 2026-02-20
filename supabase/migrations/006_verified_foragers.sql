-- ============================================
-- Migration 006: Verified foragers (forum trust badge)
-- ============================================

CREATE TABLE IF NOT EXISTS verified_foragers (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'trusted_forager'
    CHECK (role IN ('trusted_forager', 'expert', 'community_verifier', 'moderator')),
  badge_label TEXT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER verified_foragers_updated_at
  BEFORE UPDATE ON verified_foragers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE verified_foragers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Verified foragers are visible to everyone" ON verified_foragers
  FOR SELECT USING (true);

CREATE POLICY "Service role manages verified foragers" ON verified_foragers
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Moderators manage verified foragers" ON verified_foragers
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM moderator_roles mr
      WHERE mr.user_id = auth.uid() AND mr.role IN ('moderator', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM moderator_roles mr
      WHERE mr.user_id = auth.uid() AND mr.role IN ('moderator', 'admin')
    )
  );

