-- Add Layer 0 (New User Series) to the notification_layers table
INSERT INTO notification_layers (id, name, description) VALUES
(0, 'Layer 0', 'New User Series: Educational onboarding notifications for new users')
ON CONFLICT (id) DO NOTHING;

-- Add Layer 0 cooldown rule (96 hours)
INSERT INTO cadence_rules (name, value_in_hours, value_count, description) VALUES
('layer_0_cooldown_hours', 96, NULL, 'Minimum time in hours between Layer 0 (New User Series) notifications for a single user.')
ON CONFLICT (name) DO NOTHING;