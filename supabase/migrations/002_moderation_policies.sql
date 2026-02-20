-- Moderator access for report handling

CREATE TABLE IF NOT EXISTS moderator_roles (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'moderator' CHECK (role IN ('moderator', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE moderator_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Moderators can read roles" ON moderator_roles;
CREATE POLICY "Moderators can read roles" ON moderator_roles
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = auth.uid() AND mr.role IN ('moderator', 'admin')
    )
  );

DROP POLICY IF EXISTS "Admins manage moderator roles" ON moderator_roles;
CREATE POLICY "Admins manage moderator roles" ON moderator_roles
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = auth.uid() AND mr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = auth.uid() AND mr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Moderators can read all reports" ON reports;
CREATE POLICY "Moderators can read all reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = auth.uid() AND mr.role IN ('moderator', 'admin')
    )
  );

DROP POLICY IF EXISTS "Moderators can update report status" ON reports;
CREATE POLICY "Moderators can update report status" ON reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = auth.uid() AND mr.role IN ('moderator', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = auth.uid() AND mr.role IN ('moderator', 'admin')
    )
  );
