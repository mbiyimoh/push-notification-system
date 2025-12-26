# Push Notification System

## Developer Context

**Primary Developer:** Technical product person (not a traditional software engineer) using Claude Code for implementation. Capable of understanding technical concepts but relies on AI assistance for actual coding, git operations, and deployments.

**Relationship to Tradeblock:** Building internal tools with guidance from lead developer. Must be careful and respectful of production infrastructure.

**AI Agent Instructions:** When working with this developer:
- Walk through steps explicitly, one at a time
- Explain *why* before *how*
- Always test locally before pushing to production
- Never push untested code
- Ask for confirmation before destructive operations
- Default to caution over speed

---

## Development Protocol (MUST FOLLOW)

### Safe Development Workflow

```
1. EDIT     →  2. TEST LOCAL  →  3. COMMIT  →  4. REBUILD  →  5. DEPLOY  →  6. VERIFY
(code)         (npm run dev      (git)         (gcloud)       (gh action)   (health
               + VPN)                                                        checks)
```

**CRITICAL FOR AI AGENTS:** When implementing features that require code changes AND configuration updates (environment variables, secrets, database migrations):

1. **Complete ALL steps automatically** - The developer is a non-technical founder who expects Claude to handle the entire deployment workflow
2. **After code implementation:** ALWAYS rebuild Docker image and deploy to production WITHOUT being asked
3. **After adding secrets to GCP:** ALWAYS rebuild and deploy to activate them
4. **After database migrations:** Run locally first, then ensure production deployment happens

**Why this matters:** Code changes alone don't reach production. Docker images must be rebuilt and deployed. Secrets must be added to GCP AND the image must be rebuilt to load them. Missing these steps means features appear implemented but don't actually work in production.

### Before Making Changes
- [ ] Understand what you're changing and why
- [ ] Check current git status: `git status`
- [ ] Create a branch for significant changes: `git checkout -b feature/description`

### Starting Up Locally for Testing

**When to use:** Debugging, testing changes, faster iteration cycle

**Prerequisites:**
1. Connect to Tradeblock VPN (required for `DATABASE_URL` access)
2. Ensure `.env` file exists at project root with all production credentials

**Commands:**
```bash
# Navigate to project root
cd /Users/AstroLab/Desktop/code-projects/push-notification-system

# Start both services (recommended - uses dotenv to load .env)
cd services/push-blaster
npx dotenv -e ../../.env -- npm run dev

# This starts:
# - push-blaster on http://localhost:3001
# - push-cadence-service on http://localhost:3002
```

**What you'll see:**
- Real-time console logs with `[AutomationLogger]`, `[DEBUG_RUNNER]`, `[STDOUT]` prefixes
- Live log updates in terminal as automations execute
- Faster feedback loop - no Docker rebuild needed

**Testing:**
1. Open http://localhost:3001 in browser
2. Navigate to automation and click "Run Now"
3. Watch terminal for execution logs
4. Check execution progress in UI

**Stopping:**
- Press `Ctrl+C` in terminal to stop both services

**Gotcha - Port 3002 already in use:**
If you see `EADDRINUSE :::3002`, another process is using port 3002:
```bash
# Find and kill the process
lsof -ti:3002 | xargs kill -9

# Then restart
npx dotenv -e ../../.env -- npm run dev
```

### Local Testing (REQUIRED before pushing)
```bash
# 1. Connect to VPN (required for database access)
# 2. Start local dev servers
cd services/push-blaster
npx dotenv -e ../../.env -- npm run dev
# 3. Test at http://localhost:3001
# 4. Verify changes work as expected
# 5. Watch terminal logs for errors
```

### Deploying to Production (Public URL)

**When to use:** After local testing succeeds, when ready to make changes live

**Prerequisites:**
1. All changes tested locally
2. Changes committed to git

**Commands:**
```bash
# Step 1: Commit your changes
git add .
git commit -m "Clear description of change"
git push origin main

# Step 2: Rebuild Docker image (from project root)
cd /Users/AstroLab/Desktop/code-projects/push-notification-system
gcloud builds submit --config cloudbuild.yaml .

# Step 3: Deploy via GitHub Action (self-service)
gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend

# Step 4: Wait ~2-3 minutes, then verify deployment
curl https://push.tradeblock.us/api/health | jq
```

