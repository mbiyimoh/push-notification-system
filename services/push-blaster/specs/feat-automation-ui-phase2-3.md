# Automation UI Phase 2 & 3 Enhancements

> Extend the Automation UI MVP with detailed execution views, export capabilities, and UX improvements

## Status
**Validated** | Created: 2025-11-25 | Validated: 2025-11-25

## Overview

This specification covers the Phase 2 (Enhancements) and Phase 3 (Polish) features for the push-blaster Automation UI, building on the completed Phase 1 MVP. These features focus on two themes:

1. **Deeper Visibility** - Execution drill-down, cadence breakdown, CSV export
2. **UX Improvements** - Toast notifications, keyboard shortcuts

### Deferred Features (Out of Scope)
The following features have been evaluated and deferred to reduce complexity while retaining core value:
- **SSE Real-Time Progress** - Polling-based refresh is simpler; SSE adds significant infrastructure
- **Timeline Visualization** - Text-based phase durations provide equivalent insight
- **Dark Mode** - Low ROI for internal ops tool
- **Mobile Polish** - Basic Tailwind responsive defaults are sufficient

## Background / Problem Statement

The Phase 1 MVP provides core automation management functionality, but operators need:

1. **Execution Visibility**: The current execution history table shows summary metrics, but operators can't drill into individual executions to see phase-by-phase details, understand why specific pushes failed, or analyze cadence exclusion patterns.

2. **Export Capability**: Execution logs exist in JSON files on the server, but operators can't export them for external analysis, reporting, or compliance purposes.

3. **UX Friction**: Multiple small UX issues reduce efficiency:
   - No keyboard shortcuts for power users
   - Basic alert() dialogs instead of proper toast notifications

## Goals

- Provide drill-down view showing phase-by-phase execution details
- Allow CSV export of execution history for reporting and analysis
- Create dedicated pagination-friendly history API endpoint
- Break down cadence exclusions by reason (L3 cooldown, L2/L3 limit, L5 cooldown)
- Add keyboard shortcuts for common operations
- Replace alert() dialogs with proper toast notifications

## Non-Goals

- Trend charts or analytics dashboards (explicitly excluded)
- Email/Slack notifications for execution events
- Multi-user collaboration features
- Audit log viewer (separate from execution logs)
- Bulk operations on multiple automations
- SSE real-time progress (deferred - polling is sufficient)
- Timeline visualization (deferred - text durations sufficient)
- Dark mode (deferred - low ROI for internal tool)
- Mobile-specific polish beyond Tailwind defaults (deferred)

## Technical Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| Next.js | 15.3.5 | App Router, Server Components, Route Handlers |
| React | 19.0.0 | UI framework |
| Tailwind CSS | 4.x | Styling |
| PapaParse | 5.5.3 | CSV generation (already installed) |
| TypeScript | 5.x | Type safety |

**New Dependencies (Recommended):**

| Dependency | Version | Purpose |
|------------|---------|---------|
| sonner | ^1.7.0 | Lightweight toast notifications |

**Existing Internal Dependencies (reuse):**
- `src/lib/automationLogger.ts` - ExecutionLog, PhaseLog, PushLog interfaces
- `src/lib/timelineCalculator.ts` - Execution timeline calculations
- `src/app/components/automations/StatusBadge.tsx` - Status indicator component
- `src/app/components/detail/ExecutionLogTable.tsx` - Execution history display

**Cross-Service Dependency:**
- `push-cadence-service` - Requires API modification to return exclusion breakdown (see Feature 6)

