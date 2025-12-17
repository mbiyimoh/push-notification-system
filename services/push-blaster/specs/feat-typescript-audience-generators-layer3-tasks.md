# Task Breakdown: TypeScript-Native Automation Engine - Layer 3 Generator

**Generated:** 2025-11-28
**Source:** specs/feat-typescript-audience-generators-layer3.md

---

## Overview

Build TypeScript-native audience generation to replace Python scripts that fail due to Railway IP blocking. This breakdown covers foundation infrastructure (types, base classes, CSV utility, query modules) plus the Layer 3 Behavior Response Generator.

**Total Tasks:** 12
**Phases:** 5
**Parallel Opportunities:** Tasks 1.1-1.2, Tasks 2.1-2.3, Tasks 4.1-4.2

---

## Phase 1: Foundation

### Task 1.1: Install Dependencies and Create Directory Structure
**Description:** Install fast-csv and zod dependencies, create generators/ and queries/ directory structure
**Size:** Small
**Priority:** High
**Dependencies:** None
**Can run parallel with:** Task 1.2

**Technical Requirements:**
- Install `fast-csv` ^5.0.2 for streaming CSV generation
- Install `zod` ^3.24.0 for runtime type validation
- Install `@types/fast-csv` as dev dependency
- Create directory structure:
  ```
  src/lib/generators/
  src/lib/generators/layer3/
  src/lib/queries/
  ```

**Implementation Steps:**
1. Navigate to services/push-blaster
2. Run: `npm install fast-csv zod && npm install -D @types/fast-csv`
3. Create directories: `mkdir -p src/lib/generators/layer3 src/lib/queries`

**Acceptance Criteria:**
- [ ] `fast-csv` and `zod` appear in package.json dependencies
- [ ] `@types/fast-csv` appears in devDependencies
- [ ] Directory structure exists: generators/, generators/layer3/, queries/
- [ ] `npm run build` succeeds without new errors

---

### Task 1.2: Implement types.ts - Core Interfaces and Schemas
**Description:** Create src/lib/generators/types.ts with all TypeScript interfaces, Zod schemas, and constants
**Size:** Medium
**Priority:** High
**Dependencies:** Task 1.1
**Can run parallel with:** None (blocks 1.3, 1.4)

**Technical Requirements:**
- Zod schema for GeneratorOptions with defaults
- TypeScript interfaces for GeneratorResult, CsvFileResult, ActivityRecord, EnrichedUserRecord
- CSV_COLUMNS constant defining column order per action type
- FOUNDER_TEST_USER constant for test CSV generation

**Implementation - Full Code:**

```typescript
// src/lib/generators/types.ts

import { z } from 'zod';

// Generator options schema with validation and defaults
export const GeneratorOptionsSchema = z.object({
  lookbackHours: z.number().default(48),
  coolingHours: z.number().default(12),
  outputDir: z.string().default('.script-outputs'),
  dryRun: z.boolean().default(false),
  automationId: z.string().optional(),
});

export type GeneratorOptions = z.infer<typeof GeneratorOptionsSchema>;

// Generator result returned after execution
export interface GeneratorResult {
  success: boolean;
  csvFiles: CsvFileResult[];
  audienceSize: number;
  executionTimeMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface CsvFileResult {
  path: string;
  rowCount: number;
  isTestFile: boolean;
  audienceType: string;
}

// Activity data from database queries
export interface ActivityRecord {
  user_id: string;
  action_type: 'offer_created' | 'closet_add' | 'wishlist_add';
  product_name: string;
  variant_id: string;
  created_at: Date;
}

// Enriched user record for CSV output
export interface EnrichedUserRecord {
  user_id: string;
  username: string;
  firstName: string;
  usersize: string;
  relevant_variant_size: string;
  product_name: string;
  variantID: string;
  lastActive: string;
  inventory_count?: number;
  wishlist_count?: number;
}

// CSV column definitions per audience type - ORDER MATTERS for Python parity
export const CSV_COLUMNS = {
  offer_created: [
    'user_id', 'username', 'firstName', 'usersize',
    'relevant_variant_size', 'product_name', 'variantID',
    'lastActive', 'inventory_count'
  ],
  closet_add: [
    'user_id', 'username', 'firstName', 'usersize',
    'relevant_variant_size', 'product_name', 'variantID',
    'lastActive', 'wishlist_count'
  ],
  wishlist_add: [
    'user_id', 'username', 'firstName', 'usersize',
    'relevant_variant_size', 'product_name', 'variantID',
    'lastActive', 'inventory_count'
  ],
} as const;

// Test user constant - founder account for safe testing
export const FOUNDER_TEST_USER = {
  user_id: '0e54067c-4c0e-4e4a-8a23-a47661578059',
  username: 'beems',
  firstName: 'Mbiyimoh',
  usersize: '13',
} as const;
```

**Acceptance Criteria:**
- [ ] File compiles without TypeScript errors
- [ ] GeneratorOptionsSchema.parse({}) returns defaults correctly
- [ ] CSV_COLUMNS matches Python script column order exactly
- [ ] FOUNDER_TEST_USER.user_id is the correct founder UUID