**What happens:**
1. Docker image builds (~6 minutes) - contains both services
2. GitHub Action triggers Tradeblock infrastructure deployment
3. GKE pulls new image and restarts pods
4. Health checks verify services are running

**Verification:**
```bash
# Check health endpoint shows "healthy"
curl https://push.tradeblock.us/api/health

# Test in browser
open https://push.tradeblock.us

# Check automation restored jobs
# Should show scheduledJobsCount = expectedJobsCount
```

**Rollback if needed:**
```bash
# Trigger deploy with previous Docker image
# Contact lead dev for rollback assistance
```

### Iterative Debug Workflow
When debugging issues in production:
```bash
# 1. Make fix locally
# 2. Rebuild image
gcloud builds submit --config cloudbuild.yaml .

# 3. Deploy
gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend

# 4. Test at push.tradeblock.us → see results → repeat
```

**Python Script Errors:** When automations fail with "Python script exited with code 1", the actual Python traceback is now captured and displayed in the execution detail page in the UI.

### What NOT To Do
- Push untested code directly to production
- Modify environment variables without understanding them
- Run database migrations without lead dev approval
- Delete or modify production data directly
- Run commands you don't understand

---

## Quick Command Reference

**User says:** "Start up the system locally so I can test it"
```bash
cd /Users/AstroLab/Desktop/code-projects/push-notification-system/services/push-blaster
npx dotenv -e ../../.env -- npm run dev
# Opens http://localhost:3001
```

**User says:** "Everything's working locally, let's deploy to production"
```bash
# From project root
cd /Users/AstroLab/Desktop/code-projects/push-notification-system
git add . && git commit -m "Description of changes"
git push origin main
gcloud builds submit --config cloudbuild.yaml .
gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend
# Wait 2-3 min, then verify at https://push.tradeblock.us
```

**User says:** "Run the database migrations"
```bash
cd /Users/AstroLab/Desktop/code-projects/push-notification-system/services/push-cadence-service
npx dotenv -e ../../.env -- npm run migrate
```

---

## Project Overview

A push notification system for Tradeblock. **Unified Docker deployment** to GCP (migrated from Railway Dec 2025).

**Production URL:** https://push.tradeblock.us

| Service | Purpose | Port |
|---------|---------|------|
| **push-blaster** | Main UI, automation engine, push delivery | 3001 |
| **push-cadence-service** | Cadence rules, frequency caps, notification tracking | 3002 |

**Note:** Both services run in a single unified Docker container. They communicate internally via `localhost`.

## Developer Guides

Comprehensive documentation available in `developer-guides/`:
- **push-notification-system-guide.md** - Overall system architecture and flows
- **push-blaster-guide.md** - Automation engine, API routes, Firebase integration, **UI components & keyboard shortcuts**
- **push-cadence-service-guide.md** - Cadence rules, database schema, filtering logic
- **railway-deployment-guide.md** - ⚠️ OBSOLETE (migrated to GCP Dec 2025) - kept for historical reference

### Recent UI Enhancements (Nov 2025)

**Execution Drill-Down:** Detailed execution analysis with cadence exclusion breakdown, phase timing, and CSV export at `/automations/[id]/executions/[execId]`

**Keyboard Shortcuts:** Vim-style navigation (J/K), power-user shortcuts (Cmd+Enter for Run, Cmd+P for Pause, Cmd+/ for help). See `src/app/hooks/useKeyboardShortcuts.ts`

**Toast Notifications:** Replaced all alert() calls with Sonner toasts for better UX

**Key Gotchas:**
- ExecutionLog status includes `'cancelled'` - handle in UI
- ExclusionBreakdown is nested in `phases[].data.exclusionBreakdown`
- Use `execution.phases` not `execution.phaseLogs`
- CSV export auto-escapes injection characters (=, +, -, @)
- Keyboard hook allows Enter on buttons/links to prevent conflicts

## Environment Variable Loading (CRITICAL)

### How Secrets Are Loaded in Production

**Tradeblock Infrastructure Pattern:**
- Secrets are mounted at `/usr/src/.env` by Kubernetes Secret Manager CSI driver
- Container working directory is `/usr/src/` (not `/app/`)
- Both Node.js and Python must explicitly load from this location

