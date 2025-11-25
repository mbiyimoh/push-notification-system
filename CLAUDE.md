# Push Notification System

## Project Overview
A push notification system for Tradeblock consisting of two services deployed to Railway:

| Service | Purpose | Port | Railway URL |
|---------|---------|------|-------------|
| **push-blaster** | Main UI, automation engine, push delivery | 3001 | https://push-notification-system-production.up.railway.app |
| **push-cadence-service** | Cadence rules, frequency caps, notification tracking | 3002 | https://push-cadence-service-production-38ac.up.railway.app |

## Developer Guides

Comprehensive documentation available in `developer-guides/`:
- **push-notification-system-guide.md** - Overall system architecture and flows
- **push-blaster-guide.md** - Automation engine, API routes, Firebase integration, **UI components & keyboard shortcuts**
- **push-cadence-service-guide.md** - Cadence rules, database schema, filtering logic
- **railway-deployment-guide.md** - Deployment configuration, troubleshooting

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

### Railway Deployment (Two Services)

**push-notification-system (push-blaster)**:
- Dockerfile: `Dockerfile`
- Config: `railway.toml`
- No healthcheck (RDS connection can timeout)

**push-cadence-service**:
- Dockerfile: `Dockerfile.cadence`
- Config: `railway.cadence.toml`
- Healthcheck enabled (`/api/health`, 300s timeout)

### Databases (External to Railway)

| Database | Env Variable | Provider | Used By |
|----------|--------------|----------|---------|
| Main Tradeblock | `DATABASE_URL` | AWS RDS PostgreSQL | push-blaster (user data, audience queries) |
| Push Records | `PUSH_CADENCE_DATABASE_URL` | Neon PostgreSQL | push-cadence-service (notification history, cadence rules) |

**Important**: Use the RDS endpoint `production-database.cluster-cseupqwlh6at.us-east-1.rds.amazonaws.com:5432`, NOT `production.database.primary` (private hostname that doesn't resolve outside VPC)

### Environment Variables

**push-blaster**:
```
DATABASE_URL          - Main Tradeblock PostgreSQL (AWS RDS)
FIREBASE_PROJECT_ID   - Firebase project ID
FIREBASE_CLIENT_EMAIL - Firebase service account email
FIREBASE_PRIVATE_KEY  - Firebase private key (with \n escapes)
CADENCE_SERVICE_URL   - https://push-cadence-service-production-38ac.up.railway.app
GRAPHQL_ENDPOINT      - GraphQL API for device tokens
```

**push-cadence-service**:
```
PUSH_CADENCE_DATABASE_URL - Neon PostgreSQL connection
```

## Development

### Local Development
```bash
cd services/push-blaster
npm run dev          # Starts both push-blaster and cadence-service
npm run dev:push-only # Starts only push-blaster
npm run dev:cadence   # Starts only cadence-service
```

### Deployment
```bash
railway up --detach  # Deploy from local directory with Dockerfile
```

Note: Environment variable changes in Railway trigger redeployment from git repo using Railpack (which fails). Always use `railway up` to deploy with the Dockerfile configuration.

## Architecture Notes

### Health Endpoints
- push-blaster: `/api/health` always returns 200 (Railway healthcheck disabled)
- push-cadence: `/api/health` returns 200/503 (healthcheck enabled)

### Service Communication
- push-blaster calls push-cadence-service via `CADENCE_SERVICE_URL`
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
