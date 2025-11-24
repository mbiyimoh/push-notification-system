-- Migration: Layer 0 → Layer 5 Migration
-- This script migrates the new user waterfall push notifications from Layer 0 to Layer 5

-- Step 1: Add Layer 5 to notification_layers table
INSERT INTO notification_layers (id, name, description) VALUES
(5, 'Layer 5', 'New User Series: Educational onboarding notifications for new users')
ON CONFLICT (id) DO NOTHING;

-- Step 2: Add Layer 5 cooldown rule (96 hours, same as Layer 0)
INSERT INTO cadence_rules (name, value_in_hours, value_count, description) VALUES
('layer_5_cooldown_hours', 96, NULL, 'Minimum time in hours between Layer 5 (New User Series) notifications for a single user.')
ON CONFLICT (name) DO NOTHING;

-- Step 3: Migrate existing Layer 0 user_notifications to Layer 5
UPDATE user_notifications 
SET layer_id = 5 
WHERE layer_id = 0;

-- Step 4: Remove Layer 0 from notification_layers table
DELETE FROM notification_layers WHERE id = 0;

-- Step 5: Remove Layer 0 cooldown rule (optional, can be kept for historical reference)
UPDATE cadence_rules 
SET is_active = false, description = 'DEPRECATED: Migrated to layer_5_cooldown_hours'
WHERE name = 'layer_0_cooldown_hours';

-- Verification queries (commented out)
-- SELECT * FROM notification_layers ORDER BY id;
-- SELECT * FROM cadence_rules WHERE name LIKE '%layer_%_cooldown%';
-- SELECT layer_id, COUNT(*) FROM user_notifications GROUP BY layer_id ORDER BY layer_id;