**Node.js (Next.js apps):**
- `src/instrumentation.ts` loads environment variables at runtime using `dotenv.config({ path: '/usr/src/.env' })`
- This runs BEFORE the app starts (Next.js instrumentation hook)
- Do NOT use `next.config` for env loading - it runs at build time when the file doesn't exist

**Python scripts:**
- `shared/python-utilities/config.py` loads from `/usr/src/.env`
- Uses `load_dotenv('/usr/src/.env')` explicitly
- Python scripts also receive env vars from Node.js via `scriptExecutor.ts`

**Gotcha:** If DATABASE_URL is missing:
1. Check `/usr/src/.env` exists in container
2. Check `instrumentation.ts` files are present in both services
3. Check `WORKDIR` is `/usr/src` not `/app` in Dockerfile

**Key Files:**
- `services/push-blaster/src/instrumentation.ts` - Runtime env loader
- `services/push-cadence-service/src/instrumentation.ts` - Runtime env loader
- `shared/python-utilities/config.py` - Python env loader
- `Dockerfile.unified` - Sets `WORKDIR /usr/src`
- `supervisord.conf` - Service directories at `/usr/src/*`

---

## Infrastructure

### GCP Deployment (Unified Container)

**Docker Image (GAR):**
```
us-east1-docker.pkg.dev/tradeblock-infrastructure/push-notification-system/push-notification-system:latest
```

**Key Files:**
- `Dockerfile.unified` - Multi-stage build for both services
- `cloudbuild.yaml` - Cloud Build configuration
- `supervisord.conf` - Process manager for running both services
- `DEPLOYMENT.md` - Detailed deployment guide

**Rebuild Command:**
```bash
gcloud builds submit --config cloudbuild.yaml .
```

**Health Checks:**
- Port 3001: `/api/health` (push-blaster)
- Port 3002: `/api/health` (push-cadence-service)

### Databases

| Database | Env Variable | Provider | Used By |
|----------|--------------|----------|---------|
| Main Tradeblock | `DATABASE_URL` | AWS RDS PostgreSQL | push-blaster (user data, audience queries) |
| Push Records | `PUSH_CADENCE_DATABASE_URL` | Neon PostgreSQL | push-cadence-service (notification history, cadence rules) |

**Important**: Database must be accessible from GCP. The internal RDS hostname should resolve from within Tradeblock infrastructure.

### Environment Variables

**Production (set in GCP, inherited from Tradeblock infrastructure):**
```
DATABASE_URL              - Internal Tradeblock PostgreSQL
PUSH_CADENCE_DATABASE_URL - Neon PostgreSQL (notification history)
FIREBASE_PROJECT_ID       - Firebase project ID
FIREBASE_CLIENT_EMAIL     - Firebase service account email
FIREBASE_PRIVATE_KEY      - Firebase private key (with \n escapes)
GRAPHQL_ENDPOINT          - GraphQL API for device tokens
CADENCE_SERVICE_URL       - http://localhost:3002 (ALWAYS localhost in unified container)
SLACK_WEBHOOK_URL         - Webhook for #push-automation-system (live alerts)
SLACK_WEBHOOK_URL_TESTS   - Webhook for #push-automation-system-tests (test alerts)
```

**Adding New Secrets to GCP (Dec 2025 Pattern):**

When adding new environment variables that contain sensitive values:

```bash
# 1. Add secret to GCP Secret Manager
# Format: KEY1="value1"\nKEY2="value2"\n...
# Must include ALL existing secrets plus new ones
gcloud secrets versions add production-shared-main-push-secrets \
  --data-file=/path/to/new-env-file

# 2. CRITICAL: Rebuild Docker image to pick up new secrets
cd /Users/AstroLab/Desktop/code-projects/push-notification-system
gcloud builds submit --config cloudbuild.yaml .

# 3. CRITICAL: Deploy to production
gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend

# 4. Verify secrets loaded
curl https://push.tradeblock.us/api/health
```

**Gotcha:** Adding secrets to GCP alone doesn't activate them. The container reads secrets from mounted file at startup. You MUST rebuild and redeploy for new secrets to take effect.

