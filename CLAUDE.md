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

### Before Making Changes
- [ ] Understand what you're changing and why
- [ ] Check current git status: `git status`
- [ ] Create a branch for significant changes: `git checkout -b feature/description`

### Local Testing (REQUIRED before pushing)
```bash
# 1. Connect to VPN (required for database access)
# 2. Start local dev servers
cd services/push-blaster
npm run dev
# 3. Test at http://localhost:3001
# 4. Verify changes work as expected
```

### Pushing to Production
```bash
# 1. Commit changes
git add .
git commit -m "Clear description of change"
git push origin main

# 2. Rebuild Docker image (from project root)
cd /Users/AstroLab/Desktop/code-projects/push-notification-system
gcloud builds submit --config cloudbuild.yaml .

# 3. Deploy via GitHub Action (self-service)
gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend

# 4. Verify at https://push.tradeblock.us
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
```

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

### Key Components
- **AutomationEngine**: Singleton cron scheduler with startup restoration
- **AutomationStorage**: File-based JSON at `/app/.automations/`
- **Firebase Admin SDK**: Push delivery via FCM
- **ScriptExecutor**: Python script runner for audience generation

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
