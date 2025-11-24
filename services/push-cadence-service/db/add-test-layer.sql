-- Add Layer 4 (Test) to the notification_layers table
INSERT INTO notification_layers (id, name, description) VALUES
(4, 'Test', 'Test notifications for development and validation purposes')
ON CONFLICT (id) DO NOTHING;