# Automation Engine Resilience Assessment

**Slug:** automation-engine-resilience
**Author:** Claude Code
**Date:** 2025-11-27
**Branch:** preflight/automation-engine-resilience
**Related:** services/push-blaster/src/lib/automationEngine.ts

---

## 1) Intent & Assumptions

- **Task brief:** Assess whether the AutomationEngine requires refactoring to reduce brittleness and debugging overhead, or if the current design is fundamentally sound and issues stem from external factors.
- **Assumptions:**
  - The engine currently "works" but requires significant debugging effort when failures occur
  - Failures are often cascading (one failure leads to unclear state requiring investigation)
  - The goal is reducing time-to-recovery, not adding features
- **Out of scope:**
  - Adding new automation types
  - UI changes
  - Python script improvements
  - Database schema changes

---

## 2) Pre-reading Log

- `services/push-blaster/src/lib/automationEngine.ts`: Core 1,462-line orchestrator. Well-structured singleton with 5-phase execution pipeline. Extensive debug logging. Key concerns: async race conditions in execution lifecycle.
- `services/push-blaster/src/lib/db.ts`: 28-line minimal Pool wrapper. No connection limits, no query timeouts, no error handling beyond basic setup.
- `services/push-blaster/src/lib/executionEventEmitter.ts`: Clean EventEmitter singleton for SSE streaming. Max 50 listeners. Potential memory leak if unsubscribe not called.
- `services/push-blaster/src/lib/debugPythonRunner.ts`: Good timeout handling (5 min default), heartbeat logging every 10s. Writes debug files on completion.
- `developer-guides/push-blaster-guide.md`: Comprehensive documentation. Notes singleton pattern, cron cleanup, test vs real mode lead times.

---

## 3) Codebase Map

### Primary Components
| File | Role | Lines |
|------|------|-------|
| `automationEngine.ts` | Core orchestrator, cron scheduling, execution timeline | 1,462 |
| `automationStorage.ts` | File-based JSON persistence | 441 |
| `executionEventEmitter.ts` | Real-time SSE event streaming | 141 |
| `scriptExecutor.ts` | Python script spawning | 434 |
| `debugPythonRunner.ts` | Process spawning with timeout | 163 |
| `db.ts` | PostgreSQL connection pool | 28 |

### Shared Dependencies
- **node-cron**: Cron job scheduling
- **pg Pool**: Database connection management
- **EventEmitter**: Real-time event streaming
- **AbortController**: Execution cancellation

### Data Flow
```
Cron Trigger → executeAutomation() → executeTimeline()
    → Phase 1: executeAudienceGeneration() → scriptExecutor → Python
    → Phase 2: executeTestSending() → internal API
    → Phase 3: executeCancellationWindow() → setInterval polling
    → Phase 4: executeLiveSending() → internal API
    → Phase 5: executeCleanup()
    → trackExecutionComplete() → DB write
```

### External Dependencies
- **AWS RDS PostgreSQL** (DATABASE_URL): User queries, execution tracking
- **Push-Cadence-Service** (CADENCE_SERVICE_URL): Frequency cap filtering
- **Firebase** (FCM): Push delivery
- **GraphQL Endpoint**: Device token fetching

### Potential Blast Radius
- Cron scheduling affects all automations globally
- DB pool exhaustion blocks all execution tracking
- Event emitter listener exhaustion blocks all SSE connections

---

## 4) Root Cause Analysis

### The Real Problem: Unclear Failure Modes

The engine doesn't have a "design flaw" so much as it has **unclear failure modes**. When something fails, there's no structured way to identify:
1. What type of failure occurred (timeout vs crash vs data issue vs external service)
2. What state the automation is in (scheduled, executing, orphaned, corrupted)
3. What corrective action to take

### Evidence: Current Error Handling Pattern

```typescript
// automationEngine.ts:983-986
catch (error) {
  console.error('[TRACKING] Failed to track execution start:', error);
  return ''; // Continue execution even if tracking fails - SILENT FAILURE
}
```

```typescript
// automationEngine.ts:399-402
catch (error: unknown) {
  this.logError(`Automation execution failed for ${automationId}`, error);
  // No complex failure handling - just log and continue - UNCLEAR RECOVERY PATH
}
```

### Observed Failure Scenarios

