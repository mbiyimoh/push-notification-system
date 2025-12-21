# Task Breakdown: Layer 5 Waterfall TypeScript Generator

Generated: 2025-12-21
Source: specs/feat-layer5-waterfall-typescript-generator.md

## Overview

Complete the Python-to-TypeScript migration for the New User Waterfall automation (Layer 5). This involves creating waterfall query functions, a target shoe lookup module, the main generator class, and updating the registry for automatic routing.

## Phase 1: Query Functions

### Task 1.1: Create waterfallQueries.ts

**Description**: Implement waterfall-specific database queries for fetching new users and checking onboarding completion
**Size**: Medium
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.2

**Technical Requirements**:
- Create file at `services/push-blaster/src/lib/queries/waterfallQueries.ts`
- Export `NewUser` interface
- Implement 5 query functions with bulk query patterns using `ANY($1::uuid[])`
- All functions must handle empty arrays gracefully
- Add structured logging with `[waterfallQueries]` prefix

**Implementation**:

```typescript
import { Pool } from 'pg';

export interface NewUser {
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
): Promise<NewUser[]> {
  console.log(`[waterfallQueries] Fetching new users (${minHours}h - ${maxDays}d window)`);

  const query = `
    WITH user_size_preferences AS (
      SELECT
        up.user_id,
        av.value AS shoe_size
      FROM user_preferences up
      JOIN attribute_preferences ap ON up.id = ap.user_preference_id
      JOIN attributes a ON ap.attribute_id = a.id
      JOIN attribute_values av ON ap.attribute_value_id = av.id
      WHERE a.name = 'mens_size' AND ap.preferred = TRUE
    )
    SELECT
      u.id as user_id,
      u.username,
      u.first_name,
      usp.shoe_size as user_size,
      u.created_at,
      COALESCE(ua.last_active::text, '') as last_active
    FROM users u
    LEFT JOIN user_size_preferences usp ON u.id = usp.user_id
    LEFT JOIN user_activities ua ON u.id = ua.user_id
    WHERE u.created_at BETWEEN NOW() - INTERVAL '${maxDays} days'
                           AND NOW() - INTERVAL '${minHours} hours'
    AND u.deleted_at = 0
    AND u.first_name IS NOT NULL
    ORDER BY u.created_at DESC
  `;

  const result = await pool.query(query);
  console.log(`[waterfallQueries] Found ${result.rows.length} new users`);
  return result.rows;
}

export async function checkUsersClosetCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>> {
  if (userIds.length === 0) return new Map();

  const query = `
    SELECT DISTINCT user_id
    FROM inventory_items
    WHERE user_id = ANY($1::uuid[])
  `;

  const result = await pool.query(query, [userIds]);
  const usersWithCloset = new Set(result.rows.map(r => r.user_id));

  const completionMap = new Map<string, boolean>();
  for (const userId of userIds) {
    completionMap.set(userId, usersWithCloset.has(userId));
  }

  console.log(`[waterfallQueries] Closet completion: ${result.rows.length}/${userIds.length}`);
  return completionMap;
}

export async function checkUsersBioCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>> {
  if (userIds.length === 0) return new Map();

  const query = `
    SELECT id as user_id
    FROM users
    WHERE id = ANY($1::uuid[])
    AND bio IS NOT NULL
    AND TRIM(bio) != ''
  `;

  const result = await pool.query(query, [userIds]);
  const usersWithBio = new Set(result.rows.map(r => r.user_id));

  const completionMap = new Map<string, boolean>();
  for (const userId of userIds) {
    completionMap.set(userId, usersWithBio.has(userId));
  }

  console.log(`[waterfallQueries] Bio completion: ${result.rows.length}/${userIds.length}`);
  return completionMap;
}

export async function checkUsersOfferCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>> {
  if (userIds.length === 0) return new Map();

  const query = `
    SELECT DISTINCT creator_user_id as user_id
    FROM offers
    WHERE creator_user_id = ANY($1::uuid[])
  `;

  const result = await pool.query(query, [userIds]);
  const usersWithOffers = new Set(result.rows.map(r => r.user_id));

  const completionMap = new Map<string, boolean>();
  for (const userId of userIds) {
    completionMap.set(userId, usersWithOffers.has(userId));
  }

  console.log(`[waterfallQueries] Offer completion: ${result.rows.length}/${userIds.length}`);
  return completionMap;
}

export async function checkUsersWishlistCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>> {
  if (userIds.length === 0) return new Map();

  const query = `
    SELECT DISTINCT user_id
    FROM wishlist_items
    WHERE user_id = ANY($1::uuid[])
    AND deleted_at = 0
  `;

  const result = await pool.query(query, [userIds]);
  const usersWithWishlist = new Set(result.rows.map(r => r.user_id));

  const completionMap = new Map<string, boolean>();
  for (const userId of userIds) {
    completionMap.set(userId, usersWithWishlist.has(userId));
  }

  console.log(`[waterfallQueries] Wishlist completion: ${result.rows.length}/${userIds.length}`);
  return completionMap;
}
```