**Local Development (.env file):**
```
# Get these values from lead dev - must match production
DATABASE_URL              - Same as production (requires VPN)
PUSH_CADENCE_DATABASE_URL - Same as production
FIREBASE_PROJECT_ID       - Same as production
FIREBASE_CLIENT_EMAIL     - Same as production
FIREBASE_PRIVATE_KEY      - Same as production
GRAPHQL_ENDPOINT          - Same as production
CADENCE_SERVICE_URL       - http://localhost:3002
```

**Critical:** `CADENCE_SERVICE_URL` must be `http://localhost:3002` (not an external URL) because both services run in the same container.

## Development

### Local Development
```bash
cd services/push-blaster
npm run dev          # Starts both push-blaster and cadence-service
npm run dev:push-only # Starts only push-blaster
npm run dev:cadence   # Starts only cadence-service
```

### Deployment to GCP

```bash
# 1. Rebuild Docker image (from project root)
gcloud builds submit --config cloudbuild.yaml .

# 2. Deploy via GitHub Action (self-service)
gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend

# 3. Verify at https://push.tradeblock.us/api/health
```

**Note:** The Docker image is stored in Google Artifact Registry (GAR). Deployment is self-service via GitHub Action.

## Architecture Notes

### Health Endpoints
- push-blaster: `/api/health` always returns 200 (Railway healthcheck disabled)
- push-cadence: `/api/health` returns 200/503 (healthcheck enabled)

### Service Communication
- Both services run in same container, communicate via `localhost:3002`
- `CADENCE_SERVICE_URL` must always be `http://localhost:3002`
- Cadence filtering before push sends (layers 2, 3, 5)
- Fail-open: If cadence service unavailable, sends proceed

### Notification Layers
| Layer | Purpose | Cadence Rule |
|-------|---------|--------------|
| 1 | Platform-wide announcements | None (bypass) |
| 2 | Product/trend triggers | Combined with L3 (max 3/week) |
| 3 | Behavior-responsive | 72-hour cooldown |
| 4 | Test | None (bypass) |
| 5 | New user series | 96-hour cooldown |

### Execution Monitoring Architecture (Dec 2025)

**Migration from SSE to Database-Backed Polling:**

The system uses **polling-based execution monitoring** for reliable long-running automation tracking (25+ minute executions). This replaced Server-Sent Events (SSE) which suffered from GKE load balancer timeout issues.

**How it works:**
1. User clicks "Run Now" → POST `/api/automation/execute-start`
2. Automation engine writes progress to Neon database tables:
   - `execution_progress` - current execution state (status, phase, progress %)
   - `execution_logs` - append-only log entries with sequence numbers
3. UI polls GET `/api/automation/execute-poll` every 2 seconds
4. Cursor-based pagination for incremental log fetching
5. Survives disconnections, page refreshes, GKE timeouts

**Key files:**
- `services/push-blaster/src/lib/executionProgressDB.ts` - Database operations
- `services/push-blaster/src/app/api/automation/execute-poll/route.ts` - Polling endpoint
- `services/push-blaster/src/app/api/automation/execute-start/route.ts` - Start endpoint
- `services/push-blaster/src/app/components/automations/ExecutionProgressModal.tsx` - UI polling client
- `services/push-cadence-service/db/migrations/004_execution_progress.sql` - Database schema

**Gotchas:**
- SSE endpoints (`/api/automation/execute-stream`) still exist for backwards compatibility but are deprecated
- Migration `004_execution_progress.sql` must run before polling works (auto-runs on postinstall)
- Both services write to same Neon database via `executionProgressDB.ts`

### Database Migrations

**Migration System:**
- Location: `services/push-cadence-service/db/migrations/*.sql`
- Auto-run: Migrations run on `npm install` via postinstall hook
- Script: `services/push-cadence-service/scripts/run-migration.js`

**Running Migrations Manually:**
```bash
cd services/push-cadence-service

# Local (requires .env file)
npx dotenv -e ../../.env -- npm run migrate

# Production (runs automatically on container startup)
```

**Current Migrations:**
- `003_automation_executions.sql` - Historical execution records
- `004_execution_progress.sql` - Real-time progress tracking for polling
- `005_add_exclusion_breakdown.sql` - JSONB column for cadence exclusion details (used by Slack alerts)

**Gotcha:** The migration script looks for `PUSH_CADENCE_DATABASE_URL`, but Node.js doesn't auto-load `.env`. Use `npx dotenv -e ../../.env --` prefix for local runs.