| Scenario | Symptom | Root Cause | Why Debugging is Hard |
|----------|---------|------------|----------------------|
| Python script hangs | Automation appears stuck | DB connection timeout in Python > Node timeout | No differentiation between "slow" and "hung" |
| Concurrent execution | Duplicate pushes or missed sends | Cron fires while previous execution running | No execution lock per automation |
| Reschedule during execution | Orphaned execution, metrics corruption | Race between terminate and reschedule | No synchronization primitives |
| DB pool exhaustion | Executions fail silently | No max connections configured | Tracking returns empty string on failure |
| Event listener leak | New SSE connections rejected | Unsubscribe not called on disconnect | Max listeners exceeded with no clear error |

---

## 5) What's Actually Well-Designed

**Before recommending changes, let's acknowledge what's solid:**

### 1. Singleton Pattern (Lines 1413-1461)
- Production uses `global._automationEngineProductionInstance`
- Development uses `global._automationEngineInstance`
- Build phase throws error instead of creating broken instance
- **Verdict: Well-designed, no changes needed**

### 2. Process Cleanup (Lines 161-196)
- Handles SIGTERM, SIGINT, exit, uncaughtException
- Destroys all cron jobs on cleanup
- Logs cleanup progress
- **Verdict: Well-designed, no changes needed**

### 3. Debug Logging (Throughout)
- Tagged checkpoints: `[CRON-FIRE]`, `[EXEC-START]`, `[TIMELINE]`, `[PHASE-4]`
- Timestamps on all logs
- Instance ID tracking
- **Verdict: Well-designed, helpful for debugging**

### 4. AbortController Support (Lines 345, 540-545)
- Can abort mid-execution
- Signal checked at phase boundaries
- Clean abort error handling
- **Verdict: Good foundation, could be enhanced**

### 5. Execution Tracking (Lines 966-1049)
- Records start, phase transitions, completion
- Captures metrics and errors
- Tracks instance ID
- **Verdict: Good structure, needs better error handling**

### 6. Test Mode Configuration (Lines 1346-1364)
- Different lead times (3 min test vs 30 min real)
- Different cancellation windows
- Explicit mode detection
- **Verdict: Well-designed, no changes needed**

---

## 6) Targeted Hardening Recommendations

Rather than a full refactor, I recommend **surgical improvements** to the existing well-designed structure:

### HIGH PRIORITY: Execution Locking

**Problem:** Cron can fire while previous execution still running.

**Current Code (Line 254-266):**
```typescript
const cronJob = cron.schedule(cronExpression, async () => {
  await this.executeAutomation(automation.id); // No lock check
});
```

**Proposed Change:**
```typescript
const cronJob = cron.schedule(cronExpression, async () => {
  if (this.isExecutionActive(automation.id)) {
    this.log(`⚠️ Skipping cron trigger - execution already active: ${automation.id}`);
    return;
  }
  await this.executeAutomation(automation.id);
});
```

**Impact:** Prevents duplicate executions. Simple 3-line change.

---

### HIGH PRIORITY: DB Pool Configuration

**Problem:** No limits on connections, no query timeout.

**Current Code (db.ts:10-15):**
```typescript
pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
```

**Proposed Change:**
```typescript
pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,                    // Limit concurrent connections
  idleTimeoutMillis: 30000,   // Release idle connections after 30s
  connectionTimeoutMillis: 5000,  // Fail fast on connection issues
  query_timeout: 60000,       // 60s max query time
});
```

**Impact:** Prevents pool exhaustion, provides clear timeout errors.

---

### MEDIUM PRIORITY: Structured Error Types

**Problem:** All errors are logged the same way, making diagnosis hard.

**Proposed Addition (new file: `automationErrors.ts`):**
```typescript
export enum ExecutionErrorType {
  TIMEOUT = 'timeout',           // Script or query timed out
  ABORT = 'abort',               // User-initiated abort
  EXTERNAL_SERVICE = 'external', // Cadence/Firebase/GraphQL failure
  DATABASE = 'database',         // DB connection or query failure
  SCRIPT = 'script',             // Python script error
  INTERNAL = 'internal',         // Logic error in engine
}

export class ExecutionError extends Error {
  constructor(
    message: string,
    public readonly type: ExecutionErrorType,
    public readonly recoverable: boolean,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
  }
}
```

**Usage in Engine:**
```typescript
// Instead of:
throw new Error(`Script execution failed: ${errorMessage}`);

// Use:
throw new ExecutionError(
  `Script execution failed: ${errorMessage}`,
  ExecutionErrorType.SCRIPT,
  true, // Can retry
  { scriptId, automationId }
);
```

