# Task Breakdown: Automation UI Phase 2 & 3 Enhancements

Generated: 2025-11-25
Source: specs/feat-automation-ui-phase2-3.md

## Overview

This breakdown covers 10 implementation tasks across 3 phases:
- **Phase 2A**: Foundation (4 tasks) - Cadence service, History API, Drill-down page, Cadence breakdown UI
- **Phase 2B**: Export & Polish (3 tasks) - CSV export, Toast notifications, Auto-refresh
- **Phase 3**: Power User Features (3 tasks) - Keyboard shortcuts, Help modal, List navigation

**Total Estimated Effort:** 4-6 days

---

## Phase 2A: Foundation

### Task 2A.1: Update Cadence Service to Return Exclusion Breakdown

**Description**: Modify `filterUsersByCadence` in push-cadence-service to return detailed exclusion breakdown by reason
**Size**: Medium
**Priority**: High (blocking for Task 2A.4)
**Dependencies**: None
**Can run parallel with**: Task 2A.2

**Technical Requirements**:
- Update return type from `{ eligibleUserIds, excludedCount }` to include `exclusionBreakdown`
- Track counts per exclusion reason: l3Cooldown, l2l3WeeklyLimit, l5Cooldown, invalidUuid
- Update API route response to include breakdown

**Files to Modify**:
1. `services/push-cadence-service/src/lib/cadence.ts`
2. `services/push-cadence-service/src/app/api/filter-audience/route.ts`

**Implementation - cadence.ts**:
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

export const filterUsersByCadence = async (
  userIds: string[],
  layerId: number
): Promise<FilterResult> => {
  console.log(`[CADENCE] Starting cadence filtering for ${userIds.length} users, layerId: ${layerId}`);

  if (layerId === 1) {
    console.log(`[CADENCE] Layer 1 detected - bypassing cadence rules`);
    return {
      eligibleUserIds: userIds,
      excludedCount: 0,
      exclusionBreakdown: { l3Cooldown: 0, l2l3WeeklyLimit: 0, l5Cooldown: 0, invalidUuid: 0 }
    };
  }

  // Validate and filter UUIDs
  const validUserIds = userIds.filter(id => isValidUUID(id));

  const exclusionBreakdown = {
    l3Cooldown: 0,
    l2l3WeeklyLimit: 0,
    l5Cooldown: 0,
    invalidUuid: userIds.length - validUserIds.length,
  };

  // ... existing rule logic, but capture counts:

  // Rule 1: Layer 5 Cooldown
  if (layerId === 5) {
    const result = await getPool().query(/* existing query */);
    result.rows.forEach(row => excludedUserIds.add(row.user_id));
    exclusionBreakdown.l5Cooldown = result.rows.length;
    console.log(`[CADENCE] Layer 5 cooldown: excluded ${result.rows.length} users`);
  }

  // Rule 2: Layer 3 Cooldown
  if (layerId === 3) {
    const result = await getPool().query(/* existing query */);
    result.rows.forEach(row => excludedUserIds.add(row.user_id));
    exclusionBreakdown.l3Cooldown = result.rows.length;
    console.log(`[CADENCE] Layer 3 cooldown: excluded ${result.rows.length} users`);
  }

  // Rule 3: Combined L2/L3 Limit
  const usersToCheckForCombinedLimit = validUserIds.filter(id => !excludedUserIds.has(id));
  if (usersToCheckForCombinedLimit.length > 0) {
    const result = await getPool().query(/* existing query */);
    result.rows.forEach(row => excludedUserIds.add(row.user_id));
    exclusionBreakdown.l2l3WeeklyLimit = result.rows.length;
    console.log(`[CADENCE] Combined L2/L3 limit: excluded ${result.rows.length} users`);
  }

  const eligibleUserIds = validUserIds.filter(id => !excludedUserIds.has(id));

  return {
    eligibleUserIds,
    excludedCount: excludedUserIds.size,
    exclusionBreakdown,
  };
};
```

**Implementation - route.ts**:
```typescript
const { eligibleUserIds, excludedCount, exclusionBreakdown } =
  await filterUsersByCadence(userIds, layerId);