### Key Components
- **AutomationEngine**: Singleton cron scheduler with startup restoration
- **AutomationStorage**: File-based JSON at `.automations/` (local) or `/usr/src/push-blaster/.automations/` (production)
- **Firebase Admin SDK**: Push delivery via FCM
- **ScriptExecutor**: Python script runner for audience generation (legacy V1)
- **V2 TypeScript Generators**: Native TypeScript audience generators (preferred, replacing Python)
- **executionProgressDB**: Database operations for polling-based execution tracking (connects to Neon)
- **slackNotifier**: Non-blocking Slack alerts for automation events (start, complete, fail)

### Slack Automation Alerts (Dec 2025)

**What it does:** Sends real-time Slack notifications when automations start and complete, with full metrics including audience size, cadence exclusions breakdown, and delivery stats.

**Key files:**
- `services/push-blaster/src/lib/slackNotifier.ts` - Notification module with Block Kit formatting
- `services/push-blaster/src/lib/automationEngine.ts:505-516` - Start notification integration
- `services/push-blaster/src/lib/automationEngine.ts:404-417` - Completion notification integration
- `services/push-blaster/src/lib/automationEngine.ts:433-443` - Failure notification integration

**Channels:**
- `#push-automation-system` - Live automation alerts (`SLACK_WEBHOOK_URL`)
- `#push-automation-system-tests` - Test mode alerts (`SLACK_WEBHOOK_URL_TESTS`)

**Integration points:**
- Start: After Phase 1 (audience generation) completes
- Complete: After successful `trackExecutionComplete()`
- Fail: In catch block with partial metrics

**Message format:** Uses Slack Block Kit for rich formatting with emojis, metrics tables, and "View Details" links to production UI.

**Gotchas:**
- All notification functions are non-blocking (try/catch that never throws)
- If webhook URLs are missing, notifications are silently skipped (graceful degradation)
- Metrics are queried from `automation_executions` table after completion
- Exclusion breakdown requires migration `005_add_exclusion_breakdown.sql`
- Test mode routes to separate channel automatically based on automation settings

**Extending this:**
- To add new notification types, follow pattern in `slackNotifier.ts`
- All metrics must be stored in database before completion notification fires
- Never throw errors from notification functions - automation execution must not fail due to Slack issues

### Audience Generation: V2 TypeScript Generators

**What they are:** Native TypeScript audience generators that replace Python scripts for Layer 3 automations.

**Why they exist:**
- Python scripts require complex DB connectivity setup (psycopg2, connection strings)
- Local development with Python is error-prone (module paths, environment)
- TypeScript generators run in the same process as the automation engine - no subprocess spawning

**Key files:**
- `src/lib/generators/layer3BehaviorGenerator.ts` - Layer 3 behavior-responsive audiences
- `src/lib/generators/types.ts` - Shared types, constants, FOUNDER_TEST_USER
- `src/lib/environmentUtils.ts` - Path resolution for CSV output directories

