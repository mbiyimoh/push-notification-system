# Push-Blaster Service Developer Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Dependencies & Key Functions](#dependencies--key-functions)
3. [User Experience Flow](#user-experience-flow)
4. [File & Code Mapping](#file--code-mapping)
5. [Critical Notes & Pitfalls](#critical-notes--pitfalls)
6. [Common Development Scenarios](#common-development-scenarios)
7. [Testing Strategy](#testing-strategy)
8. [Quick Reference](#quick-reference)

---

## Architecture Overview

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                    PUSH-BLASTER SERVICE                           │
│                     (Next.js 15.3.5)                              │
└──────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
   ┌──────────┐         ┌──────────┐         ┌──────────┐
   │   Web UI │         │  API     │         │ Cron    │
   │ (React)  │         │ Routes   │         │ Jobs    │
   └──────────┘         └──────────┘         └──────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
  ┌──────────────────┐              ┌──────────────────────┐
  │ Automation       │              │ Script Executor      │
  │ Engine           │              │ (Python Scripts)     │
  │                  │              │                      │
  │ - Scheduling     │              │ - Audience queries   │
  │ - Timeline mgmt  │              │ - CSV generation     │
  │ - Execution      │              │ - Data processing    │
  └──────────────────┘              └──────────────────────┘
        │                                    │
        │                    ┌───────────────┘
        │                    │
        ▼                    ▼
  ┌──────────────────────────────────┐
  │  Automation Storage System        │
  │  (File-based JSON storage)        │
  │  Location: /app/.automations/     │
  │                                   │
  │  Structure:                       │
  │  ├─ /automations/*.json (configs) │
  │  ├─ /templates/*.json             │
  │  └─ /executions/*.json            │
  └──────────────────────────────────┘
        │
        ▼
  ┌──────────────────┐
  │ Audience Cache   │
  │ /audience-cache/ │
  └──────────────────┘
        │
        ├──────────────────────┬──────────────────┐
        │                      │                  │
        ▼                      ▼                  ▼
  ┌──────────┐         ┌──────────────┐    ┌──────────┐
  │ Firebase │         │ PostgreSQL   │    │ Push     │
  │ (Push)   │         │ Database     │    │ Cadence  │
  │ Messaging│         │              │    │ Service  │
  └──────────┘         └──────────────┘    └──────────┘
```

### Core Components

#### 1. **AutomationEngine** (`src/lib/automationEngine.ts`)
- **Singleton pattern**: Global instance created at module load time
- **Cron scheduling**: Uses node-cron for reliable schedule-based execution
- **Execution timeline**: 30-minute lead time with 5-phase execution pipeline
- **Process cleanup**: Destroys all cron jobs on shutdown
- **Key methods**:
  - `scheduleAutomation()`: Create and schedule a cron job
  - `executeAutomation()`: Orchestrate entire execution timeline
  - `terminateExecution()`: Emergency stop during cancellation window
  - `getExecutionStatus()`: Monitor active execution phases

#### 2. **AutomationStorage** (`src/lib/automationStorage.ts`)
- **File-based persistence**: JSON files in `/app/.automations/`
- **Directory structure**:
  - `.automations/` - Root automations
  - `.automations/templates/` - Reusable templates
  - `.automations/executions/` - Execution logs
- **Methods**:
  - `saveAutomation()`: Persist automation config
  - `loadAutomation()`: Retrieve by ID
  - `listAutomations()`: Query with optional filters
  - `deleteAutomation()`: Remove automation

#### 3. **ScriptExecutor** (`src/lib/scriptExecutor.ts`)
- **Python script execution**: Spawns child processes for audience generation
- **Output management**: CSV files stored in `.script-outputs/`

#### 4. **AudienceProcessor** (`src/lib/audienceProcessor.ts`)
- **Parallel processing**: Batch-processes audiences (3 at a time max)
- **Caching**: Stores generated audiences for sequence execution

#### 5. **Firebase Integration** (`src/lib/firebaseAdmin.ts`)
- **Admin SDK**: Initialized with credentials from environment
- **Methods**:
  - `getPushClient()`: Get Firebase Messaging instance

---

## Dependencies & Key Functions

### External Dependencies

#### **Firebase Admin SDK** (`firebase-admin@^13.4.0`)
```typescript
const messaging = getPushClient();
await messaging.sendMulticast(message);
```
- Requires: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`
- Handles multicast push delivery to device tokens

#### **PostgreSQL Database** (`pg@^8.16.3`)
```typescript
import pool from '@/lib/db';
const result = await pool.query('SELECT * FROM users');
```
- Tracks automation execution history
- Table: `automation_executions`

#### **Push-Cadence-Service** (sibling service)
```
Location: ../push-cadence-service/
Purpose: Frequency cap enforcement for recurring automations
Port: 3002 (default)
```

#### **Node-Cron** (`node-cron@^4.2.1`)
```typescript
const cronJob = cron.schedule('0 11 * * *', callback, { timezone: 'America/Chicago' });
cronJob.start();
```

### Internal Key Functions

#### **Timeline Execution Pipeline**
Located in `automationEngine.ts:executeTimeline()`

```typescript
// Phase 1: Audience Generation (T-30 minutes)
await executeAudienceGeneration(automation, executionConfig);

// Phase 2: Test Push Sending (T-25 minutes)
await executeTestSending(automation, executionConfig);

// Phase 3: Cancellation Window (T-25 to T-0)
await executeCancellationWindow(automation, executionConfig);

// Phase 4: Live Execution (T-0)
await executeLiveSending(automation, executionConfig);

// Phase 5: Cleanup
await executeCleanup(automation, executionConfig);
```

#### **Cron Expression Builder**
Located in `automationEngine.ts:buildCronExpression()`

**Critical timing logic:**
- `executionTime` = desired SEND time (when users receive pushes)
- Cron job runs at: `executionTime - leadTimeMinutes`
- Test mode: 3-minute lead time
- Real mode: 30-minute lead time

---

## User Experience Flow

### Creating an Automation via UI

**Path:** `/create-automation` (UI form)

```typescript
const automation = {
  name: "Layer 2 Trending Shoes Push",
  type: "single_push",  // or "sequence", "recurring"
  schedule: {
    frequency: "daily",
    executionTime: "11:45",  // Send time in UI
    timezone: "America/Chicago",
    leadTimeMinutes: 30
  },
  pushSequence: [
    {
      title: "Check out trending shoes",
      body: "The hottest shoes in the market...",
      deepLink: "https://tradeblock.us/shoes",
      layerId: 2
    }
  ],
  audienceCriteria: {
    customScript: {
      scriptId: "generate_layer_2_push_csv",
      parameters: { lookback_days: 30 }
    }
  },
  settings: {
    testUserIds: ["user1", "user2"],
    dryRunFirst: true,
    cancellationWindowMinutes: 25
  }
}
```

### Scheduling Push Notifications

**Phase Timeline** (30-minute lead time)

```
11:15 AM → Automation START (cron triggers)
         ↓
11:15-11:20 → Phase 1: Audience Generation
         ↓
11:20-11:25 → Phase 2: Test Push Sending
         ↓
11:25-11:40 → Phase 3: Cancellation Window (15 min)
         ↓
11:40-11:45 → Phase 4: Live Execution
         ↓
11:45 AM → SEND COMPLETE
```

### Audience Targeting & Filtering

**Query Execution Flow**

```typescript
// Option A: Custom Script (Recommended)
const criteria = {
  customScript: {
    scriptId: "generate_layer_2_push_csv",
    parameters: { lookback_days: 30 }
  }
}

// Option B: Database Query
const criteria = {
  trustedTraderStatus: "trusted",
  activityDays: 30,
  tradingDays: 7,
  minTrades: 5
}

// Option C: Manual CSV Upload
const criteria = {
  customQuery: "SELECT user_id FROM manual_audience.csv"
}
```

### Delivery via Firebase

**Push Delivery Process**

```typescript
// 1. Load CSV audience file
const userIds = loadCsvUserIds(csvPath);

// 2. Fetch device tokens from GraphQL
const tokens = await fetchDeviceTokens(userIds);

// 3. Build Firebase message
const message = {
  notification: { title, body },
  data: { deepLink, layerId }
}

// 4. Send in batches (500 tokens per batch)
for (let i = 0; i < tokens.length; i += 500) {
  const batch = tokens.slice(i, i + 500);
  const response = await admin.messaging().sendMulticast({
    tokens: batch,
    ...message
  });
}
```

---

## File & Code Mapping

### API Routes Structure

```
src/app/api/
├── automation/
│   ├── recipes/
│   │   ├── route.ts           # CRUD for automations
│   │   └── [id]/route.ts      # Get/update/delete specific automation
│   ├── sequences/
│   │   ├── route.ts           # Sequence automation management
│   │   └── [id]/route.ts
│   ├── templates/
│   │   ├── route.ts           # Template management
│   │   └── [id]/route.ts
│   ├── test/
│   │   ├── route.ts           # Run test push sequence
│   │   ├── [id]/route.ts      # Test specific automation
│   │   └── [id]/kill/route.ts # Kill running test execution
│   ├── control/route.ts       # Cancel/pause/resume automation
│   ├── monitor/route.ts       # Get execution status
│   ├── audit/route.ts         # Execution history
│   ├── debug/route.ts         # Debug info
│   └── restore/route.ts       # Manual restoration from storage
├── send-push/route.ts         # Traditional single push
├── scheduled-pushes/
│   ├── route.ts               # CRUD for scheduled pushes
│   └── [id]/route.ts
├── query-audience/route.ts    # Execute audience query
├── execute-query/route.ts     # Run Python script manually
├── push-logs/route.ts         # Retrieve push delivery logs
├── health/route.ts            # Service health check
└── scripts/route.ts           # List available scripts
```

### Library Modules

```
src/lib/
├── automationEngine.ts        # Core orchestrator (singleton)
├── automationStorage.ts       # File-based persistence
├── scriptExecutor.ts          # Python script spawning
├── audienceProcessor.ts       # Parallel audience generation
├── automationIntegration.ts   # External service calls
├── automationLogger.ts        # Structured logging
├── automationTester.ts        # Test execution logic
├── firebaseAdmin.ts           # Firebase initialization
├── variableProcessor.ts       # Template variable substitution
├── db.ts                      # PostgreSQL connection pool
└── types/
    └── automation.ts          # TypeScript interfaces
```

### UI Components

```
src/app/
├── page.tsx                   # Home page (push dashboard)
├── create-automation/
│   └── page.tsx              # Create automation form
├── edit-automation/
│   └── [id]/page.tsx         # Edit existing automation
├── test-automation/
│   └── [id]/page.tsx         # Manual test execution
└── components/
    ├── Button.tsx
    ├── Input.tsx
    └── Textarea.tsx
```

---

## Critical Notes & Pitfalls

### 1. File-Based Automation Storage Location

**Path:** `/app/.automations/`
- **Not recommended for production scaling** - single-machine dependency
- **Requires persistent volume** in containerized environments

**Impact:**
```typescript
// Without persistent volume:
AUTOMATION LOST → Engine can't restore on restart → Jobs disappear

// With persistent volume:
AUTOMATION SAVED → Engine restores on startup → Jobs resume correctly
```

### 2. Python Script Execution

**Critical Path:** `ScriptExecutor → spawn() → child process → Python script`

**Pitfalls:**

```typescript
// PITFALL 1: Script not found
const result = await scriptExecutor.executeScript('invalid_script');
// Error: ENOENT: no such file or directory

// PITFALL 2: Timeout on long-running scripts
// FIX: Pass estimatedRuntime parameter
const result = await scriptExecutor.executeScript('generate_new_user_waterfall', {
  timeoutMs: 20 * 60 * 1000  // 20 minute timeout
});
```

### 3. Environment Variable Requirements

**Critical variables** (service won't start without these):

```bash
# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Database
DATABASE_URL=postgres://user:password@host:port/dbname

# Services
CADENCE_SERVICE_URL=http://localhost:3002
```

### 4. Health Endpoint Behavior

**Endpoint:** `GET /api/health`

**Returns:**
```json
{
  "status": "healthy|degraded|critical",
  "service": "push-blaster",
  "automationEngine": {
    "scheduledJobsCount": 5,
    "expectedJobsCount": 5,
    "divergence": 0
  },
  "dependencies": {
    "database": "connected|degraded|not_configured",
    "cadence": "healthy|degraded|unreachable|not_configured"
  }
}
```

**Critical:** Always returns HTTP 200 for Railway healthcheck

### 5. Singleton Pattern Race Conditions

**Solution:** Global singleton with production/development modes

```typescript
if (process.env.NODE_ENV === 'production') {
  global._automationEngineProductionInstance ||= new AutomationEngine();
  return global._automationEngineProductionInstance;
}
```

### 6. Cron Job Cleanup on Shutdown

**Critical:** All cron jobs must be destroyed on process exit

```typescript
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
process.on('exit', cleanup);
```

### 7. Test Mode vs Real Mode Lead Times

```typescript
// REAL MODE (production automations)
schedule.leadTimeMinutes = 30

// TEST MODE (test automations)
schedule.leadTimeMinutes = 3
```

---

## Common Development Scenarios

### Scenario 1: Adding a New Automation Type

**Steps:**

1. **Update type definitions** (`src/types/automation.ts`)
```typescript
export type AutomationType =
  | 'single_push'
  | 'sequence'
  | 'recurring'
  | 'time_based_trigger';  // NEW
```

2. **Create automation handler** (`src/lib/automationEngine.ts`)

3. **Update UI form** (`src/app/create-automation/page.tsx`)

4. **Update API validation** (`src/app/api/automation/recipes/route.ts`)

### Scenario 2: Debugging Failed Notifications

**Investigation steps:**

1. **Check automation logs**
```bash
tail -f /app/.automations/executions/*.json | grep "automation-id"
```

2. **Review push delivery logs**
```bash
cat /app/.push-logs/{jobId}.json | jq '.batches[] | select(.status == "failed")'
```

3. **Verify audience generation**
```bash
ls -la /app/.script-outputs/
head -20 /app/.script-outputs/automation-id-*.csv
```

4. **Test Firebase delivery directly**
```typescript
POST /api/send-push
{
  "title": "Test",
  "body": "Test message",
  "userIds": ["test-user-1", "test-user-2"]
}
```

### Scenario 3: Extending Audience Filtering

**Goal:** Add filter for "last purchase amount > $100"

**Steps:**

1. **Update AudienceCriteria type**
2. **Add to UI form**
3. **Update audience processor**
4. **Update database query**

---

## Testing Strategy

### Local Development Testing

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env

# 3. Start development server
npm run dev:push-only

# 4. Open UI
http://localhost:3001
```

**Test Automation Creation:**

```bash
curl -X POST http://localhost:3001/api/automation/recipes \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Automation",
    "type": "single_push",
    "schedule": {
      "frequency": "once",
      "startDate": "2024-11-24",
      "executionTime": "14:30",
      "leadTimeMinutes": 3
    },
    "pushSequence": [
      {
        "title": "Test",
        "body": "Testing automation",
        "layerId": 1
      }
    ],
    "settings": {
      "testUserIds": ["test-user-1"],
      "dryRunFirst": true
    }
  }'
```

**Manual Verification:**

```bash
# Check cron job was scheduled
curl http://localhost:3001/api/automation/debug

# Monitor execution
watch -n 1 'curl http://localhost:3001/api/automation/monitor'
```

---

## Quick Reference

### npm Scripts

```bash
npm run dev              # Start push-blaster + cadence-service
npm run dev:push-only   # Just push-blaster
npm run build           # Build Next.js app
npm run start           # Start single service
npm run start:railway   # Railway deployment start
npm run lint            # ESLint
```

### Key API Endpoints

```
POST   /api/automation/recipes                  # Create automation
GET    /api/automation/recipes                  # List automations
GET    /api/automation/recipes/{id}             # Get automation
PUT    /api/automation/recipes/{id}             # Update automation
DELETE /api/automation/recipes/{id}             # Delete automation

GET    /api/automation/test/{id}                # Run test sequence
POST   /api/automation/control                  # Cancel/pause/resume
GET    /api/automation/monitor                  # Execution status
GET    /api/automation/debug                    # Debug info

POST   /api/send-push                           # Send single push
GET    /api/health                              # Service health
```

### Critical Configuration Values

```javascript
// Lead times
TEST_MODE_LEAD_TIME = 3 minutes
PRODUCTION_MODE_LEAD_TIME = 30 minutes
DEFAULT_CANCELLATION_WINDOW = 25 minutes

// Concurrency
MAX_AUDIENCE_BATCH_SIZE = 3
MAX_PUSH_BATCH_SIZE = 500

// Timeouts
CADENCE_SERVICE_TIMEOUT = 5 seconds
SCRIPT_EXECUTION_TIMEOUT = 5 minutes
```

### Environment Configuration

```bash
# Required
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
DATABASE_URL=postgres://...

# Optional but recommended
CADENCE_SERVICE_URL=http://localhost:3002
NODE_ENV=production|development
```

### File Structure for Automation Execution

```
.automations/
├── automation-id-123.json
├── templates/
│   └── onboarding-template.json
├── executions/
│   └── execution-id-001.json
└── audience-cache/
    └── automation-id-123/
        ├── cache-manifest.json
        └── push-1-audience.csv

.push-logs/
├── job-id-001.json
└── job-id-002.json

.script-outputs/
└── script-id-001-output.csv
```

---

## Troubleshooting Guide

### Issue: Automations Not Scheduling on Restart
**Solution:**
```bash
# Manual trigger restoration
curl -X POST http://localhost:3001/api/automation/restore
```

### Issue: Python Script Times Out
**Solution:**
```bash
SCRIPT_TIMEOUT_MS=900000  # 15 minutes
```

### Issue: Firebase Credentials Invalid
**Solution:**
```bash
# Verify Firebase key format
echo "$FIREBASE_PRIVATE_KEY" | head -5
# Should show: -----BEGIN PRIVATE KEY-----
```

---

**Last Updated:** 2025-11-24
**Service Version:** 0.1.0
**Next.js:** 15.3.5