**Acceptance Criteria**:
- [ ] File created at correct path
- [ ] All 5 functions implemented with correct SQL
- [ ] Empty array handling returns empty Map
- [ ] Bulk query uses `ANY($1::uuid[])` pattern
- [ ] Logging includes function context and counts

---

### Task 1.2: Create targetShoeQueries.ts

**Description**: Implement 4-step fallback target shoe lookup for enriching Level 3-5 users
**Size**: Medium
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.1

**Technical Requirements**:
- Create file at `services/push-blaster/src/lib/queries/targetShoeQueries.ts`
- Export `TargetShoeResult` interface
- Implement 4-step fallback: desired_items → recent_offers → wishlist → comprehensive
- Each step only queries users not yet found
- Handle errors gracefully (warn but continue)

**Implementation**:

```typescript
import { Pool } from 'pg';

export interface TargetShoeResult {
  user_id: string;
  product_variant_id: string;
  product_name: string;
  source: 'desired_item' | 'recent_offer' | 'wishlist_item' | 'comprehensive_offer_target';
}

export async function getTopTargetShoeForUsers(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, TargetShoeResult>> {
  if (userIds.length === 0) return new Map();

  const targetShoes = new Map<string, TargetShoeResult>();

  // Primary: User's Top Desired Item
  const primaryQuery = `
    WITH ranked_desired_items AS (
      SELECT
        di.user_id,
        di.product_variant_id,
        p.name as product_name,
        ROW_NUMBER() OVER(
          PARTITION BY di.user_id
          ORDER BY di.offers_count DESC, di.created_at DESC
        ) as rn
      FROM desired_items di
      JOIN product_variants pv ON di.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE di.user_id = ANY($1::uuid[])
      AND di.deleted_at = 0
    )
    SELECT user_id, product_variant_id, product_name, 'desired_item' as source
    FROM ranked_desired_items
    WHERE rn = 1
  `;

  try {
    const primaryResult = await pool.query(primaryQuery, [userIds]);
    for (const row of primaryResult.rows) {
      targetShoes.set(row.user_id, row as TargetShoeResult);
    }
    console.log(`[targetShoeQueries] Primary (desired_items): ${primaryResult.rows.length} found`);
  } catch (error) {
    console.warn(`[targetShoeQueries] Primary lookup failed:`, error);
  }

  // Secondary: Recent offers for users without desired items
  const usersNeedingFallback = userIds.filter(id => !targetShoes.has(id));

  if (usersNeedingFallback.length > 0) {
    const secondaryQuery = `
      WITH ranked_offers AS (
        SELECT
          o.creator_user_id as user_id,
          oi.product_variant_id,
          p.name as product_name,
          ROW_NUMBER() OVER (
            PARTITION BY o.creator_user_id
            ORDER BY o.created_at DESC
          ) as rn
        FROM offers o
        JOIN offer_items oi ON o.id = oi.offer_id
        JOIN product_variants pv ON oi.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE o.creator_user_id = ANY($1::uuid[])
      )
      SELECT user_id, product_variant_id, product_name, 'recent_offer' as source
      FROM ranked_offers
      WHERE rn = 1
    `;

    try {
      const secondaryResult = await pool.query(secondaryQuery, [usersNeedingFallback]);
      for (const row of secondaryResult.rows) {
        targetShoes.set(row.user_id, row as TargetShoeResult);
      }
      console.log(`[targetShoeQueries] Secondary (recent_offers): ${secondaryResult.rows.length} found`);
    } catch (error) {
      console.warn(`[targetShoeQueries] Secondary lookup failed:`, error);
    }
  }

  // Tertiary: Wishlist items
  const usersStillNeedingFallback = userIds.filter(id => !targetShoes.has(id));

  if (usersStillNeedingFallback.length > 0) {
    const tertiaryQuery = `
      WITH ranked_wishlist AS (
        SELECT
          wi.user_id,
          wi.product_variant_id,
          p.name as product_name,
          ROW_NUMBER() OVER (
            PARTITION BY wi.user_id
            ORDER BY wi.created_at DESC
          ) as rn
        FROM wishlist_items wi
        JOIN product_variants pv ON wi.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE wi.user_id = ANY($1::uuid[])
        AND wi.deleted_at = 0
      )
      SELECT user_id, product_variant_id, product_name, 'wishlist_item' as source
      FROM ranked_wishlist
      WHERE rn = 1
    `;

    try {
      const tertiaryResult = await pool.query(tertiaryQuery, [usersStillNeedingFallback]);
      for (const row of tertiaryResult.rows) {
        targetShoes.set(row.user_id, row as TargetShoeResult);
      }
      console.log(`[targetShoeQueries] Tertiary (wishlist): ${tertiaryResult.rows.length} found`);
    } catch (error) {
      console.warn(`[targetShoeQueries] Tertiary lookup failed:`, error);
    }
  }

  // Quaternary: Comprehensive offer target search
  const usersFinalFallback = userIds.filter(id => !targetShoes.has(id));

  if (usersFinalFallback.length > 0) {
    const quaternaryQuery = `
      WITH all_offer_targets AS (
        SELECT
          o.creator_user_id as user_id,
          oi.product_variant_id,
          p.name as product_name,
          ROW_NUMBER() OVER (
            PARTITION BY o.creator_user_id
            ORDER BY o.created_at DESC
          ) as rn
        FROM offers o
        JOIN offer_items oi ON o.id = oi.offer_id
        LEFT JOIN product_variants pv ON oi.product_variant_id = pv.id
        LEFT JOIN products p ON pv.product_id = p.id
        WHERE o.creator_user_id = ANY($1::uuid[])
        AND oi.product_variant_id IS NOT NULL
      )
      SELECT
        user_id,
        product_variant_id,
        COALESCE(product_name, 'Unknown Product') as product_name,
        'comprehensive_offer_target' as source
      FROM all_offer_targets
      WHERE rn = 1
    `;

    try {
      const quaternaryResult = await pool.query(quaternaryQuery, [usersFinalFallback]);
      for (const row of quaternaryResult.rows) {
        targetShoes.set(row.user_id, row as TargetShoeResult);
      }
      console.log(`[targetShoeQueries] Quaternary (comprehensive): ${quaternaryResult.rows.length} found`);
    } catch (error) {
      console.warn(`[targetShoeQueries] Quaternary lookup failed:`, error);
    }
  }

  console.log(`[targetShoeQueries] Total target shoes found: ${targetShoes.size}/${userIds.length}`);
  return targetShoes;
}
```

