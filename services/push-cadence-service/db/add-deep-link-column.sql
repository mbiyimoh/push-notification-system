-- Add deep_link column to user_notifications table for historical data restoration
ALTER TABLE user_notifications ADD COLUMN IF NOT EXISTS deep_link TEXT;