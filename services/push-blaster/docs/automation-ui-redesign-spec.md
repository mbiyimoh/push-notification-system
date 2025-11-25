# Automation UI Redesign Specification

> Generated: 2025-11-24
> Purpose: Reference document for redesigning push-blaster UI to focus on automations

---

## Task Context Summary

**Task Understanding:**
Create a new push notification UI that prioritizes automation management over one-off "blast" functionality. The new interface should make it intuitive to schedule automations, monitor live automation status, view execution logs with detailed metrics (users sent, cadence exclusions), and see upcoming scheduled runs.

**Relevant Context Found:**

### Code/Components
- **Main UI** (`services/push-blaster/src/app/page.tsx`)
  - **Why relevant:** The current monolithic 3000+ line page with 5 tabs (make, track, calendar, automations, restore). Heavy focus on one-off push creation.
  - **Influences approach:** New UI should break this into dedicated automation-focused routes/pages with cleaner separation.

- **Automation Types** (`services/push-blaster/src/types/automation.ts`)
  - **Why relevant:** Defines `UniversalAutomation`, `AutomationPush`, `ExecutionConfig`, `AutomationSchedule` - the core data models.
  - **Influences approach:** UI should surface these models: status (active/draft/paused), schedule (frequency, executionTime), push sequences, metrics.

- **Automation Engine** (`services/push-blaster/src/lib/automationEngine.ts`)
  - **Why relevant:** Manages cron scheduling, tracks active executions, handles startup restoration.
  - **Influences approach:** UI should display scheduled jobs, next execution times, active execution phases.

- **Automation Logger** (`services/push-blaster/src/lib/automationLogger.ts`)
  - **Why relevant:** Detailed execution logging with `ExecutionLog`, `PhaseLog`, `PushLog`, `ExecutionMetrics`.
  - **Influences approach:** Log viewer should show: totalDuration, audienceSize, sentCount, failureCount, cadence exclusions.

### Database/Data
- **Cadence Service** (`services/push-cadence-service/src/lib/cadence.ts`)
  - **Why relevant:** `filterUsersByCadence()` returns `{ eligibleUserIds, excludedCount }` - the cadence exclusion data.
  - **Influences approach:** Display excluded counts in execution logs.

- **Push Logs** (`.push-logs/*.json`)
  - **Why relevant:** JSON files with execution details: batches, successCount, failedCount, timestamps.
  - **Influences approach:** Parse and display these logs in the execution history.

### API Endpoints
- `/api/automation/recipes` - CRUD for automations
- `/api/automation/audit` - Health check for zombie jobs
- `/api/automation/monitor` - Real-time monitoring

**Key Insights:**
1. The current UI mixes one-off blasts and automations - the new UI should be automation-first with clear separation
2. Execution logs already capture detailed metrics (audience size, sent count, excluded count, phase timing) - just needs better surfacing
3. The automation engine has built-in restoration and cleanup - UI should reflect scheduled job status and next execution time

**Recommended Approach:**
Build a new Next.js App Router structure with dedicated pages for: Dashboard (overview), Automations List, Automation Detail, Execution Logs, and Create/Edit Automation. The dashboard should show at-a-glance status of live automations and upcoming runs. Break the monolithic page.tsx into focused components.

---

## ASCII Wireframes

