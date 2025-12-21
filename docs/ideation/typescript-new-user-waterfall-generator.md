# TypeScript New User Waterfall Generator Migration

**Slug:** typescript-new-user-waterfall-generator
**Author:** Claude Code
**Date:** 2025-12-21
**Branch:** feat/layer5-typescript-generator
**Related:**
- `specs/feat-typescript-audience-generators-layer3.md` (prior migration spec)
- `services/push-blaster/src/lib/generators/layer3/Layer3BehaviorGenerator.ts` (template implementation)

---

## 1) Intent & Assumptions

- **Task brief:** Complete the Python-to-TypeScript migration by implementing a native TypeScript generator for the New User Waterfall automation (Layer 5). This is the second of the two primary automations - Layer 3 has already been migrated.

- **Assumptions:**
  - The existing Layer 3 TypeScript generator pattern is the correct template to follow
  - The Python waterfall script's business logic (5-level waterfall, mutual exclusivity, target shoe lookup) must be preserved exactly
  - Environment variable `AUTOMATION_ENGINE_VERSION=v2` is already configured in production
  - The existing `queries/` TypeScript modules can be extended with new waterfall-specific queries
  - Test user (founder beems: `0e54067c-4c0e-4e4a-8a23-a47661578059`) should continue to be used for test CSVs

- **Out of scope:**
  - Migrating Layer 2 (trending) or Layer 1 (showcase) - those remain Python
  - Removing the Python fallback scripts (kept for emergency rollback)
  - Modifying the automation engine's decision logic
  - Changes to the push notification delivery system

---

## 2) Pre-reading Log

- `CLAUDE.md`: Confirms migration status - Layer 3 fully migrated, Layer 5 planned but not implemented
- `services/push-blaster/src/lib/generators/layer3/Layer3BehaviorGenerator.ts`: Template implementation showing the exact patterns to follow (349 lines)
- `services/push-blaster/src/lib/generators/BaseAudienceGenerator.ts`: Abstract base class with validation, timing, and error handling
- `services/push-blaster/src/lib/generators/types.ts`: Shared types, `GeneratorOptions`, `GeneratorResult`, `FOUNDER_TEST_USER`
- `services/push-blaster/src/lib/generators/index.ts`: Registry pattern - need to add Layer 5 mapping
- `audience-generation-scripts/generate_new_user_waterfall.py`: Complete Python implementation (827 lines) with waterfall logic
- `basic_capabilities/internal_db_queries_toolbox/push_csv_queries.py`: Python queries that must be ported to TypeScript
- `services/push-blaster/src/lib/queries/*.ts`: Existing TypeScript query modules to extend

---

## 3) Codebase Map

### Primary components/modules (to create)

| File | Purpose |
|------|---------|
| `src/lib/generators/layer5/Layer5WaterfallGenerator.ts` | Main generator class (~400 lines) |
| `src/lib/queries/waterfallQueries.ts` | New user queries, completion checks (~200 lines) |
| `src/lib/queries/targetShoeQueries.ts` | 4-step fallback shoe lookup (~150 lines) |

### Shared dependencies (existing, to extend)

| File | What to modify |
|------|----------------|
| `src/lib/generators/index.ts` | Add `Layer5WaterfallGenerator` to registry, add mapping `'layer5-waterfall' → 'generate_new_user_waterfall'` |
| `src/lib/generators/types.ts` | Add `WaterfallUserRecord` interface, `WATERFALL_CSV_COLUMNS` constant |
| `src/lib/queries/index.ts` | Export new waterfall query functions |

### Data flow

```
1. automationEngine.generatePushAudience()
   ↓
2. generatorRegistry.get('generate_new_user_waterfall')
   ↓
3. Layer5WaterfallGenerator.generate(options)
   ↓
4. getNewUsersInWindow() → base audience
   ↓
5. Sequential waterfall extraction (5 levels):
   - Level 1: No closet items → extract
   - Level 2: No bio → extract
   - Level 3: No offers → extract + target shoes
   - Level 4: No wishlist → extract + target shoes
   - Level 5: All remaining → "New Stars" + target shoes
   ↓
6. CsvGenerator.writeRecords() → 5 production + 5 test CSVs
```

### Feature flags/config

