# Task Breakdown: Automation UI MVP

Generated: 2025-11-25
Source: specs/feat-automation-ui-mvp.md

## Overview

Replace the monolithic 3000+ line `page.tsx` with a focused 3-page automation dashboard consisting of:
- Dashboard (`/`) - Stats, upcoming executions, recent activity
- Automations List (`/automations`) - Filterable list with actions
- Automation Detail (`/automations/[id]`) - Config panels, execution history, Run Now

## Dependency Graph

```
Phase 1: Foundation (can run in parallel)
├── Task 1.1: StatusBadge component
├── Task 1.2: StatsCard component
└── Task 1.3: HeaderNav with breadcrumbs

Phase 2: Core Components (depends on Phase 1)
├── Task 2.1: AutomationCard component (depends on 1.1)
├── Task 2.2: ExecutionLogTable component
├── Task 2.3: UpcomingExecutions component (depends on 1.1)
└── Task 2.4: RecentActivity component

Phase 3: Pages (depends on Phase 2)
├── Task 3.1: Dashboard page (depends on 1.2, 1.3, 2.3, 2.4)
├── Task 3.2: Automations List page (depends on 1.3, 2.1)
└── Task 3.3: Automation Detail page (depends on 1.3, 2.2)

Phase 4: Integration (depends on Phase 3)
├── Task 4.1: Run Now functionality (depends on 3.3)
├── Task 4.2: Layout updates (depends on 1.3)
└── Task 4.3: Delete old page.tsx and update navigation (depends on 3.1, 3.2, 3.3)
```

---

## Phase 1: Foundation Components

### Task 1.1: Create StatusBadge Component

**Description**: Build reusable status indicator pill component for automation status display
**Size**: Small
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.2, Task 1.3

**File to create**: `src/app/components/automations/StatusBadge.tsx`

**Technical Requirements**:
```typescript
interface StatusBadgeProps {
  status: AutomationStatus;
  size?: 'sm' | 'md';
}

// AutomationStatus from src/types/automation.ts:
// 'draft' | 'active' | 'inactive' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

// Status colors:
// active/running -> green (bg-green-100 text-green-800)
// paused -> yellow (bg-yellow-100 text-yellow-800)
// failed -> red (bg-red-100 text-red-800)
// draft -> gray (bg-gray-100 text-gray-800)
// scheduled -> blue (bg-blue-100 text-blue-800)
```

**Implementation**:
```typescript
'use client';

import { AutomationStatus } from '@/types/automation';

interface StatusBadgeProps {
  status: AutomationStatus;
  size?: 'sm' | 'md';
}

const statusConfig: Record<AutomationStatus, { bg: string; text: string; label: string }> = {
  active: { bg: 'bg-green-100', text: 'text-green-800', label: 'Active' },
  running: { bg: 'bg-green-100', text: 'text-green-800', label: 'Running' },
  paused: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Paused' },
  failed: { bg: 'bg-red-100', text: 'text-red-800', label: 'Failed' },
  draft: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Draft' },
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Scheduled' },
  inactive: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Inactive' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', label: 'Completed' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Cancelled' },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span className={`inline-flex items-center rounded-full font-medium ${config.bg} ${config.text} ${sizeClasses}`}>
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${status === 'running' || status === 'active' ? 'bg-green-500' : status === 'paused' ? 'bg-yellow-500' : 'bg-current'}`} />
      {config.label}
    </span>
  );
}
```

**Acceptance Criteria**:
- [ ] Renders correct color for each status type
- [ ] Supports 'sm' and 'md' sizes
- [ ] Shows status dot indicator
- [ ] Handles unknown status gracefully (falls back to draft style)
- [ ] Uses Tailwind CSS classes only

---

### Task 1.2: Create StatsCard Component

**Description**: Build dashboard stat display card showing count with status indicator
**Size**: Small
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.1, Task 1.3

**File to create**: `src/app/components/dashboard/StatsCard.tsx`

**Technical Requirements**:
```typescript
interface StatsCardProps {
  label: string;      // "Live Automations", "Scheduled", "Paused"
  count: number;      // The numeric count to display
  status: 'live' | 'scheduled' | 'paused';
  subtitle?: string;  // Optional subtext like "Running now"
}
```

**Implementation**:
```typescript
'use client';

interface StatsCardProps {
  label: string;
  count: number;
  status: 'live' | 'scheduled' | 'paused';
  subtitle?: string;
}

const statusStyles = {
  live: {
    border: 'border-green-200',
    bg: 'bg-green-50',
    dot: 'bg-green-500',
    text: 'text-green-700',
  },
  scheduled: {
    border: 'border-blue-200',
    bg: 'bg-blue-50',
    dot: 'bg-blue-500',
    text: 'text-blue-700',
  },
  paused: {
    border: 'border-yellow-200',
    bg: 'bg-yellow-50',
    dot: 'bg-yellow-500',
    text: 'text-yellow-700',
  },
};

