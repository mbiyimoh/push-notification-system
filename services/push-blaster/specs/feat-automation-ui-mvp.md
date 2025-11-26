# Automation UI MVP

> Replace push-blaster's monolithic page.tsx with a focused 3-page automation dashboard

## Status
**Draft** | Created: 2025-11-24

## Overview

Replace the existing 3000+ line `page.tsx` (which mixes one-off blast functionality with automation management across 5 tabs) with a clean, automation-first interface consisting of 3 pages: Dashboard, Automations List, and Automation Detail.

## Background / Problem Statement

The current push-blaster UI evolved organically with "blast" (one-off push) functionality as the primary use case. Automation management was added as a tab but remains secondary in the UX hierarchy. Now that automations are the primary operational workflow:

1. **Visibility Problem**: Live automation status, upcoming runs, and execution history are buried in a tab
2. **Monitoring Gap**: Execution metrics (sent count, cadence exclusions, failures) require clicking through multiple views
3. **Maintainability**: The 3000-line monolithic file is difficult to modify and test
4. **Focus Mismatch**: UI emphasizes one-off blasts which are now rarely used

## Goals

- Provide at-a-glance visibility into automation health (live, scheduled, paused counts)
- Surface upcoming execution schedule prominently on landing page
- Display execution history with key metrics (sent, excluded by cadence, failed, duration)
- Enable quick navigation to automation config and logs
- Delete the monolithic `page.tsx` to reduce tech debt
- Maintain all existing automation CRUD functionality via existing pages

## Non-Goals

- Rebuild the create/edit automation wizard (reuse existing `/create-automation` and `/edit-automation/[id]`)
- Add real-time WebSocket updates (defer to phase 2)
- Build single-execution drill-down page (defer to phase 2)
- Add analytics charts or trend visualization (defer)
- Support one-off "blast" functionality (intentionally removed)

## Technical Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.3.5 | App Router, Server Components |
| React | 19.0.0 | UI framework |
| Tailwind CSS | 4.x | Styling |
| TypeScript | 5.x | Type safety |

**Existing Internal Dependencies (reuse, do not modify):**
- `src/types/automation.ts` - `UniversalAutomation`, `AutomationPush`, `ExecutionMetrics` types
- `src/lib/automationLogger.ts` - `ExecutionLog`, `PushLog` interfaces
- `/api/automation/recipes` - CRUD for automations
- `/api/automation/monitor` - Health, active executions, violations
- `/api/automation/control` - Pause/resume/stop actions

## Detailed Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser                                  │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard (/)           │  List (/automations)  │  Detail      │
│  - Stats cards           │  - Filterable list    │  (/[id])     │
│  - Upcoming executions   │  - Automation cards   │  - Config    │
│  - Recent activity       │  - Actions            │  - Logs      │
└──────────┬───────────────┴───────────┬───────────┴──────┬───────┘
           │                           │                  │
           ▼                           ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Layer (existing)                         │