---

### Task 1.3: Implement BaseAudienceGenerator.ts - Abstract Base Class
**Description:** Create abstract base class with generate() entry point, validation, logging, and error handling
**Size:** Medium
**Priority:** High
**Dependencies:** Task 1.2
**Can run parallel with:** Task 1.4

**Technical Requirements:**
- Abstract class with name, layerId, description properties
- Constructor accepts pg Pool
- generate() method validates options, times execution, handles errors
- Template method pattern: subclasses implement executeGeneration()
- validate() method tests database connectivity

**Implementation - Full Code:**

```typescript
// src/lib/generators/BaseAudienceGenerator.ts

import { Pool } from 'pg';
import { GeneratorOptions, GeneratorResult, GeneratorOptionsSchema } from './types';

export abstract class BaseAudienceGenerator {
  abstract readonly name: string;
  abstract readonly layerId: number;
  abstract readonly description: string;

  constructor(protected pool: Pool) {}

  /**
   * Main entry point - validates options and executes generation
   */
  async generate(options: Partial<GeneratorOptions>): Promise<GeneratorResult> {
    const startTime = Date.now();

    try {
      // Validate options with defaults
      const validatedOptions = GeneratorOptionsSchema.parse(options);

      console.log(`[${this.name}] Starting generation with options:`, {
        lookbackHours: validatedOptions.lookbackHours,
        coolingHours: validatedOptions.coolingHours,
        dryRun: validatedOptions.dryRun,
      });

      // Template method pattern - subclasses implement executeGeneration
      const result = await this.executeGeneration(validatedOptions);

      result.executionTimeMs = Date.now() - startTime;

      console.log(`[${this.name}] Completed in ${result.executionTimeMs}ms:`, {
        success: result.success,
        audienceSize: result.audienceSize,
        fileCount: result.csvFiles.length,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[${this.name}] Generation failed:`, errorMessage);

      return {
        success: false,
        csvFiles: [],
        audienceSize: 0,
        executionTimeMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Subclasses implement this method with their specific logic
   */
  protected abstract executeGeneration(options: GeneratorOptions): Promise<GeneratorResult>;

  /**
   * Validate generator is properly configured
   */
  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Test database connectivity
    try {
      await this.pool.query('SELECT 1');
    } catch (e) {
      errors.push(`Database connection failed: ${e}`);
    }

    return { valid: errors.length === 0, errors };
  }
}
```

**Acceptance Criteria:**
- [ ] Abstract class compiles without errors
- [ ] generate() returns error result on exception (doesn't throw)
- [ ] Execution time is correctly calculated in result
- [ ] Logs show phase transitions with timing
- [ ] validate() returns errors array if DB unreachable

---

### Task 1.4: Implement CsvGenerator.ts - Streaming CSV Utility
**Description:** Create CSV generator utility using fast-csv with streaming for memory efficiency
**Size:** Small
**Priority:** High
**Dependencies:** Task 1.1
**Can run parallel with:** Task 1.3

**Technical Requirements:**
- Uses fast-csv format() for streaming
- Creates output directory if not exists
- Writes only specified columns in correct order
- Handles undefined values as empty strings
- Promise-based API

**Implementation - Full Code:**

```typescript
// src/lib/generators/CsvGenerator.ts

import * as fs from 'fs';
import * as path from 'path';
import { format } from 'fast-csv';

export class CsvGenerator {
  /**
   * Write records to CSV file using streaming for memory efficiency
   */
  async writeRecords<T extends Record<string, unknown>>(
    filePath: string,
    records: T[],
    columns: readonly string[]
  ): Promise<void> {
    // Ensure output directory exists
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });

    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);
      const csvStream = format({ headers: columns as string[] });

      csvStream.pipe(writeStream);

      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      csvStream.on('error', reject);

      for (const record of records) {
        // Extract only specified columns in order
        const row = columns.reduce((acc, col) => {
          acc[col] = record[col] ?? '';
          return acc;
        }, {} as Record<string, unknown>);

        csvStream.write(row);
      }

      csvStream.end();
    });
  }
}
```

**Acceptance Criteria:**
- [ ] Creates directory if not exists
- [ ] Writes header row with column names
- [ ] Columns appear in specified order
- [ ] Undefined/null values become empty strings
- [ ] File is valid CSV parseable by papaparse

---

## Phase 2: Query Layer

### Task 2.1: Implement activityQueries.ts - Daily Activity Data
**Description:** Create getDailyActivityData() function with UNION ALL query for closet adds, wishlist adds, and offer creations
**Size:** Large
**Priority:** High
**Dependencies:** Task 1.2
**Can run parallel with:** Task 2.2, Task 2.3

**Technical Requirements:**
- Query combines 3 activity types with UNION ALL
- Applies lookback and cooling hour filters
- For offers: uses ROW_NUMBER to get first item only (multi-item offers)
- Filters out deleted users (u.deleted_at = 0)
- Returns ActivityRecord[] typed array

**Implementation - Full Code:**

```typescript
// src/lib/queries/activityQueries.ts

