# TypeScript-Native Automation Engine: Foundation + Layer 3 Generator

**Status:** Draft
**Author:** Claude Code
**Date:** 2025-11-28
**Related:** [Ideation Document](../docs/ideation/typescript-native-automation-engine.md)

---

## Overview

Build the foundation for TypeScript-native audience generation and implement the Layer 3 Behavior Response Generator to replace `generate_layer_3_push_csvs.py`. This eliminates Python subprocess dependencies that cause database connectivity failures on Railway due to dynamic IP blocking by AWS RDS security groups.

---

## Background/Problem Statement

### Root Cause
Python scripts executed via `scriptExecutor.ts` spawn child processes that create new database connections. When Railway's ephemeral IPs change, these new connections are blocked by AWS RDS security groups, causing all Python-based audience generation to fail with connection timeouts.

### Why TypeScript Solves This
The existing Node.js `pg` Pool in `src/lib/db.ts` maintains persistent connections that continue working even when IPs change. By implementing audience generation directly in TypeScript, we leverage this working connection pool instead of creating new connections per script execution.

### Current State
- Python scripts fail: `connection to server... timeout expired` after 120s x 3 retries
- Node.js queries work: Health check shows database "degraded" but functional
- Automation executions fail at Phase 1 (Audience Generation)

---

## Goals

- Implement `BaseAudienceGenerator` abstract class for consistent generator interface
- Create `Layer3BehaviorGenerator` that produces identical output to Python script
- Add feature flag (`AUTOMATION_ENGINE_VERSION`) for V1/V2 switching
- Use existing `pg` pool for all database queries (no new connections)
- Generate 6 CSV files: 3 production + 3 test (matching Python output)
- Integrate with existing automation pipeline without breaking changes

---

## Non-Goals

- Layer 2 (Trending Closet) generator - deferred to follow-up spec
- Layer 5 (New User Waterfall) generator - deferred to follow-up spec
- Showcase generators - deferred
- BullMQ/Redis migration - keep node-cron for MVP
- Kysely adoption - use raw SQL for complex queries initially
- UI changes - use existing automation UI
- Cadence service modifications

---

## Technical Dependencies

### Existing Dependencies (Reuse)
| Dependency | Version | Purpose |
|------------|---------|---------|
| `pg` | ^8.16.3 | PostgreSQL connection pool |
| `node-cron` | ^4.2.1 | Cron scheduling |
| `uuid` | ^11.1.0 | UUID generation |

### New Dependencies (Install)
| Dependency | Version | Purpose |
|------------|---------|---------|
| `fast-csv` | ^5.0.2 | Streaming CSV generation |
| `zod` | ^3.24.0 | Runtime type validation |

**Installation:**
```bash
npm install fast-csv zod
npm install -D @types/fast-csv
```

---

## Detailed Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      automationEngine.ts                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ executeAudienceGeneration()                                 ││
│  │   ├─ if AUTOMATION_ENGINE_VERSION === 'v2'                  ││
│  │   │     └─ generatorRegistry.get(scriptId).generate()       ││
│  │   └─ else (v1)                                              ││
│  │         └─ scriptExecutor.executeScript() [Python]          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    src/lib/generators/                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ BaseAudience     │  │ Layer3Behavior   │  │ Generator     │ │
│  │ Generator.ts     │  │ Generator.ts     │  │ Registry.ts   │ │
│  │ (abstract)       │  │ (concrete)       │  │ (lookup)      │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ types.ts         │  │ CsvGenerator.ts  │                    │
│  │ (interfaces)     │  │ (streaming)      │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    src/lib/queries/                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ activityQueries  │  │ userQueries.ts   │  │ variantQueries│ │
│  │ .ts              │  │                  │  │ .ts           │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      src/lib/db.ts                              │
│                    (existing pg Pool)                           │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
services/push-blaster/src/lib/
├── generators/
│   ├── index.ts                    # Barrel exports + registry
│   ├── types.ts                    # Shared interfaces
│   ├── BaseAudienceGenerator.ts    # Abstract base class
│   ├── CsvGenerator.ts             # Streaming CSV utility
│   └── layer3/
│       └── Layer3BehaviorGenerator.ts
├── queries/
│   ├── index.ts                    # Barrel exports
│   ├── activityQueries.ts          # Recent activity lookups
│   ├── userQueries.ts              # User profile data
│   └── variantQueries.ts           # Variant statistics
└── automationEngine.ts             # Modified: add V2 path
```

### Core Interfaces

```typescript
// src/lib/generators/types.ts

