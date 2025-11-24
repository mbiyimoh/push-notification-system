# Layer 0 → Layer 5 Database Migration Instructions

## Overview
This migration updates the Neon.tech database to reflect the shift of "New User Waterfall" push notifications from Layer 0 to Layer 5. This change was made to fix cadence filtering issues where Layer 0 was bypassed due to JavaScript truthiness (0 is falsy).

## Migration File
- **File:** `migrate-layer-0-to-5.sql`
- **Purpose:** Migrates database schema and existing data from Layer 0 to Layer 5

## Pre-Migration Checklist
1. ✅ Ensure both push-blaster and push-cadence-service are updated with Layer 5 logic
2. ✅ Verify all UI components now use Layer 5 instead of Layer 0
3. ✅ Confirm no active automations are scheduled to run during migration
4. 🔲 Backup the database (recommended)

## Migration Steps

### Step 1: Connect to Neon.tech Database
```bash
# Use your Neon.tech connection string from .env
psql "YOUR_NEON_DATABASE_URL"
```

### Step 2: Run the Migration Script
```sql
-- Execute the migration
\i apps/push-cadence-service/db/migrate-layer-0-to-5.sql
```

### Step 3: Verify Migration Results
```sql
-- Check notification_layers table
SELECT * FROM notification_layers ORDER BY id;
-- Expected: Layer 0 removed, Layer 5 added

-- Check cadence_rules table  
SELECT * FROM cadence_rules WHERE name LIKE '%layer_%_cooldown%';
-- Expected: layer_0_cooldown_hours inactive, layer_5_cooldown_hours active

-- Check user_notifications migration
SELECT layer_id, COUNT(*) FROM user_notifications GROUP BY layer_id ORDER BY layer_id;
-- Expected: No layer_id = 0, all migrated to layer_id = 5
```

## What the Migration Does

1. **Adds Layer 5** to `notification_layers` table:
   - ID: 5
   - Name: "Layer 5" 
   - Description: "New User Series: Educational onboarding notifications for new users"

2. **Adds Layer 5 Cooldown Rule** to `cadence_rules` table:
   - Name: `layer_5_cooldown_hours`
   - Value: 96 hours (same as Layer 0)
   - Description: "Minimum time in hours between Layer 5 (New User Series) notifications for a single user."

3. **Migrates Existing Data** in `user_notifications` table:
   - All records with `layer_id = 0` updated to `layer_id = 5`

4. **Removes Layer 0** from `notification_layers` table:
   - Deletes the Layer 0 entry

5. **Deactivates Layer 0 Rule** in `cadence_rules` table:
   - Sets `is_active = false` for `layer_0_cooldown_hours`
   - Updates description to indicate deprecation

## Post-Migration Verification

### Test the Updated System
1. **Verify Cadence API** accepts Layer 5:
   ```bash
   curl -X POST http://localhost:3002/api/filter-audience \
     -H "Content-Type: application/json" \
     -d '{"userIds": ["test-user-id"], "layerId": 5}'
   ```

2. **Test Automation with Layer 5**:
   - Run a test execution of the "Daily Generate New User Waterfall" automation
   - Verify Layer 5 pushes go through cadence filtering (no bypass)
   - Confirm database tracking works for Layer 5

3. **Check Layer Validation**:
   - Confirm Layer 0 is rejected: `{"userIds": ["test"], "layerId": 0}` → Error
   - Confirm Layer 5 is accepted: `{"userIds": ["test"], "layerId": 5}` → Success

## Rollback Plan (If Needed)
If issues arise, you can rollback by:

1. **Re-add Layer 0**:
   ```sql
   INSERT INTO notification_layers (id, name, description) VALUES
   (0, 'Layer 0', 'New User Series: Educational onboarding notifications for new users');
   ```

2. **Reactivate Layer 0 Rule**:
   ```sql
   UPDATE cadence_rules 
   SET is_active = true, description = 'Minimum time in hours between Layer 0 (New User Series) notifications for a single user.'
   WHERE name = 'layer_0_cooldown_hours';
   ```

3. **Migrate Data Back**:
   ```sql
   UPDATE user_notifications SET layer_id = 0 WHERE layer_id = 5;
   ```

4. **Revert Code Changes** in both services to use Layer 0 logic

## Final System State
After migration:
- **Layer 1**: Platform-Wide Moments
- **Layer 2**: Product/Trend Triggers  
- **Layer 3**: Behavior-Responsive (72-hour cooldown)
- **Layer 4**: Test (bypasses cadence filtering)
- **Layer 5**: New User Series (96-hour cooldown, proper cadence filtering) ✨

The critical fix: **Layer 5 will now properly enforce cadence filtering**, unlike Layer 0 which was bypassed due to JavaScript falsy evaluation.