return NextResponse.json({ eligibleUserIds, excludedCount, exclusionBreakdown });
```

**Acceptance Criteria**:
- [ ] Return type includes `exclusionBreakdown` object
- [ ] Each rule tracks its exclusion count separately
- [ ] API response includes breakdown in JSON
- [ ] Existing functionality unchanged (same filtering logic)
- [ ] Console logs show per-rule exclusion counts
- [ ] Layer 1 returns zero for all breakdown fields

---

### Task 2A.2: Create History API Endpoint with Pagination

**Description**: Build `/api/automation/[id]/history` route with pagination, filtering, and sorting
**Size**: Medium
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 2A.1

**Technical Requirements**:
- Query params: page, limit, status, startDate, endDate, sortBy, sortOrder
- Default pagination: page=1, limit=20, max=100
- Sort by date descending by default
- Return ExecutionSummary objects (not full logs)

**File**: `src/app/api/automation/[id]/history/route.ts`

**Implementation**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { automationLogger } from '@/lib/automationLogger';
import { ExecutionLog, ExecutionStatus } from '@/lib/automationLogger';

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

function toSummary(log: ExecutionLog): ExecutionSummary {
  return {
    executionId: log.executionId,
    startTime: log.startTime,
    status: log.status,
    duration: log.metrics.totalDuration,
    metrics: {
      totalSentCount: log.metrics.totalSentCount,
      totalAudienceSize: log.metrics.totalAudienceSize,
      failedPushes: log.metrics.failedPushes,
    },
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20')), 100);
    const status = searchParams.get('status') as ExecutionStatus | null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const sortBy = searchParams.get('sortBy') || 'date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Load all execution logs for this automation
    const allLogs = await automationLogger.loadExecutionHistory(id);

    // Apply filters
    let filtered = allLogs;
    if (status) {
      filtered = filtered.filter(log => log.status === status);
    }
    if (startDate) {
      const start = new Date(startDate);
      filtered = filtered.filter(log => new Date(log.startTime) >= start);
    }
    if (endDate) {
      const end = new Date(endDate);
      filtered = filtered.filter(log => new Date(log.startTime) <= end);
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'duration':
          comparison = a.metrics.totalDuration - b.metrics.totalDuration;
          break;
        case 'sent':
          comparison = a.metrics.totalSentCount - b.metrics.totalSentCount;
          break;
        case 'date':
        default:
          comparison = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

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
  } catch (error) {
    console.error('History API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load execution history' },
      { status: 500 }
    );
  }
}
```

**Acceptance Criteria**:
- [ ] GET `/api/automation/[id]/history` returns paginated results
- [ ] Default page=1, limit=20
- [ ] Max limit capped at 100
- [ ] Status filter works (completed, failed, running, cancelled)
- [ ] Date range filters work with ISO strings
- [ ] Sort by date (default), duration, or sent count
- [ ] Pagination metadata includes page, limit, total, totalPages, hasNext, hasPrev
- [ ] Returns 500 on error with success: false

---

### Task 2A.3: Build Execution Drill-Down Page

**Description**: Create `/automations/[id]/executions/[execId]` page with phase breakdown, summary stats, and push results
**Size**: Large
**Priority**: High
**Dependencies**: Task 2A.2 (History API)
**Can run parallel with**: None (depends on 2A.2)

**Technical Requirements**:
- Server component fetches automation + execution data in parallel
- Client component for interactive phase expansion
- Display: summary stats, expandable phases, push results table
- Back navigation to automation detail page

**Files to Create**:
1. `src/app/automations/[id]/executions/[execId]/page.tsx`
2. `src/app/components/detail/ExecutionDrilldown.tsx`
3. `src/app/components/detail/PhaseBreakdown.tsx`

**Implementation - page.tsx (Server Component)**:
```typescript
import { automationStorage } from '@/lib/automationStorage';
import { automationLogger } from '@/lib/automationLogger';
import { ExecutionDrilldown } from '@/app/components/detail/ExecutionDrilldown';
import { notFound } from 'next/navigation';

export default async function ExecutionDrilldownPage({
  params
}: {
  params: Promise<{ id: string; execId: string }>;
}) {
  const { id, execId } = await params;

  // Parallel fetch
  const [automation, executionHistory] = await Promise.all([
    automationStorage.getAutomation(id),
    automationLogger.loadExecutionHistory(id),
  ]);

  if (!automation) {
    notFound();
  }

  const execution = executionHistory.find(e => e.executionId === execId);
  if (!execution) {
    notFound();
  }

  return (
    <ExecutionDrilldown
      execution={execution}
      automation={automation}
    />
  );
}
```