export function StatsCard({ label, count, status, subtitle }: StatsCardProps) {
  const styles = statusStyles[status];

  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-slate-600">{label}</p>
          <p className={`text-3xl font-bold ${styles.text}`}>{count}</p>
          {subtitle && (
            <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`h-3 w-3 rounded-full ${styles.dot}`} />
      </div>
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Displays label, count, and optional subtitle
- [ ] Applies correct color scheme for each status type
- [ ] Shows status dot indicator
- [ ] Handles zero count display correctly
- [ ] Responsive sizing with Tailwind

---

### Task 1.3: Create HeaderNav Component with Breadcrumbs

**Description**: Build header navigation component with breadcrumb support and "+ New Automation" button
**Size**: Medium
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.1, Task 1.2

**File to create**: `src/app/components/nav/HeaderNav.tsx`

**Technical Requirements**:
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
```

**Implementation**:
```typescript
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface HeaderNavProps {
  breadcrumbs: BreadcrumbItem[];
  showCreateButton?: boolean;
}

export function HeaderNav({ breadcrumbs, showCreateButton = true }: HeaderNavProps) {
  const router = useRouter();

  // Find the first breadcrumb with href for back navigation
  const backLink = breadcrumbs.find(b => b.href)?.href;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {backLink && (
              <button
                onClick={() => router.push(backLink)}
                className="text-slate-400 hover:text-slate-600 mr-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <nav className="flex items-center space-x-2 text-sm">
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center">
                  {index > 0 && <span className="mx-2 text-slate-300">/</span>}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-slate-500 hover:text-slate-700"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="font-semibold text-slate-800">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          </div>

          {showCreateButton && (
            <Link
              href="/create-automation"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              + New Automation
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
```

**Acceptance Criteria**:
- [ ] Renders breadcrumb trail with "/" separators
- [ ] Shows back arrow when navigable breadcrumbs exist
- [ ] Last breadcrumb (current page) is bold and not a link
- [ ] "+ New Automation" button links to /create-automation
- [ ] Button can be hidden via showCreateButton prop
- [ ] Sticky header with white background

---

## Phase 2: Core Components

### Task 2.1: Create AutomationCard Component

**Description**: Build card component for displaying automation in list view with actions
**Size**: Medium
**Priority**: High
**Dependencies**: Task 1.1 (StatusBadge)
**Can run parallel with**: Task 2.2, Task 2.3, Task 2.4

**File to create**: `src/app/components/automations/AutomationCard.tsx`

**Technical Requirements**:
```typescript
interface AutomationCardProps {
  automation: UniversalAutomation;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

// Display fields from UniversalAutomation:
// - name, description
// - type (script_based, template, etc.)
// - schedule.frequency (daily, weekly, once)
// - schedule.executionTime
// - schedule.timezone
// - pushSequence.length
// - metadata.lastExecutedAt
// - metadata.nextExecutionAt
// - metadata.totalExecutions
// - metadata.successfulExecutions (for success rate)
// - status, isActive
```

**Implementation**:
```typescript
'use client';

import Link from 'next/link';
import { UniversalAutomation } from '@/types/automation';
import { StatusBadge } from './StatusBadge';

interface AutomationCardProps {
  automation: UniversalAutomation;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatDate(dateString?: string): string {
  if (!dateString) return '--';
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  if (isToday) return `Today ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  if (isTomorrow) return `Tomorrow ${date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getSuccessRate(automation: UniversalAutomation): string {
  const total = automation.metadata.totalExecutions;
  const successful = automation.metadata.successfulExecutions;
  if (total === 0) return '--';
  return `${((successful / total) * 100).toFixed(1)}%`;
}

export function AutomationCard({ automation, onPause, onResume, onDelete }: AutomationCardProps) {
  const isPaused = automation.status === 'paused';
  const isRunning = automation.status === 'running';

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete "${automation.name}"?`)) {
      onDelete(automation.id);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 hover:border-slate-300 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center space-x-3">
          <StatusBadge status={automation.status} />
          <h3 className="font-semibold text-slate-800">{automation.name}</h3>
        </div>
      </div>

      <div className="text-sm text-slate-500 mb-4">
        <span className="capitalize">{automation.type.replace('_', '-')}</span>
        <span className="mx-2">|</span>
        <span className="capitalize">{automation.schedule.frequency}</span>
        <span className="mx-2">|</span>
        <span>{automation.schedule.executionTime} {automation.schedule.timezone?.split('/')[1] || 'CT'}</span>
        <span className="mx-2">|</span>
        <span>{automation.pushSequence.length} sequence{automation.pushSequence.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="text-sm text-slate-600 mb-4">
        <div className="flex space-x-6">
          <span>Last: {formatDate(automation.metadata.lastExecutedAt)}</span>
          <span>Next: {isPaused ? '--' : formatDate(automation.metadata.nextExecutionAt)}</span>
        </div>
        <div className="mt-1">
          <span>{automation.metadata.totalExecutions} executions</span>
          <span className="mx-2">|</span>
          <span>{getSuccessRate(automation)} success</span>
        </div>
      </div>

      <div className="flex items-center space-x-2 pt-4 border-t border-slate-100">
        <Link
          href={`/automations/${automation.id}`}
          className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded"
        >
          View
        </Link>
        <Link
          href={`/edit-automation/${automation.id}`}
          className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-50 rounded"
        >
          Edit
        </Link>
        {isPaused ? (
          <button
            onClick={() => onResume(automation.id)}
            className="px-3 py-1.5 text-sm text-green-600 hover:text-green-800 hover:bg-green-50 rounded"
          >
            Resume
          </button>
        ) : (
          <button
            onClick={() => onPause(automation.id)}
            disabled={isRunning}
            className="px-3 py-1.5 text-sm text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded disabled:opacity-50"
          >
            Pause
          </button>
        )}
        <button
          onClick={handleDelete}
          className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Displays automation name, type, frequency, time, sequence count
- [ ] Shows last/next execution dates with smart formatting (Today, Tomorrow, date)
- [ ] Shows execution count and success rate
- [ ] StatusBadge shows current status
- [ ] Pause button for active, Resume button for paused
- [ ] Delete button with confirmation dialog
- [ ] View and Edit links navigate correctly

---

### Task 2.2: Create ExecutionLogTable Component

**Description**: Build table component for displaying automation execution history with metrics
**Size**: Medium
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 2.1, Task 2.3, Task 2.4

**File to create**: `src/app/components/detail/ExecutionLogTable.tsx`

**Technical Requirements**:
```typescript
interface ExecutionLogTableProps {
  automationId: string;
  logs: ExecutionLog[];
  onLoadMore: () => void;
  hasMore: boolean;
}

// Each row displays from ExecutionLog:
// - Status icon (✓/✗) based on status field
// - Date/time from startTime
// - Sent count from metrics.totalSentCount
// - Excluded count = metrics.totalAudienceSize - metrics.totalSentCount - failedPushes
// - Failed count from metrics.failedPushes
// - Duration from metrics.totalDuration (formatted to human readable)
```

**Implementation**:
```typescript
'use client';

interface ExecutionLog {
  executionId: string;
  automationId: string;
  automationName: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  metrics: {
    totalDuration: number;
    totalAudienceSize: number;
    totalSentCount: number;
    failedPushes: number;
  };
}

interface ExecutionLogTableProps {
  automationId: string;
  logs: ExecutionLog[];
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading?: boolean;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDateTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

export function ExecutionLogTable({ logs, onLoadMore, hasMore, isLoading }: ExecutionLogTableProps) {
  if (logs.length === 0 && !isLoading) {
    return (
      <div className="text-center py-12 text-slate-500">
        <p>No executions yet</p>
        <p className="text-sm mt-1">Execution history will appear here after the automation runs</p>
      </div>
    );
  }

  return (
    <div>
      <table className="w-full">
        <thead>
          <tr className="text-left text-sm text-slate-500 border-b border-slate-200">
            <th className="pb-3 font-medium">Status</th>
            <th className="pb-3 font-medium">Date/Time</th>
            <th className="pb-3 font-medium text-right">Sent</th>
            <th className="pb-3 font-medium text-right">Excluded</th>
            <th className="pb-3 font-medium text-right">Failed</th>
            <th className="pb-3 font-medium text-right">Duration</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const excluded = log.metrics.totalAudienceSize - log.metrics.totalSentCount - log.metrics.failedPushes;
            const isSuccess = log.status === 'completed';
            const isFailed = log.status === 'failed';

            return (
              <tr key={log.executionId} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-3">
                  {isSuccess ? (
                    <span className="text-green-600">✓</span>
                  ) : isFailed ? (
                    <span className="text-red-600">✗</span>
                  ) : (
                    <span className="text-blue-600">●</span>
                  )}
                </td>
                <td className="py-3 text-sm text-slate-600">
                  {formatDateTime(log.startTime)}
                </td>
                <td className="py-3 text-sm text-slate-800 text-right font-medium">
                  {log.metrics.totalSentCount.toLocaleString()}
                </td>
                <td className="py-3 text-sm text-slate-500 text-right">
                  {excluded > 0 ? excluded.toLocaleString() : '--'}
                </td>
                <td className="py-3 text-sm text-right">
                  {log.metrics.failedPushes > 0 ? (
                    <span className="text-red-600">{log.metrics.failedPushes}</span>
                  ) : (
                    <span className="text-slate-400">--</span>
                  )}
                </td>
                <td className="py-3 text-sm text-slate-500 text-right">
                  {formatDuration(log.metrics.totalDuration)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {hasMore && (
        <div className="mt-4 text-center">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Renders table with Status, Date/Time, Sent, Excluded, Failed, Duration columns
- [ ] Shows ✓ for completed, ✗ for failed, ● for running
- [ ] Calculates excluded count correctly: totalAudienceSize - totalSentCount - failedPushes
- [ ] Formats duration from ms to human readable (45s, 2m 30s)
- [ ] Shows "No executions yet" for empty state
- [ ] "Load More" button triggers onLoadMore callback
- [ ] Numbers formatted with locale separators (12,453)

---

### Task 2.3: Create UpcomingExecutions Component

**Description**: Build component showing next scheduled automation runs
**Size**: Small
**Priority**: High
**Dependencies**: Task 1.1 (StatusBadge)
**Can run parallel with**: Task 2.1, Task 2.2, Task 2.4

**File to create**: `src/app/components/dashboard/UpcomingExecutions.tsx`

**Implementation**:
```typescript
'use client';

import Link from 'next/link';
import { UniversalAutomation } from '@/types/automation';
import { StatusBadge } from '../automations/StatusBadge';

interface UpcomingExecutionsProps {
  automations: UniversalAutomation[];
}

function formatNextRun(dateString?: string): string {
  if (!dateString) return '--';
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (isToday) return `Today ${time}`;
  if (isTomorrow) return `Tomorrow ${time}`;
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ` ${time}`;
}

export function UpcomingExecutions({ automations }: UpcomingExecutionsProps) {
  // Sort by next execution time, filter for active with nextExecutionAt
  const upcoming = automations
    .filter(a => a.isActive && a.metadata.nextExecutionAt)
    .sort((a, b) =>
      new Date(a.metadata.nextExecutionAt!).getTime() -
      new Date(b.metadata.nextExecutionAt!).getTime()
    )
    .slice(0, 5);

  if (upcoming.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No upcoming executions</p>
        <p className="text-sm mt-1">Active automations will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {upcoming.map((automation) => (
        <Link
          key={automation.id}
          href={`/automations/${automation.id}`}
          className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <span className="text-lg">⏰</span>
            <div>
              <p className="font-medium text-slate-800">{automation.name}</p>
              <p className="text-sm text-slate-500">
                {formatNextRun(automation.metadata.nextExecutionAt)} • {automation.schedule.frequency}
              </p>
            </div>
          </div>
          <StatusBadge status={automation.status} size="sm" />
        </Link>
      ))}
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Shows up to 5 upcoming automations sorted by next run time
- [ ] Displays automation name, next run time, frequency
- [ ] Smart date formatting (Today, Tomorrow, weekday)
- [ ] StatusBadge shows current status
- [ ] Links to automation detail page
- [ ] Empty state when no upcoming executions

---

### Task 2.4: Create RecentActivity Component

**Description**: Build component showing recent execution activity with metrics
**Size**: Small
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 2.1, Task 2.2, Task 2.3

**File to create**: `src/app/components/dashboard/RecentActivity.tsx`

**Implementation**:
```typescript
'use client';

import Link from 'next/link';

interface ExecutionSummary {
  executionId: string;
  automationId: string;
  automationName: string;
  startTime: string;
  status: 'completed' | 'failed' | 'running';
  metrics: {
    totalSentCount: number;
    totalAudienceSize: number;
  };
  error?: string;
}

interface RecentActivityProps {
  executions: ExecutionSummary[];
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (isToday) return time;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`;
}

export function RecentActivity({ executions }: RecentActivityProps) {
  if (executions.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p>No recent activity</p>
        <p className="text-sm mt-1">Execution results will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {executions.map((exec) => {
        const excluded = exec.metrics.totalAudienceSize - exec.metrics.totalSentCount;
        const isSuccess = exec.status === 'completed';
        const isFailed = exec.status === 'failed';

        return (
          <Link
            key={exec.executionId}
            href={`/automations/${exec.automationId}`}
            className="block p-3 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <span className={`mt-0.5 ${isSuccess ? 'text-green-600' : isFailed ? 'text-red-600' : 'text-blue-600'}`}>
                  {isSuccess ? '✓' : isFailed ? '✗' : '●'}
                </span>
                <div>
                  <p className="font-medium text-slate-800">{exec.automationName}</p>
                  {isFailed && exec.error ? (
                    <p className="text-sm text-red-600">Error: {exec.error}</p>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Sent: {exec.metrics.totalSentCount.toLocaleString()}
                      {excluded > 0 && ` • Excluded: ${excluded.toLocaleString()}`}
                    </p>
                  )}
                </div>
              </div>
              <span className="text-sm text-slate-400">{formatTime(exec.startTime)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Shows recent executions with status icon (✓/✗/●)
- [ ] Displays automation name, sent count, excluded count
- [ ] Shows error message for failed executions
- [ ] Smart time formatting (time only for today, date + time otherwise)
- [ ] Links to automation detail page
- [ ] Empty state when no recent activity

---

## Phase 3: Pages

### Task 3.1: Create Dashboard Page

**Description**: Build main dashboard page with stats, upcoming executions, and recent activity
**Size**: Large
**Priority**: High
**Dependencies**: Task 1.2 (StatsCard), Task 1.3 (HeaderNav), Task 2.3 (UpcomingExecutions), Task 2.4 (RecentActivity)
**Can run parallel with**: Task 3.2, Task 3.3

**File to create**: `src/app/page.tsx` (NEW - replaces old monolith)

**Data Requirements**:
```typescript
// Fetch from /api/automation/recipes
const automations: UniversalAutomation[] = await fetchAutomations();

// Compute stats
const stats = {
  live: automations.filter(a => a.status === 'running').length,
  scheduled: automations.filter(a => a.status === 'active' && a.isActive).length,
  paused: automations.filter(a => a.status === 'paused').length,
};

// Fetch from /api/automation/monitor?type=executions for recent activity
const recentExecutions = await fetchRecentExecutions(10);
```

**UI States**:
```typescript
// Loading state: Show 3 skeleton StatsCards + skeleton list items
// Error state: Show error banner with "Failed to load automations" + retry button
// Empty state: Show "No automations yet" message with "+ Create Your First Automation" CTA
```

**Implementation**:
```typescript
import { HeaderNav } from '@/app/components/nav/HeaderNav';
import { StatsCard } from '@/app/components/dashboard/StatsCard';
import { UpcomingExecutions } from '@/app/components/dashboard/UpcomingExecutions';
import { RecentActivity } from '@/app/components/dashboard/RecentActivity';
import Link from 'next/link';

async function getAutomations() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/automation/recipes`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch automations');
  const data = await res.json();
  return data.data || [];
}

async function getRecentExecutions() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/automation/monitor?type=executions`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.data?.executions?.slice(0, 10) || [];
}

export default async function DashboardPage() {
  const [automations, recentExecutions] = await Promise.all([
    getAutomations(),
    getRecentExecutions(),
  ]);

  const stats = {
    live: automations.filter((a: any) => a.status === 'running').length,
    scheduled: automations.filter((a: any) => a.status === 'active' && a.isActive).length,
    paused: automations.filter((a: any) => a.status === 'paused').length,
  };

  const isEmpty = automations.length === 0;

  return (
    <>
      <HeaderNav breadcrumbs={[{ label: 'Push Automation Center' }]} />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {isEmpty ? (
          <div className="text-center py-16">
            <h2 className="text-2xl font-semibold text-slate-800 mb-2">No automations yet</h2>
            <p className="text-slate-500 mb-6">Create your first automation to get started</p>
            <Link
              href="/create-automation"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              + Create Your First Automation
            </Link>
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-6 mb-8">
              <StatsCard
                label="Live Automations"
                count={stats.live}
                status="live"
                subtitle="Running now"
              />
              <StatsCard
                label="Scheduled"
                count={stats.scheduled}
                status="scheduled"
              />
              <StatsCard
                label="Paused"
                count={stats.paused}
                status="paused"
              />
            </div>

            <div className="grid grid-cols-2 gap-8">
              {/* Upcoming Executions */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-800">Upcoming Executions</h2>
                  <Link href="/automations" className="text-sm text-blue-600 hover:text-blue-700">
                    View All →
                  </Link>
                </div>
                <UpcomingExecutions automations={automations} />
              </div>

              {/* Recent Activity */}
              <div className="bg-white rounded-xl border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-slate-800">Recent Activity</h2>
                  <Link href="/automations" className="text-sm text-blue-600 hover:text-blue-700">
                    View Logs →
                  </Link>
                </div>
                <RecentActivity executions={recentExecutions} />
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}
```

**Acceptance Criteria**:
- [ ] Fetches automations from /api/automation/recipes
- [ ] Fetches recent executions from /api/automation/monitor?type=executions
- [ ] Displays 3 stats cards (Live, Scheduled, Paused)
- [ ] Shows upcoming executions sorted by next run time
- [ ] Shows recent activity with metrics
- [ ] Empty state with CTA when no automations
- [ ] "View All" links to /automations
- [ ] Server component for initial data fetch

---

### Task 3.2: Create Automations List Page

**Description**: Build automations list page with filtering and action buttons
**Size**: Large
**Priority**: High
**Dependencies**: Task 1.3 (HeaderNav), Task 2.1 (AutomationCard)
**Can run parallel with**: Task 3.1, Task 3.3

**File to create**: `src/app/automations/page.tsx`

**Implementation**:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { HeaderNav } from '@/app/components/nav/HeaderNav';
import { AutomationCard } from '@/app/components/automations/AutomationCard';
import { AutomationFilters } from '@/app/components/automations/AutomationFilters';
import Link from 'next/link';

export default function AutomationsListPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [automations, setAutomations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const statusFilter = searchParams.get('status') || 'all';
  const frequencyFilter = searchParams.get('frequency') || 'all';

  const fetchAutomations = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/automation/recipes?${params}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();

      let filtered = data.data || [];
      if (frequencyFilter !== 'all') {
        filtered = filtered.filter((a: any) => a.schedule.frequency === frequencyFilter);
      }

      setAutomations(filtered);
    } catch (e) {
      setError('Failed to load automations');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAutomations();
  }, [statusFilter, frequencyFilter]);

  const handlePause = async (id: string) => {
    await fetch('/api/automation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause', automationId: id }),
    });
    fetchAutomations();
  };

  const handleResume = async (id: string) => {
    await fetch('/api/automation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume', automationId: id }),
    });
    fetchAutomations();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/automation/recipes/${id}`, { method: 'DELETE' });
    fetchAutomations();
  };

  const isEmpty = !isLoading && automations.length === 0;
  const noResults = isEmpty && (statusFilter !== 'all' || frequencyFilter !== 'all');

  return (
    <>
      <HeaderNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Automations' },
        ]}
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <AutomationFilters
          status={statusFilter}
          frequency={frequencyFilter}
          onStatusChange={(s) => {
            const params = new URLSearchParams(searchParams);
            if (s === 'all') params.delete('status');
            else params.set('status', s);
            router.push(`/automations?${params}`);
          }}
          onFrequencyChange={(f) => {
            const params = new URLSearchParams(searchParams);
            if (f === 'all') params.delete('frequency');
            else params.set('frequency', f);
            router.push(`/automations?${params}`);
          }}
        />

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800">{error}</p>
            <button onClick={fetchAutomations} className="text-red-600 underline mt-2">
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-slate-100 rounded-xl h-40 animate-pulse" />
            ))}
          </div>
        ) : noResults ? (
          <div className="text-center py-16">
            <p className="text-slate-500 mb-4">No automations match your filters</p>
            <button
              onClick={() => router.push('/automations')}
              className="text-blue-600 hover:text-blue-700"
            >
              Clear filters
            </button>
          </div>
        ) : isEmpty ? (
          <div className="text-center py-16">
            <h2 className="text-2xl font-semibold text-slate-800 mb-2">No automations yet</h2>
            <p className="text-slate-500 mb-6">Create your first automation to get started</p>
            <Link
              href="/create-automation"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
            >
              + Create Your First Automation
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {automations.map((automation) => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                onPause={handlePause}
                onResume={handleResume}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
```

**Also create AutomationFilters component**:
```typescript
// src/app/components/automations/AutomationFilters.tsx
'use client';

interface AutomationFiltersProps {
  status: string;
  frequency: string;
  onStatusChange: (status: string) => void;
  onFrequencyChange: (frequency: string) => void;
}

export function AutomationFilters({
  status,
  frequency,
  onStatusChange,
  onFrequencyChange,
}: AutomationFiltersProps) {
  return (
    <div className="flex items-center space-x-4 mb-6">
      <select
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
      >
        <option value="all">All Status</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
        <option value="draft">Draft</option>
      </select>

      <select
        value={frequency}
        onChange={(e) => onFrequencyChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-3 py-2 text-sm"
      >
        <option value="all">All Frequencies</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="once">One-time</option>
      </select>
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Fetches automations with filter support
- [ ] Status and frequency filter dropdowns work
- [ ] URL query params update on filter change
- [ ] Pause/Resume/Delete actions work and refresh list
- [ ] Loading state shows skeleton cards
- [ ] Error state with retry button
- [ ] Empty state (no automations) with CTA
- [ ] No results state with clear filters button

---

### Task 3.3: Create Automation Detail Page

**Description**: Build automation detail page with config panels, execution history, and Run Now
**Size**: Large
**Priority**: High
**Dependencies**: Task 1.3 (HeaderNav), Task 2.2 (ExecutionLogTable)
**Can run parallel with**: Task 3.1, Task 3.2

**File to create**: `src/app/automations/[id]/page.tsx`

**Implementation**:
```typescript
'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { HeaderNav } from '@/app/components/nav/HeaderNav';
import { StatusBadge } from '@/app/components/automations/StatusBadge';
import { ExecutionLogTable } from '@/app/components/detail/ExecutionLogTable';
import Link from 'next/link';

export default function AutomationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [automation, setAutomation] = useState<any>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [autoRes, logsRes] = await Promise.all([
        fetch(`/api/automation/recipes/${params.id}`),
        fetch(`/api/automation/monitor?type=executions`),
      ]);

      if (!autoRes.ok) {
        if (autoRes.status === 404) {
          setError('Automation not found');
          return;
        }
        throw new Error('Failed to fetch');
      }

      const autoData = await autoRes.json();
      setAutomation(autoData.data);

      if (logsRes.ok) {
        const logsData = await logsRes.json();
        const filtered = (logsData.data?.executions || [])
          .filter((e: any) => e.automationId === params.id);
        setLogs(filtered);
      }
    } catch (e) {
      setError('Failed to load automation');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const handleRunNow = async () => {
    if (!confirm(`Run "${automation.name}" now? This will execute immediately.`)) return;

    setIsRunning(true);
    try {
      const res = await fetch('/api/automation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'execute_now', automationId: params.id }),
      });

      if (!res.ok) throw new Error('Failed to start execution');

      // Refresh data after short delay
      setTimeout(fetchData, 2000);
    } catch (e) {
      alert('Failed to start execution');
    } finally {
      setIsRunning(false);
    }
  };

  const handlePause = async () => {
    await fetch('/api/automation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause', automationId: params.id }),
    });
    fetchData();
  };

  const handleResume = async () => {
    await fetch('/api/automation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume', automationId: params.id }),
    });
    fetchData();
  };

  if (error === 'Automation not found') {
    return (
      <>
        <HeaderNav breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Not Found' }]} />
        <main className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold text-slate-800 mb-2">Automation not found</h1>
          <p className="text-slate-500 mb-6">The automation you're looking for doesn't exist.</p>
          <Link href="/automations" className="text-blue-600 hover:text-blue-700">
            ← Back to Automations
          </Link>
        </main>
      </>
    );
  }

  if (isLoading || !automation) {
    return (
      <>
        <HeaderNav breadcrumbs={[{ label: 'Dashboard', href: '/' }, { label: 'Loading...' }]} />
        <main className="max-w-6xl mx-auto px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-32 bg-slate-100 rounded-xl" />
            <div className="h-48 bg-slate-100 rounded-xl" />
            <div className="h-64 bg-slate-100 rounded-xl" />
          </div>
        </main>
      </>
    );
  }

  const isPaused = automation.status === 'paused';
  const isExecuting = automation.status === 'running';

  return (
    <>
      <HeaderNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Automations', href: '/automations' },
          { label: automation.name },
        ]}
        showCreateButton={false}
      />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Header Actions */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-slate-800">{automation.name}</h1>
            <StatusBadge status={automation.status} />
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRunNow}
              disabled={isRunning || isExecuting}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {isRunning ? 'Starting...' : 'Run Now'}
            </button>
            <Link
              href={`/edit-automation/${params.id}`}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg text-sm font-medium"
            >
              Edit
            </Link>
            {isPaused ? (
              <button
                onClick={handleResume}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Resume
              </button>
            ) : (
              <button
                onClick={handlePause}
                disabled={isExecuting}
                className="bg-yellow-500 hover:bg-yellow-600 disabled:bg-yellow-300 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Pause
              </button>
            )}
          </div>
        </div>

        {/* Overview & Schedule Panels */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Overview</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-slate-500">Status</dt>
                <dd className="font-medium text-slate-800 capitalize">{automation.status}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Created</dt>
                <dd className="font-medium text-slate-800">
                  {new Date(automation.createdAt).toLocaleDateString()}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Type</dt>
                <dd className="font-medium text-slate-800 capitalize">
                  {automation.type.replace('_', ' ')}
                </dd>
              </div>
              {automation.audienceCriteria?.customScript?.scriptName && (
                <div className="flex justify-between">
                  <dt className="text-slate-500">Script</dt>
                  <dd className="font-medium text-slate-800">
                    {automation.audienceCriteria.customScript.scriptName}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="font-semibold text-slate-800 mb-4">Schedule</h2>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-slate-500">Frequency</dt>
                <dd className="font-medium text-slate-800 capitalize">{automation.schedule.frequency}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Time</dt>
                <dd className="font-medium text-slate-800">
                  {automation.schedule.executionTime} {automation.schedule.timezone?.split('/')[1] || 'CT'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Next Run</dt>
                <dd className="font-medium text-slate-800">
                  {isPaused ? '--' : automation.metadata.nextExecutionAt
                    ? new Date(automation.metadata.nextExecutionAt).toLocaleString()
                    : '--'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Lead Time</dt>
                <dd className="font-medium text-slate-800">{automation.schedule.leadTimeMinutes} min</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Push Sequences */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
          <h2 className="font-semibold text-slate-800 mb-4">
            Push Sequences ({automation.pushSequence.length})
          </h2>
          <div className="space-y-3">
            {automation.pushSequence.map((push: any, index: number) => (
              <div key={push.id || index} className="flex items-start space-x-4 p-3 bg-slate-50 rounded-lg">
                <span className="text-sm font-medium text-slate-400">#{index + 1}</span>
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{push.audienceName || push.title}</p>
                  <p className="text-sm text-slate-500">"{push.title}"</p>
                  <p className="text-sm text-slate-400">{push.body}</p>
                </div>
                <span className="text-sm text-slate-400">Layer {push.layerId}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Execution History */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-800 mb-4">Execution History</h2>
          <ExecutionLogTable
            automationId={params.id as string}
            logs={logs}
            onLoadMore={() => {}}
            hasMore={false}
          />
        </div>
      </main>
    </>
  );
}
```

**Acceptance Criteria**:
- [ ] Fetches automation by ID from /api/automation/recipes/[id]
- [ ] Fetches execution logs filtered by automationId
- [ ] Displays Overview panel (status, created, type, script)
- [ ] Displays Schedule panel (frequency, time, next run, lead time)
- [ ] Displays Push Sequences list with title, body, layer
- [ ] Displays Execution History table
- [ ] "Run Now" button with confirmation dialog
- [ ] "Run Now" calls POST /api/automation/control with execute_now action
- [ ] "Run Now" disabled while running
- [ ] Edit link to /edit-automation/[id]
- [ ] Pause/Resume buttons work
- [ ] 404 page when automation not found
- [ ] Loading skeleton state

---

## Phase 4: Integration

### Task 4.1: Run Now API Support

**Description**: Ensure /api/automation/control supports execute_now action
**Size**: Small
**Priority**: High
**Dependencies**: Task 3.3
**Can run parallel with**: Task 4.2

**Check existing API**: `/api/automation/control` should already support `execute_now` action. Verify and add if missing.

**Expected behavior**:
```typescript
// POST /api/automation/control
// Body: { action: 'execute_now', automationId: string }
// Response: { success: boolean, message: string }

// Action should:
// 1. Find automation by ID
// 2. Trigger immediate execution via automationEngine.executeAutomation()
// 3. Return success/failure
```

**Acceptance Criteria**:
- [ ] POST with { action: 'execute_now', automationId } triggers immediate execution
- [ ] Returns error if automation not found
- [ ] Returns error if automation already running
- [ ] Returns success on execution start

---

### Task 4.2: Update Layout with HeaderNav

**Description**: Update root layout to support the new navigation pattern
**Size**: Small
**Priority**: High
**Dependencies**: Task 1.3 (HeaderNav)
**Can run parallel with**: Task 4.1

**File to update**: `src/app/layout.tsx`

**Note**: HeaderNav is rendered per-page since breadcrumbs vary. Layout just needs to ensure proper structure.

```typescript
import './globals.css';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50">
        {children}
      </body>
    </html>
  );
}
```

**Acceptance Criteria**:
- [ ] Layout provides consistent background color
- [ ] No conflicting header elements
- [ ] globals.css imported

---

### Task 4.3: Delete Old page.tsx and Update Navigation

**Description**: Remove old monolithic page.tsx and update existing page navigation
**Size**: Small
**Priority**: High
**Dependencies**: Task 3.1, Task 3.2, Task 3.3

**Steps**:
1. Backup old `src/app/page.tsx` to `src/app/page.old.tsx.bak` (temporary)
2. Verify new dashboard works at `/`
3. Update `/create-automation/page.tsx` navigation links
4. Update `/edit-automation/[id]/page.tsx` navigation links
5. Delete backup after verification

**Files to check for navigation updates**:
- `/create-automation/page.tsx` - Ensure back links go to `/` or `/automations`
- `/edit-automation/[id]/page.tsx` - Ensure back links go to `/automations/[id]`

**Acceptance Criteria**:
- [ ] Old page.tsx is deleted (or backed up)
- [ ] New dashboard renders at `/`
- [ ] Create automation page back links work
- [ ] Edit automation page back links work
- [ ] No broken navigation

---

## Summary

| Phase | Tasks | Can Parallel |
|-------|-------|--------------|
| 1: Foundation | 1.1, 1.2, 1.3 | All 3 can run in parallel |
| 2: Core Components | 2.1, 2.2, 2.3, 2.4 | All 4 can run in parallel |
| 3: Pages | 3.1, 3.2, 3.3 | All 3 can run in parallel |
| 4: Integration | 4.1, 4.2, 4.3 | 4.1 and 4.2 can run in parallel |

**Total Tasks**: 12
**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 4
**Estimated Parallel Execution Groups**: 4

**Execution Order Recommendation**:
1. Run Phase 1 tasks in parallel (3 tasks)
2. Run Phase 2 tasks in parallel (4 tasks)
3. Run Phase 3 tasks in parallel (3 tasks)
4. Run Phase 4 tasks (2 parallel + 1 sequential)