import { Pool } from 'pg';
import { ActivityRecord } from '../generators/types';

/**
 * Fetch recent high-intent user activity (offers, closet adds, wishlist adds)
 * Time window: (now - lookbackHours) to (now - coolingHours)
 * The cooling period prevents spamming users who just performed actions
 */
export async function getDailyActivityData(
  pool: Pool,
  lookbackHours: number,
  coolingHours: number
): Promise<ActivityRecord[]> {
  const effectiveLookback = lookbackHours - coolingHours;

  const query = `
    WITH recent_activity AS (
      -- Recent closet adds
      SELECT
        ii.user_id,
        'closet_add'::text as action_type,
        p.name as product_name,
        ii.product_variant_id as variant_id,
        ii.created_at
      FROM inventory_items ii
      JOIN product_variants pv ON ii.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN users u ON ii.user_id = u.id
      WHERE ii.created_at >= NOW() - INTERVAL '${effectiveLookback} hours'
        AND ii.created_at < NOW() - INTERVAL '${coolingHours} hours'
        AND ii.status = 'OPEN_FOR_TRADE'
        AND u.deleted_at = 0

      UNION ALL

      -- Recent wishlist adds
      SELECT
        wi.user_id,
        'wishlist_add'::text as action_type,
        p.name as product_name,
        wi.product_variant_id as variant_id,
        wi.created_at
      FROM wishlist_items wi
      JOIN product_variants pv ON wi.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN users u ON wi.user_id = u.id
      WHERE wi.created_at >= NOW() - INTERVAL '${effectiveLookback} hours'
        AND wi.created_at < NOW() - INTERVAL '${coolingHours} hours'
        AND wi.deleted_at = 0
        AND u.deleted_at = 0

      UNION ALL

      -- Recent offer creations (first item only for multi-item offers)
      SELECT
        o.creator_user_id as user_id,
        'offer_created'::text as action_type,
        p.name as product_name,
        oi.product_variant_id as variant_id,
        o.created_at
      FROM (
        SELECT o.*,
          ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY oi.id ASC) as item_rank,
          oi.product_variant_id,
          oi.id as oi_id
        FROM offers o
        JOIN offer_items oi ON o.id = oi.offer_id
        WHERE o.created_at >= NOW() - INTERVAL '${effectiveLookback} hours'
          AND o.created_at < NOW() - INTERVAL '${coolingHours} hours'
      ) o
      JOIN product_variants pv ON o.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN users u ON o.creator_user_id = u.id
      WHERE o.item_rank = 1
        AND u.deleted_at = 0
    )
    SELECT * FROM recent_activity
    ORDER BY created_at DESC
  `;

  const result = await pool.query(query);
  return result.rows as ActivityRecord[];
}
```

**Acceptance Criteria:**
- [ ] Query returns all 3 action types: offer_created, closet_add, wishlist_add
- [ ] Multi-item offers return only first item (item_rank = 1)
- [ ] Deleted users are excluded
- [ ] Time window respects both lookback and cooling hours
- [ ] Query executes in < 10 seconds on production data

---

### Task 2.2: Implement userQueries.ts - User Profile Bulk Lookup
**Description:** Create getUserProfilesByIds() function with CTE for user size preferences
**Size:** Medium
**Priority:** High
**Dependencies:** Task 1.2
**Can run parallel with:** Task 2.1, Task 2.3

**Technical Requirements:**
- Bulk lookup using ANY($1::uuid[]) for array parameter
- CTE to extract shoe size from user_preferences/attribute_preferences
- LEFT JOINs to handle missing preferences/activity gracefully
- Returns Map<string, UserProfile> for O(1) lookups

**Implementation - Full Code:**

```typescript
// src/lib/queries/userQueries.ts

import { Pool } from 'pg';

interface UserProfile {
  user_id: string;
  username: string;
  first_name: string;
  user_size: string;
  last_active: string;
}

/**
 * Fetch user profiles for a list of user IDs
 * Uses bulk query with ANY() to avoid N+1 problem
 */