### 1. Dashboard (Home)
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  Push Automation Center                                      [+ New Automation]     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐        │
│  │   LIVE AUTOMATIONS   │ │     SCHEDULED        │ │        PAUSED        │        │
│  │         2            │ │          0           │ │          1           │        │
│  │   ● Running now      │ │   Next: 10:00 AM CT  │ │   Awaiting action    │        │
│  └──────────────────────┘ └──────────────────────┘ └──────────────────────┘        │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  UPCOMING EXECUTIONS                                            [View All]   │   │
│  ├──────────────────────────────────────────────────────────────────────────────┤   │
│  │  ⏰ Daily Showcase Push - Haves/Wants                                        │   │
│  │     Next run: Today 10:00 AM CT • Frequency: Daily • Status: ● Active       │   │
│  │  ⏰ Onboarding Level 2/3 - New User Series                                   │   │
│  │     Next run: Today 11:00 AM CT • Frequency: Daily • Status: ● Active       │   │
│  │  ⏰ Weekly Trending Sneakers                                                 │   │
│  │     Next run: Monday 9:00 AM CT • Frequency: Weekly • Status: ○ Paused      │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │  RECENT ACTIVITY                                                [View Logs]  │   │
│  ├──────────────────────────────────────────────────────────────────────────────┤   │
│  │  ✓ Daily Showcase Push           Today 10:00 AM     Sent: 12,453 users      │   │
│  │    └─ Excluded by cadence: 2,341 • Failed: 12 • Duration: 45s              │   │
│  │  ✓ Onboarding Level 2/3          Today 11:00 AM     Sent: 847 users        │   │
│  │    └─ Excluded by cadence: 156 • Failed: 0 • Duration: 12s                 │   │
│  │  ✓ Daily Showcase Push           Yesterday 10:00 AM Sent: 11,982 users     │   │
│  │    └─ Excluded by cadence: 2,198 • Failed: 8 • Duration: 42s               │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 2. Automations List
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ← Dashboard    AUTOMATIONS                                  [+ New Automation]     │
├─────────────────────────────────────────────────────────────────────────────────────┤
│  Filter: [All ▾]  [Daily ▾]  [Active ▾]                        Search: [________]  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ ● Daily Showcase Push - Haves/Wants                              [Actions ▾] │   │
│  │ ─────────────────────────────────────────────────────────────────────────── │   │
│  │ Type: Script-based │ Frequency: Daily │ Time: 10:00 AM CT                   │   │
│  │ Push Sequences: 4 (Haves, Wants, Hot Items, Trending)                       │   │
│  │ ─────────────────────────────────────────────────────────────────────────── │   │
│  │ Last Run: Today 10:00 AM • Next Run: Tomorrow 10:00 AM                      │   │
│  │ Total Executions: 127 • Success Rate: 99.2%                                 │   │
│  │                                        [View Logs] [Edit] [Pause] [Delete]  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ ● Onboarding Level 2/3 - New User Series                         [Actions ▾] │   │
│  │ ─────────────────────────────────────────────────────────────────────────── │   │
│  │ Type: Script-based │ Frequency: Daily │ Time: 11:00 AM CT                   │   │
│  │ Push Sequences: 3 (Level 2, Level 3, New Stars)                             │   │
│  │ ─────────────────────────────────────────────────────────────────────────── │   │
│  │ Last Run: Today 11:00 AM • Next Run: Tomorrow 11:00 AM                      │   │
│  │ Total Executions: 89 • Success Rate: 100%                                   │   │
│  │                                        [View Logs] [Edit] [Pause] [Delete]  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ ○ Weekly Trending Sneakers                                       [Actions ▾] │   │
│  │ ─────────────────────────────────────────────────────────────────────────── │   │
│  │ Type: Template │ Frequency: Weekly │ Time: Monday 9:00 AM CT    [PAUSED]    │   │
│  │ Push Sequences: 1 (All Active Users)                                        │   │
│  │ ─────────────────────────────────────────────────────────────────────────── │   │
│  │ Last Run: Nov 18 • Next Run: -- (Paused)                                    │   │
│  │ Total Executions: 12 • Success Rate: 98.1%                                  │   │
│  │                                       [View Logs] [Edit] [Resume] [Delete]  │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 3. Automation Detail / Execution Logs
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ← Automations    DAILY SHOWCASE PUSH - HAVES/WANTS          [Edit] [Pause] [Run]  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────┬─────────────────────────────────────────┐ │
│  │ OVERVIEW                            │ SCHEDULE                                │ │
│  │ ──────────────────────────────────  │ ──────────────────────────────────────  │ │
│  │ Status:     ● Active                │ Frequency:  Daily                       │ │
│  │ Created:    Oct 15, 2025            │ Send Time:  10:00 AM CT                 │ │
│  │ Script:     daily_showcase.py       │ Next Run:   Tomorrow 10:00 AM           │ │
│  │ Lead Time:  30 minutes              │ Timezone:   America/Chicago             │ │
│  └─────────────────────────────────────┴─────────────────────────────────────────┘ │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ PUSH SEQUENCES (4)                                                          │   │
│  │ ──────────────────────────────────────────────────────────────────────────  │   │
│  │  #1  HAVES                                                     Layer: 2     │   │
│  │      "Your sneaker is in demand!"                                           │   │
│  │      "Someone is looking for what you have..."                              │   │
│  │                                                                             │   │
│  │  #2  WANTS                                                     Layer: 2     │   │
│  │      "Your wishlist item is available!"                                     │   │
│  │      "Great news - check out this match..."                                 │   │
│  │                                                                             │   │
│  │  #3  HOT_ITEMS                                                 Layer: 2     │   │
│  │      "Hot item alert"                                                       │   │
│  │      "This sneaker is trending..."                                          │   │
│  │                                                                             │   │
│  │  #4  TRENDING                                                  Layer: 2     │   │
│  │      "Trending now"                                                         │   │
│  │      "See what's popular today..."                                          │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ EXECUTION HISTORY                                              [Export CSV] │   │
│  ├────────┬────────────────┬─────────┬──────────┬──────────┬─────────┬────────┤   │
│  │ Status │ Date/Time      │ Sent    │ Excluded │ Failed   │Duration │ Action │   │
│  ├────────┼────────────────┼─────────┼──────────┼──────────┼─────────┼────────┤   │
│  │   ✓    │ Nov 24, 10:00a │ 12,453  │ 2,341    │ 12       │ 45s     │ [View] │   │
│  │   ✓    │ Nov 23, 10:00a │ 11,982  │ 2,198    │ 8        │ 42s     │ [View] │   │
│  │   ✓    │ Nov 22, 10:00a │ 12,001  │ 2,456    │ 15       │ 47s     │ [View] │   │
│  │   ✓    │ Nov 21, 10:00a │ 11,876  │ 2,234    │ 3        │ 41s     │ [View] │   │
│  │   ✓    │ Nov 20, 10:00a │ 12,234  │ 2,567    │ 7        │ 44s     │ [View] │   │
│  │   ✗    │ Nov 19, 10:00a │ 0       │ 0        │ --       │ 2s      │ [View] │   │
│  │   ✓    │ Nov 18, 10:00a │ 11,543  │ 2,089    │ 11       │ 39s     │ [View] │   │
│  └────────┴────────────────┴─────────┴──────────┴──────────┴─────────┴────────┘   │
│                                               [Load More]                          │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 4. Single Execution Log Detail
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ← Execution History    EXECUTION LOG: Nov 24, 2025 10:00 AM                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ SUMMARY                                                         Status: ✓   │   │
│  │ ─────────────────────────────────────────────────────────────────────────   │   │
│  │ Automation:  Daily Showcase Push - Haves/Wants                              │   │
│  │ Execution:   exec_20251124_100000_abc12                                     │   │
│  │ Start:       Nov 24, 2025 09:30:00 AM CT (audience generation)              │   │
│  │ End:         Nov 24, 2025 10:00:45 AM CT                                    │   │
│  │ Duration:    30m 45s total (45s push sending)                               │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ AUDIENCE METRICS                                                            │   │
│  │ ─────────────────────────────────────────────────────────────────────────   │   │
│  │                                                                             │   │
│  │   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │   │
│  │   │  QUERIED   │  │  EXCLUDED  │  │    SENT    │  │   FAILED   │           │   │
│  │   │  14,806    │→ │   2,341    │→ │  12,453    │→ │     12     │           │   │
│  │   │ (script)   │  │ (cadence)  │  │ (success)  │  │  (errors)  │           │   │
│  │   └────────────┘  └────────────┘  └────────────┘  └────────────┘           │   │
│  │                                                                             │   │
│  │   Exclusion Breakdown:                                                      │   │
│  │   • Layer 3 cooldown (72h):        1,234 users                              │   │
│  │   • Combined L2/L3 limit:          1,107 users                              │   │
│  │   • Invalid tokens:                    12 users                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ PUSH BREAKDOWN BY SEQUENCE                                                  │   │
│  │ ─────────────────────────────────────────────────────────────────────────   │   │
│  │  #  Sequence     Audience    Sent    Excluded   Failed   Time              │   │
│  │  1  HAVES        5,234       4,112   1,122      3        12s               │   │
│  │  2  WANTS        4,892       3,876   1,016      4        10s               │   │
│  │  3  HOT_ITEMS    2,456       2,341   115        2        8s                │   │
│  │  4  TRENDING     2,224       2,124   88         3        7s                │   │
│  │  ─────────────────────────────────────────────────────────────────────     │   │
│  │     TOTAL        14,806     12,453   2,341      12       45s               │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ EXECUTION TIMELINE                                                          │   │
│  │ ─────────────────────────────────────────────────────────────────────────   │   │
│  │  09:30:00  ● AUDIENCE_GENERATION started                                   │   │
│  │  09:30:12  ✓ Script daily_showcase.py completed (12s)                      │   │
│  │  09:30:12  ● TEST_SENDING started                                          │   │
│  │  09:30:15  ✓ Test push sent to 2 test users                                │   │
│  │  09:30:15  ● CANCELLATION_WINDOW started (25 min)                          │   │
│  │  09:55:15  ✓ Cancellation window closed                                    │   │
│  │  10:00:00  ● LIVE_EXECUTION started                                        │   │
│  │  10:00:12  ✓ Push #1 (HAVES) sent - 4,112 users                            │   │
│  │  10:00:22  ✓ Push #2 (WANTS) sent - 3,876 users                            │   │
│  │  10:00:30  ✓ Push #3 (HOT_ITEMS) sent - 2,341 users                        │   │
│  │  10:00:37  ✓ Push #4 (TRENDING) sent - 2,124 users                         │   │
│  │  10:00:45  ✓ EXECUTION completed successfully                              │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### 5. Create/Edit Automation (Simplified Flow)
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ← Automations    CREATE NEW AUTOMATION                                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Step: [1 Script ●]──────[2 Schedule ○]──────[3 Content ○]──────[4 Review ○]      │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ SELECT AUDIENCE SCRIPT                                                      │   │
│  │ ─────────────────────────────────────────────────────────────────────────   │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │ ○ Daily Showcase (Haves/Wants)                                      │   │   │
│  │  │   Generates 4 audiences: haves, wants, hot_items, trending          │   │   │
│  │  │   Est. runtime: ~12s                                                │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │ ● Onboarding Series                                        SELECTED │   │   │
│  │  │   Generates 3 audiences: level_2, level_3, new_stars                │   │   │
│  │  │   Est. runtime: ~8s                                                 │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │ ○ Inactive User Re-engagement                                       │   │   │
│  │  │   Generates 2 audiences: inactive_30d, inactive_60d                 │   │   │
│  │  │   Est. runtime: ~15s                                                │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│                                               [Cancel]              [Next Step →]   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