## Detailed Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  Detail Page (/automations/[id])                                            │
│  ├─ ExecutionHistory (table with drill-down links)                          │
│  └─ [Export CSV] button                                                     │
│                                                                             │
│  Drill-down Page (/automations/[id]/executions/[execId])                    │
│  ├─ ExecutionOverview (summary stats)                                       │
│  ├─ PhaseBreakdown (expandable phase details)                               │
│  ├─ CadenceExclusionDetails (breakdown by reason)                           │
│  └─ PushLogList (individual push results)                                   │
│                                                                             │
│  Global UI                                                                  │
│  ├─ Toaster (sonner notifications)                                          │
│  └─ KeyboardShortcuts (global listener)                                     │
└──────────┬──────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API Layer (push-blaster)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  NEW: /api/automation/[id]/history                                          │
│       GET: Paginated execution history with optional filters                 │
│                                                                             │
│  NEW: /api/automation/[id]/executions/[execId]                              │
│       GET: Full execution details including phase logs                       │
│                                                                             │
│  NEW: /api/automation/[id]/executions/[execId]/export                       │
│       GET: CSV download of execution data                                    │
│                                                                             │
│  EXISTING: /api/automation/control                                          │
│            POST: execute_now                                                 │
└──────────┬──────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        API Layer (push-cadence-service)                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  MODIFIED: /api/filter-audience                                             │
│            POST: Returns eligibleUserIds + exclusionBreakdown               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/
├── app/
│   ├── automations/
│   │   └── [id]/
│   │       ├── page.tsx                    # EXISTING: Detail page (update)
│   │       ├── AutomationDetailClient.tsx  # EXISTING: Client component (update)
│   │       └── executions/
│   │           └── [execId]/
│   │               └── page.tsx            # NEW: Drill-down page
│   ├── api/
│   │   └── automation/
│   │       └── [id]/
│   │           ├── history/
│   │           │   └── route.ts            # NEW: Paginated history endpoint
│   │           └── executions/
│   │               └── [execId]/
│   │                   ├── route.ts        # NEW: Execution details
│   │                   └── export/
│   │                       └── route.ts    # NEW: CSV export
│   ├── components/
│   │   └── detail/
│   │       ├── ExecutionLogTable.tsx       # EXISTING: Update with drill-down links
│   │       ├── ExecutionDrilldown.tsx      # NEW: Full execution view
│   │       ├── PhaseBreakdown.tsx          # NEW: Phase-by-phase accordion
│   │       └── CadenceBreakdown.tsx        # NEW: Exclusion reason breakdown
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts         # NEW: Global shortcuts hook
│   └── layout.tsx                          # UPDATE: Add Toaster
├── lib/
│   ├── automationLogger.ts                 # UPDATE: Add exclusion breakdown
│   └── csvExporter.ts                      # NEW: CSV generation utilities
└── services/
    └── push-cadence-service/
        └── src/
            ├── lib/
            │   └── cadence.ts              # UPDATE: Return exclusion breakdown
            └── app/api/filter-audience/
                └── route.ts                # UPDATE: Include breakdown in response
```

---

## Feature Specifications

### Feature 1: Single Execution Drill-Down Page

**Route:** `/automations/[id]/executions/[execId]`

**Purpose:** Provide detailed view of a single execution with phase-by-phase breakdown

**Data Requirements:**
```typescript
interface ExecutionDrilldownData {
  execution: ExecutionLog;
  automation: UniversalAutomation;
  cadenceBreakdown: CadenceBreakdown;
}