export async function getUserProfilesByIds(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, UserProfile>> {
  if (userIds.length === 0) return new Map();

  const query = `
    WITH user_size_preferences AS (
      SELECT
        up.user_id,
        av.value AS shoe_size
      FROM user_preferences up
      JOIN attribute_preferences ap ON up.id = ap.user_preference_id
      JOIN attributes a ON ap.attribute_id = a.id
      JOIN attribute_values av ON ap.attribute_value_id = av.id
      WHERE a.name = 'mens_size'
        AND ap.preferred = TRUE
    )
    SELECT
      u.id as user_id,
      u.username,
      u.first_name,
      COALESCE(usp.shoe_size, '') as user_size,
      COALESCE(ua.last_active::text, '') as last_active
    FROM users u
    LEFT JOIN user_size_preferences usp ON u.id = usp.user_id
    LEFT JOIN user_activities ua ON u.id = ua.user_id
    WHERE u.id = ANY($1::uuid[])
      AND u.deleted_at = 0
  `;

  const result = await pool.query(query, [userIds]);

  const profileMap = new Map<string, UserProfile>();
  for (const row of result.rows) {
    profileMap.set(row.user_id, row as UserProfile);
  }

  return profileMap;
}
```

**Acceptance Criteria:**
- [ ] Empty userIds array returns empty Map (no query executed)
- [ ] Returns Map with O(1) lookup by user_id
- [ ] Missing preferences return empty string, not null
- [ ] Deleted users are excluded from results

---

### Task 2.3: Implement variantQueries.ts - Variant Statistics Bulk Lookups
**Description:** Create bulk lookup functions for variant sizes, inventory counts, and wishlist counts
**Size:** Medium
**Priority:** High
**Dependencies:** Task 1.2
**Can run parallel with:** Task 2.1, Task 2.2

**Technical Requirements:**
- Three functions: getBulkVariantSizes, getBulkInventoryCounts, getBulkWishlistCounts
- All use ANY($1::uuid[]) for bulk parameter binding
- Return Map<string, T> for O(1) lookups
- Handle empty arrays without querying

**Implementation - Full Code:**

```typescript
// src/lib/queries/variantQueries.ts

import { Pool } from 'pg';

/**
 * Fetch sizes for multiple variants in bulk
 * Size is extracted from index_cache JSONB field
 */
export async function getBulkVariantSizes(
  pool: Pool,
  variantIds: string[]
): Promise<Map<string, string>> {
  if (variantIds.length === 0) return new Map();

  const query = `
    SELECT
      pv.id as variant_id,
      COALESCE(pv.index_cache->>'mens_size', 'Unknown') as size
    FROM product_variants pv
    WHERE pv.id = ANY($1::uuid[])
  `;

  const result = await pool.query(query, [variantIds]);

  const sizeMap = new Map<string, string>();
  for (const row of result.rows) {
    sizeMap.set(row.variant_id, row.size);
  }

  return sizeMap;
}

/**
 * Fetch inventory counts for multiple variants in bulk
 * Counts only OPEN_FOR_TRADE items from non-deleted users
 */
export async function getBulkInventoryCounts(
  pool: Pool,
  variantIds: string[]
): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();

  const query = `
    SELECT
      ii.product_variant_id as variant_id,
      COUNT(*)::int as inventory_count
    FROM inventory_items ii
    JOIN users u ON ii.user_id = u.id
    WHERE ii.product_variant_id = ANY($1::uuid[])
      AND ii.status = 'OPEN_FOR_TRADE'
      AND u.deleted_at = 0
    GROUP BY ii.product_variant_id
  `;

  const result = await pool.query(query, [variantIds]);

  const countMap = new Map<string, number>();
  for (const row of result.rows) {
    countMap.set(row.variant_id, row.inventory_count);
  }

  return countMap;
}

/**
 * Fetch wishlist counts for multiple variants in bulk
 * Counts only non-deleted wishlist items from non-deleted users
 */
export async function getBulkWishlistCounts(
  pool: Pool,
  variantIds: string[]
): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();

  const query = `
    SELECT
      wi.product_variant_id as variant_id,
      COUNT(*)::int as wishlist_count
    FROM wishlist_items wi
    JOIN users u ON wi.user_id = u.id
    WHERE wi.product_variant_id = ANY($1::uuid[])
      AND wi.deleted_at = 0
      AND u.deleted_at = 0
    GROUP BY wi.product_variant_id
  `;

  const result = await pool.query(query, [variantIds]);

  const countMap = new Map<string, number>();
  for (const row of result.rows) {
    countMap.set(row.variant_id, row.wishlist_count);
  }

  return countMap;
}
```

**Acceptance Criteria:**
- [ ] All three functions return empty Map for empty input (no query)
- [ ] Variant sizes default to 'Unknown' if index_cache missing
- [ ] Inventory counts exclude deleted users and non-OPEN_FOR_TRADE items
- [ ] Wishlist counts exclude deleted items and deleted users

---

### Task 2.4: Create Query Barrel Exports
**Description:** Create src/lib/queries/index.ts barrel file exporting all query functions
**Size:** Small
**Priority:** High
**Dependencies:** Task 2.1, 2.2, 2.3

**Implementation - Full Code:**

```typescript
// src/lib/queries/index.ts