**How they work:**
1. Automation engine calls V2 generator during Phase 1 (Audience Generation)
2. Generator queries Tradeblock database directly using existing connection
3. Outputs CSV files to `.script-outputs/` directory
4. Generates both REAL and TEST versions (TEST includes founder's user ID for testing)

**CSV Output Location:**
- **V2 Generators:** `.script-outputs/` (local) or `/app/.script-outputs/` (production)
- **V1 Python Scripts:** `generated_csvs/` (legacy)
- **Path Resolution:** `getGeneratedCsvsDir()` checks `.script-outputs` first, falls back to `generated_csvs`

**File Naming Patterns:**
- **Production:** `recent-offer-creators_20251219T180926.csv`
- **Test:** `recent-offer-creators_TEST_20251219T180926.csv` (includes `_TEST_` marker)

**Gotchas:**
- Test API (`/api/automation/test/[id]`) now checks for existing V2 CSVs before running Python scripts
- If recent CSVs exist (within 30 min), test API reuses them instead of regenerating
- This prevents Python module errors during local testing
- The `_TEST_` files always include the founder's user ID for test push notifications

**Migration Status (Dec 2025):**
- ✅ Layer 3 (behavior-responsive): Fully migrated to V2 TypeScript
- ⏳ Layer 2 (trending): Still uses Python
- ⏳ Layer 5 (new user series): Still uses Python
- ⏳ Layer 1 (showcase): Still uses Python

**Testing V2 Generators Locally:**
```bash
# 1. Start dev server
npm run dev

# 2. Run automation (generates CSVs)
# Watch terminal for: [layer3-behavior] Completed in 5170ms: { success: true, audienceSize: 510, fileCount: 6 }

# 3. Check CSVs were created
ls -la .script-outputs/recent-*_TEST_*.csv

# 4. Click "Test" in UI during cancellation window
# Should see: "Found 6 existing V2-generated CSV files (skipping script execution)"
# Should receive 3 test push notifications (one per audience)
```

### Testing Automations

**CRITICAL: Test User Configuration**

When `dryRunFirst: true` is enabled, the automation sends a test push before the live send. However:

**Gotcha:** If `testUserIds` is empty (`[]`), the test phase will "complete successfully" with 0 sends.
- The UI will show "Test push completed" ✅
- But NO push notifications are actually sent
- The execution continues to the cancellation window

**To receive test pushes:**
1. Get your user ID from the Tradeblock database
2. Add it to the automation's `settings.testUserIds` array
3. Test pushes will send ONLY to users in this list
4. Live sends use the actual audience generated by the Python script

**Test Mode vs Dry Run:**
- `testMode: true` - Uses test user IDs for ALL phases (test + live)
- `dryRunFirst: true` - Sends test push first, then waits for cancellation window, then live send
- Both can be enabled together

**Key Files:**
- Automation config: `.automations/{id}.json` - Look for `settings.testUserIds`
- Test logic: `src/lib/sequenceExecutor.ts:270-272`

## UI Architecture (push-blaster)

### Page Structure

The UI is organized as a 3-page automation dashboard:

| Page | Route | Purpose | Key Features |
|------|-------|---------|--------------|
| **Dashboard** | `/` | Automation health overview | Stats cards (live/scheduled/paused), upcoming executions, recent activity |
| **Automations List** | `/automations` | Browse and manage automations | Status/frequency filters, search, pause/resume/delete actions |
| **Automation Detail** | `/automations/[id]` | View config and execution history | Overview panels, push sequences, execution logs, **Run Now** button |

### Component Organization

```
src/app/components/
├── nav/
│   └── HeaderNav.tsx           # Breadcrumb navigation with "New Automation" CTA
├── dashboard/
│   ├── StatsCard.tsx           # Color-coded stat cards (live=green, scheduled=blue, paused=yellow)
│   ├── UpcomingExecutions.tsx  # Next 5 scheduled runs sorted by time
│   └── RecentActivity.tsx      # Last 5 executions with metrics
├── automations/
│   ├── StatusBadge.tsx         # Status indicator pills
│   └── AutomationCard.tsx      # List view card with inline actions
└── detail/
    └── ExecutionLogTable.tsx   # Paginated execution history table
```

### Key Integration Points

**Data Fetching:**
- Dashboard: `GET /api/automation/recipes` + `GET /api/automation/monitor?type=executions&limit=5`
- List: `GET /api/automation/recipes` (with optional status/frequency filters)
- Detail: `GET /api/automation/recipes/[id]` + `automationStorage.loadExecutionLogs(id)`

**Control Actions:**
- Pause/Resume: `POST /api/automation/control` with `action: 'pause'|'resume'`
- **Run Now**: `POST /api/automation/control` with `action: 'execute_now'` (bypasses schedule, runs immediately)
- Delete: `DELETE /api/automation/recipes/[id]`

### Navigation Patterns

- **Dashboard** → Click automation → Detail page
- **List** → Click "View" → Detail page
- **List** → Click "Edit" → Edit wizard (`/edit-automation/[id]`)
- **Detail** → Click "Edit" → Edit wizard
- **Edit wizard** → Cancel → Returns to automation detail page (NOT dashboard)
- **Create wizard** → Cancel → Returns to dashboard

### Layout Notes

- `src/app/layout.tsx` provides `bg-slate-50` background, no global header
- `HeaderNav` is rendered per-page with page-specific breadcrumbs
- Server Components for data fetching, Client Components for interactivity
- All pages use Next.js 15 App Router pattern