interface CadenceBreakdown {
  totalExcluded: number;
  byReason: {
    l3Cooldown: number;      // 72-hour cooldown for Layer 3
    l2l3WeeklyLimit: number; // Combined L2/L3 max 3/week
    l5Cooldown: number;      // 96-hour cooldown for Layer 5
    other: number;           // Any other exclusion reasons
  };
  excludedUserSample: string[]; // First 10 excluded user IDs for debugging
}
```

**UI Layout:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Daily Showcase Push                                               │
│                                                                             │
│ EXECUTION: Nov 25, 2025 10:00 AM                     ✓ Completed (45s)      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ SUMMARY                                                                 │ │
│ │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐                        │ │
│ │ │ Sent    │ │Excluded │ │ Failed  │ │Duration │                        │ │
│ │ │ 12,453  │ │  2,341  │ │   12    │ │   45s   │                        │ │
│ │ └─────────┘ └─────────┘ └─────────┘ └─────────┘                        │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ EXECUTION PHASES                                                        │ │
│ │ ▼ Phase 1: Audience Generation            ✓ 5.2s                        │ │
│ │   └─ Script: generate_layer_3_push_csvs                                 │ │
│ │   └─ Generated: 14,806 users                                            │ │
│ │                                                                         │ │
│ │ ▼ Phase 2: Cadence Filtering              ✓ 1.1s                        │ │
│ │   └─ Input: 14,806 users                                                │ │
│ │   └─ Excluded: 2,341 users                                              │ │
│ │   └─ Output: 12,465 users                                               │ │
│ │                                                                         │ │
│ │ ► Phase 3: Test Sending                   ✓ 2.8s     [Expand]           │ │
│ │ ► Phase 4: Live Execution                 ✓ 35.4s    [Expand]           │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ CADENCE EXCLUSIONS (2,341 total)                          [Export CSV]  │ │
│ │ ├─ L3 72-hour Cooldown:     1,847 (78.9%)  ████████████████░░░░        │ │
│ │ ├─ L2/L3 Weekly Limit:        412 (17.6%)  ████░░░░░░░░░░░░░░░░        │ │
│ │ └─ Other:                      82 (3.5%)   █░░░░░░░░░░░░░░░░░░░        │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ PUSH RESULTS (4 sequences)                                              │ │
│ │ ┌────────┬────────────────────────────┬───────┬────────┬──────────────┐ │ │
│ │ │ Seq #  │ Title                      │ Sent  │ Failed │ Avg Time     │ │ │
│ │ ├────────┼────────────────────────────┼───────┼────────┼──────────────┤ │ │
│ │ │ 1      │ HAVES - Your sneaker...    │ 3,124 │ 3      │ 8.2ms        │ │ │
│ │ │ 2      │ WANTS - Wishlist item...   │ 3,089 │ 4      │ 7.9ms        │ │ │
│ │ │ 3      │ HOT_ITEMS - Hot alert...   │ 3,118 │ 2      │ 8.1ms        │ │ │
│ │ │ 4      │ TRENDING - Trending now    │ 3,122 │ 3      │ 8.0ms        │ │ │
│ │ └────────┴────────────────────────────┴───────┴────────┴──────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Component:** `ExecutionDrilldown.tsx`
```typescript
interface ExecutionDrilldownProps {
  execution: ExecutionLog;
  automation: UniversalAutomation;
  cadenceBreakdown: CadenceBreakdown;
}

// Server Component fetches data, renders client component for interactivity
export default async function ExecutionDrilldownPage({
  params
}: {
  params: Promise<{ id: string; execId: string }>;
}) {
  const { id, execId } = await params;
  const [execution, automation] = await Promise.all([
    fetchExecution(id, execId),
    fetchAutomation(id),
  ]);

  return (
    <ExecutionDrilldownClient
      execution={execution}
      automation={automation}
    />
  );
}
```

---

### Feature 3: Export Execution Logs to CSV

**Endpoint:** `GET /api/automation/[id]/executions/[execId]/export`

**Query Parameters:**
- `format`: `csv` (default) | `json`
- `include`: `summary` | `phases` | `pushes` | `all` (default)

**CSV Format (Summary):**
```csv
Execution ID,Automation,Date,Status,Duration (s),Sent,Excluded,Failed,Audience Size
exec_abc123,Daily Showcase,2025-11-25T10:00:00Z,completed,45,12453,2341,12,14806
```

**CSV Format (Detailed - Pushes):**
```csv
Execution ID,Sequence,Title,Layer,Sent,Failed,Excluded,Avg Time (ms)
exec_abc123,1,HAVES - Your sneaker...,2,3124,3,587,8.2
exec_abc123,2,WANTS - Wishlist item...,2,3089,4,601,7.9
```

**Implementation:**
```typescript
// src/lib/csvExporter.ts
import Papa from 'papaparse';
import { ExecutionLog } from './automationLogger';

