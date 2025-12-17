# Automation Execution Debug Guide

## Overview

This document maps out exactly what should happen during automation execution, with logging checkpoints to identify failures.

---

## FLOW 1: Scheduled Automation Execution

When the scheduled time arrives, the following sequence should occur:

### Step 1: Cron Job Fires
**Location:** `automationEngine.ts` line ~243-246
**Log Prefix:** `[CRON-FIRE]`

```
Cron expression: "30 12 * * *" fires at 12:30 PM
↓
scheduleAutomation() callback: await this.executeAutomation(automation.id)
```

**Expected Logs:**
```
[CRON-FIRE] Cron triggered for automation: {automationId}
```

### Step 2: executeAutomation() Called
**Location:** `automationEngine.ts` line 284
**Log Prefix:** `[EXEC-START]`

```
executeAutomation(automationId) {
  1. Log entry
  2. Load automation from storage
  3. Track execution in database
  4. Create abort controller
  5. Call executeTimeline()
}
```

**Expected Logs:**
```
[EXEC-START] Starting execution for: {automationId}
[EXEC-START] Automation loaded: {name}
[EXEC-START] Database tracking started: {executionRecordId}
```

### Step 3: executeTimeline() - 5 Phase Pipeline
**Location:** `automationEngine.ts` line 363
**Log Prefix:** `[TIMELINE]`

```
Phase 1: Audience Generation
Phase 2: Test Sending (if dryRunFirst enabled)
Phase 3: Cancellation Window (waits until deadline)
Phase 4: Live Execution (calls test API)
Phase 5: Cleanup
```

**Expected Logs per Phase:**
```
[TIMELINE] === PHASE 1: AUDIENCE GENERATION ===
[TIMELINE] Phase 1 entry
[TIMELINE] Calling generatePushAudience() for {pushCount} pushes
[TIMELINE] Phase 1 complete

[TIMELINE] === PHASE 2: TEST SENDING ===
[TIMELINE] Phase 2 entry
[TIMELINE] dryRunFirst: {true/false}
[TIMELINE] Phase 2 complete

[TIMELINE] === PHASE 3: CANCELLATION WINDOW ===
[TIMELINE] Phase 3 entry
[TIMELINE] Window duration: {minutes} minutes
[TIMELINE] Deadline: {timestamp}
[TIMELINE] Phase 3 complete - proceeding to live

[TIMELINE] === PHASE 4: LIVE EXECUTION ===
[TIMELINE] Phase 4 entry
[TIMELINE] Mode: {test-mode/real-mode}
[TIMELINE] API URL: http://localhost:3001/api/automation/test/{id}?mode={mode}
[TIMELINE] API call initiated
[TIMELINE] API response status: {status}
[TIMELINE] Phase 4 complete

[TIMELINE] === PHASE 5: CLEANUP ===
[TIMELINE] Phase 5 entry
[TIMELINE] Phase 5 complete
```

---

## FLOW 2: Manual "Run Now" Button

When user clicks "Run Now" in the UI:

### Step 1: UI Button Click
**Location:** `AutomationDetailClient.tsx`
**Action:** Calls `/api/automation/control` with `action: 'execute_now'`

### Step 2: Control API Endpoint
**Location:** `api/automation/control/route.ts` line 97-120
**Log Prefix:** `[CONTROL-API]`

```
POST /api/automation/control
Body: { automationId, action: 'execute_now' }
↓
Load automation from storage
↓
Call automationEngine.executeAutomationNow(automation)
```

**Expected Logs:**
```
[CONTROL-API] Received action: execute_now for {automationId}
[CONTROL-API] Automation loaded: {name}
[CONTROL-API] Calling executeAutomationNow()
```

### Step 3: executeAutomationNow()
**Location:** `automationEngine.ts` line 1074
**Log Prefix:** `[EXEC-NOW]`

```
executeAutomationNow(automation) {
  1. Check if already running
  2. Call executeAutomation(automation.id)
  3. Return result
}
```

**Expected Logs:**
```
[EXEC-NOW] Manual execution requested: {automationId}
[EXEC-NOW] Already running check: {true/false}
[EXEC-NOW] Delegating to executeAutomation()
```