**Acceptance Criteria**:
- [ ] 4-step fallback order is correct (desired → offers → wishlist → comprehensive)
- [ ] Each step only queries users not yet found
- [ ] Errors are caught and logged but don't stop execution
- [ ] Final summary shows total found vs requested

---

### Task 1.3: Update queries/index.ts exports

**Description**: Add exports for new waterfall and target shoe query modules
**Size**: Small
**Priority**: High
**Dependencies**: Task 1.1, Task 1.2
**Can run parallel with**: None (depends on 1.1 and 1.2)

**Technical Requirements**:
- Add exports to `services/push-blaster/src/lib/queries/index.ts`
- Export all functions and types from new modules

**Implementation**:

Add to existing `src/lib/queries/index.ts`:

```typescript
export {
  getNewUsersInWindow,
  checkUsersClosetCompletion,
  checkUsersBioCompletion,
  checkUsersOfferCompletion,
  checkUsersWishlistCompletion,
  NewUser,
} from './waterfallQueries';

export {
  getTopTargetShoeForUsers,
  TargetShoeResult,
} from './targetShoeQueries';
```

**Acceptance Criteria**:
- [ ] All functions exported
- [ ] All types exported
- [ ] No import errors when consuming from other modules

---

## Phase 2: Generator Implementation