export function exportExecutionToCsv(
  execution: ExecutionLog,
  include: 'summary' | 'phases' | 'pushes' | 'all' = 'all'
): string {
  const sections: string[] = [];

  if (include === 'summary' || include === 'all') {
    sections.push(Papa.unparse([{
      'Execution ID': execution.executionId,
      'Automation': execution.automationName,
      'Date': execution.startTime,
      'Status': execution.status,
      'Duration (s)': Math.round(execution.metrics.totalDuration / 1000),
      'Sent': execution.metrics.totalSentCount,
      'Excluded': execution.metrics.totalAudienceSize - execution.metrics.totalSentCount,
      'Failed': execution.metrics.failedPushes,
      'Audience Size': execution.metrics.totalAudienceSize,
    }]));
  }

  if (include === 'pushes' || include === 'all') {
    const pushRows = execution.pushLogs.map(push => ({
      'Execution ID': execution.executionId,
      'Sequence': push.sequenceOrder,
      'Title': push.title,
      'Layer': push.layerId,
      'Sent': push.sentCount,
      'Failed': push.failedCount,
      'Avg Time (ms)': push.avgSendTime?.toFixed(1) || 'N/A',
    }));
    sections.push(Papa.unparse(pushRows));
  }

  return sections.join('\n\n');
}
```

**UI Integration:**
- Add "Export CSV" button to ExecutionLogTable header
- Add "Export" button to drill-down page
- Download triggers via `blob` and `URL.createObjectURL`

---

### Feature 5: Dedicated History API Endpoint

**Endpoint:** `GET /api/automation/[id]/history`

**Purpose:** Paginated, filterable execution history (better than current approach of loading all logs)

**Query Parameters:**
```typescript
interface HistoryQueryParams {
  page?: number;        // Default: 1
  limit?: number;       // Default: 20, Max: 100
  status?: 'completed' | 'failed' | 'running' | 'cancelled';
  startDate?: string;   // ISO date
  endDate?: string;     // ISO date
  sortBy?: 'date' | 'duration' | 'sent';
  sortOrder?: 'asc' | 'desc';
}
```

**Response:**
```typescript
interface HistoryResponse {
  success: true;
  data: {
    executions: ExecutionSummary[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  };
  message: string;
}

interface ExecutionSummary {
  executionId: string;
  startTime: string;
  status: ExecutionStatus;
  duration: number;
  metrics: {
    totalSentCount: number;
    totalAudienceSize: number;
    failedPushes: number;
  };
}
```

**Implementation:**
```typescript
// src/app/api/automation/[id]/history/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);

  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
  const status = searchParams.get('status') as ExecutionStatus | null;
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  // Load all execution logs for this automation
  const allLogs = await automationLogger.loadExecutionHistory(id);

  // Apply filters
  let filtered = allLogs;
  if (status) {
    filtered = filtered.filter(log => log.status === status);
  }
  if (startDate) {
    filtered = filtered.filter(log => new Date(log.startTime) >= new Date(startDate));
  }
  if (endDate) {
    filtered = filtered.filter(log => new Date(log.startTime) <= new Date(endDate));
  }

  // Sort by date descending (most recent first)
  filtered.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());

  // Paginate
  const total = filtered.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const executions = filtered.slice(offset, offset + limit).map(toSummary);

  return NextResponse.json({
    success: true,
    data: {
      executions,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    },
    message: 'Execution history retrieved successfully',
  });
}
```

---

### Feature 6: Cadence Exclusion Breakdown

**Purpose:** Show detailed breakdown of why users were excluded by cadence rules

**Cross-Service Modification Required:** This feature requires updating `push-cadence-service` to return exclusion breakdown data.

#### push-cadence-service Changes

**File:** `services/push-cadence-service/src/lib/cadence.ts`

**Current Return Type:**
```typescript
{ eligibleUserIds: string[], excludedCount: number }
```

**New Return Type:**
```typescript
interface FilterResult {
  eligibleUserIds: string[];
  excludedCount: number;
  exclusionBreakdown: {
    l3Cooldown: number;        // Layer 3: 72-hour cooldown
    l2l3WeeklyLimit: number;   // Combined L2/L3: max 3/week
    l5Cooldown: number;        // Layer 5: 96-hour cooldown
    invalidUuid: number;       // Invalid UUID format
  };
}
```

**Implementation Update:**
```typescript
// In filterUsersByCadence function, track counts per-reason
export const filterUsersByCadence = async (
  userIds: string[],
  layerId: number
): Promise<FilterResult> => {
  // ... existing validation code ...

  const exclusionBreakdown = {
    l3Cooldown: 0,
    l2l3WeeklyLimit: 0,
    l5Cooldown: 0,
    invalidUuid: userIds.length - validUserIds.length,
  };

  // Rule 1: Layer 5 Cooldown
  if (layerId === 5) {
    const result = await getPool().query(/* existing query */);
    result.rows.forEach(row => excludedUserIds.add(row.user_id));
    exclusionBreakdown.l5Cooldown = result.rows.length;
  }

  // Rule 2: Layer 3 Cooldown
  if (layerId === 3) {
    const result = await getPool().query(/* existing query */);
    result.rows.forEach(row => excludedUserIds.add(row.user_id));
    exclusionBreakdown.l3Cooldown = result.rows.length;
  }

  // Rule 3: Combined L2/L3 Limit
  if (usersToCheckForCombinedLimit.length > 0) {
    const result = await getPool().query(/* existing query */);
    result.rows.forEach(row => excludedUserIds.add(row.user_id));
    exclusionBreakdown.l2l3WeeklyLimit = result.rows.length;
  }

  return {
    eligibleUserIds,
    excludedCount: excludedUserIds.size,
    exclusionBreakdown,
  };
};
```

**File:** `services/push-cadence-service/src/app/api/filter-audience/route.ts`

Update response to include breakdown:
```typescript
const { eligibleUserIds, excludedCount, exclusionBreakdown } =
  await filterUsersByCadence(userIds, layerId);