| Flag | Current Value | Impact |
|------|---------------|--------|
| `AUTOMATION_ENGINE_VERSION` | `v2` | Routes to TypeScript when registered |
| Script ID | `generate_new_user_waterfall` | Must match registry mapping |

### Potential blast radius

- **Low risk:** Adding new files, extending existing modules
- **Medium risk:** Registry update could affect existing Layer 3 if done incorrectly
- **Zero risk to Python:** Python fallback remains untouched and functional

---

## 4) Root Cause Analysis

**Not applicable** - This is a new feature implementation, not a bug fix.

---

## 5) Research

### Potential Solutions

**Option 1: Direct Port (Recommended)**

Port the Python waterfall logic directly to TypeScript following the Layer 3 pattern exactly.

**Pros:**
- Proven pattern from Layer 3 migration
- Maintains exact business logic parity
- Uses existing infrastructure (CsvGenerator, BaseAudienceGenerator)
- Same database connection pool (no subprocess spawning)

**Cons:**
- Significant implementation effort (~800 lines of new code)
- Need to port 7 Python query functions to TypeScript

**Option 2: Hybrid Approach**

Keep Python for complex queries, call via subprocess from TypeScript wrapper.

**Pros:**
- Less new code to write
- Reuses tested Python queries

**Cons:**
- Defeats the purpose of migration (still spawns subprocess)
- Maintains dual-system complexity
- Database connection issues remain

**Option 3: Gradual Partial Migration**

Migrate only the CSV generation to TypeScript, keep waterfall logic in Python.

**Pros:**
- Smaller scope

**Cons:**
- Creates even more complexity
- Still has Python dependency issues

### Recommendation

**Option 1: Direct Port** is the clear winner. The Layer 3 migration established a solid pattern, and following it exactly for Layer 5 will:
1. Eliminate all Python subprocess spawning for primary automations
2. Use the existing database connection pool
3. Provide consistent error handling and logging
4. Allow eventual cleanup of Python codebase

---

## 6) Clarification

### Decisions Made

1. **Output directory consistency:**
   - Python outputs to `generated_csvs/`
   - TypeScript V2 outputs to `.script-outputs/`
   - **Decision:** Use `.script-outputs/` for consistency with Layer 3 ✅

2. **Waterfall metrics JSON file:**
   - Python generates `waterfall-metrics-{timestamp}.json` for debugging
   - **Decision:** Skip metrics JSON, use structured logging instead (matches Layer 3) ✅

3. **Residual remaining users:**
   - Python generates `residual-remaining-{timestamp}.csv` for users who don't fit any level
   - **Decision:** Skip - after Level 5 all users are captured, no residual needed ✅

4. **Historical appearance filtering:**
   - Python has `check_level_appearance_history()` that queries `push_logs` table
   - **Decision:** Defer until push_logs table is confirmed to exist and be populated ✅

---

## 7) Implementation Tasks

### Phase 1: Query Functions (Day 1)

1. Create `src/lib/queries/waterfallQueries.ts`:
   - `getNewUsersInWindow(pool, minHours, maxDays)` - base audience
   - `checkUsersClosetCompletion(pool, userIds)` - Level 1
   - `checkUsersBioCompletion(pool, userIds)` - Level 2
   - `checkUsersOfferCompletion(pool, userIds)` - Level 3
   - `checkUsersWishlistCompletion(pool, userIds)` - Level 4

2. Create `src/lib/queries/targetShoeQueries.ts`:
   - `getTopTargetShoeForUsers(pool, userIds)` - 4-step fallback lookup

3. Update `src/lib/queries/index.ts` with new exports

### Phase 2: Generator Implementation (Day 2)

1. Create `src/lib/generators/layer5/Layer5WaterfallGenerator.ts`:
   - Extend `BaseAudienceGenerator`
   - Implement `executeGeneration()` with 5-level waterfall
   - Implement `prioritizeWaterfallLevels()` for mutual exclusivity
   - Implement `generateAllCsvFiles()` following Layer 3 pattern

2. Update `src/lib/generators/types.ts`:
   - Add `WaterfallUserRecord` interface
   - Add `WATERFALL_CSV_COLUMNS` constant

### Phase 3: Registration & Testing (Day 3)