**Implementation - ExecutionDrilldown.tsx**:
```typescript
'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ExecutionLog } from '@/lib/automationLogger';
import { UniversalAutomation } from '@/types/automation';
import { PhaseBreakdown } from './PhaseBreakdown';

interface ExecutionDrilldownProps {
  execution: ExecutionLog;
  automation: UniversalAutomation;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function ExecutionDrilldown({ execution, automation }: ExecutionDrilldownProps) {
  const excluded = execution.metrics.totalAudienceSize -
                   execution.metrics.totalSentCount -
                   execution.metrics.failedPushes;

  const statusIcon = execution.status === 'completed' ? '✓' :
                     execution.status === 'failed' ? '✗' : '●';
  const statusColor = execution.status === 'completed' ? 'text-green-600' :
                      execution.status === 'failed' ? 'text-red-600' : 'text-yellow-600';

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with back link */}
      <div className="mb-6">
        <Link
          href={`/automations/${automation.id}`}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
        >
          ← Back to {automation.name}
        </Link>
      </div>

      {/* Execution title */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">
          EXECUTION: {formatDateTime(execution.startTime)}
        </h1>
        <span className={`${statusColor} font-medium`}>
          {statusIcon} {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
          ({formatDuration(execution.metrics.totalDuration)})
        </span>
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">SUMMARY</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {execution.metrics.totalSentCount.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Sent</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {excluded.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Excluded</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {execution.metrics.failedPushes.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {formatDuration(execution.metrics.totalDuration)}
            </div>
            <div className="text-sm text-gray-600">Duration</div>
          </div>
        </div>
      </div>

      {/* Execution Phases */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">EXECUTION PHASES</h2>
        <PhaseBreakdown phases={execution.phaseLogs || []} />
      </div>

      {/* Push Results */}
      {execution.pushLogs && execution.pushLogs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            PUSH RESULTS ({execution.pushLogs.length} sequences)
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seq #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sent</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Failed</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {execution.pushLogs.map((push, index) => (
                  <tr key={index}>
                    <td className="px-4 py-3 text-sm text-gray-900">{push.sequenceOrder}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate">{push.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{push.sentCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">{push.failedCount}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 text-right">
                      {push.avgSendTime ? `${push.avgSendTime.toFixed(1)}ms` : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
```

**Implementation - PhaseBreakdown.tsx**:
```typescript
'use client';

import React, { useState } from 'react';
import { PhaseLog } from '@/lib/automationLogger';

interface PhaseBreakdownProps {
  phases: PhaseLog[];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const phaseLabels: Record<string, string> = {
  audience_generation: 'Audience Generation',
  cadence_filtering: 'Cadence Filtering',
  test_sending: 'Test Sending',
  live_execution: 'Live Execution',
  cancellation_window: 'Cancellation Window',
};

export function PhaseBreakdown({ phases }: PhaseBreakdownProps) {
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(new Set());

  const togglePhase = (phase: string) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  };

  if (phases.length === 0) {
    return <p className="text-gray-500">No phase data available</p>;
  }

  return (
    <div className="space-y-2">
      {phases.map((phase, index) => {
        const isExpanded = expandedPhases.has(phase.phase);
        const statusIcon = phase.status === 'completed' ? '✓' :
                          phase.status === 'failed' ? '✗' : '●';
        const statusColor = phase.status === 'completed' ? 'text-green-600' :
                           phase.status === 'failed' ? 'text-red-600' : 'text-yellow-600';

        return (
          <div key={phase.phase} className="border border-gray-200 rounded-lg">
            <button
              onClick={() => togglePhase(phase.phase)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-gray-400">{isExpanded ? '▼' : '►'}</span>
                <span className="font-medium">
                  Phase {index + 1}: {phaseLabels[phase.phase] || phase.phase}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className={statusColor}>{statusIcon}</span>
                <span className="text-gray-600">{formatDuration(phase.duration)}</span>
              </div>
            </button>

            {isExpanded && phase.details && (
              <div className="px-4 pb-4 pt-0 border-t border-gray-100">
                <div className="pl-8 space-y-1 text-sm text-gray-600">
                  {Object.entries(phase.details).map(([key, value]) => (
                    <div key={key}>
                      └─ {key}: {typeof value === 'number' ? value.toLocaleString() : String(value)}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Route `/automations/[id]/executions/[execId]` renders drill-down page
- [ ] Shows back link to automation detail page
- [ ] Summary stats show Sent, Excluded, Failed, Duration
- [ ] Phases are expandable with click
- [ ] Phase details show when expanded
- [ ] Push results table shows all sequences
- [ ] 404 page for invalid automation or execution ID
- [ ] Numbers formatted with locale separators

---

### Task 2A.4: Create Cadence Breakdown UI Component

**Description**: Build `CadenceBreakdown.tsx` component showing exclusion reasons with visual progress bars
**Size**: Small
**Priority**: High
**Dependencies**: Task 2A.1 (Cadence service returns breakdown)
**Can run parallel with**: Task 2A.3

**Technical Requirements**:
- Display breakdown by reason with colored progress bars
- Show count and percentage for each reason
- Filter out reasons with zero count
- Integrate into ExecutionDrilldown page

**File**: `src/app/components/detail/CadenceBreakdown.tsx`

**Implementation**:
```typescript
'use client';