#### Step 2: Schedule Configuration
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│  ← Automations    CREATE NEW AUTOMATION                                            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                     │
│  Step: [1 Script ✓]──────[2 Schedule ●]──────[3 Content ○]──────[4 Review ○]      │
│                                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │ CONFIGURE SCHEDULE                                                          │   │
│  │ ─────────────────────────────────────────────────────────────────────────   │   │
│  │                                                                             │   │
│  │  Automation Name: [Onboarding Level 2/3 Daily___________________]           │   │
│  │                                                                             │   │
│  │  ┌───────────────────────────────┬───────────────────────────────┐         │   │
│  │  │ Frequency                     │ Send Time                     │         │   │
│  │  │ ┌───────────────────────────┐ │ ┌───────────────────────────┐ │         │   │
│  │  │ │ ● Daily                   │ │ │ [ 11 : 00 ]  AM ▾         │ │         │   │
│  │  │ │ ○ Weekly                  │ │ │                           │ │         │   │
│  │  │ │ ○ One-time                │ │ │ Timezone: America/Chicago │ │         │   │
│  │  │ └───────────────────────────┘ │ └───────────────────────────┘ │         │   │
│  │  └───────────────────────────────┴───────────────────────────────┘         │   │
│  │                                                                             │   │
│  │  Start automation:  ● Immediately  ○ On specific date: [__________]        │   │
│  │                                                                             │   │
│  │  ┌─────────────────────────────────────────────────────────────────────┐   │   │
│  │  │ ℹ️  Lead time: Audience generation starts 30 min before send time   │   │   │
│  │  └─────────────────────────────────────────────────────────────────────┘   │   │
│  │                                                                             │   │
│  └─────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                     │
│                                     [← Back]                        [Next Step →]   │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Proposed Architecture

