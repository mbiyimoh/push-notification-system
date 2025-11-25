# Push Cadence Service Developer Guide

## Overview

The **Push Cadence Service** is a Next.js-based microservice that manages notification delivery frequency and prevents notification fatigue by enforcing cadence rules. It tracks all push notifications sent to users and prevents duplicate sends within configurable time windows.

**Service Location**: `/services/push-cadence-service/`
**Port**: 3002 (development), configurable via environment
**Database**: Neon PostgreSQL (via `PUSH_CADENCE_DATABASE_URL`)

---

## Architecture Overview

```
Push Blaster & Other Services
           │
           ├─→ POST /api/filter-audience (cadence filtering)
           ├─→ POST /api/track-notification (record sends)
           └─→ GET  /api/health (status check)
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
   PUSH CADENCE SERVICE      ADMIN ENDPOINTS
   (Next.js 15)              (CSV Import/Restore)

   API Routes:
   • filter-audience         (Core - prevent fatigue)
   • track-notification      (Core - record sends)
   • health                  (Monitoring)
   • restore-historical-data (Admin - import CSV)
   • convert-audience-to-history (Admin - migrate campaigns)
   • find-matching-logs      (Admin - Track Results matching)
   • update-deep-links       (Admin - retroactive updates)

   Core Library:
   • cadence.ts     (filtering logic, validation, CSV handling)
   • db.ts          (connection pooling)
   • startupValidation.ts (env checks)
        │
        └─→ Neon PostgreSQL Database
            (PUSH_CADENCE_DATABASE_URL)

            Tables:
            • notification_layers (5 layers)
            • cadence_rules (layer cooldowns)
            • user_notifications (tracking all sends)
            • automation_executions (execution history)
```

---

## Dependencies & Key Functions

### External Dependencies
- **Database**: Neon PostgreSQL with SSL + connection pooling
- **Node Packages**: next, pg, papaparse, react, dotenv-cli
- **Environment**: PUSH_CADENCE_DATABASE_URL (required for database features)

### Internal Key Functions

**Database Connection** (`src/lib/db.ts`):
- Singleton pool pattern with global persistence
- Graceful degradation if DATABASE_URL not set
- SSL configuration for Neon

**Cadence Rules Engine** (`src/lib/cadence.ts`):
- `getCadenceRules()` - Fetch active rules from database
- `filterUsersByCadence(userIds, layerId)` - Apply cadence filtering
- `trackNotification()` - Record a sent notification
- `validateHistoricalData()` - CSV validation before import
- `bulkInsertHistoricalNotifications()` - Batch insert with transactions
- `isValidUUID()` - UUID v4 validation (prevents SQL injection)

---

## User Experience Flow

### 1. Recording Push Notification Sends

**Trigger**: Push-blaster sends a notification

```
POST /api/track-notification
Body: {
  userId: "uuid",
  layerId: 1-5,
  pushTitle: "Title",
  pushBody: "Message",
  audienceDescription: "Segment"
}
↓
Inserts to user_notifications table
↓
Returns: { success: true, message: "..." }
```

### 2. Checking Cadence Rules (Preventing Fatigue)

**Trigger**: Before sending a batch of pushes

```
POST /api/filter-audience
Body: {
  userIds: ["uuid1", "uuid2", ...],
  layerId: 2 or 3
}
↓
Applies rules in order:
1. Layer 5 cooldown (96 hours if layer 5)
2. Layer 3 cooldown (72 hours if layer 3)
3. Combined L2/L3 limit (max 3 per 7 days)
4. Layer 1 bypass (no restrictions)
↓
Returns: {
  eligibleUserIds: ["uuid1", "uuid3", ...],
  excludedCount: 2
}
```

**Critical Rules**:
- Layer 1: Platform announcements (BYPASS - no restrictions)
- Layer 2: Product/trend triggers (COMBINED with L3 - max 3 per 7 days)
- Layer 3: Behavior-responsive (72-hour cooldown)
- Layer 4: Test layer (BYPASS - no restrictions)
- Layer 5: New user series (96-hour cooldown)

---

## File & Code Mapping

### API Routes (`src/app/api/`)

| Route | Method | Purpose | Calls |
|-------|--------|---------|-------|
| `/filter-audience` | POST | Cadence filtering | filterUsersByCadence() |
| `/track-notification` | POST | Record sends | trackNotification() |
| `/health` | GET | Health check | pool.query('SELECT 1') |
| `/restore-historical-data` | POST | CSV import | validateHistoricalData(), bulkInsertHistoricalNotifications() |
| `/convert-audience-to-history` | POST | Audience conversion | convertAudienceToHistoricalRecords() |
| `/find-matching-logs` | POST | Track Results matching | findMatchingTrackResults() |
| `/update-deep-links` | POST | Deep link updates | updateExistingRecordsWithDeepLinks() |