import React from 'react';

interface ExclusionBreakdown {
  l3Cooldown: number;
  l2l3WeeklyLimit: number;
  l5Cooldown: number;
  invalidUuid: number;
}

interface CadenceBreakdownProps {
  breakdown: ExclusionBreakdown;
  totalExcluded: number;
}

export function CadenceBreakdown({ breakdown, totalExcluded }: CadenceBreakdownProps) {
  if (totalExcluded === 0) {
    return (
      <p className="text-gray-500 text-sm">No users were excluded by cadence rules</p>
    );
  }

  const reasons = [
    { label: 'L3 72-hour Cooldown', count: breakdown.l3Cooldown, color: 'bg-blue-500' },
    { label: 'L2/L3 Weekly Limit (3/week)', count: breakdown.l2l3WeeklyLimit, color: 'bg-purple-500' },
    { label: 'L5 96-hour Cooldown', count: breakdown.l5Cooldown, color: 'bg-orange-500' },
    { label: 'Invalid UUID', count: breakdown.invalidUuid, color: 'bg-gray-500' },
  ].filter(r => r.count > 0);

  // Calculate "other" as difference
  const accounted = reasons.reduce((sum, r) => sum + r.count, 0);
  const other = totalExcluded - accounted;
  if (other > 0) {
    reasons.push({ label: 'Other', count: other, color: 'bg-gray-400' });
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-gray-600 mb-2">
        {totalExcluded.toLocaleString()} users excluded
      </div>
      {reasons.map(reason => {
        const percentage = (reason.count / totalExcluded) * 100;
        return (
          <div key={reason.label} className="flex items-center gap-3">
            <div className="w-44 text-sm text-gray-600 truncate">{reason.label}</div>
            <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
              <div
                className={`h-full ${reason.color} transition-all duration-300`}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <div className="w-28 text-sm text-gray-900 text-right">
              {reason.count.toLocaleString()} ({percentage.toFixed(1)}%)
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Integration into ExecutionDrilldown.tsx**:
```typescript
// Add import
import { CadenceBreakdown } from './CadenceBreakdown';

// Add section after Execution Phases
{execution.exclusionBreakdown && (
  <div className="bg-white rounded-lg shadow p-6 mb-6">
    <h2 className="text-lg font-semibold text-gray-900 mb-4">
      CADENCE EXCLUSIONS
    </h2>
    <CadenceBreakdown
      breakdown={execution.exclusionBreakdown}
      totalExcluded={excluded}
    />
  </div>
)}
```

**Acceptance Criteria**:
- [ ] Shows "No users excluded" when totalExcluded is 0
- [ ] Displays progress bar for each non-zero reason
- [ ] Colors match spec (blue, purple, orange, gray)
- [ ] Percentages calculated correctly
- [ ] Numbers use locale formatting
- [ ] "Other" category shown when breakdown doesn't sum to total
- [ ] Integrated into drill-down page

---

## Phase 2B: Export & Polish

### Task 2B.1: Implement CSV Export

**Description**: Create CSV exporter utility and export API endpoint for execution data
**Size**: Medium
**Priority**: Medium
**Dependencies**: Task 2A.3 (Drill-down page exists)
**Can run parallel with**: Task 2B.2

**Technical Requirements**:
- Use PapaParse (already installed) for CSV generation
- Export endpoint at `/api/automation/[id]/executions/[execId]/export`
- Support summary, phases, pushes, or all
- Escape CSV injection characters (=, +, -, @)
- Trigger download via blob URL

**Files to Create**:
1. `src/lib/csvExporter.ts`
2. `src/app/api/automation/[id]/executions/[execId]/export/route.ts`

**Implementation - csvExporter.ts**:
```typescript
import Papa from 'papaparse';
import { ExecutionLog } from './automationLogger';

// Escape CSV injection characters
function escapeValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Prefix with single quote if starts with formula character
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function exportExecutionToCsv(
  execution: ExecutionLog,
  include: 'summary' | 'phases' | 'pushes' | 'all' = 'all'
): string {
  const sections: string[] = [];

  if (include === 'summary' || include === 'all') {
    const excluded = execution.metrics.totalAudienceSize -
                     execution.metrics.totalSentCount -
                     execution.metrics.failedPushes;
    sections.push(Papa.unparse([{
      'Execution ID': escapeValue(execution.executionId),
      'Automation': escapeValue(execution.automationName),
      'Date': execution.startTime,
      'Status': execution.status,
      'Duration (s)': Math.round(execution.metrics.totalDuration / 1000),
      'Sent': execution.metrics.totalSentCount,
      'Excluded': excluded,
      'Failed': execution.metrics.failedPushes,
      'Audience Size': execution.metrics.totalAudienceSize,
    }]));
  }

  if ((include === 'phases' || include === 'all') && execution.phaseLogs) {
    const phaseRows = execution.phaseLogs.map((phase, index) => ({
      'Phase #': index + 1,
      'Phase': phase.phase,
      'Status': phase.status,
      'Duration (ms)': phase.duration,
      'Start Time': phase.startTime,
    }));
    if (phaseRows.length > 0) {
      if (sections.length > 0) sections.push(''); // Empty line separator
      sections.push('PHASES');
      sections.push(Papa.unparse(phaseRows));
    }
  }

  if ((include === 'pushes' || include === 'all') && execution.pushLogs) {
    const pushRows = execution.pushLogs.map(push => ({
      'Sequence': push.sequenceOrder,
      'Title': escapeValue(push.title),
      'Layer': push.layerId,
      'Sent': push.sentCount,
      'Failed': push.failedCount,
      'Avg Time (ms)': push.avgSendTime?.toFixed(1) || 'N/A',
    }));
    if (pushRows.length > 0) {
      if (sections.length > 0) sections.push(''); // Empty line separator
      sections.push('PUSH RESULTS');
      sections.push(Papa.unparse(pushRows));
    }
  }

  return sections.join('\n');
}

export function getExportFilename(execution: ExecutionLog): string {
  const date = new Date(execution.startTime).toISOString().split('T')[0];
  const safeName = execution.automationName.replace(/[^a-zA-Z0-9]/g, '_');
  return `${safeName}_${date}_${execution.executionId.slice(0, 8)}.csv`;
}
```

**Implementation - export/route.ts**:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { automationLogger } from '@/lib/automationLogger';
import { exportExecutionToCsv, getExportFilename } from '@/lib/csvExporter';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; execId: string }> }
) {
  try {
    const { id, execId } = await params;
    const { searchParams } = new URL(req.url);

    const include = (searchParams.get('include') || 'all') as 'summary' | 'phases' | 'pushes' | 'all';

    const history = await automationLogger.loadExecutionHistory(id);
    const execution = history.find(e => e.executionId === execId);

    if (!execution) {
      return NextResponse.json(
        { success: false, message: 'Execution not found' },
        { status: 404 }
      );
    }

    const csv = exportExecutionToCsv(execution, include);
    const filename = getExportFilename(execution);

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { success: false, message: 'Export failed' },
      { status: 500 }
    );
  }
}
```

**UI Integration - Add export button to ExecutionDrilldown.tsx**:
```typescript
const handleExport = async () => {
  const url = `/api/automation/${automation.id}/executions/${execution.executionId}/export`;
  const response = await fetch(url);
  const blob = await response.blob();
  const downloadUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `${automation.name}_${execution.executionId}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
};

// Add button in header
<button
  onClick={handleExport}
  className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
>
  Export CSV
</button>
```

**Acceptance Criteria**:
- [ ] GET `/api/automation/[id]/executions/[execId]/export` returns CSV
- [ ] Content-Type is text/csv
- [ ] Content-Disposition triggers download
- [ ] Filename includes automation name and date
- [ ] CSV injection characters escaped
- [ ] `include` param filters sections (summary, phases, pushes, all)
- [ ] Export button in drill-down triggers download
- [ ] 404 for non-existent execution

---

### Task 2B.2: Install and Configure Toast Notifications

**Description**: Add sonner toast library and replace all alert() calls with toast notifications
**Size**: Small
**Priority**: Medium
**Dependencies**: None
**Can run parallel with**: Task 2B.1

**Technical Requirements**:
- Install sonner package
- Add Toaster to root layout
- Replace 6 existing alert() calls
- Use appropriate toast types (success, error, with action)

**Files to Modify**:
1. `src/app/layout.tsx` - Add Toaster
2. `src/app/automations/page.tsx` - Replace 3 alert() calls
3. `src/app/test-automation/[id]/page.tsx` - Replace 3 alert() calls

**Installation**:
```bash
npm install sonner
```

**Implementation - layout.tsx**:
```typescript
import { Toaster } from 'sonner';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
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

**Implementation - automations/page.tsx replacements**:
```typescript
import { toast } from 'sonner';

// Replace line ~130:
// alert(err instanceof Error ? err.message : 'Failed to pause automation');
toast.error('Failed to pause automation', {
  description: err instanceof Error ? err.message : 'Unknown error',
});

// Replace line ~160:
// alert(err instanceof Error ? err.message : 'Failed to resume automation');
toast.error('Failed to resume automation', {
  description: err instanceof Error ? err.message : 'Unknown error',
});

// Replace line ~184:
// alert(err instanceof Error ? err.message : 'Failed to delete automation');
toast.error('Failed to delete automation', {
  description: err instanceof Error ? err.message : 'Unknown error',
});

// Add success toasts after successful operations:
toast.success('Automation paused');
toast.success('Automation resumed');
toast.success('Automation deleted');
```

**Implementation - test-automation/[id]/page.tsx replacements**:
```typescript
import { toast } from 'sonner';

// Replace line ~327:
// alert('Please select both date and time for scheduling.');
toast.error('Missing schedule', {
  description: 'Please select both date and time for scheduling.',
});

// Replace line ~337:
// alert('Scheduled time must be in the future.');
toast.error('Invalid time', {
  description: 'Scheduled time must be in the future.',
});

// Replace line ~352:
// alert(`Test automation requires at least ${minimumLeadTime} minutes lead time...`);
toast.error('Insufficient lead time', {
  description: `Test automation requires at least ${minimumLeadTime} minutes lead time. Please schedule for ${formattedEarliestTime} CST or later.`,
});
```

**Acceptance Criteria**:
- [ ] sonner installed and added to package.json
- [ ] Toaster component in root layout
- [ ] Position is bottom-right
- [ ] Default duration is 4000ms
- [ ] All 6 alert() calls replaced with toast
- [ ] Error toasts show title + description
- [ ] Success toasts show after successful actions
- [ ] No remaining alert() calls in codebase

---

### Task 2B.3: Add Auto-Refresh After Run Now

**Description**: Implement polling-based refresh to update execution history after "Run Now" execution
**Size**: Small
**Priority**: Low
**Dependencies**: Task 2B.2 (Toast for feedback)
**Can run parallel with**: None

**Technical Requirements**:
- After Run Now API returns, start polling every 5 seconds
- Stop after detecting new execution in history
- Show toast with execution result
- Maximum 12 polls (60 seconds timeout)

**File**: `src/app/automations/[id]/AutomationDetailClient.tsx`

**Implementation**:
```typescript
// Add to handleRunNow function after successful API call:
const handleRunNow = async () => {
  setShowRunDialog(false);
  setIsRunning(true);
  setError(null);
  setSuccessMessage(null);

  try {
    const response = await fetch('/api/automation/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        automationId: automation.id,
        action: 'execute_now',
        reason: 'Manual execution from detail page'
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || 'Failed to execute automation');
    }

    // Start polling for completion
    toast.info('Automation executing...', {
      description: 'Checking for completion...',
      duration: 60000,
      id: 'execution-polling',
    });

    let pollCount = 0;
    const maxPolls = 12;
    const initialExecutionCount = executionHistory.length;

    const pollInterval = setInterval(async () => {
      pollCount++;

      try {
        await refreshExecutionHistory();

        // Check if new execution appeared
        if (executionHistory.length > initialExecutionCount) {
          clearInterval(pollInterval);
          toast.dismiss('execution-polling');

          const latestExecution = executionHistory[0];
          if (latestExecution.status === 'completed') {
            toast.success('Automation executed successfully', {
              description: `Sent ${latestExecution.metrics.totalSentCount.toLocaleString()} pushes`,
            });
          } else if (latestExecution.status === 'failed') {
            toast.error('Execution failed', {
              description: 'Check execution details for more information',
            });
          }

          router.refresh();
        }

        if (pollCount >= maxPolls) {
          clearInterval(pollInterval);
          toast.dismiss('execution-polling');
          toast.info('Execution may still be running', {
            description: 'Refresh the page to check status',
          });
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 5000);

  } catch (err) {
    toast.error('Execution failed', {
      description: err instanceof Error ? err.message : 'Unknown error',
    });
  } finally {
    setIsRunning(false);
  }
};
```

**Acceptance Criteria**:
- [ ] Polling starts after Run Now API returns success
- [ ] Polls every 5 seconds
- [ ] Stops when new execution detected
- [ ] Shows success toast with sent count on completion
- [ ] Shows error toast on failure
- [ ] Stops after 60 seconds (12 polls)
- [ ] Shows info toast on timeout

---

## Phase 3: Power User Features

### Task 3.1: Create Keyboard Shortcuts Hook

**Description**: Build `useKeyboardShortcuts` hook for global keyboard shortcut handling
**Size**: Small
**Priority**: Low
**Dependencies**: None
**Can run parallel with**: Task 3.2

**File**: `src/app/hooks/useKeyboardShortcuts.ts`

**Implementation**:
```typescript
'use client';

import { useEffect, useCallback } from 'react';

export interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  action: () => void;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handler = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      // Only allow Escape in inputs
      if (e.key !== 'Escape') return;
    }

    for (const shortcut of shortcuts) {
      // Check modifier keys
      const metaMatch = shortcut.meta
        ? (e.metaKey || e.ctrlKey) // Support both Cmd (Mac) and Ctrl (Windows)
        : !(e.metaKey || e.ctrlKey);
      const ctrlMatch = shortcut.ctrl ? e.ctrlKey : true;
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();

      if (metaMatch && ctrlMatch && shiftMatch && altMatch && keyMatch) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}

// Utility to get platform-specific modifier key symbol
export function getModifierSymbol(): string {
  if (typeof window === 'undefined') return '⌘';
  return navigator.platform.toLowerCase().includes('mac') ? '⌘' : 'Ctrl';
}
```

**Acceptance Criteria**:
- [ ] Hook accepts array of ShortcutConfig
- [ ] Triggers action on matching shortcut
- [ ] Supports meta (Cmd/Ctrl), ctrl, shift, alt modifiers
- [ ] Ignores shortcuts when typing in inputs (except Escape)
- [ ] Prevents default browser behavior
- [ ] Cleans up listener on unmount
- [ ] getModifierSymbol returns correct symbol for platform

---

### Task 3.2: Create Shortcuts Help Modal

**Description**: Build modal component showing all available keyboard shortcuts
**Size**: Small
**Priority**: Low
**Dependencies**: Task 3.1
**Can run parallel with**: None

**File**: `src/app/components/ui/ShortcutsHelpModal.tsx`

**Implementation**:
```typescript
'use client';

import React from 'react';
import { getModifierSymbol } from '@/app/hooks/useKeyboardShortcuts';

interface ShortcutsHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  keys: string;
  description: string;
}

export function ShortcutsHelpModal({ isOpen, onClose }: ShortcutsHelpModalProps) {
  if (!isOpen) return null;

  const mod = getModifierSymbol();

  const detailPageShortcuts: ShortcutItem[] = [
    { keys: `${mod} + Enter`, description: 'Run automation now' },
    { keys: `${mod} + P`, description: 'Pause / Resume' },
    { keys: `${mod} + E`, description: 'Edit automation' },
  ];

  const globalShortcuts: ShortcutItem[] = [
    { keys: `${mod} + /`, description: 'Show this help' },
    { keys: 'Escape', description: 'Close dialog' },
  ];

  const navigationShortcuts: ShortcutItem[] = [
    { keys: 'J', description: 'Move down' },
    { keys: 'K', description: 'Move up' },
    { keys: 'Enter', description: 'Open selected' },
  ];

  const ShortcutSection = ({ title, items }: { title: string; items: ShortcutItem[] }) => (
    <div className="mb-4">
      <h3 className="text-sm font-medium text-gray-500 mb-2">{title}</h3>
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.keys} className="flex items-center justify-between">
            <kbd className="px-2 py-1 bg-gray-100 rounded text-sm font-mono">
              {item.keys}
            </kbd>
            <span className="text-sm text-gray-600">{item.description}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <ShortcutSection title="Detail Page" items={detailPageShortcuts} />
        <ShortcutSection title="Global" items={globalShortcuts} />
        <ShortcutSection title="List Navigation" items={navigationShortcuts} />

        <div className="mt-6 pt-4 border-t border-gray-200 text-center text-sm text-gray-500">
          Press <kbd className="px-1 bg-gray-100 rounded">Escape</kbd> to close
        </div>
      </div>
    </div>
  );
}
```

**Integration into AutomationDetailClient.tsx**:
```typescript
import { useKeyboardShortcuts } from '@/app/hooks/useKeyboardShortcuts';
import { ShortcutsHelpModal } from '@/app/components/ui/ShortcutsHelpModal';

// In component:
const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

useKeyboardShortcuts([
  { key: 'Enter', meta: true, action: () => setShowRunDialog(true), description: 'Run now' },
  { key: 'p', meta: true, action: () => setShowPauseDialog(true), description: 'Pause/Resume' },
  { key: 'e', meta: true, action: handleEdit, description: 'Edit' },
  { key: '/', meta: true, action: () => setShowShortcutsHelp(true), description: 'Show help' },
  { key: 'Escape', action: () => {
    setShowRunDialog(false);
    setShowPauseDialog(false);
    setShowShortcutsHelp(false);
  }, description: 'Close' },
]);

// In JSX:
<ShortcutsHelpModal
  isOpen={showShortcutsHelp}
  onClose={() => setShowShortcutsHelp(false)}
/>
```

**Acceptance Criteria**:
- [ ] Modal shows all shortcuts organized by section
- [ ] Uses platform-specific modifier symbol
- [ ] Closes on Escape key
- [ ] Closes on backdrop click
- [ ] Opens with Cmd/Ctrl + /
- [ ] Keyboard shortcuts work on detail page

---

### Task 3.3: Implement J/K List Navigation

**Description**: Add vim-style J/K navigation for execution history list
**Size**: Small
**Priority**: Low
**Dependencies**: Task 3.1, Task 2A.3
**Can run parallel with**: None

**Technical Requirements**:
- J moves selection down, K moves up
- Enter opens selected execution
- Visual highlight on selected row
- Works in ExecutionLogTable component

**File**: Modify `src/app/components/detail/ExecutionLogTable.tsx`

**Implementation**:
```typescript
'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useKeyboardShortcuts } from '@/app/hooks/useKeyboardShortcuts';
import { ExecutionLog } from '@/lib/automationLogger';

interface ExecutionLogTableProps {
  automationId: string;
  logs: ExecutionLog[];
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoading?: boolean;
}

export default function ExecutionLogTable({
  automationId,
  logs,
  onLoadMore,
  hasMore,
  isLoading = false
}: ExecutionLogTableProps) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const moveDown = useCallback(() => {
    setSelectedIndex(prev => Math.min(prev + 1, logs.length - 1));
  }, [logs.length]);

  const moveUp = useCallback(() => {
    setSelectedIndex(prev => Math.max(prev - 1, 0));
  }, []);

  const openSelected = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < logs.length) {
      const log = logs[selectedIndex];
      window.location.href = `/automations/${automationId}/executions/${log.executionId}`;
    }
  }, [selectedIndex, logs, automationId]);

  useKeyboardShortcuts([
    { key: 'j', action: moveDown, description: 'Move down' },
    { key: 'k', action: moveUp, description: 'Move up' },
    { key: 'Enter', action: openSelected, description: 'Open selected' },
  ]);

  // ... existing table render code, but add selected styling:

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        {/* ... thead ... */}
        <tbody className="divide-y divide-gray-200">
          {logs.map((log, index) => (
            <tr
              key={log.executionId}
              className={`hover:bg-gray-50 cursor-pointer ${
                index === selectedIndex ? 'bg-blue-50 ring-2 ring-blue-200 ring-inset' : ''
              }`}
              onClick={() => setSelectedIndex(index)}
            >
              {/* ... existing cells ... */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] J key moves selection down
- [ ] K key moves selection up
- [ ] Enter opens selected execution
- [ ] Selected row has visual highlight
- [ ] Click also selects row
- [ ] Selection wraps at boundaries (top/bottom)
- [ ] Works in execution history table

---

## Summary

| Phase | Tasks | Priority | Dependencies |
|-------|-------|----------|--------------|
| 2A.1 | Cadence Service Update | High | None |
| 2A.2 | History API | High | None |
| 2A.3 | Drill-Down Page | High | 2A.2 |
| 2A.4 | Cadence Breakdown UI | High | 2A.1 |
| 2B.1 | CSV Export | Medium | 2A.3 |
| 2B.2 | Toast Notifications | Medium | None |
| 2B.3 | Auto-Refresh | Low | 2B.2 |
| 3.1 | Keyboard Shortcuts Hook | Low | None |
| 3.2 | Shortcuts Help Modal | Low | 3.1 |
| 3.3 | J/K List Navigation | Low | 3.1, 2A.3 |

**Parallel Execution Opportunities**:
- 2A.1 + 2A.2 can run in parallel
- 2B.1 + 2B.2 can run in parallel
- 3.1 + 3.2 can start while 2B tasks complete