export { getDailyActivityData } from './activityQueries';
export { getUserProfilesByIds } from './userQueries';
export {
  getBulkVariantSizes,
  getBulkInventoryCounts,
  getBulkWishlistCounts,
} from './variantQueries';
```

**Acceptance Criteria:**
- [ ] All query functions importable from '../queries'
- [ ] TypeScript compiles without errors

---

## Phase 3: Layer 3 Generator

### Task 3.1: Implement Layer3BehaviorGenerator.ts - Core Generator
**Description:** Implement the complete Layer 3 generator with prioritization, enrichment, filtering, and CSV generation
**Size:** Large
**Priority:** High
**Dependencies:** Tasks 1.2, 1.3, 1.4, 2.1-2.4

**Technical Requirements:**
- Extends BaseAudienceGenerator
- 6-step pipeline: fetch activity → prioritize → group → enrich → filter → generate CSV
- Priority order: offer_created > closet_add > wishlist_add (each user in ONE file only)
- Demand filtering thresholds: offer_created/wishlist_add need inventory >= 3, closet_add needs wishlist >= 2
- Generates 6 CSV files: 3 production + 3 test (founder only)

**Implementation - Full Code:**

```typescript
// src/lib/generators/layer3/Layer3BehaviorGenerator.ts

import { Pool } from 'pg';
import { BaseAudienceGenerator } from '../BaseAudienceGenerator';
import { CsvGenerator } from '../CsvGenerator';
import {
  GeneratorOptions,
  GeneratorResult,
  ActivityRecord,
  EnrichedUserRecord,
  CsvFileResult,
  CSV_COLUMNS,
  FOUNDER_TEST_USER,
} from '../types';
import {
  getDailyActivityData,
  getUserProfilesByIds,
  getBulkVariantSizes,
  getBulkInventoryCounts,
  getBulkWishlistCounts,
} from '../../queries';

type ActionType = 'offer_created' | 'closet_add' | 'wishlist_add';

// Priority order: higher intent actions take precedence
const ACTION_PRIORITY: Record<ActionType, number> = {
  offer_created: 3,  // Highest intent
  closet_add: 2,     // Medium intent
  wishlist_add: 1,   // Lower intent
};

export class Layer3BehaviorGenerator extends BaseAudienceGenerator {
  readonly name = 'layer3-behavior';
  readonly layerId = 3;
  readonly description = 'Behavior-responsive push notifications for recent user activity';

  private csvGenerator: CsvGenerator;

  constructor(pool: Pool) {
    super(pool);
    this.csvGenerator = new CsvGenerator();
  }

  protected async executeGeneration(options: GeneratorOptions): Promise<GeneratorResult> {
    const { lookbackHours, coolingHours, outputDir, dryRun } = options;

    // Step 1: Fetch all recent activity
    console.log(`[${this.name}] Fetching activity data (${lookbackHours - coolingHours}h window)...`);
    const activityData = await getDailyActivityData(this.pool, lookbackHours, coolingHours);

    if (!activityData.length) {
      console.log(`[${this.name}] No activity found in time window`);
      return {
        success: true,
        csvFiles: [],
        audienceSize: 0,
        executionTimeMs: 0,
        metadata: { reason: 'no_activity' },
      };
    }

    console.log(`[${this.name}] Found ${activityData.length} activity records`);

    // Step 2: Prioritize - each user appears in only ONE output
    const prioritized = this.prioritizeUserActions(activityData);
    console.log(`[${this.name}] Prioritized to ${prioritized.size} unique users`);

    // Step 3: Group by action type
    const grouped = this.groupByActionType(prioritized);

    // Step 4: Enrich each group with user profiles and variant stats
    const enrichedGroups = await this.enrichAllGroups(grouped);

    // Step 5: Apply demand filtering
    const filteredGroups = this.applyDemandFiltering(enrichedGroups);

    // Calculate total audience size
    const totalAudienceSize = Object.values(filteredGroups)
      .reduce((sum, group) => sum + group.length, 0);

    if (dryRun) {
      console.log(`[${this.name}] Dry run - skipping CSV generation`);
      return {
        success: true,
        csvFiles: [],
        audienceSize: totalAudienceSize,
        executionTimeMs: 0,
        metadata: {
          offer_created: filteredGroups.offer_created.length,
          closet_add: filteredGroups.closet_add.length,
          wishlist_add: filteredGroups.wishlist_add.length,
        },
      };
    }

    // Step 6: Generate CSV files
    const csvFiles = await this.generateAllCsvFiles(filteredGroups, outputDir);

    return {
      success: true,
      csvFiles,
      audienceSize: totalAudienceSize,
      executionTimeMs: 0,
    };
  }

  /**
   * Ensure each user appears in only one output file based on highest-priority action
   */
  private prioritizeUserActions(
    activities: ActivityRecord[]
  ): Map<string, ActivityRecord> {
    const userBestAction = new Map<string, ActivityRecord>();

    for (const activity of activities) {
      const existing = userBestAction.get(activity.user_id);

      if (!existing) {
        userBestAction.set(activity.user_id, activity);
      } else {
        // Keep higher priority action
        const existingPriority = ACTION_PRIORITY[existing.action_type];
        const newPriority = ACTION_PRIORITY[activity.action_type];

        if (newPriority > existingPriority) {
          userBestAction.set(activity.user_id, activity);
        }
      }
    }

    return userBestAction;
  }

  /**
   * Group prioritized activities by action type
   */
  private groupByActionType(
    prioritized: Map<string, ActivityRecord>
  ): Record<ActionType, ActivityRecord[]> {
    const groups: Record<ActionType, ActivityRecord[]> = {
      offer_created: [],
      closet_add: [],
      wishlist_add: [],
    };

    for (const activity of prioritized.values()) {
      groups[activity.action_type].push(activity);
    }

    return groups;
  }

