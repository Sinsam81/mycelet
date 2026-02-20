-- ============================================
-- Migration 007: Stripe webhook idempotency log
-- ============================================

CREATE TABLE IF NOT EXISTS billing_webhook_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'failed')),
  payload JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_received_at
  ON billing_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_billing_webhook_events_status
  ON billing_webhook_events(status);

ALTER TABLE billing_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role manages billing webhook events" ON billing_webhook_events
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