│  /api/automation/recipes  │  /api/automation/monitor            │
│  /api/automation/control  │  /api/automation/recipes/[id]       │
└─────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Data Layer                                   │
│  .automations/*.json      │  .automations/logs/                 │
│  automationStorage.ts     │  automationLogger.ts                │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/app/
├── page.tsx                      # NEW: Dashboard (replaces old monolith)
├── layout.tsx                    # UPDATE: Add header nav component
├── automations/
│   ├── page.tsx                  # NEW: Automations list
│   └── [id]/
│       └── page.tsx              # NEW: Automation detail + logs table
├── create-automation/
│   └── page.tsx                  # KEEP: Existing wizard (no changes)
├── edit-automation/
│   └── [id]/
│       └── page.tsx              # KEEP: Existing edit page (no changes)
├── components/
│   ├── nav/
│   │   └── HeaderNav.tsx         # NEW: Header with breadcrumbs
│   ├── dashboard/
│   │   ├── StatsCard.tsx         # NEW: Stat display card
│   │   ├── UpcomingExecutions.tsx# NEW: Next runs list
│   │   └── RecentActivity.tsx    # NEW: Recent execution feed
│   ├── automations/
│   │   ├── AutomationCard.tsx    # NEW: Card for list view
│   │   ├── AutomationFilters.tsx # NEW: Status/frequency filters
│   │   └── StatusBadge.tsx       # NEW: Status indicator pill
│   └── detail/
│       ├── OverviewPanel.tsx     # NEW: Config overview
│       ├── SchedulePanel.tsx     # NEW: Schedule display
│       ├── PushSequenceList.tsx  # NEW: Push preview list
│       └── ExecutionLogTable.tsx # NEW: Logs table with metrics
└── api/
    └── automation/               # KEEP: All existing API routes
```

### Page Specifications

#### 1. Dashboard (`/`) - `page.tsx`

**Purpose:** At-a-glance automation health and activity

**Data Requirements:**
```typescript
// Fetch from /api/automation/recipes
const automations: UniversalAutomation[] = await fetchAutomations();

// Compute stats
const stats = {
  live: automations.filter(a => a.status === 'running').length,
  scheduled: automations.filter(a => a.status === 'active' && a.isActive).length,
  paused: automations.filter(a => a.status === 'paused').length,
};

// Sort by next execution for upcoming list
const upcoming = automations
  .filter(a => a.isActive && a.metadata.nextExecutionAt)
  .sort((a, b) => new Date(a.metadata.nextExecutionAt!).getTime() -
                  new Date(b.metadata.nextExecutionAt!).getTime())
  .slice(0, 5);

// Fetch from /api/automation/monitor?type=executions for recent activity
const recentExecutions = await fetchRecentExecutions(10);
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Push Automation Center                    [+ New Automation] │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐                         │
│ │ LIVE: 2 │ │SCHED: 3 │ │PAUSED: 1│    <- Stats cards       │
│ └─────────┘ └─────────┘ └─────────┘                         │
│                                                             │
│ UPCOMING EXECUTIONS                          [View All →]   │
│ ├─ Daily Showcase Push      Today 10:00 AM   ● Active       │
│ ├─ Onboarding Level 2/3     Today 11:00 AM   ● Active       │
│ └─ Weekly Trending          Mon 9:00 AM      ○ Paused       │
│                                                             │
│ RECENT ACTIVITY                              [View Logs →]  │
│ ├─ ✓ Daily Showcase    10:00 AM  Sent: 12,453  Excl: 2,341  │
│ ├─ ✓ Onboarding        11:00 AM  Sent: 847     Excl: 156    │
│ └─ ✗ Weekly Trending   Failed    Error: Script timeout      │
└─────────────────────────────────────────────────────────────┘
```

**Component:** Server Component with client interactivity for "+ New Automation" button

**UI States:**
```typescript
// Loading state: Show 3 skeleton StatsCards + skeleton list items
// Error state: Show error banner with "Failed to load automations" + retry button
// Empty state: Show "No automations yet" message with "+ Create Your First Automation" CTA
```

#### 2. Automations List (`/automations`) - `page.tsx`

**Purpose:** Browse and manage all automations

**Data Requirements:**
```typescript
// Fetch with optional filters from query params
const searchParams = useSearchParams();
const status = searchParams.get('status'); // active, paused, draft, all
const frequency = searchParams.get('frequency'); // daily, weekly, once, all

const automations = await fetchAutomations({ status, frequency });
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Dashboard    AUTOMATIONS                [+ New Automation] │
├─────────────────────────────────────────────────────────────┤
│ Filter: [All ▾] [Daily ▾] [Active ▾]        Search: [____]  │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ● Daily Showcase Push - Haves/Wants                     │ │
│ │ Script-based │ Daily │ 10:00 AM CT │ 4 sequences        │ │
│ │ Last: Today 10:00 AM │ Next: Tomorrow 10:00 AM          │ │
│ │ 127 executions │ 99.2% success                          │ │
│ │                     [View] [Edit] [Pause] [Delete]      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ○ Weekly Trending                            [PAUSED]   │ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Component:** Client Component for filters, Server Component for initial data

**UI States:**
```typescript
// Loading state: Show skeleton cards in a list layout
// Error state: Show error banner with "Failed to load automations" + retry button
// Empty state (no results): Show "No automations match your filters" with clear filters button
// Empty state (no automations): Show "No automations yet" with "+ Create Your First Automation" CTA
```

#### 3. Automation Detail (`/automations/[id]`) - `page.tsx`

**Purpose:** View automation config and execution history

**Data Requirements:**
```typescript
// Fetch automation by ID
const automation = await fetchAutomation(params.id);

// Fetch execution history from logger
// Use: automationStorage.loadExecutionLogs(automationId) from src/lib/automationStorage.ts
// Returns: ExecutionLog[] sorted by timestamp descending
const executionHistory = await automationStorage.loadExecutionLogs(params.id);
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ ← Automations    DAILY SHOWCASE PUSH  [Run Now] [Edit] [Pause]
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────┬─────────────────────┐               │
│ │ OVERVIEW            │ SCHEDULE            │               │
│ │ Status: ● Active    │ Frequency: Daily    │               │
│ │ Created: Oct 15     │ Time: 10:00 AM CT   │               │
│ │ Script: showcase.py │ Next: Tomorrow      │               │
│ └─────────────────────┴─────────────────────┘               │
│                                                             │
│ PUSH SEQUENCES (4)                                          │
│ #1 HAVES      "Your sneaker is in demand!"      Layer 2     │
│ #2 WANTS      "Your wishlist item available!"   Layer 2     │
│ #3 HOT_ITEMS  "Hot item alert"                  Layer 2     │
│ #4 TRENDING   "Trending now"                    Layer 2     │
│                                                             │
│ EXECUTION HISTORY                            [Export CSV]   │
│ ┌────────┬──────────┬───────┬──────────┬────────┬─────────┐ │
│ │ Status │ Date     │ Sent  │ Excluded │ Failed │Duration │ │
│ ├────────┼──────────┼───────┼──────────┼────────┼─────────┤ │
│ │   ✓    │ Nov 24   │12,453 │ 2,341    │ 12     │ 45s     │ │
│ │   ✓    │ Nov 23   │11,982 │ 2,198    │ 8      │ 42s     │ │
│ │   ✗    │ Nov 22   │ 0     │ 0        │ --     │ 2s      │ │
│ └────────┴──────────┴───────┴──────────┴────────┴─────────┘ │
│                                          [Load More]        │
└─────────────────────────────────────────────────────────────┘
```

**Component:** Server Component for data, Client Component for actions

**UI States:**
```typescript
// Loading state: Show skeleton panels for overview/schedule, skeleton table for logs
// Error state (automation not found): Show 404 page with "Automation not found" + back link
// Error state (logs failed): Show config panels but error message in logs section with retry
// Empty state (no logs): Show "No executions yet" in logs table area
// Running state: Show spinner on "Run Now" button, disable other actions until complete
```

**Run Now Behavior:**
```typescript
// "Run Now" button triggers immediate execution of scheduled automation
// - Shows confirmation dialog: "Run [Automation Name] now? This will execute immediately instead of waiting for the scheduled time."
// - On confirm: POST to /api/automation/control with { action: 'execute_now', automationId }
// - Show loading spinner on button during execution
// - On success: Refresh execution history, show success toast
// - On error: Show error toast with message
// - Button disabled while automation is already running
```

### Component Specifications

#### `StatsCard.tsx`
```typescript
interface StatsCardProps {
  label: string;
  count: number;
  status: 'live' | 'scheduled' | 'paused';
  subtitle?: string;
}
```

#### `AutomationCard.tsx`
```typescript
interface AutomationCardProps {
  automation: UniversalAutomation;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}
```

#### `ExecutionLogTable.tsx`
```typescript
interface ExecutionLogTableProps {
  automationId: string;
  logs: ExecutionLog[];
  onLoadMore: () => void;
  hasMore: boolean;
}

// Each row displays:
// - Status icon (✓/✗)
// - Date/time
// - Sent count (from metrics.totalSentCount)
// - Excluded count (totalAudienceSize - totalSentCount - failedPushes)
// - Failed count (from metrics.failedPushes or sum of push failures)
// - Duration (from metrics.totalDuration, formatted)
```

#### `StatusBadge.tsx`
```typescript
interface StatusBadgeProps {
  status: AutomationStatus;
  size?: 'sm' | 'md';
}

// Status colors:
// active/running -> green
// paused -> yellow
// failed -> red
// draft -> gray
// scheduled -> blue
```

### API Integration

**No new API endpoints required.** All data available from existing endpoints:

| UI Need | API Endpoint | Data Path |
|---------|--------------|-----------|
| Stats counts | `GET /api/automation/recipes` | Count by `status` field |
| Upcoming runs | `GET /api/automation/recipes` | Sort by `metadata.nextExecutionAt` |
| Recent activity | `GET /api/automation/monitor?type=executions` | `data.executions` |
| Automation list | `GET /api/automation/recipes?status=X` | Full response |
| Automation detail | `GET /api/automation/recipes/[id]` | Single automation |
| Execution history | `GET /api/automation/monitor?type=executions` + filter | Filter by automationId |
| Pause/Resume | `POST /api/automation/control` | `{ action: 'pause'/'resume', automationId }` |
| Run Now | `POST /api/automation/control` | `{ action: 'execute_now', automationId }` |
| Delete | `DELETE /api/automation/recipes/[id]` | - |

**Execution History Data Source:**
```typescript
// Use automationStorage.loadExecutionLogs(automationId) from src/lib/automationStorage.ts
// This reads from .automations/logs/ directory
// Returns ExecutionLog[] with: automationId, timestamp, status, phases, pushLogs, metrics
// A dedicated /api/automation/[id]/history endpoint could be added in phase 2 for better pagination
```

### Data Flow

```
User visits Dashboard (/)
    │
    ├─► Server fetches /api/automation/recipes
    │   └─► Compute stats, sort upcoming
    │
    ├─► Server fetches /api/automation/monitor?type=executions
    │   └─► Map to recent activity feed
    │
    └─► Render with computed data

User clicks automation card
    │
    └─► Navigate to /automations/[id]
        │
        ├─► Server fetches /api/automation/recipes/[id]
        │
        └─► Server loads execution history from logger
            └─► Render detail + logs table
```

### Layout Updates

Update `layout.tsx` to include header navigation:

```typescript
// src/app/layout.tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HeaderNav />
        <main className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
```

**HeaderNav Component:**
```typescript
interface HeaderNavProps {
  breadcrumbs: BreadcrumbItem[];
  showCreateButton?: boolean; // defaults to true
}

interface BreadcrumbItem {
  label: string;
  href?: string; // if undefined, renders as text (current page)
}

// Example breadcrumb configurations:
// Dashboard: [{ label: 'Dashboard' }]
// Automations List: [{ label: 'Dashboard', href: '/' }, { label: 'Automations' }]
// Automation Detail: [{ label: 'Dashboard', href: '/' }, { label: 'Automations', href: '/automations' }, { label: 'Daily Showcase Push' }]

// Layout:
// ┌─────────────────────────────────────────────────────────────┐
// │ ← Dashboard / Automations / Daily Showcase   [+ New Auto..] │
// └─────────────────────────────────────────────────────────────┘
// - First item with href shows ← back arrow
// - Items separated by " / "
// - Last item (no href) is bold/current
// - "+ New Automation" button on right, links to /create-automation
```

## User Experience

### Navigation Flow

1. **Landing (Dashboard)**: User sees automation health at a glance
2. **Browse**: Click "View All" or nav to see full automations list
3. **Filter**: Use dropdowns to filter by status/frequency
4. **Detail**: Click automation card to see config and logs
5. **Action**: Pause/Resume/Delete from card or detail view
6. **Create**: Click "+ New Automation" → existing wizard
7. **Edit**: Click "Edit" → existing edit page

### Key Interactions

| Action | Location | Behavior |
|--------|----------|----------|
| View automation | Card or row | Navigate to `/automations/[id]` |
| Pause automation | Card action or detail | POST to control API, refresh list |
| Resume automation | Card action or detail | POST to control API, refresh list |
| Run Now | Detail page header | Confirm dialog, POST `execute_now` to control API, show spinner, refresh logs on complete |
| Delete automation | Card action | Confirm dialog, DELETE request, remove from list |
| Create new | Header button | Navigate to `/create-automation` |
| Edit | Detail page | Navigate to `/edit-automation/[id]` |
| Load more logs | Detail page | Fetch next page, append to table |

## Testing Strategy

### Unit Tests

**Purpose:** Validate individual components render correctly with various data states

```typescript
// components/dashboard/StatsCard.test.tsx
describe('StatsCard', () => {
  // Test: Renders count and label correctly
  // Why: Ensures basic display functionality works

  // Test: Applies correct color class for each status type
  // Why: Visual feedback depends on status-specific styling

  // Test: Handles zero count without errors
  // Why: Edge case when no automations exist
});

// components/automations/AutomationCard.test.tsx
describe('AutomationCard', () => {
  // Test: Displays automation name, type, frequency
  // Why: Core information must be visible

  // Test: Shows "Paused" badge when status is paused
  // Why: Status visibility is critical for operations

  // Test: Calculates and displays success rate correctly
  // Why: Math errors would mislead operators

  // Test: Calls onPause with correct ID when pause clicked
  // Why: Action handlers must receive correct automation ID

  // Test: Shows "Resume" button when paused, "Pause" when active
  // Why: Button label must match available action
});

// components/detail/ExecutionLogTable.test.tsx
describe('ExecutionLogTable', () => {
  // Test: Renders correct number of rows for given logs
  // Why: All logs should be displayed

  // Test: Displays excluded count as (audienceSize - sentCount)
  // Why: Cadence exclusion calculation must be correct

  // Test: Formats duration from milliseconds to human-readable
  // Why: Raw milliseconds are not user-friendly

  // Test: Shows failure icon for failed executions
  // Why: Failed runs need visual distinction

  // Test: Calls onLoadMore when "Load More" clicked
  // Why: Pagination must trigger data fetch
});
```

### Integration Tests

**Purpose:** Validate page-level data fetching and rendering

```typescript
// app/page.test.tsx
describe('Dashboard Page', () => {
  // Test: Fetches automations and displays stats
  // Why: Dashboard depends on successful API integration

  // Test: Sorts upcoming executions by next run time
  // Why: Upcoming list must show soonest first

  // Test: Displays recent activity with metrics
  // Why: Activity feed is key monitoring feature

  // Test: "+ New Automation" links to /create-automation
  // Why: Navigation must work for primary CTA
});

// app/automations/page.test.tsx
describe('Automations List Page', () => {
  // Test: Renders all automations from API
  // Why: List must show complete data

  // Test: Filters by status when query param present
  // Why: Filtering is core list functionality

  // Test: Handles empty state gracefully
  // Why: New users will have no automations
});

// app/automations/[id]/page.test.tsx
describe('Automation Detail Page', () => {
  // Test: Fetches and displays automation config
  // Why: Detail page must show correct automation

  // Test: Loads and displays execution history
  // Why: Logs are key feature of detail page

  // Test: 404 when automation ID not found
  // Why: Invalid IDs should not crash app

  // Test: "Run Now" button triggers execute_now API call
  // Why: Manual execution is key operational feature

  // Test: "Run Now" shows confirmation dialog before executing
  // Why: Prevent accidental executions

  // Test: "Run Now" button disabled while automation is running
  // Why: Prevent duplicate concurrent executions
});
```

### E2E Tests (Playwright)

**Purpose:** Validate critical user flows work end-to-end

```typescript
// e2e/automation-dashboard.spec.ts
test.describe('Automation Dashboard', () => {
  // Test: User can view dashboard and see automation stats
  // Why: Primary landing experience must work

  // Test: User can navigate to automations list
  // Why: Navigation is core UX

  // Test: User can view automation detail and see logs
  // Why: Log viewing is key user need

  // Test: User can pause an active automation
  // Why: Control actions must work

  // Test: User can trigger "Run Now" on an automation
  // Why: Manual execution is key operational feature

  // Test: User can navigate to create automation
  // Why: CTA must lead to wizard
});
```

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Large automation list | Implement pagination (20 per page) |
| Execution history size | Load 20 logs initially, paginate on demand |
| Dashboard load time | Use Server Components for initial data fetch |
| Frequent polling | No auto-refresh in MVP; manual refresh button |

**Performance Targets:**
- Dashboard initial load: < 1s
- Automations list: < 500ms
- Detail page: < 500ms
- Action responses: < 200ms

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| Unauthorized access | Rely on existing deployment auth (Vercel/Railway) |
| CSRF on actions | Next.js App Router has built-in CSRF protection |
| Data exposure | APIs already return only necessary fields |
| Delete confirmation | Require explicit confirmation dialog |

**Note:** This is an internal ops tool. No public-facing authentication changes needed.

## Documentation

| Document | Action |
|----------|--------|
| This spec | Create in `specs/` |
| README.md | Update with new page structure |
| CLAUDE.md | Update if navigation patterns change |
| Inline comments | Add to new components explaining purpose |

## Implementation Phases

### Phase 1: Core Pages (MVP)

1. Create `HeaderNav` component with breadcrumb support
2. Create Dashboard page with stats, upcoming, recent activity
3. Create Automations List page with filtering
4. Create Automation Detail page with config panels
5. Create `ExecutionLogTable` component
6. Add "Run Now" button to detail page (triggers immediate execution of scheduled automation)
7. Update `layout.tsx` to use new header
8. Delete old `page.tsx`
9. Update navigation links in existing create/edit pages

### Phase 2: Enhancements (Deferred)

- Single execution drill-down page
- Real-time execution progress via SSE
- Export execution logs to CSV
- Execution timeline visualization
- Trend charts for success rates

### Phase 3: Polish (Deferred)

- Keyboard shortcuts for common actions
- Toast notifications for action feedback
- Dark mode support
- Mobile-responsive refinements

## Open Questions

1. **Execution history API**: Should we create a dedicated `/api/automation/[id]/history` endpoint for better pagination, or continue using logger file reads?
   - **Recommendation**: Use file reads for MVP, add endpoint in phase 2

2. **Cadence exclusion breakdown**: Should we show detailed exclusion reasons (L3 cooldown vs L2/L3 limit) or just total excluded count?
   - **Recommendation**: Total count for MVP, breakdown in phase 2

~~3. **Manual run**: Should detail page have a "Run Now" button to trigger immediate execution?~~
   - **RESOLVED**: Yes, included in Phase 1. "Run Now" button allows immediate execution of scheduled automations.

## References

- **Ideation Document**: `docs/automation-ui-redesign-spec.md`
- **Automation Types**: `src/types/automation.ts`
- **Logger Interface**: `src/lib/automationLogger.ts`
- **Existing Create Wizard**: `src/app/create-automation/page.tsx`
- **API Routes**: `src/app/api/automation/`

---

## Appendix: Wireframe Reference

See `docs/automation-ui-redesign-spec.md` for detailed ASCII wireframes of each page.