import { z } from 'zod';

// Generator options schema
export const GeneratorOptionsSchema = z.object({
  lookbackHours: z.number().default(48),
  coolingHours: z.number().default(12),
  outputDir: z.string().default('.script-outputs'),
  dryRun: z.boolean().default(false),
  automationId: z.string().optional(),
});

export type GeneratorOptions = z.infer<typeof GeneratorOptionsSchema>;

// Generator result
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

// Activity data from database
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

// CSV column definitions per audience type
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

// Test user constant
export const FOUNDER_TEST_USER = {
  user_id: '0e54067c-4c0e-4e4a-8a23-a47661578059',
  username: 'beems',
  firstName: 'Mbiyimoh',
  usersize: '13',
} as const;
```

### Base Generator Class

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

### Layer 3 Generator Implementation

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

### CSV Generator Utility

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

### Query Modules

```typescript
// src/lib/queries/activityQueries.ts

import { Pool } from 'pg';
import { ActivityRecord } from '../generators/types';

/**
 * Fetch recent high-intent user activity (offers, closet adds, wishlist adds)
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

```typescript
// src/lib/queries/variantQueries.ts

import { Pool } from 'pg';

/**
 * Fetch sizes for multiple variants in bulk
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

### Generator Registry

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

// Generator registry
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

### Feature Flag Integration

```typescript
// Modification to src/lib/automationEngine.ts

// Add at top of file
import { generatorRegistry, GeneratorOptions } from './generators';

// Add environment variable check
const AUTOMATION_ENGINE_VERSION = process.env.AUTOMATION_ENGINE_VERSION ?? 'v1';

// Modify executeAudienceGeneration method
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

---

## User Experience

### For Operators

No UI changes required. Operators continue using the existing automation dashboard:
1. Create/edit automations with `generate_layer_3_push_csvs` script
2. View execution logs showing generator progress
3. Download generated CSV files from `.script-outputs/`

### For System Administrators

New environment variable for version control:
```bash
# Railway environment variables
AUTOMATION_ENGINE_VERSION=v2  # Use TypeScript generators
# or
AUTOMATION_ENGINE_VERSION=v1  # Use Python scripts (default)
```

### Switching Between Versions

```bash
# Enable V2 (TypeScript)
railway variables set AUTOMATION_ENGINE_VERSION=v2

# Rollback to V1 (Python) if issues
railway variables set AUTOMATION_ENGINE_VERSION=v1
```

---

## Testing Strategy

### Unit Tests

```typescript
// src/lib/generators/__tests__/Layer3BehaviorGenerator.test.ts

import { Layer3BehaviorGenerator } from '../layer3/Layer3BehaviorGenerator';

describe('Layer3BehaviorGenerator', () => {
  let generator: Layer3BehaviorGenerator;
  let mockPool: jest.Mocked<Pool>;

  beforeEach(() => {
    mockPool = createMockPool();
    generator = new Layer3BehaviorGenerator(mockPool);
  });

  describe('prioritizeUserActions', () => {
    /**
     * Purpose: Verify that when a user has multiple actions, only the highest
     * priority action is kept. This prevents users from receiving multiple
     * push notifications for different actions.
     */
    it('keeps highest priority action when user has multiple activities', () => {
      const activities = [
        { user_id: 'u1', action_type: 'wishlist_add', ... },
        { user_id: 'u1', action_type: 'offer_created', ... }, // Higher priority
        { user_id: 'u2', action_type: 'closet_add', ... },
      ];

      const result = generator['prioritizeUserActions'](activities);

      expect(result.get('u1')?.action_type).toBe('offer_created');
      expect(result.size).toBe(2);
    });
  });

  describe('applyDemandFiltering', () => {
    /**
     * Purpose: Verify demand thresholds are correctly applied. Users should
     * only receive notifications when there's meaningful supply/demand for
     * their activity.
     */
    it('filters out closet_add records with wishlist_count < 2', () => {
      const groups = {
        closet_add: [
          { wishlist_count: 5 }, // Keep
          { wishlist_count: 1 }, // Filter out
          { wishlist_count: 2 }, // Keep (boundary)
        ],
        offer_created: [],
        wishlist_add: [],
      };

      const result = generator['applyDemandFiltering'](groups);

      expect(result.closet_add).toHaveLength(2);
    });
  });
});
```

### Integration Tests

```typescript
// src/lib/generators/__tests__/integration/Layer3BehaviorGenerator.integration.test.ts