### Task 2.1: Add waterfall types to types.ts

**Description**: Add WaterfallUserRecord interface and CSV column constants to generator types
**Size**: Small
**Priority**: High
**Dependencies**: None
**Can run parallel with**: Task 1.1, Task 1.2

**Technical Requirements**:
- Add to `services/push-blaster/src/lib/generators/types.ts`
- Define `WaterfallUserRecord` interface with index signature for CsvGenerator
- Define `WATERFALL_CSV_COLUMNS` constant with column arrays for each level type

**Implementation**:

Add to existing `src/lib/generators/types.ts`:

```typescript
// Waterfall user record for Layer 5 CSV output
export interface WaterfallUserRecord {
  user_id: string;
  username: string;
  firstName: string;
  new_user_level: number;
  top_target_shoe?: string;
  top_target_shoe_variantid?: string;
  // Index signature for CsvGenerator compatibility
  [key: string]: string | number | undefined;
}

// CSV column definitions for waterfall levels
export const WATERFALL_CSV_COLUMNS = {
  levels_1_2: ['user_id', 'username', 'firstName', 'new_user_level'],
  levels_3_4_5: ['user_id', 'username', 'firstName', 'new_user_level', 'top_target_shoe', 'top_target_shoe_variantid'],
} as const;
```

**Acceptance Criteria**:
- [ ] WaterfallUserRecord has all required fields
- [ ] Index signature allows dynamic property access
- [ ] Column arrays match Python CSV output order exactly

---

### Task 2.2: Create Layer5WaterfallGenerator.ts

**Description**: Implement the main generator class with waterfall extraction and CSV generation
**Size**: Large
**Priority**: High
**Dependencies**: Task 1.1, Task 1.2, Task 1.3, Task 2.1
**Can run parallel with**: None

**Technical Requirements**:
- Create file at `services/push-blaster/src/lib/generators/layer5/Layer5WaterfallGenerator.ts`
- Extend `BaseAudienceGenerator`
- Implement `executeGeneration()` with 5-level waterfall
- Use atomic writes (temp files + rename) for CSV generation
- Include rollback on failure
- Use `FOUNDER_TEST_USER` for test CSVs

**Implementation**:

See full implementation in spec file (lines 502-817). Key structure:

```typescript
import { Pool } from 'pg';
import { BaseAudienceGenerator } from '../BaseAudienceGenerator';
import { CsvGenerator } from '../CsvGenerator';
import {
  GeneratorOptions,
  GeneratorResult,
  CsvFileResult,
  WaterfallUserRecord,
  WATERFALL_CSV_COLUMNS,
  FOUNDER_TEST_USER,
} from '../types';
import {
  getNewUsersInWindow,
  checkUsersClosetCompletion,
  checkUsersBioCompletion,
  checkUsersOfferCompletion,
  checkUsersWishlistCompletion,
  NewUser,
} from '../../queries/waterfallQueries';
import { getTopTargetShoeForUsers } from '../../queries/targetShoeQueries';

type WaterfallLevel = 1 | 2 | 3 | 4 | 5;

interface LevelConfig {
  level: WaterfallLevel;
  name: string;
  prefix: string;
  includesTargetShoe: boolean;
}

const LEVEL_CONFIGS: LevelConfig[] = [
  { level: 1, name: 'No Shoes', prefix: 'no-shoes-new-user', includesTargetShoe: false },
  { level: 2, name: 'No Bio', prefix: 'no-bio-new-user', includesTargetShoe: false },
  { level: 3, name: 'No Offers', prefix: 'no-offers-new-user', includesTargetShoe: true },
  { level: 4, name: 'No Wishlist', prefix: 'no-wishlist-new-user', includesTargetShoe: true },
  { level: 5, name: 'New Stars', prefix: 'new-stars-new-user', includesTargetShoe: true },
];

export class Layer5WaterfallGenerator extends BaseAudienceGenerator {
  readonly name = 'layer5-waterfall';
  readonly layerId = 5;
  readonly description = 'New user onboarding waterfall notifications';

  private csvGenerator: CsvGenerator;

  constructor(pool: Pool) {
    super(pool);
    this.csvGenerator = new CsvGenerator();
  }

  protected async executeGeneration(options: GeneratorOptions): Promise<GeneratorResult> {
    // Full implementation as specified in spec
  }

  private async extractWaterfallLevels(baseUsers: NewUser[]): Promise<Record<WaterfallLevel, WaterfallUserRecord[]>> {
    // Sequential extraction with mutual exclusivity
  }

  private toWaterfallRecord(user: NewUser, level: WaterfallLevel): WaterfallUserRecord { ... }
  private toWaterfallRecordWithShoe(...): WaterfallUserRecord { ... }
  private async generateAllCsvFiles(...): Promise<CsvFileResult[]> { ... }
  private createTestRecord(...): WaterfallUserRecord { ... }
}
```

**Acceptance Criteria**:
- [ ] Extends BaseAudienceGenerator correctly
- [ ] Uses minHours=12, maxDays=14 as defaults
- [ ] Waterfall extraction is mutually exclusive
- [ ] Levels 3-5 get target shoe enrichment
- [ ] Empty levels produce no CSV files
- [ ] Atomic writes with rollback on failure
- [ ] Dry run mode skips CSV generation
- [ ] Test CSVs use FOUNDER_TEST_USER

---

### Task 2.3: Register generator in index.ts

**Description**: Add Layer5WaterfallGenerator to the generator registry
**Size**: Small
**Priority**: High
**Dependencies**: Task 2.2
**Can run parallel with**: None

**Technical Requirements**:
- Modify `services/push-blaster/src/lib/generators/index.ts`
- Import Layer5WaterfallGenerator
- Register in doInitialize()
- Add legacy script ID mapping

**Implementation**:

```typescript
// Add import
import { Layer5WaterfallGenerator } from './layer5/Layer5WaterfallGenerator';

// Add to exports
export { Layer5WaterfallGenerator } from './layer5/Layer5WaterfallGenerator';

// In doInitialize() method, after Layer3 registration:
this.register(new Layer5WaterfallGenerator(pool));

// In getLegacyScriptId() method:
const mapping: Record<string, string> = {
  'layer3-behavior': 'generate_layer_3_push_csvs',
  'layer5-waterfall': 'generate_new_user_waterfall',  // ADD THIS
};
```

**Acceptance Criteria**:
- [ ] Import added at top of file
- [ ] Export added
- [ ] Registration in doInitialize()
- [ ] Legacy mapping added for 'generate_new_user_waterfall'
- [ ] `generatorRegistry.has('generate_new_user_waterfall')` returns true

---