### Step 4: Same as Scheduled Flow
After `executeAutomationNow()` calls `executeAutomation()`, the flow is identical to scheduled execution (Steps 2-3 above).

---

## CRITICAL CHECKPOINTS

To debug failures, look for these checkpoint logs in order:

| # | Checkpoint | Log Tag | Success Indicator |
|---|------------|---------|-------------------|
| 1 | Entry point | `[CRON-FIRE]` or `[EXEC-NOW]` | Log appears |
| 2 | Automation load | `[EXEC-START]` | "Automation loaded: {name}" |
| 3 | DB tracking | `[TRACKING]` | "Execution started: {id}" |
| 4 | Timeline start | `[TIMELINE]` | "=== PHASE 1 ===" |
| 5 | Audience gen | `[TIMELINE]` | "Phase 1 complete" |
| 6 | Test sending | `[TIMELINE]` | "Phase 2 complete" |
| 7 | Cancel window | `[TIMELINE]` | "Phase 3 complete" |
| 8 | Live execution | `[TIMELINE]` | "API call initiated" |
| 9 | API response | `[TIMELINE]` | "API response status: 200" |
| 10 | Cleanup | `[TIMELINE]` | "Phase 5 complete" |

---

## COMMON FAILURE POINTS

### 1. Automation Not Found
**Symptom:** No logs after checkpoint 1
**Cause:** `loadAutomation()` returns null
**Debug:** Check `.automations/` directory for automation JSON file

### 2. Database Connection Failure
**Symptom:** `[TRACKING] Failed to track execution start`
**Cause:** PostgreSQL connection issue
**Debug:** Check `DATABASE_URL` env var, test connection

### 3. Audience Generation Failure
**Symptom:** Phase 1 never completes
**Cause:** Python script failure
**Debug:** Check `[ScriptExecutor]` logs, verify `basic_capabilities` module exists

### 4. Live Send API Failure
**Symptom:** Phase 4 shows error
**Cause:** `/api/automation/test/{id}` endpoint failure
**Debug:**
- Check API is accessible
- Verify URL is correct (localhost vs production domain)
- Check test API logs

### 5. Test API URL Problem (LIKELY CAUSE)
**Symptom:** Phase 4 fails with connection error
**Cause:** Code uses `http://localhost:3001` which doesn't work in Railway container
**Debug:** Check if running in Railway vs local

---

## Railway vs Local URL Issue

**CRITICAL:** In `executeLiveSending()` (line 619), the code calls:
```typescript
fetch(`http://localhost:3001/api/automation/test/${automation.id}?mode=${mode}`)
```

This **WILL FAIL** on Railway because:
- Railway containers use different internal networking
- `localhost:3001` doesn't exist in Railway container context
- Should use relative URL or environment-based URL

**FIX NEEDED:** Change to:
```typescript
const baseUrl = process.env.RAILWAY_STATIC_URL || 'http://localhost:3001';
fetch(`${baseUrl}/api/automation/test/${automation.id}?mode=${mode}`)
```

---

## Debug Commands

### View Live Logs (Railway)
```bash
railway logs --service push-notification-system | grep -E "\[CRON-FIRE\]|\[EXEC-START\]|\[TIMELINE\]|\[EXEC-NOW\]"
```

### View Live Logs (Local)
Check terminal running `npm run dev:push-only`

### Force Test Execution
```bash
curl -X POST http://localhost:3001/api/automation/control \
  -H "Content-Type: application/json" \
  -d '{"automationId": "YOUR_ID", "action": "execute_now"}'
```

---

## Logging Checkpoints Added

The following debug logs have been added to the codebase:

1. `[CRON-FIRE]` - When cron job callback fires
2. `[EXEC-START]` - executeAutomation entry
3. `[EXEC-NOW]` - executeAutomationNow entry
4. `[TIMELINE]` - Each phase entry/exit
5. `[PHASE-1]` - Audience generation details
6. `[PHASE-4]` - Live execution API call details
7. `[CONTROL-API]` - Control endpoint handling