**Impact:** Clear error categorization, enables targeted recovery.

---

### MEDIUM PRIORITY: Enhanced Health Endpoint

**Problem:** Current health endpoint doesn't expose specific failure indicators.

**Proposed Enhancement to /api/health:**
```typescript
{
  "status": "healthy|degraded|critical",
  "automationEngine": {
    "instanceId": "engine-xxx",
    "scheduledJobsCount": 5,
    "activeExecutionsCount": 1,
    "lastRestorationTimestamp": "2025-11-27T10:00:00Z",
    "lastRestorationSuccess": true,
    "dbPoolStats": {
      "totalCount": 10,
      "idleCount": 8,
      "waitingCount": 0
    }
  },
  "recentErrors": [
    {
      "type": "timeout",
      "automationId": "xxx",
      "timestamp": "2025-11-27T10:15:00Z",
      "message": "Script timeout after 300s"
    }
  ]
}
```

**Impact:** Enables proactive monitoring, faster diagnosis.

---

### LOW PRIORITY: Cancellation Window Refactor

**Problem:** setInterval-based cancellation window is fragile.

**Current Implementation (Lines 657-696):** Uses setInterval polling every 30 seconds.

**Proposed Change:** Use `setTimeout` with cleanup:
```typescript
private async executeCancellationWindow(
  automation: UniversalAutomation,
  executionConfig: ExecutionConfig,
  abortSignal: AbortSignal
): Promise<void> {
  const deadline = new Date(executionConfig.cancellationDeadline);
  const msUntilDeadline = deadline.getTime() - Date.now();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      executionConfig.canCancel = false;
      resolve();
    }, msUntilDeadline);

    // Handle abort during window
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error('Execution aborted during cancellation window'));
    };

    abortSignal?.addEventListener('abort', onAbort, { once: true });
  });
}
```

**Impact:** Cleaner timing, proper abort handling.

---

### LOW PRIORITY: Event Listener Cleanup

**Problem:** Potential memory leak if SSE connections don't clean up.

**Proposed Change in API routes:**
```typescript
// In SSE endpoint
const unsubscribe = executionEventEmitter.subscribeToAutomation(
  automationId, onLog, onProgress
);

// CRITICAL: Ensure cleanup on request close
req.signal.addEventListener('abort', () => {
  unsubscribe();
});
```

**Impact:** Prevents listener exhaustion under load.

---

## 7) Recommendation Summary

### Don't Refactor

The engine architecture is fundamentally sound:
- Singleton pattern ✓
- Process cleanup ✓
- Debug logging ✓
- Test mode support ✓
- Execution tracking ✓

### Do Harden (In Priority Order)

| Priority | Change | Effort | Impact |
|----------|--------|--------|--------|
| HIGH | Execution locking in cron callback | 3 lines | Prevents duplicate executions |
| HIGH | DB pool configuration | 5 lines | Prevents pool exhaustion |
| MEDIUM | Structured error types | New file + updates | Clear error diagnosis |
| MEDIUM | Enhanced health endpoint | ~50 lines | Proactive monitoring |
| LOW | Cancellation window refactor | ~30 lines | Cleaner timing |
| LOW | Event listener cleanup | Pattern enforcement | Memory leak prevention |

### Estimated Total Effort

- **Minimum viable hardening (HIGH only):** ~1 hour
- **Full hardening (all priorities):** ~4 hours
- **Full refactor (not recommended):** Days to weeks

---

## 8) Clarifications for User

1. **Do you want execution locking to be "skip" (current execution continues) or "queue" (new execution waits)?**
   - Skip is simpler and recommended for cron-based scheduling
   - Queue adds complexity with potential for backlog

2. **Should health endpoint errors be persisted to DB or memory-only?**
   - Memory-only is simpler but lost on restart
   - DB persistence enables historical analysis

3. **How many concurrent automations do you typically run?**
   - Affects DB pool `max` configuration
   - Current default of 10 may be insufficient

4. **Is there a monitoring system (Datadog, etc.) that should receive structured errors?**
   - Affects error type design
   - May want JSON logging instead of console.log

---

## 9) Next Steps

If you agree with this assessment:

1. **Start with HIGH priority changes** - execution locking and DB pool config
2. **Test in development** with concurrent automation triggers
3. **Deploy and monitor** for 1 week
4. **Then consider MEDIUM priority** based on observed issues

If you want me to implement any of these changes, let me know which priority level to start with.