### Database Directory (`db/`)

- `schema.sql` - Initial schema (notification_layers, cadence_rules, user_notifications)
- `migrations/003_automation_executions.sql` - Automation execution tracking table
- `add-deep-link-column.sql` - Adds deep_link column
- `migrate-layer-0-to-5.sql` - Converts Layer 0 to Layer 5
- `README-LAYER-MIGRATION.md` - Migration documentation

### Library Modules (`src/lib/`)

- `db.ts` - Database connection (Pool with SSL, global persistence)
- `cadence.ts` - Core business logic (filtering + validation + CSV handling)
- `startupValidation.ts` - Environment validation at startup

---

## Connections to Other Parts

### Push-Blaster Integration

**1. Audience Filtering Before Send**:
```typescript
// From push-blaster/src/lib/automationIntegration.ts
const response = await fetch('http://localhost:3002/api/filter-audience', {
  method: 'POST',
  body: JSON.stringify({ userIds: audienceUserIds, layerId: automation.layerId })
});
const { eligibleUserIds, excludedCount } = await response.json();
```

**2. Recording Successful Sends**:
```typescript
await fetch('http://localhost:3002/api/track-notification', {
  method: 'POST',
  body: JSON.stringify({
    userId: user.id,
    layerId: automation.layerId,
    pushTitle, pushBody, audienceDescription
  })
});
```

### Database Schema

**Environment Variables**:
- `PUSH_CADENCE_DATABASE_URL` - Required for database features
- `DATABASE_URL` - Fallback for migration script
- `NODE_ENV` - Affects pool initialization

**Required Tables**:

1. **notification_layers** (5 layers)
   ```
   1 | Layer 1 | Platform-Wide Moments
   2 | Layer 2 | Product/Trend Triggers
   3 | Layer 3 | Behavior-Responsive
   4 | Layer 4 | Test
   5 | Layer 5 | New User Series
   ```

2. **cadence_rules** (3 active rules)
   ```
   layer_3_cooldown_hours: 72
   combined_l2_l3_limit_hours: 168 (max 3 per 7 days)
   layer_5_cooldown_hours: 96
   ```

3. **user_notifications** (primary tracking table)
   ```
   id (uuid PK) | user_id (uuid) | layer_id (int) | sent_at (timestamptz)
   push_title (text) | push_body (text) | audience_description (text)
   deep_link (text, nullable)

   Indexes:
   • (user_id, sent_at DESC)
   • (layer_id)
   • (sent_at DESC)
   ```

4. **automation_executions** (execution tracking)
   ```
   id | automation_id | automation_name | started_at | completed_at | status
   current_phase | audience_size | pushes_sent | pushes_failed
   ```

---

## Critical Notes & Pitfalls

### 1. Database Migrations on Startup

**Current**: `postinstall` hook runs migration (idempotent)

**Pitfalls**:
- In CI/CD without database: Table won't be created automatically
- Manual migration needed: `psql PUSH_CADENCE_DATABASE_URL < db/schema.sql`

### 2. Connection Pooling

**Default**: 10 max connections per instance

**To optimize**:
```typescript
new Pool({
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
})
```

### 3. Cadence Rule Logic

**Layer Bypass**: Layer 1 and 4 bypass all cadence rules

**Fail-Open Design**: If database error occurs, returns all users as eligible
- Trade-off: Allows duplicate sends but prevents blocking pushes

**Bug Prevention**:
- UUID validation required (prevents SQL injection)
- Parameterized queries ($1, $2) - no string concatenation

### 4. Layer 0 → Layer 5 Migration

**Why**: JavaScript falsy evaluation (`if (layerId === 0)` fails)

**What Changed**:
- All Layer 0 records migrated to Layer 5
- Layer 0 removed from notification_layers

---

## Common Development Scenarios

### Scenario 1: Adding a New Cadence Rule

**Goal**: Add 4-hour cooldown for Layer 2

**Steps**:
1. Insert into database:
   ```sql
   INSERT INTO cadence_rules (name, value_in_hours, value_count, description)
   VALUES ('layer_2_cooldown_hours', 4, NULL, 'Layer 2 min interval');
   ```

2. Update `filterUsersByCadence()` in `src/lib/cadence.ts`:
   ```typescript
   if (layerId === 2) {
       const l2CooldownHours = l2CooldownRule?.value_in_hours || 4;
       const query = `
           SELECT DISTINCT user_id FROM user_notifications
           WHERE user_id = ANY($1::uuid[])
             AND layer_id = 2
             AND sent_at >= NOW() - INTERVAL '${l2CooldownHours} hours'
       `;
       const result = await getPool().query(query, [validUserIds]);
       result.rows.forEach(row => excludedUserIds.add(row.user_id));
   }
   ```

