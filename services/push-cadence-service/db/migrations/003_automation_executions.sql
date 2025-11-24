-- Create automation_executions table for persistent tracking
-- Migration: 003_automation_executions.sql
-- Purpose: Track all automation executions for historical analysis and alerting
--
-- MIGRATION NOTES:
-- - Removed Supabase-specific GRANT statements (not compatible with Neon/Railway)
-- - Neon uses database-level permissions, not table-level GRANTs
-- - If migrating from Supabase to Neon, ensure service role has necessary permissions
-- - Safe to run multiple times (CREATE TABLE IF NOT EXISTS)
-- - Part of 5-layer automation resilience system (Layer 5: Database Execution Tracking)
--
-- Dependencies: None (standalone migration)
-- Created: 2025-11-22
-- Modified: 2025-11-23 - Removed Supabase GRANT statements for Neon compatibility
--
-- Deployment Integration:
-- - Runs automatically via postinstall hook in package.json
-- - Migration script: scripts/run-migration.js
-- - Idempotent: Skips if table already exists

CREATE TABLE IF NOT EXISTS automation_executions (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id UUID NOT NULL,
  automation_name VARCHAR(255) NOT NULL,

  -- Execution timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Execution status
  status VARCHAR(50) NOT NULL CHECK (status IN ('running', 'completed', 'failed', 'aborted')),
  current_phase VARCHAR(50),

  -- Metrics
  audience_size INTEGER,
  pushes_sent INTEGER DEFAULT 0,
  pushes_failed INTEGER DEFAULT 0,

  -- Error tracking
  error_message TEXT,
  error_stack TEXT,

  -- Metadata
  instance_id VARCHAR(100),
  execution_mode VARCHAR(50) CHECK (execution_mode IN ('test-live-send', 'live-send', 'real-dry-run')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_automation_executions_automation_id ON automation_executions(automation_id);
CREATE INDEX idx_automation_executions_started_at ON automation_executions(started_at DESC);
CREATE INDEX idx_automation_executions_status ON automation_executions(status);
CREATE INDEX idx_automation_executions_automation_started ON automation_executions(automation_id, started_at DESC);

-- Comment on table
COMMENT ON TABLE automation_executions IS 'Persistent tracking of all automation executions for historical analysis and monitoring';

-- Comments on key columns
COMMENT ON COLUMN automation_executions.automation_id IS 'Foreign key to automation config (stored in .automations/ JSON files)';
COMMENT ON COLUMN automation_executions.duration_ms IS 'Total execution time from start to completion in milliseconds';
COMMENT ON COLUMN automation_executions.current_phase IS 'Last execution phase before completion (audience_generation, test_sending, cancellation_window, live_execution, cleanup)';
COMMENT ON COLUMN automation_executions.instance_id IS 'AutomationEngine instance ID for debugging duplicate instances';

-- View for last execution per automation
CREATE OR REPLACE VIEW automation_last_executions AS
SELECT DISTINCT ON (automation_id)
  automation_id,
  automation_name,
  started_at,
  completed_at,
  status,
  audience_size,
  pushes_sent,
  error_message
FROM automation_executions
ORDER BY automation_id, started_at DESC;

COMMENT ON VIEW automation_last_executions IS 'Most recent execution record for each automation (used for "last executed" queries)';

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_automation_execution_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER automation_executions_updated_at
BEFORE UPDATE ON automation_executions
FOR EACH ROW
EXECUTE FUNCTION update_automation_execution_timestamp();

-- Sample query examples (for documentation)
/*
-- Get all executions for an automation
SELECT * FROM automation_executions
WHERE automation_id = 'UUID_HERE'
ORDER BY started_at DESC
LIMIT 10;

-- Get last execution per automation
SELECT * FROM automation_last_executions;

-- Find failed executions in last 24 hours
SELECT * FROM automation_executions
WHERE status = 'failed'
AND started_at >= NOW() - INTERVAL '24 hours'
ORDER BY started_at DESC;

-- Calculate success rate per automation
SELECT
  automation_name,
  COUNT(*) FILTER (WHERE status = 'completed') as success_count,
  COUNT(*) FILTER (WHERE status = 'failed') as failure_count,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / COUNT(*), 2) as success_rate_pct
FROM automation_executions
WHERE started_at >= NOW() - INTERVAL '30 days'
GROUP BY automation_name
ORDER BY success_rate_pct ASC;
*/