  /**
   * Enrich all groups with user profiles and variant statistics
   */
  private async enrichAllGroups(
    groups: Record<ActionType, ActivityRecord[]>
  ): Promise<Record<ActionType, EnrichedUserRecord[]>> {
    const result: Record<ActionType, EnrichedUserRecord[]> = {
      offer_created: [],
      closet_add: [],
      wishlist_add: [],
    };

    for (const [actionType, activities] of Object.entries(groups) as [ActionType, ActivityRecord[]][]) {
      if (activities.length === 0) continue;

      const userIds = activities.map(a => a.user_id);
      const variantIds = activities.map(a => a.variant_id);

      // Fetch user profiles
      const userProfiles = await getUserProfilesByIds(this.pool, userIds);

      // Fetch variant sizes
      const variantSizes = await getBulkVariantSizes(this.pool, variantIds);

      // Fetch inventory or wishlist counts based on action type
      let inventoryCounts: Map<string, number> = new Map();
      let wishlistCounts: Map<string, number> = new Map();

      if (actionType === 'closet_add') {
        wishlistCounts = await getBulkWishlistCounts(this.pool, variantIds);
      } else {
        inventoryCounts = await getBulkInventoryCounts(this.pool, variantIds);
      }

      // Build enriched records
      result[actionType] = activities.map(activity => {
        const profile = userProfiles.get(activity.user_id);

        return {
          user_id: activity.user_id,
          username: profile?.username ?? '',
          firstName: profile?.first_name ?? '',
          usersize: profile?.user_size ?? '',
          relevant_variant_size: variantSizes.get(activity.variant_id) ?? 'Unknown',
          product_name: activity.product_name,
          variantID: activity.variant_id,
          lastActive: profile?.last_active ?? '',
          inventory_count: inventoryCounts.get(activity.variant_id),
          wishlist_count: wishlistCounts.get(activity.variant_id),
        };
      });
    }

    return result;
  }

  /**
   * Apply demand-based filtering to ensure compelling notifications
   */
  private applyDemandFiltering(
    groups: Record<ActionType, EnrichedUserRecord[]>
  ): Record<ActionType, EnrichedUserRecord[]> {
    const filtered: Record<ActionType, EnrichedUserRecord[]> = {
      offer_created: [],
      closet_add: [],
      wishlist_add: [],
    };

    // offer_created: Remove if inventory_count < 3
    filtered.offer_created = groups.offer_created.filter(
      r => (r.inventory_count ?? 0) >= 3
    );

    // closet_add: Remove if wishlist_count < 2
    filtered.closet_add = groups.closet_add.filter(
      r => (r.wishlist_count ?? 0) >= 2
    );

    // wishlist_add: Remove if inventory_count < 3
    filtered.wishlist_add = groups.wishlist_add.filter(
      r => (r.inventory_count ?? 0) >= 3
    );

    // Log filtering results
    for (const [type, records] of Object.entries(filtered) as [ActionType, EnrichedUserRecord[]][]) {
      const before = groups[type].length;
      const after = records.length;
      if (before !== after) {
        console.log(`[${this.name}] Demand filtering ${type}: ${before} -> ${after}`);
      }
    }

    return filtered;
  }

  /**
   * Generate all production and test CSV files
   */
  private async generateAllCsvFiles(
    groups: Record<ActionType, EnrichedUserRecord[]>,
    outputDir: string
  ): Promise<CsvFileResult[]> {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const results: CsvFileResult[] = [];

    const fileConfigs: { type: ActionType; prefix: string }[] = [
      { type: 'offer_created', prefix: 'recent-offer-creators' },
      { type: 'closet_add', prefix: 'recent-closet-adders' },
      { type: 'wishlist_add', prefix: 'recent-wishlist-adders' },
    ];

    for (const { type, prefix } of fileConfigs) {
      const records = groups[type];
      const columns = CSV_COLUMNS[type];

      // Production CSV
      const prodPath = `${outputDir}/${prefix}_${timestamp}.csv`;
      await this.csvGenerator.writeRecords(prodPath, records, columns);
      results.push({
        path: prodPath,
        rowCount: records.length,
        isTestFile: false,
        audienceType: type,
      });
      console.log(`[${this.name}] Generated ${prodPath} (${records.length} rows)`);

      // Test CSV (founder only)
      const testPath = `${outputDir}/${prefix}_TEST_${timestamp}.csv`;
      const testRecord = this.createTestRecord(records[0], type);
      await this.csvGenerator.writeRecords(testPath, [testRecord], columns);
      results.push({
        path: testPath,
        rowCount: 1,
        isTestFile: true,
        audienceType: type,
      });
      console.log(`[${this.name}] Generated ${testPath} (1 test row)`);
    }

    return results;
  }

