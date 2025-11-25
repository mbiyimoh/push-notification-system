# Push Notification System - Comprehensive Developer Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Dependencies & Key Functions](#dependencies--key-functions)
3. [User Experience Flow](#user-experience-flow)
4. [File & Code Mapping](#file--code-mapping)
5. [Service Connections](#service-connections)
6. [Critical Notes & Pitfalls](#critical-notes--pitfalls)
7. [Common Development Scenarios](#common-development-scenarios)
8. [Testing Strategy](#testing-strategy)
9. [Quick Reference](#quick-reference)

---

## Architecture Overview

### System Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                         PUSH NOTIFICATION SYSTEM                    │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────┐          ┌──────────────────────────┐     │
│  │  PUSH-BLASTER       │          │ PUSH-CADENCE-SERVICE     │     │
│  │  (Next.js - Port 3001)         │ (Next.js - Port 3002)    │     │
│  │                      │          │                          │     │
│  │  • Web UI            │◄────────►│ • Cadence Rules          │     │
│  │  • Push Scheduler    │ HTTP     │ • Frequency Filtering    │     │
│  │  • Automation Engine │(TCP:3002)│ • Notification Tracking  │     │
│  │  • CSV Upload        │          │ • History Management     │     │
│  │  • Manual Sends      │          │                          │     │
│  │  • Job Logging       │          │                          │     │
│  └─────────────────────┘          └──────────────────────────┘     │
│           │                                │                        │
│           │                                │                        │
│           ▼                                ▼                        │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │              FIREBASE CLOUD MESSAGING (FCM)              │     │
│  │         (Handles actual device push delivery)            │     │
│  └──────────────────────────────────────────────────────────┘     │
│           │                                                         │
│           ▼                                                         │
│  ┌──────────────────────────────────────────────────────────┐     │
│  │          USER DEVICES (iOS, Android, Web)                │     │
│  └──────────────────────────────────────────────────────────┘     │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                     DATABASE LAYER                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────┐   ┌──────────────────────────┐       │
│  │  RDS PostgreSQL          │   │  NEON PostgreSQL         │       │
│  │  (Main App Database)     │   │  (Cadence/History DB)    │       │
│  │                          │   │                          │       │
│  │  • users table           │   │  • user_notifications    │       │
│  │  • user_activities       │   │  • cadence_rules         │       │
│  │  • offers/trades         │   │  • notification_history  │       │
│  │  • inventory_items       │   │  • user_segments         │       │
│  │  • desired_items         │   │                          │       │
│  │  • wishlist_items        │   │                          │       │
│  │  • products              │   │                          │       │
│  │  • product_variants      │   │                          │       │
│  └──────────────────────────┘   └──────────────────────────┘       │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                   RAILWAY DEPLOYMENT                               │
├─────────────────────────────────────────────────────────────────────┤
│  • Docker-based deployment                                          │
│  • Environment-based scaling                                        │
│  • Restart policies: ON_FAILURE with max 10 retries                │
└────────────────────────────────────────────────────────────────────┘
```

### Key Architecture Patterns

**Service Communication:**
- Push-Blaster (port 3001) → Push-Cadence (port 3002) via HTTP
- Both services use environment-based configuration
- Graceful degradation when services are unavailable
- Health checks at `/api/health` endpoints

**Database Strategy:**
- **RDS PostgreSQL** (DATABASE_URL): Main application data, user profiles, trading activity
- **Neon PostgreSQL** (PUSH_CADENCE_DATABASE_URL): Notification history, cadence rules, frequency caps

---

## Dependencies & Key Functions

### Core Dependencies

```json
{
  "push-blaster": {
    "next": "15.3.5",
    "firebase-admin": "^13.4.0",
    "pg": "^8.16.3",
    "node-cron": "^4.2.1",
    "papaparse": "^5.5.3",
    "uuid": "^11.1.0"
  },
  "push-cadence-service": {
    "next": "15.4.6",
    "pg": "^8.16.3",
    "papaparse": "^5.5.3"
  }
}
```

### Critical Environment Variables

```bash
# Push-Blaster
DATABASE_URL=postgresql://user:pass@host/database
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
CADENCE_SERVICE_URL=http://localhost:3002
GRAPHQL_ENDPOINT=https://your-api.com/graphql

# Push-Cadence-Service
PUSH_CADENCE_DATABASE_URL=postgresql://user:pass@neon.host/database
NOTIFICATION_HISTORY_TABLE=user_notifications
CADENCE_RULES_TABLE=cadence_rules
```

### Key Functions & Services

**Push-Blaster Core Functions:**

| Function | Location | Purpose |
|----------|----------|---------|
| `getPushClient()` | `src/lib/firebaseAdmin.ts` | Initializes Firebase Admin for push delivery |
| `queryUsers()` | `src/lib/databaseQueries.ts` | Filters users by activity, trading, and tenure criteria |
| `fetchDataPacks()` | `src/lib/databaseQueries.ts` | Enriches user data with shoe preferences (3-step fallback) |
| `processVariableReplacements()` | `src/lib/variableProcessor.ts` | Personalizes push content with CSV data |
| `validateVariables()` | `src/lib/variableProcessor.ts` | Ensures all variables in templates have data |
| `executeQuery()` | `src/lib/databaseQueries.ts` | Raw PostgreSQL execution |
| `fetchDeviceTokens()` | `src/lib/graphql.ts` | GraphQL query for device tokens |

**Push-Cadence-Service Core Functions:**

| Function | Location | Purpose |
|----------|----------|---------|
| `getCadenceRules()` | `src/lib/cadence.ts` | Fetches active frequency rules from database |
| `filterUsersByCadence()` | `src/lib/cadence.ts` | Applies cooldown/frequency rules to audience |
| `isValidUUID()` | `src/lib/cadence.ts` | Validates user IDs before database queries |

---

## User Experience Flow

### Complete Notification Lifecycle

```
┌─────────────────────────────────────────────────────────────────┐
│  USER INITIATES PUSH (Web UI or API)                             │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  1. INPUT VALIDATION                                             │
│     • Title & body required                                      │
│     • Deep link must be tradeblock.us domain                     │
│     • Layer ID (1-5) must be valid                               │
│     • Either CSV file OR manual user IDs (not both)              │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  2. AUDIENCE ASSEMBLY                                            │
│     • CSV: Parse with PapaParse, extract user_id column          │
│     • Manual: Split comma-separated user IDs                     │
│     • Extract variable data from CSV (firstName, shoe names)     │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  3. CADENCE FILTERING (unless Layer 4 - Test)                   │
│     • POST to cadence-service /api/filter-audience               │
│     • Layer 1: No filtering (foundational)                       │
│     • Layer 3: 72-hour cooldown between sends                    │
│     • Layer 5: 96-hour cooldown (new user series)                │
│     • Combined L2+L3: Daily frequency cap                        │
│     • Fail-open: Proceed with original list on service error     │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  4. VARIABLE VALIDATION & PROCESSING                            │
│     • Identify all {{variables}} in title/body/deepLink          │
│     • Validate CSV has matching columns                          │
│     • Process replacements for each user                         │
│     • Create unique message groups (same content = same batch)   │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  5. DEVICE TOKEN FETCH                                           │
│     • GraphQL query for all user device tokens                   │
│     • Returns: user_id, token tuples                             │
│     • Builds user→tokens map for efficient lookup                │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  6. BATCH GROUPING                                               │
│     • Group tokens by exact message content                      │
│     • Each unique message → separate FCM call                    │
│     • Max 500 tokens per FCM batch                               │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  7. FCM DELIVERY (concurrency limit: 2)                          │
│     • sendEachForMulticast() for each batch                      │
│     • Capture success/failure per token                          │
│     • Log each batch result to disk (.push-logs/)                │
│     • Dry-run skips actual FCM, simulates delivery               │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  8. NOTIFICATION TRACKING (if not dry-run)                      │
│     • POST to cadence-service /api/track-notification            │
│     • Record in user_notifications table                         │
│     • Include layer_id, timestamp, content                       │
└──────────────────────┬──────────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  9. JOB COMPLETION                                               │
│     • Finalize log with success/failure counts                   │
│     • Return summary to client                                   │
│     • Failed tokens included in response (if any)                │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Definitions

| Layer | Purpose | Cadence Rule | Use Case |
|-------|---------|--------------|----------|
| **1** | Foundational | None | Critical/transactional notifications |
| **2** | Promotional | Combined daily cap | Marketing campaigns |
| **3** | Engagement | 72-hour cooldown | Re-engagement campaigns |
| **4** | Test | None (bypassed) | Testing with real devices |
| **5** | New User Series | 96-hour cooldown | Onboarding sequences |

---

## File & Code Mapping

### Push-Blaster Directory Structure

```
services/push-blaster/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── send-push/route.ts             # Main push delivery endpoint
│   │   │   ├── scheduled-pushes/route.ts      # Schedule management
│   │   │   ├── query-audience/route.ts        # Test audience filtering
│   │   │   ├── push-logs/route.ts             # Retrieve push job logs
│   │   │   ├── health/route.ts                # Health check endpoint
│   │   │   ├── execute-query/route.ts         # Debug SQL execution
│   │   │   ├── automation/                    # Advanced scheduling
│   │   │   │   ├── sequences/route.ts         # Multi-step push sequences
│   │   │   │   ├── templates/route.ts         # Push templates CRUD
│   │   │   │   ├── recipes/route.ts           # Reusable automation recipes
│   │   │   │   └── monitor/route.ts           # Monitor running automations
│   │   │   └── scripts/route.ts               # Execute arbitrary scripts
│   │   ├── layout.tsx
│   │   ├── page.tsx                           # Main UI
│   │   └── globals.css
│   ├── components/
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Textarea.tsx
│   └── lib/
│       ├── db.ts                              # Database connection pool
│       ├── firebaseAdmin.ts                   # FCM initialization & client
│       ├── databaseQueries.ts                 # User filtering & data packs
│       ├── graphql.ts                         # Device token fetching
│       ├── variableProcessor.ts               # Template variable handling
│       ├── automationEngine.ts                # Complex automation scheduling
│       ├── automationStorage.ts               # Persist automation definitions
│       ├── automationTemplates.ts             # Template management
│       ├── sequenceExecutor.ts                # Execute multi-step workflows
│       ├── automationLogger.ts                # Detailed automation logging
│       └── testProcessManager.ts              # Manage test execution processes
├── .push-logs/                                # Job execution logs (JSON)
├── .scheduled-pushes/                         # Scheduled push configs (JSON)
├── Dockerfile
├── next.config.ts
├── tsconfig.json
└── package.json
```

### Push-Cadence-Service Directory Structure

```
services/push-cadence-service/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── filter-audience/route.ts       # Apply cadence rules
│   │   │   ├── track-notification/route.ts    # Record sent notification
│   │   │   ├── health/route.ts                # Health check endpoint
│   │   │   ├── find-matching-logs/route.ts    # Find notification history
│   │   │   ├── update-deep-links/route.ts     # Update link tracking
│   │   │   └── restore-historical-data/route.ts
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   └── lib/
│       ├── db.ts                              # Neon PostgreSQL pool
│       ├── cadence.ts                         # Cadence rule engine
│       └── startupValidation.ts               # Database initialization checks
├── db/
│   ├── migrations/                            # SQL migration scripts
│   └── README-LAYER-MIGRATION.md              # Database migration guide
├── Dockerfile
├── next.config.ts
├── tsconfig.json
└── package.json
```

### Root Level

```
push-notification-system/
├── Dockerfile                                 # Multi-stage build for push-blaster
├── Dockerfile.cadence                         # Build for push-cadence-service
├── railway.toml                               # Railway deployment config
├── railway.cadence.toml                       # Cadence service config
├── .env                                       # Environment variables (git-ignored)
├── env.example                                # Example environment file
├── shared/
│   └── python-utilities/                      # Legacy Python database utilities
├── services/
│   ├── push-blaster/
│   └── push-cadence-service/
└── developer-guides/                          # Documentation
```

---

## Service Connections

### HTTP Endpoints Map

**Push-Blaster to Push-Cadence Communication:**

```
┌─────────────────────────────────────┐
│  SEND PUSH (POST /api/send-push)   │
└────────────┬────────────────────────┘
             │
             ▼
   ┌─────────────────────────────────┐
   │ CADENCE FILTER (non-Layer-4)    │
   │ POST /api/filter-audience       │
   │ body: { userIds, layerId }      │
   │ response: {                     │
   │   eligibleUserIds: [...]        │
   │   excludedCount: N              │
   │ }                               │
   └─────────────────────────────────┘
             │
             ▼
   ┌─────────────────────────────────┐
   │ TRACK SUCCESS NOTIFICATIONS     │
   │ POST /api/track-notification    │
   │ body: {                         │
   │   userId, layerId,              │
   │   pushTitle, pushBody,          │
   │   audienceDescription           │
   │ }                               │
   └─────────────────────────────────┘
```

### Database Connection Strategy

**Push-Blaster:**
```typescript
// DATABASE_URL → RDS PostgreSQL (main app data)
import pool from '@/lib/db';

const result = await pool.query(
  'SELECT id FROM users WHERE deleted_at = 0 LIMIT 100'
);
```

**Push-Cadence-Service:**
```typescript
// PUSH_CADENCE_DATABASE_URL → Neon PostgreSQL (notification tracking)
import pool from '@/lib/db';

const result = await pool.query(
  'SELECT * FROM cadence_rules WHERE is_active = true'
);
```

### Firebase Integration

**Initialization Flow:**
```typescript
// firebaseAdmin.ts
function initFirebase() {
  if (process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
      })
    });
  }
}

export function getPushClient() {
  initFirebase();
  return admin.messaging();
}
```

**Push Delivery:**
```typescript
const messaging = getPushClient();

const message: admin.messaging.MulticastMessage = {
  notification: { title, body },
  tokens: batchOfTokens,
  data: { click_action: deepLink, url: deepLink }
};

const response = await messaging.sendEachForMulticast(message);
// response.successCount, response.failureCount, response.responses[]
```

---

## Critical Notes & Pitfalls

### Railway Deployment Gotchas

**1. Port Configuration**
```bash
# Local: Services use hardcoded ports
npm run dev                    # push-blaster: 3001, cadence: 3002

# Railway: Single port via environment variable
CMD ["npm", "run", "start:railway"]
# Uses: next start --port $PORT (assigned by Railway)
```

**2. Healthcheck Configuration**
```toml
# railway.toml - push-blaster has NO healthcheck (database can timeout)
[deploy]
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10

# railway.cadence.toml - push-cadence HAS healthcheck (Neon connects fast)
[deploy]
healthcheckPath = "/api/health"
healthcheckTimeout = 300
```

**3. Environment Variable Secrets**
```bash
# Firebase private key needs literal \n in Railway UI
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----

# Code does the replacement:
# .replace(/\\n/g, '\n')
```

### Database Connection Issues

**1. RDS Security Groups**
- Railway IPs may not be in RDS security group allowlist
- Push-blaster health may show "database: degraded"
- Add Railway outbound IPs to security group if needed

**2. Neon (Cadence Service)**
- Neon allows all connections by default
- Cadence service health shows "database: connected"

**3. Connection Pool Exhaustion**
```typescript
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,  // Max connections
  min: 5    // Min connections
});
```

### Firebase/FCM Gotchas

**1. Token Validity**
- Device tokens expire after ~60 days of inactivity
- FCM returns error for invalid/revoked tokens

**2. Multicast Limit**
```typescript
const BATCH_SIZE = 500;  // FCM max per request
```

**3. Deep Link URL Validation**
```typescript
const isValidTradeblockUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'tradeblock.us' ||
           parsed.hostname.endsWith('.tradeblock.us');
  } catch {
    return false;
  }
};
```

### Cadence & Frequency Rules

**Layer Bypass:**
- Layer 1: No filtering (critical/foundational)
- Layer 4: No filtering (test layer)

**Fail-Open Behavior:**
```typescript
// If cadence service unavailable, proceed with original list
if (!cadenceResponse.ok) {
  console.error('Cadence service error, failing open.');
  eligibleUserIds = userIds;  // Use original list
}
```

---

## Common Development Scenarios

### Scenario 1: Adding New Notification Layer Type

```typescript
// Step 1: Define layer in send-push/route.ts
if (![1, 2, 3, 4, 5, 6].includes(layerId)) {  // Add 6
  return NextResponse.json({
    success: false,
    message: 'Invalid layer'
  }, { status: 400 });
}

// Step 2: Add cadence rule in push-cadence-service DB
INSERT INTO cadence_rules (name, value_in_hours, is_active)
VALUES ('layer_6_cooldown_hours', 168, true);  // 7 days

// Step 3: Update cadence filtering logic (cadence.ts)
```

### Scenario 2: Debugging Delivery Issues

**Step 1: Check Job Logs**
```bash
curl http://localhost:3001/api/push-logs?jobId=abc123
```

**Step 2: Verify Device Tokens**
```typescript
const allTokens = await fetchDeviceTokens(userIds);
console.log(`Fetched ${allTokens.length} tokens for ${userIds.length} users`);
```

**Step 3: Test Dry-Run**
```bash
POST /api/send-push?dryRun=true
{
  "title": "Test",
  "body": "Test message",
  "layerId": 4,
  "userIds": "user-id-1,user-id-2"
}
```

**Step 4: Check Cadence Filters**
```bash
POST http://localhost:3002/api/filter-audience
{
  "userIds": ["user-id-1", "user-id-2"],
  "layerId": 3
}
```

### Scenario 3: Using Variable Substitution

**Template Definition:**
```
Title: "{{firstName}}, {{shoe_name}} is hot!"
Body: "{{shoe_name}} had {{trade_count}} trades this week."
Deep Link: "https://tradeblock.us/product/{{shoe_id}}"
```

**CSV Data:**
```csv
user_id,firstName,shoe_name,trade_count,shoe_id
uuid-1,John,Jordan 1,25,variant-123
uuid-2,Jane,Nike SB,18,variant-456
```

---

## Testing Strategy

### Local Development Testing

```bash
# Install dependencies
npm install

# Start both services
npm run dev

# Or start individually
cd services/push-blaster && npm run dev:push-only
cd services/push-cadence-service && npm run dev
```

### Smoke Tests for Production

**1. Health Endpoint Check**
```bash
curl http://push-blaster-url/api/health
curl http://push-cadence-url/api/health
```

**2. Sample Full Push (Layer 4 - Test)**
```bash
curl -X POST https://push-blaster-url/api/send-push \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Production Test",
    "body": "Testing",
    "layerId": 4,
    "userIds": "test-user-id"
  }'
```

---

## Quick Reference

### API Endpoints

**Push-Blaster**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/send-push` | Send notification to audience |
| `GET` | `/api/push-logs?jobId=X` | Retrieve job execution log |
| `GET` | `/api/scheduled-pushes` | List scheduled pushes |
| `POST` | `/api/scheduled-pushes` | Create scheduled push |
| `POST` | `/api/query-audience` | Test audience filtering |
| `GET` | `/api/health` | Service health check |

**Push-Cadence-Service**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `POST` | `/api/filter-audience` | Apply cadence rules to user list |
| `POST` | `/api/track-notification` | Record sent notification |
| `GET` | `/api/health` | Service health check |

### Environment Variables Checklist

```bash
# REQUIRED for push-blaster
DATABASE_URL=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
GRAPHQL_ENDPOINT=
CADENCE_SERVICE_URL=http://localhost:3002

# REQUIRED for push-cadence-service
PUSH_CADENCE_DATABASE_URL=
```

### Common Commands

```bash
# Development
npm run dev                    # Both services
npm run dev:push-only         # Push-blaster only
npm run dev:cadence           # Cadence service only

# Production Build
npm run build                 # Build next.js
npm run start                 # Start single service
npm run start:railway         # Railway deployment start

# Linting
npm run lint
```

### Troubleshooting Decision Tree

```
Push not delivering?
├─ Check health endpoints
│  ├─ push-blaster: /api/health
│  └─ push-cadence: /api/health
├─ Check DATABASE_URL connectivity
├─ Check FIREBASE_* credentials initialized
├─ Check job logs: /api/push-logs?jobId=X
│  ├─ No tokens found? → Device tokens missing for users
│  ├─ Tokens excluded? → Check cadence rules
│  └─ Batch failures? → Check Firebase error responses
└─ Manual test with Layer 4 (Test layer) to bypass cadence

Cadence not filtering?
├─ Verify PUSH_CADENCE_DATABASE_URL configured
├─ Check cadence_rules table has active rules
├─ Test: POST /api/filter-audience
└─ Check console logs for filtering details

Database connection issues?
├─ Check DATABASE_URL format (postgresql://...)
├─ Verify SSL configuration
├─ Check max connections limit not hit
├─ Verify RDS security group allows Railway IPs
└─ Test direct psql connection
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-24
**Maintained By:** Development Team