## Phase 3: Testing & Validation

### Task 3.1: Manual Local Testing

**Description**: Test the generator locally with real database
**Size**: Medium
**Priority**: High
**Dependencies**: Task 2.3
**Can run parallel with**: None

**Technical Requirements**:
- Connect to VPN
- Start local dev server
- Trigger waterfall automation
- Verify CSV output

**Steps**:
1. Connect to Tradeblock VPN
2. Start local dev server: `cd services/push-blaster && npx dotenv -e ../../.env -- npm run dev`
3. Navigate to waterfall automation in UI
4. Click "Run Now" to trigger execution
5. Watch terminal for `[layer5-waterfall]` logs
6. Verify CSV files in `.script-outputs/`:
   - `no-shoes-new-user-{timestamp}.csv`
   - `no-bio-new-user-{timestamp}.csv`
   - `no-offers-new-user-{timestamp}.csv`
   - `no-wishlist-new-user-{timestamp}.csv`
   - `new-stars-new-user-{timestamp}.csv`
   - Plus corresponding `-test-` versions
7. Verify CSV column headers match Python output
8. Verify founder receives test push notifications

**Acceptance Criteria**:
- [ ] Generator executes without errors
- [ ] CSV files created in correct location
- [ ] Column headers match Python format
- [ ] Test pushes received on founder device

---

### Task 3.2: Compare with Python Output

**Description**: Verify TypeScript output matches Python for same time window
**Size**: Small
**Priority**: Medium
**Dependencies**: Task 3.1
**Can run parallel with**: None

**Steps**:
1. Run Python version manually to capture output
2. Run TypeScript version
3. Compare CSV formats and row counts
4. Verify mutual exclusivity (no user in multiple levels)

**Acceptance Criteria**:
- [ ] Same CSV column format
- [ ] Comparable audience sizes
- [ ] Mutual exclusivity maintained

---

## Phase 4: Production Deployment

### Task 4.1: Commit and Deploy

**Description**: Deploy the implementation to production
**Size**: Small
**Priority**: High
**Dependencies**: Task 3.1, Task 3.2
**Can run parallel with**: None

**Steps**:
1. Commit changes: `git add . && git commit -m "feat: Add TypeScript Layer 5 Waterfall Generator"`
2. Push to main: `git push origin main`
3. Rebuild Docker image: `gcloud builds submit --config cloudbuild.yaml .`
4. Deploy: `gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend`
5. Wait ~3 minutes for deployment
6. Verify health: `curl https://push.tradeblock.us/api/health | jq`

**Acceptance Criteria**:
- [ ] Changes committed and pushed
- [ ] Docker image rebuilt
- [ ] Deployment successful
- [ ] Health check passes

---

### Task 4.2: Monitor First Execution

**Description**: Monitor the first scheduled execution at 1:05 PM CT
**Size**: Small
**Priority**: High
**Dependencies**: Task 4.1
**Can run parallel with**: None

**Steps**:
1. Wait for 1:05 PM CT scheduled execution
2. Monitor logs in GCP or via `kubectl logs`
3. Verify execution completes successfully
4. Check CSV files generated
5. Verify push notifications delivered

**Acceptance Criteria**:
- [ ] Execution completes without errors
- [ ] CSV files generated correctly
- [ ] Push notifications delivered
- [ ] No Python fallback triggered

---

## Summary

| Phase | Tasks | Can Parallelize |
|-------|-------|-----------------|
| Phase 1 | 1.1, 1.2, 1.3 | 1.1 and 1.2 can run in parallel |
| Phase 2 | 2.1, 2.2, 2.3 | 2.1 can run parallel with Phase 1 |
| Phase 3 | 3.1, 3.2 | Sequential |
| Phase 4 | 4.1, 4.2 | Sequential |

**Total Tasks**: 9
**Critical Path**: 1.1 → 1.3 → 2.2 → 2.3 → 3.1 → 4.1 → 4.2