  /**
   * Create test record with founder user info + product data from first production record
   */
  private createTestRecord(
    sourceRecord: EnrichedUserRecord | undefined,
    actionType: ActionType
  ): EnrichedUserRecord {
    return {
      ...FOUNDER_TEST_USER,
      relevant_variant_size: sourceRecord?.relevant_variant_size ?? '13',
      product_name: sourceRecord?.product_name ?? 'Test Product',
      variantID: sourceRecord?.variantID ?? 'test-variant-id',
      lastActive: new Date().toISOString(),
      inventory_count: sourceRecord?.inventory_count,
      wishlist_count: sourceRecord?.wishlist_count,
    };
  }
}
```

**Acceptance Criteria:**
- [ ] Generates 6 CSV files (3 prod + 3 test)
- [ ] Each user appears in exactly ONE output file (prioritization works)
- [ ] Demand filtering removes low-value records
- [ ] Test CSVs contain only founder user ID
- [ ] CSV column order matches Python script exactly
- [ ] dryRun mode skips CSV generation but returns correct counts

---

### Task 3.2: Create Generator Registry and Barrel Exports
**Description:** Create src/lib/generators/index.ts with GeneratorRegistry class and all exports
**Size:** Small
**Priority:** High
**Dependencies:** Task 3.1

**Implementation - Full Code:**

```typescript
// src/lib/generators/index.ts

import pool from '../db';
import { BaseAudienceGenerator } from './BaseAudienceGenerator';
import { Layer3BehaviorGenerator } from './layer3/Layer3BehaviorGenerator';

// Export types
export * from './types';
export { BaseAudienceGenerator } from './BaseAudienceGenerator';
export { CsvGenerator } from './CsvGenerator';
export { Layer3BehaviorGenerator } from './layer3/Layer3BehaviorGenerator';

// Generator registry for lookup by name or legacy script ID
class GeneratorRegistry {
  private generators = new Map<string, BaseAudienceGenerator>();

  register(generator: BaseAudienceGenerator): void {
    this.generators.set(generator.name, generator);
    // Also register by legacy script ID for backward compatibility
    const legacyId = this.getLegacyScriptId(generator.name);
    if (legacyId) {
      this.generators.set(legacyId, generator);
    }
  }

  get(nameOrScriptId: string): BaseAudienceGenerator | undefined {
    return this.generators.get(nameOrScriptId);
  }

  has(nameOrScriptId: string): boolean {
    return this.generators.has(nameOrScriptId);
  }

  list(): string[] {
    return Array.from(new Set(
      Array.from(this.generators.values()).map(g => g.name)
    ));
  }

  private getLegacyScriptId(name: string): string | null {
    const mapping: Record<string, string> = {
      'layer3-behavior': 'generate_layer_3_push_csvs',
      // Future mappings:
      // 'layer2-trending': 'generate_layer_2_push_csv',
      // 'layer5-waterfall': 'generate_new_user_waterfall',
    };
    return mapping[name] ?? null;
  }
}

// Create singleton registry with registered generators
export const generatorRegistry = new GeneratorRegistry();

// Register all generators
generatorRegistry.register(new Layer3BehaviorGenerator(pool));
```

**Acceptance Criteria:**
- [ ] generatorRegistry.get('layer3-behavior') returns generator instance
- [ ] generatorRegistry.get('generate_layer_3_push_csvs') returns same instance (backward compat)
- [ ] generatorRegistry.list() returns ['layer3-behavior']
- [ ] All types exportable from '../generators'

---

## Phase 4: Integration

### Task 4.1: Add Feature Flag to automationEngine.ts
**Description:** Modify automationEngine.ts to check AUTOMATION_ENGINE_VERSION and route to V2 generators
**Size:** Medium
**Priority:** High
**Dependencies:** Tasks 3.1, 3.2

**Technical Requirements:**
- Read AUTOMATION_ENGINE_VERSION env var (default 'v1')
- If 'v2' and generator exists, use TypeScript generator
- Map automation parameters to GeneratorOptions
- Convert GeneratorResult to AudienceGenerationResult format
- Fall through to Python executor if V1 or no generator available

**Implementation - Code to add to automationEngine.ts:**

```typescript
// Add at top of src/lib/automationEngine.ts

import { generatorRegistry, GeneratorOptions } from './generators';

// Add environment variable check
const AUTOMATION_ENGINE_VERSION = process.env.AUTOMATION_ENGINE_VERSION ?? 'v1';