return NextResponse.json({ eligibleUserIds, excludedCount, exclusionBreakdown });
```

#### push-blaster Changes

**Data Model Update:**
```typescript
// Extend PhaseLog for cadence_filtering phase
interface CadenceFilteringPhaseLog extends PhaseLog {
  phase: 'cadence_filtering';
  exclusionBreakdown: {
    l3Cooldown: number;        // Layer 3: 72-hour cooldown
    l2l3WeeklyLimit: number;   // Combined L2/L3: max 3/week
    l5Cooldown: number;        // Layer 5: 96-hour cooldown
    invalidUuid: number;       // Invalid UUID format
  };
}
```

**UI Component:**
```typescript
interface CadenceBreakdownProps {
  breakdown: CadenceBreakdown;
  totalExcluded: number;
}

export function CadenceBreakdown({ breakdown, totalExcluded }: CadenceBreakdownProps) {
  const reasons = [
    { label: 'L3 72-hour Cooldown', count: breakdown.l3Cooldown, color: 'bg-blue-500' },
    { label: 'L2/L3 Weekly Limit (3/week)', count: breakdown.l2l3WeeklyLimit, color: 'bg-purple-500' },
    { label: 'L5 96-hour Cooldown', count: breakdown.l5Cooldown, color: 'bg-orange-500' },
    { label: 'No Device Token', count: breakdown.noDeviceToken, color: 'bg-gray-500' },
    { label: 'Other', count: breakdown.other, color: 'bg-gray-400' },
  ].filter(r => r.count > 0);

  return (
    <div className="space-y-3">
      {reasons.map(reason => (
        <div key={reason.label} className="flex items-center gap-3">
          <div className="w-40 text-sm text-gray-600">{reason.label}</div>
          <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full ${reason.color}`}
              style={{ width: `${(reason.count / totalExcluded) * 100}%` }}
            />
          </div>
          <div className="w-20 text-sm text-gray-900 text-right">
            {reason.count.toLocaleString()} ({((reason.count / totalExcluded) * 100).toFixed(1)}%)
          </div>
        </div>
      ))}
    </div>
  );
}
```

---

### Feature 7: Keyboard Shortcuts

**Implementation:** Global keyboard shortcut hook

**Shortcuts:**
| Shortcut | Action | Context |
|----------|--------|---------|
| `Cmd/Ctrl + Enter` | Run Now | Detail page |
| `Cmd/Ctrl + P` | Pause/Resume | Detail page |
| `Cmd/Ctrl + E` | Edit | Detail page |
| `Cmd/Ctrl + /` | Show shortcuts help | Global |
| `Escape` | Close modal/dialog | Global |
| `J` / `K` | Navigate list (down/up) | List page |

**Hook Implementation:**
```typescript
// src/app/hooks/useKeyboardShortcuts.ts
interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.meta ? (e.metaKey || e.ctrlKey) : true;
        const ctrlMatch = shortcut.ctrl ? e.ctrlKey : true;
        const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
        const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

        if (metaMatch && ctrlMatch && shiftMatch && keyMatch) {
          e.preventDefault();
          shortcut.action();
          return;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

// Usage:
useKeyboardShortcuts([
  { key: 'Enter', meta: true, action: handleRunNow, description: 'Run automation now' },
  { key: 'p', meta: true, action: handlePauseResume, description: 'Pause/Resume' },
  { key: 'e', meta: true, action: handleEdit, description: 'Edit automation' },
  { key: '/', meta: true, action: () => setShowShortcutsHelp(true), description: 'Show shortcuts' },
  { key: 'Escape', action: handleClose, description: 'Close dialog' },
]);
```

**Shortcuts Help Modal:**
```
┌─────────────────────────────────────────────────────┐
│ KEYBOARD SHORTCUTS                            [×]   │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ⌘ + Enter    Run automation now                   │
│  ⌘ + P        Pause / Resume                       │
│  ⌘ + E        Edit automation                      │
│  ⌘ + /        Show this help                       │
│  Escape       Close dialog                         │
│                                                     │
│  List Navigation:                                   │
│  J            Move down                            │
│  K            Move up                              │
│  Enter        Open selected                        │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### Feature 8: Toast Notifications

**Approach:** Use `sonner` library for lightweight, accessible toasts

**Installation:**
```bash
npm install sonner
```

**Provider Setup:**
```typescript
// src/app/layout.tsx
import { Toaster } from 'sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            duration: 4000,
            className: 'font-sans',
          }}
        />
      </body>
    </html>
  );
}
```

**Usage Pattern:**
```typescript
import { toast } from 'sonner';

// Success
toast.success('Automation executed successfully', {
  description: 'Sent 12,453 pushes in 45 seconds',
});

// Error
toast.error('Execution failed', {
  description: 'Audience generation script timed out',
});

// Loading (with promise)
toast.promise(executeAutomation(), {
  loading: 'Executing automation...',
  success: (data) => `Sent ${data.sentCount} pushes`,
  error: (err) => `Failed: ${err.message}`,
});

// Action toast
toast('Automation paused', {
  action: {
    label: 'Undo',
    onClick: () => handleResume(),
  },
});
```

**Replace Alert Patterns:**
```typescript
// Before (in automations/page.tsx)
alert(err instanceof Error ? err.message : 'Failed to pause automation');

// After
toast.error('Failed to pause automation', {
  description: err instanceof Error ? err.message : 'Unknown error',
});
```

---

## User Experience

### User Flows

**Flow 1: Running Automation Manually**
1. User clicks "Run Now" on automation detail page
2. Confirmation dialog appears
3. User confirms execution
4. Toast notification shows "Automation executing..."
5. After ~30s, page auto-refreshes to show new execution in history
6. Toast notification shows completion status with metrics
7. User can click new execution to see drill-down

**Flow 2: Analyzing Past Execution**
1. User views automation detail page
2. Clicks execution row in history table
3. Navigates to drill-down page
4. Expands phase sections to see details
5. Reviews cadence exclusion breakdown
6. Clicks "Export CSV" to download data
7. Uses exported data for reporting

**Flow 3: Using Keyboard Shortcuts**
1. User presses `Cmd/Ctrl + /` to see shortcuts help
2. Uses `J`/`K` to navigate execution history
3. Presses `Enter` to open selected execution
4. Uses `Cmd/Ctrl + E` to edit automation

### Accessibility Considerations

- All interactive elements keyboard-accessible
- ARIA labels for icon-only buttons
- Focus management for modals
- Color contrast meets WCAG AA
- Screen reader announcements for toast notifications

---

## Testing Strategy

### Unit Tests

```typescript
// src/lib/__tests__/csvExporter.test.ts
describe('csvExporter', () => {
  // Test: Generates valid CSV with correct headers
  // Purpose: Ensures exported CSV can be opened in spreadsheet apps

  // Test: Handles empty execution logs gracefully
  // Purpose: Edge case when no data available

  // Test: Escapes special characters in CSV values
  // Purpose: Prevents CSV injection and parsing errors
});

// src/app/hooks/__tests__/useKeyboardShortcuts.test.ts
describe('useKeyboardShortcuts', () => {
  // Test: Triggers action on matching shortcut
  // Purpose: Core functionality works

  // Test: Ignores shortcuts when input is focused
  // Purpose: Prevents conflicts with text entry

  // Test: Handles Cmd on Mac and Ctrl on Windows
  // Purpose: Cross-platform compatibility
});
```

### Integration Tests

```typescript
// src/app/api/automation/[id]/history/__tests__/route.test.ts
describe('GET /api/automation/[id]/history', () => {
  // Test: Returns paginated results with correct structure
  // Purpose: Validates pagination math and response shape

  // Test: Filters by status when query param provided
  // Purpose: Ensures filtering logic works

  // Test: Returns 404 for non-existent automation
  // Purpose: Error handling for invalid IDs
});

// src/app/automations/[id]/executions/[execId]/__tests__/page.test.ts
describe('Execution Drill-down Page', () => {
  // Test: Renders all execution phases
  // Purpose: Core UI displays correctly

  // Test: Shows cadence breakdown when available
  // Purpose: Feature renders with real data

  // Test: Export button triggers CSV download
  // Purpose: Export functionality works end-to-end
});
```

### E2E Tests (Playwright)

```typescript
// e2e/execution-drilldown.spec.ts
test.describe('Execution Drill-down', () => {
  // Test: Navigate to drill-down from history table
  // Purpose: Navigation flow works

  // Test: Expand and collapse phase sections
  // Purpose: Accordion interaction works

  // Test: Export CSV and verify download
  // Purpose: Full export flow works
});

// e2e/toast-notifications.spec.ts
test.describe('Toast Notifications', () => {
  // Test: Success toast appears after Run Now completes
  // Purpose: User feedback on execution completion

  // Test: Error toast appears on failure
  // Purpose: Error states are communicated clearly

  // Test: Action toasts allow undo (e.g., pause)
  // Purpose: Reversible actions work correctly
});

// e2e/keyboard-shortcuts.spec.ts
test.describe('Keyboard Shortcuts', () => {
  // Test: Cmd+/ shows shortcuts help modal
  // Purpose: Discoverability of shortcuts

  // Test: J/K navigates history list
  // Purpose: Power user navigation works

  // Test: Escape closes modals
  // Purpose: Standard keyboard patterns work
});
```

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Large execution history | Server-side pagination; lazy load older entries |
| CSV export memory usage | Stream large exports; limit to 10,000 rows |
| Drill-down page data fetch | Parallel fetch of automation + execution data |

**Performance Targets:**
- Drill-down page load: < 500ms
- CSV export (1000 rows): < 1s
- History API response: < 200ms

---

## Security Considerations

| Concern | Mitigation |
|---------|------------|
| CSV injection | Escape formulas (=, +, -, @) in exported data |
| XSS in user-generated content | Sanitize automation names/descriptions in exports |
| API authorization | Verify user has access to automation before returning data |

---

## Documentation

| Document | Action |
|----------|--------|
| This spec | Create in `specs/` |
| CLAUDE.md | Add new API endpoints and components |
| developer-guides/push-blaster-guide.md | Update with Phase 2/3 features |
| README.md | Update feature list |

---

## Implementation Phases

### Phase 2A: Foundation (Estimated: 2-3 days)
1. **Cadence Service Update** - Modify `filterUsersByCadence` to return exclusion breakdown
2. **History API** - Create `/api/automation/[id]/history` with pagination
3. **Drill-down Page** - Build `/automations/[id]/executions/[execId]` with phase breakdown
4. **Cadence Breakdown UI** - Display exclusion reasons with visual bars

### Phase 2B: Export & Polish (Estimated: 1-2 days)
5. **CSV Export** - Implement export endpoint and download trigger
6. **Toast Notifications** - Install sonner, replace 6 existing alert() calls
7. **Auto-refresh** - Add polling-based refresh after "Run Now" execution

### Phase 3: Power User Features (Estimated: 1 day)
8. **Keyboard Shortcuts** - Implement `useKeyboardShortcuts` hook
9. **Shortcuts Help Modal** - Show available shortcuts on `Cmd+/`
10. **List Navigation** - J/K navigation for execution history

**Total Estimated Effort: 4-6 days**

### Deferred to Future (If Needed)
- SSE real-time progress monitoring
- Timeline visualization
- Dark mode support
- Mobile-specific responsive polish

---

## Resolved Questions

1. **~~SSE vs WebSocket~~**: Deferred - using polling-based refresh instead.

2. **CSV vs Excel Export**: CSV only for MVP; Excel adds complexity (need xlsx library).
   - **Decision**: CSV only

3. **Cadence Service Integration**: Does push-cadence-service provide exclusion reason breakdown?
   - **Resolved**: No, current API returns only `{ eligibleUserIds, excludedCount }`.
   - **Solution**: Modify `filterUsersByCadence()` to return breakdown (included in this spec).

4. **Toast Duration**: How long should toasts remain visible?
   - **Decision**: 4s for success, 6s for errors, indefinite for action toasts

---

## References

- **Phase 1 MVP Spec**: `specs/feat-automation-ui-mvp.md`
- **Execution Logger**: `src/lib/automationLogger.ts`
- **Cadence Service**: `services/push-cadence-service/src/lib/cadence.ts`
- **Sonner Documentation**: https://sonner.emilkowal.ski/
- **Next.js Route Handlers**: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
