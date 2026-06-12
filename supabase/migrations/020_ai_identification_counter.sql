-- ============================================
-- Migration 020: durable per-call AI identification counter
-- ============================================
--
-- BUG: the free "5 AI per day" cap in /api/identify counted SAVED findings
-- (ai_used = true) in the last 24h. But the expensive Kindwise call happens
-- whether or not the user saves the result — so a free user who identifies
-- without saving never counted against the cap (only the 20/min burst limit
-- applied). Kindwise is paid past 50 credits, so that's a real cost leak and it
-- softens the premium hook.
--
-- FIX: log one row here per *successful identify call*; the route counts the
-- last 24h of rows. RLS is ON with NO policies, so only the service role (which
-- bypasses RLS) can read/write it — users can neither read it nor delete rows to
-- reset their own quota.

CREATE TABLE IF NOT EXISTS ai_identifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_identifications_user_time
  ON ai_identifications (user_id, created_at DESC);

ALTER TABLE ai_identifications ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service-role only. (Optional later: a retention job
-- can DELETE rows older than ~2 days — only the last 24h is ever read.)