// Modify executeAudienceGeneration method - replace or augment existing implementation
async executeAudienceGeneration(
  automation: Automation,
  config: ExecutionConfig
): Promise<AudienceGenerationResult> {
  const scriptId = automation.audienceCriteria?.customScript?.scriptId;

  // V2 path: Use TypeScript generators if available
  if (AUTOMATION_ENGINE_VERSION === 'v2' && scriptId && generatorRegistry.has(scriptId)) {
    console.log(`[AutomationEngine] Using V2 TypeScript generator for ${scriptId}`);

    const generator = generatorRegistry.get(scriptId)!;
    const options: Partial<GeneratorOptions> = {
      lookbackHours: automation.audienceCriteria?.customScript?.parameters?.lookback_hours ?? 48,
      coolingHours: automation.audienceCriteria?.customScript?.parameters?.cooling_hours ?? 12,
      outputDir: '.script-outputs',
      dryRun: false,
      automationId: automation.id,
    };

    const result = await generator.generate(options);

    if (!result.success) {
      throw new Error(`Generator failed: ${result.error}`);
    }

    return {
      success: true,
      csvPaths: result.csvFiles.filter(f => !f.isTestFile).map(f => f.path),
      testCsvPaths: result.csvFiles.filter(f => f.isTestFile).map(f => f.path),
      audienceSize: result.audienceSize,
    };
  }

  // V1 path: Use Python scripts (existing behavior)
  console.log(`[AutomationEngine] Using V1 Python script executor for ${scriptId}`);
  return this.executePythonScript(automation, config);
}
```

**Acceptance Criteria:**
- [ ] AUTOMATION_ENGINE_VERSION=v2 routes to TypeScript generator
- [ ] AUTOMATION_ENGINE_VERSION=v1 routes to Python executor
- [ ] Unset env var defaults to v1 (Python)
- [ ] Unknown scriptId falls through to Python
- [ ] Logs indicate which version is being used

---

### Task 4.2: Test V1/V2 Switching Locally
**Description:** Test feature flag switching between Python and TypeScript execution
**Size:** Small
**Priority:** High
**Dependencies:** Task 4.1

**Test Steps:**
1. Set `AUTOMATION_ENGINE_VERSION=v1` in .env
2. Trigger automation - verify Python script executes (check logs)
3. Set `AUTOMATION_ENGINE_VERSION=v2` in .env
4. Trigger automation - verify TypeScript generator executes
5. Compare CSV outputs for parity

**Acceptance Criteria:**
- [ ] V1 shows "Using V1 Python script executor" in logs
- [ ] V2 shows "Using V2 TypeScript generator" in logs
- [ ] Both produce valid CSV files
- [ ] CSV column order matches between V1 and V2

---

## Phase 5: Validation & Rollout

### Task 5.1: Production Validation and Deployment
**Description:** Deploy to Railway with V1 default, test V2, then full rollout
**Size:** Medium
**Priority:** High
**Dependencies:** Task 4.2

**Deployment Steps:**
1. Deploy with AUTOMATION_ENGINE_VERSION=v1 (safe fallback)
2. Trigger test automation, verify Python works
3. Set AUTOMATION_ENGINE_VERSION=v2 in Railway
4. Trigger test automation, verify TypeScript works
5. Compare CSV outputs
6. Monitor for errors
7. If issues: immediately set back to v1

**Rollback Checklist:**
- [ ] Set `AUTOMATION_ENGINE_VERSION=v1` in Railway variables
- [ ] Trigger test automation
- [ ] Verify logs show "Using V1 Python script executor"
- [ ] Verify CSV files generated in `.script-outputs/`
- [ ] Confirm automation completes successfully

**Post-Implementation Documentation:**
- [ ] Document actual execution time vs. expected (~30-60s)
- [ ] Record query performance from production logs
- [ ] Update developer-guides/push-blaster-guide.md

**Acceptance Criteria:**
- [ ] V2 generator works in production
- [ ] CSV output matches Python output format
- [ ] Execution time < 60 seconds
- [ ] Rollback to V1 verified working
- [ ] Documentation updated

---

## Dependency Graph

```
Phase 1:
  1.1 (Install deps) ─┬─> 1.2 (types.ts) ───> 1.3 (BaseAudienceGenerator)
                      └─> 1.4 (CsvGenerator)

Phase 2: [Can run parallel with Phase 1.3-1.4]
  2.1 (activityQueries) ─┐
  2.2 (userQueries) ─────┼─> 2.4 (barrel exports)
  2.3 (variantQueries) ──┘

Phase 3: [Depends on Phase 1 + 2]
  3.1 (Layer3Generator) ──> 3.2 (registry)

Phase 4: [Depends on Phase 3]
  4.1 (feature flag) ──> 4.2 (local testing)

Phase 5: [Depends on Phase 4]
  5.1 (production deployment)
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Query differences from Python | Medium | High | Exact SQL provided, column mapping explicit |
| CSV format mismatch | Low | High | CSV_COLUMNS constant matches Python |
| Performance regression | Low | Medium | Streaming CSV, bulk queries |
| Feature flag not respected | Low | High | Tests verify routing logic |

---

## Summary

- **Total Tasks:** 12
- **Phase 1 (Foundation):** 4 tasks
- **Phase 2 (Query Layer):** 4 tasks
- **Phase 3 (Generator):** 2 tasks
- **Phase 4 (Integration):** 2 tasks
- **Phase 5 (Validation):** 1 task
- **Parallel Opportunities:** Tasks 1.3+1.4, Tasks 2.1+2.2+2.3
- **Critical Path:** 1.1 → 1.2 → 3.1 → 3.2 → 4.1 → 5.1