3. Test:
   ```bash
   curl -X POST http://localhost:3002/api/filter-audience \
     -H "Content-Type: application/json" \
     -d '{"userIds": ["550e8400-e29b-41d4-a716-446655440000"], "layerId": 2}'
   ```

### Scenario 2: Modifying Database Schema

**Goal**: Add `sent_device_type` column

**Steps**:
1. Create migration: `db/add-device-type.sql`
   ```sql
   ALTER TABLE user_notifications
   ADD COLUMN IF NOT EXISTS sent_device_type VARCHAR(50);
   ```

2. Run migration:
   ```bash
   psql "$PUSH_CADENCE_DATABASE_URL" < db/add-device-type.sql
   ```

3. Update TypeScript types in `src/lib/cadence.ts`

### Scenario 3: Debugging Audience Queries

**Steps**:
1. Check recent history:
   ```sql
   SELECT * FROM user_notifications
   WHERE user_id = '550e8400-e29b-41d4-a716-446655440000'
   ORDER BY sent_at DESC LIMIT 10;
   ```

2. Check active rules:
   ```sql
   SELECT * FROM cadence_rules WHERE is_active = true;
   ```

---

## Testing Strategy

### Local Testing with Neon

**Setup**:
1. Create Neon project (neon.tech)
2. Set PUSH_CADENCE_DATABASE_URL in environment
3. Run: `npm install` (triggers postinstall → migration)
4. Verify: `psql "$PUSH_CADENCE_DATABASE_URL" -c "SELECT * FROM cadence_rules;"`

### API Testing

**Health Check**:
```bash
curl http://localhost:3002/api/health
# { status: "healthy", service: "push-cadence", database: "connected" }
```

**Filter Audience**:
```bash
curl -X POST http://localhost:3002/api/filter-audience \
  -H "Content-Type: application/json" \
  -d '{"userIds": ["550e8400-..."], "layerId": 3}'
```

**Track Notification**:
```bash
curl -X POST http://localhost:3002/api/track-notification \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "550e8400-...",
    "layerId": 3,
    "pushTitle": "Test",
    "pushBody": "Message",
    "audienceDescription": "Test"
  }'
```

---

## Quick Reference

### npm Scripts

```bash
npm run dev              # Dev server (port 3002, hot-reload)
npm run build            # Production bundle
npm start                # Start production
npm run start:railway    # Railway start with PORT env
npm run lint             # ESLint
npm run migrate          # Database migration
```

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/filter-audience` | POST | Cadence filtering |
| `/api/track-notification` | POST | Record sends |
| `/api/restore-historical-data` | POST | CSV import |
| `/api/convert-audience-to-history` | POST | Audience conversion |
| `/api/find-matching-logs` | POST | Track Results matching |
| `/api/update-deep-links` | POST | Deep link updates |

### Database Rules

**Cadence Values**:
- Layer 3: 72-hour cooldown
- Layer 5: 96-hour cooldown
- Combined L2+L3: Max 3 per 168 hours (7 days)

**Layers**:
- Layer 1: Platform announcements (bypass)
- Layer 2: Product/trend triggers (combined with L3)
- Layer 3: Behavior-responsive (72h cooldown)
- Layer 4: Test (bypass)
- Layer 5: New user series (96h cooldown)

### Environment Variables

```bash
PUSH_CADENCE_DATABASE_URL=postgresql://...  # Required
NODE_ENV=production|development
PORT=3002
```

---

## Troubleshooting

### PUSH_CADENCE_DATABASE_URL not configured
**Fix**: Set environment variable before starting service

### Database pool not initialized
**Cause**: DATABASE_URL missing on production
**Fix**: Set environment variable

### Cadence rules not found
**Fix**: Verify rules exist and run schema if empty:
```bash
psql "$PUSH_CADENCE_DATABASE_URL" < db/schema.sql
```

### CSV Import Fails
**Check**: Headers (user_id, layer_id, push_title, sent_at), valid UUIDs, layer_id 1-5

---

## Architecture Decisions

### 1. Fail-Open on Database Error
**Trade-off**: Allows duplicates but prevents blocking pushes
**Why**: Push delivery is critical; duplicates recoverable

### 2. Separate Service for Cadence
**Benefits**: Isolated logic, scalable, clean separation

### 3. Layer 1 Bypasses Cadence
**Assumption**: Layer 1 = critical announcements (must reach)

---

**Last Updated**: 2025-11-24
**Service Version**: 0.1.1
**Next.js**: 15.4.6