1. Update `src/lib/generators/index.ts`:
   - Import `Layer5WaterfallGenerator`
   - Add to registry: `this.register(new Layer5WaterfallGenerator(pool))`
   - Add mapping: `'layer5-waterfall': 'generate_new_user_waterfall'`

2. Local testing:
   - Run with `npm run dev`
   - Trigger waterfall automation via UI
   - Verify CSV output matches Python format
   - Verify founder receives test push

3. Compare outputs:
   - Run Python version, capture CSVs
   - Run TypeScript version, capture CSVs
   - Diff to verify parity

### Phase 4: Production Deployment

1. Commit and push to main
2. Rebuild Docker image: `gcloud builds submit --config cloudbuild.yaml .`
3. Deploy: `gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend`
4. Monitor first scheduled execution (1:05 PM CT daily)
5. Verify CSV generation and push delivery

---

## 8) File-Level Implementation Spec

### New Files

```typescript
// src/lib/queries/waterfallQueries.ts

import { Pool } from 'pg';

interface NewUser {
  user_id: string;
  username: string;
  first_name: string;
  user_size: string | null;
  created_at: Date;
  last_active: string | null;
}

export async function getNewUsersInWindow(
  pool: Pool,
  minHours: number = 12,
  maxDays: number = 14
): Promise<NewUser[]>;

export async function checkUsersClosetCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>>;

export async function checkUsersBioCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>>;

export async function checkUsersOfferCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>>;

export async function checkUsersWishlistCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>>;
```

```typescript
// src/lib/queries/targetShoeQueries.ts

import { Pool } from 'pg';

interface TargetShoeResult {
  user_id: string;
  product_variant_id: string;
  product_name: string;
  source: 'desired_item' | 'recent_offer' | 'wishlist_item' | 'comprehensive_offer_target';
}

export async function getTopTargetShoeForUsers(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, TargetShoeResult>>;
```

```typescript
// src/lib/generators/layer5/Layer5WaterfallGenerator.ts

import { BaseAudienceGenerator } from '../BaseAudienceGenerator';
import { GeneratorOptions, GeneratorResult } from '../types';

export class Layer5WaterfallGenerator extends BaseAudienceGenerator {
  readonly name = 'layer5-waterfall';
  readonly layerId = 5;
  readonly description = 'New user onboarding waterfall notifications';

  protected async executeGeneration(options: GeneratorOptions): Promise<GeneratorResult>;
}
```

### Modified Files

```typescript
// src/lib/generators/types.ts - ADD:

export interface WaterfallUserRecord {
  user_id: string;
  username: string;
  firstName: string;
  new_user_level: number;
  top_target_shoe?: string;
  top_target_shoe_variantid?: string;
  [key: string]: string | number | undefined;
}

export const WATERFALL_CSV_COLUMNS = {
  levels_1_2: ['user_id', 'username', 'firstName', 'new_user_level'],
  levels_3_4_5: ['user_id', 'username', 'firstName', 'new_user_level', 'top_target_shoe', 'top_target_shoe_variantid'],
} as const;
```

```typescript
// src/lib/generators/index.ts - MODIFY:

import { Layer5WaterfallGenerator } from './layer5/Layer5WaterfallGenerator';

// In doInitialize():
this.register(new Layer5WaterfallGenerator(pool));

// In getLegacyScriptId():
const mapping: Record<string, string> = {
  'layer3-behavior': 'generate_layer_3_push_csvs',
  'layer5-waterfall': 'generate_new_user_waterfall',  // ADD THIS
};
```

---

## 9) Success Criteria

1. **Functional parity:** TypeScript generator produces identical CSV format to Python
2. **Mutual exclusivity:** Each user appears in exactly one waterfall level
3. **Target shoe lookup:** Levels 3-5 correctly populate `top_target_shoe` fields
4. **Test CSVs:** Founder-only test CSVs generated for each non-empty level
5. **Registry integration:** `generatorRegistry.has('generate_new_user_waterfall')` returns true
6. **Production execution:** Daily 1:05 PM CT run completes without errors
7. **Push delivery:** Test pushes received during cancellation window

---

## 10) Rollback Plan

If issues occur in production:

1. **Immediate:** Set `AUTOMATION_ENGINE_VERSION=v1` in GCP secrets
2. **Redeploy:** `gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend`
3. **Result:** System falls back to Python waterfall script automatically

No code changes required - the Python script remains in place and functional.
