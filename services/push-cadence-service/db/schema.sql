-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table for defining notification layers
CREATE TABLE notification_layers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT
);

-- Insert the three defined layers
INSERT INTO notification_layers (id, name, description) VALUES
(1, 'Layer 1', 'Platform-Wide Moments: Critical announcements, drops, feature launches'),
(2, 'Layer 2', 'Product/Trend Triggers: Highly traded shoes, wishlist spikes, market alerts'),
(3, 'Layer 3', 'Behavior-Responsive: Recent intent signals (offers, wishlists, unclaimed opportunities)')
ON CONFLICT (id) DO NOTHING;

-- Table for storing configurable cadence rules
CREATE TABLE cadence_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    value_in_hours INT,
    value_count INT,
    description TEXT,
    is_active BOOLEAN DEFAULT true
);

-- Insert the initial rules
INSERT INTO cadence_rules (name, value_in_hours, value_count, description) VALUES
('layer_3_cooldown_hours', 72, NULL, 'Minimum time in hours between Layer 3 notifications for a single user.'),
('combined_l2_l3_limit_hours', 168, 3, 'Maximum number of combined Layer 2 and Layer 3 notifications a user can receive in a 7-day (168-hour) window.')
ON CONFLICT (name) DO NOTHING;

-- Main table for tracking each notification sent to each user
CREATE TABLE user_notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    notification_id UUID, -- Optional: Can link to a specific campaign or notification entity later
    layer_id INT NOT NULL REFERENCES notification_layers(id),
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    push_title TEXT,
    push_body TEXT,
    audience_description TEXT
);

-- Create indexes for efficient querying
CREATE INDEX idx_user_notifications_user_id_sent_at ON user_notifications (user_id, sent_at DESC);
CREATE INDEX idx_user_notifications_layer_id ON user_notifications (layer_id);
CREATE INDEX idx_user_notifications_sent_at ON user_notifications (sent_at DESC);

-- Optional: Add a foreign key constraint if your main app has a users table with UUIDs
-- ALTER TABLE user_notifications ADD CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES users(id);