describe('Layer3BehaviorGenerator Integration', () => {
  /**
   * Purpose: Verify the complete generation flow works end-to-end,
   * producing valid CSV files with the expected structure.
   */
  it('generates CSV files matching Python output format', async () => {
    const generator = new Layer3BehaviorGenerator(testPool);

    const result = await generator.generate({
      lookbackHours: 48,
      coolingHours: 12,
      outputDir: testOutputDir,
      dryRun: false,
    });

    expect(result.success).toBe(true);
    expect(result.csvFiles.length).toBe(6); // 3 prod + 3 test

    // Verify CSV structure
    const prodCsv = await parseCsv(result.csvFiles[0].path);
    expect(prodCsv.headers).toEqual([
      'user_id', 'username', 'firstName', 'usersize',
      'relevant_variant_size', 'product_name', 'variantID',
      'lastActive', 'inventory_count'
    ]);
  });

  /**
   * Purpose: Verify test CSVs contain only the founder user.
   * This is critical for safe pre-production testing.
   */
  it('test CSV contains only founder user', async () => {
    const generator = new Layer3BehaviorGenerator(testPool);

    const result = await generator.generate({ ... });

    const testCsv = result.csvFiles.find(f => f.isTestFile);
    const parsed = await parseCsv(testCsv.path);

    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].user_id).toBe('0e54067c-4c0e-4e4a-8a23-a47661578059');
  });
});
```

### Feature Flag Tests

```typescript
describe('Feature Flag Switching', () => {
  /**
   * Purpose: Verify the automation engine respects the version flag
   * and correctly routes to V1 (Python) or V2 (TypeScript) execution.
   */
  it('uses TypeScript generator when AUTOMATION_ENGINE_VERSION=v2', async () => {
    process.env.AUTOMATION_ENGINE_VERSION = 'v2';

    const result = await automationEngine.executeAudienceGeneration(
      mockAutomation,
      mockConfig
    );

    expect(generatorRegistry.get).toHaveBeenCalledWith('generate_layer_3_push_csvs');
    expect(scriptExecutor.executeScript).not.toHaveBeenCalled();
  });

  it('falls back to Python when AUTOMATION_ENGINE_VERSION=v1', async () => {
    process.env.AUTOMATION_ENGINE_VERSION = 'v1';

    const result = await automationEngine.executeAudienceGeneration(
      mockAutomation,
      mockConfig
    );

    expect(scriptExecutor.executeScript).toHaveBeenCalled();
  });
});
```

---

## Performance Considerations

### Query Optimization

1. **Bulk queries instead of N+1**: All user profiles, variant sizes, and counts fetched in single bulk queries using `ANY($1::uuid[])` array parameters
2. **Index utilization**: Queries designed to use existing indexes on `created_at`, `user_id`, `product_variant_id`
3. **Connection reuse**: Uses existing pg pool (no new connections)

### Memory Management

1. **Streaming CSV generation**: Uses `fast-csv` streaming to avoid loading entire dataset into memory
2. **Iterative processing**: Processes each action type group sequentially
3. **Map-based lookups**: O(1) lookups for user profiles and variant statistics

### Expected Performance

| Metric | Python Script | TypeScript Generator |
|--------|---------------|---------------------|
| Connection time | 120s+ (timeout) | 0s (pool reuse) |
| Query execution | Similar | Similar |
| CSV generation | ~5s for 10k rows | ~3s (streaming) |
| Total execution | FAILS | ~30-60s |

---

## Security Considerations

### Database Access

- Uses existing authenticated pg pool (no credentials in generator code)
- Parameterized queries prevent SQL injection
- UUID array parameters sanitized by pg driver

### File System

- CSV output restricted to `.script-outputs/` directory
- No user-controlled file paths
- Timestamp-based file naming prevents overwrites

### Environment Variables

- `AUTOMATION_ENGINE_VERSION` is non-sensitive
- No new secrets required

---

## Documentation

### Files to Create

1. `src/lib/generators/README.md` - Generator development guide
2. Update `developer-guides/push-blaster-guide.md` with V2 engine section

### Developer Guide Addition

```markdown
## V2 TypeScript Generators