```
services/push-blaster/src/app/
├── (dashboard)/
│   └── page.tsx                    # Dashboard home
├── automations/
│   ├── page.tsx                    # Automations list
│   ├── [id]/
│   │   ├── page.tsx                # Automation detail + logs
│   │   ├── edit/page.tsx           # Edit automation
│   │   └── logs/[logId]/page.tsx   # Single execution detail
│   └── create/page.tsx             # Create automation wizard
├── components/
│   ├── AutomationCard.tsx
│   ├── ExecutionLogTable.tsx
│   ├── ExecutionTimeline.tsx
│   ├── AudienceMetrics.tsx
│   ├── ScheduleForm.tsx
│   ├── PushSequenceEditor.tsx
│   └── StatusBadge.tsx
└── layout.tsx                      # App shell with sidebar nav
```

---

## Key Data Models to Surface in UI

From `src/types/automation.ts`:

### UniversalAutomation
- `id`, `name`, `description`
- `status`: draft | active | inactive | scheduled | running | paused | completed | failed | cancelled
- `isActive`: boolean
- `schedule`: { frequency, executionTime, timezone, leadTimeMinutes, startDate }
- `pushSequence`: array of push configs
- `metadata`: { totalExecutions, successfulExecutions, failedExecutions, lastExecutedAt, nextExecutionAt }

### ExecutionLog (from automationLogger.ts)
- `automationId`, `automationName`, `executionId`
- `startTime`, `endTime`, `status`
- `phases`: array of { phase, startTime, endTime, status, duration }
- `pushLogs`: array of { pushId, pushTitle, audienceSize, sentCount, failureCount, layerId }
- `metrics`: { totalDuration, audienceGenerationTime, testSendingTime, liveExecutionTime, totalAudienceSize, totalSentCount }

### Cadence Exclusion Data (from cadence.ts)
- `eligibleUserIds`: users who passed cadence filters
- `excludedCount`: users excluded by cadence rules
- Exclusion reasons: Layer cooldowns, combined limits

---

## Future Considerations

1. **One-off Blasts**: May be re-added later as a secondary feature
2. **Real-time Monitoring**: WebSocket/SSE for live execution tracking
3. **Alerting**: Email/Slack notifications for failures
4. **Analytics**: Charts for trend analysis over time