### Feature Flag
Set `AUTOMATION_ENGINE_VERSION=v2` to enable TypeScript generators.

### Adding a New Generator
1. Create class extending `BaseAudienceGenerator`
2. Implement `executeGeneration()` method
3. Register in `src/lib/generators/index.ts`
4. Add legacy script ID mapping for backward compatibility
```

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Install dependencies (`fast-csv`, `zod`)
- [ ] Create `src/lib/generators/` directory structure
- [ ] Implement `types.ts` with interfaces and schemas
- [ ] Implement `BaseAudienceGenerator.ts`
- [ ] Implement `CsvGenerator.ts`

### Phase 2: Query Layer
- [ ] Create `src/lib/queries/` directory
- [ ] Implement `activityQueries.ts`
- [ ] Implement `userQueries.ts`
- [ ] Implement `variantQueries.ts`
- [ ] Create barrel exports in `queries/index.ts`
- [ ] Add query execution logging to verify index usage (run `EXPLAIN ANALYZE` on main queries)

### Phase 3: Layer 3 Generator
- [ ] Implement `Layer3BehaviorGenerator.ts`
- [ ] Add generator to registry
- [ ] Test with founder user

### Phase 4: Integration
- [ ] Add feature flag to `automationEngine.ts`
- [ ] Implement V2 execution path
- [ ] Test switching between V1/V2

### Phase 5: Validation & Rollout
- [ ] Run V2 generation and compare output to V1
- [ ] Verify CSV column order matches
- [ ] Verify audience sizes are similar
- [ ] Deploy with `AUTOMATION_ENGINE_VERSION=v1` (Python fallback)
- [ ] Test V2 in production with single automation
- [ ] Full V2 rollout

#### Rollback Verification Checklist
If issues occur, verify V1 fallback works:
- [ ] Set `AUTOMATION_ENGINE_VERSION=v1` in Railway
- [ ] Trigger a test automation execution
- [ ] Verify Python script executor is invoked (check logs for "Using V1 Python script executor")
- [ ] Verify CSV output is generated in `.script-outputs/`
- [ ] Confirm automation completes successfully

#### Post-Implementation Documentation
- [ ] Document actual execution time vs. expected (~30-60s)
- [ ] Record query performance metrics from `EXPLAIN ANALYZE`
- [ ] Update developer guide with production observations

---

## Design Decisions

The following decisions have been made based on validation feedback:

1. **Parallel execution**: **DECISION: Sequential processing**
   - Process action types sequentially for Phase 1
   - Simpler debugging and error tracing
   - Can optimize to parallel in future if performance requires

2. **Logging verbosity**: **DECISION: Phase transitions + counts only**
   - Log phase start/end with timing
   - Log record counts at each step
   - Do NOT log individual records (too verbose)

3. **Error recovery**: **DECISION: Partial output on partial failure**
   - If one action type fails, continue processing others
   - Generate CSVs for successful groups
   - Log failures with full error context
   - Return `success: true` with error metadata if any groups succeeded

---

## References

- [Ideation Document](../docs/ideation/typescript-native-automation-engine.md)
- [Python DB Connectivity Problem](../docs/ideation/python-db-connectivity-problem.md)
- [fast-csv Documentation](https://c2fo.github.io/fast-csv/)
- [Zod Documentation](https://zod.dev/)
- [PostgreSQL Array Parameters](https://node-postgres.com/features/queries#parameterized-query)
