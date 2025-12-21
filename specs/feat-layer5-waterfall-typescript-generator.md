# TypeScript Layer 5 Waterfall Generator

## Status
**Draft** - Ready for implementation

## Authors
- Claude Code (2025-12-21)

## Overview
Complete the Python-to-TypeScript migration by implementing a native TypeScript generator for the New User Waterfall automation (Layer 5). This eliminates Python subprocess spawning for the second of two primary automations, following the established Layer 3 migration pattern.

## Background/Problem Statement

### Current State
The push notification system has two primary automations:
1. **Layer 3 (Daily Layer 3 Pushes)** - ✅ Migrated to TypeScript
2. **Layer 5 (New User Waterfall)** - ❌ Still uses Python subprocess

The Layer 5 automation currently:
- Spawns a Python subprocess (`generate_new_user_waterfall.py`)
- Creates a new database connection from Python
- Can fail due to database connectivity issues in containerized environments
- Has different error handling patterns than the Node.js application
- Creates debugging complexity (Python tracebacks vs Node.js errors)

### Why This Matters
- **Reliability**: Python subprocess spawning is fragile in containerized deployments
- **Consistency**: Layer 3 already migrated successfully using a proven pattern
- **Debugging**: TypeScript errors appear in standard Node.js logs
- **Performance**: Uses existing database connection pool (no connection overhead)
- **Maintainability**: Single language codebase for primary automations

## Goals
- Implement `Layer5WaterfallGenerator` following the Layer 3 pattern exactly
- Port all waterfall query functions to TypeScript
- Maintain exact business logic parity with Python implementation
- Generate identical CSV output format for compatibility
- Register generator in `generatorRegistry` for automatic routing
- Enable rollback to Python via environment variable

## Non-Goals
- Migrating Layer 2 (trending) or Layer 1 (showcase) automations
- Removing the Python fallback scripts
- Modifying the automation engine's decision logic
- Implementing historical appearance filtering (deferred - push_logs table TBD)
- Generating waterfall metrics JSON (using structured logging instead)
- Generating residual remaining users file (Level 5 captures all)

## Technical Dependencies
- **pg** (^8.x) - PostgreSQL client for Node.js
- **zod** (^3.x) - Runtime type validation for options
- **fs/promises** - File system operations for CSV generation

All dependencies are already installed and used by Layer 3 implementation.

## Detailed Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    automationEngine.ts                          │
│                                                                 │
│  generatePushAudience() {                                       │
│    if (AUTOMATION_ENGINE_VERSION === 'v2' &&                    │
│        generatorRegistry.has(scriptId)) {                       │
│      // Route to TypeScript generator                           │
│    } else {                                                     │
│      // Fall back to Python script                              │
│    }                                                            │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    generatorRegistry                            │
│                                                                 │
│  'generate_new_user_waterfall' → Layer5WaterfallGenerator       │
│  'generate_layer_3_push_csvs'  → Layer3BehaviorGenerator        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Layer5WaterfallGenerator.ts                        │
│                                                                 │
│  executeGeneration(options) {                                   │
│    1. getNewUsersInWindow() → base audience                     │
│    2. Level 1: checkUsersClosetCompletion → extract no-shoes    │
│    3. Level 2: checkUsersBioCompletion → extract no-bio         │
│    4. Level 3: checkUsersOfferCompletion → extract no-offers    │
│    5. Level 4: checkUsersWishlistCompletion → extract no-wishlist│
│    6. Level 5: remaining → "New Stars"                          │
│    7. Enrich L3-5 with getTopTargetShoeForUsers()               │
│    8. Generate 5 production + 5 test CSVs                       │
│  }                                                              │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
1. Automation scheduled at 1:05 PM CT daily
   ↓
2. automationEngine reads script_id: 'generate_new_user_waterfall'
   ↓
3. AUTOMATION_ENGINE_VERSION=v2 → routes to TypeScript
   ↓
4. generatorRegistry.get('generate_new_user_waterfall')
   ↓
5. Layer5WaterfallGenerator.generate(options)
   ↓
6. Waterfall extraction (each level removes users from pool):
   Level 1: No Shoes    → no-shoes-new-user-{ts}.csv
   Level 2: No Bio      → no-bio-new-user-{ts}.csv
   Level 3: No Offers   → no-offers-new-user-{ts}.csv (+ target shoes)
   Level 4: No Wishlist → no-wishlist-new-user-{ts}.csv (+ target shoes)
   Level 5: New Stars   → new-stars-new-user-{ts}.csv (+ target shoes)
   ↓
7. Return GeneratorResult with csvFiles array
   ↓
8. Automation engine proceeds to push delivery phase
```

### File Structure

```
services/push-blaster/src/lib/
├── generators/
│   ├── index.ts                    # MODIFY: Add Layer5 to registry
│   ├── types.ts                    # MODIFY: Add WaterfallUserRecord
│   ├── BaseAudienceGenerator.ts    # (existing)
│   ├── CsvGenerator.ts             # (existing)
│   ├── layer3/
│   │   └── Layer3BehaviorGenerator.ts  # (existing reference)
│   └── layer5/
│       └── Layer5WaterfallGenerator.ts  # NEW: Main generator
└── queries/
    ├── index.ts                    # MODIFY: Export new functions
    ├── activityQueries.ts          # (existing)
    ├── userQueries.ts              # (existing)
    ├── variantQueries.ts           # (existing)
    ├── waterfallQueries.ts         # NEW: Waterfall-specific queries
    └── targetShoeQueries.ts        # NEW: 4-step fallback lookup
```

### New File: `src/lib/queries/waterfallQueries.ts`

```typescript
import { Pool } from 'pg';

// Types
export interface NewUser {
  user_id: string;
  username: string;
  first_name: string;
  user_size: string | null;
  created_at: Date;
  last_active: string | null;
}

/**
 * Fetch users who signed up between min_hours and max_days ago
 * Base audience for waterfall extraction
 */
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

/**
 * Check which users have added any items to their closet
 * Uses bulk query with ANY() to avoid N+1
 */
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

  const completedCount = result.rows.length;
  console.log(`[waterfallQueries] Closet completion: ${completedCount}/${userIds.length}`);

  return completionMap;
}

/**
 * Check which users have updated their bio
 */
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

/**
 * Check which users have created any offers
 */
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

/**
 * Check which users have added any wishlist items
 */
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

### New File: `src/lib/queries/targetShoeQueries.ts`

```typescript
import { Pool } from 'pg';

export interface TargetShoeResult {
  user_id: string;
  product_variant_id: string;
  product_name: string;
  source: 'desired_item' | 'recent_offer' | 'wishlist_item' | 'comprehensive_offer_target';
}

/**
 * 4-step fallback method to find shoes users want to GET
 * 1. Primary: User's Top Desired Item (highest intent)
 * 2. Secondary: User's Most Recent Offer Target (medium intent)
 * 3. Tertiary: User's Newest Wishlist Addition (low intent)
 * 4. Quaternary: Comprehensive offer target search (handles deleted products)
 */
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

  // Quaternary: Comprehensive offer target search (LEFT JOINs for deleted products)
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

### New File: `src/lib/generators/layer5/Layer5WaterfallGenerator.ts`

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
    const { outputDir, dryRun } = options;
    const minHours = 12;
    const maxDays = 14;

    // Step 1: Fetch base audience
    console.log(`[${this.name}] Fetching new users (${minHours}h - ${maxDays}d window)...`);
    const baseUsers = await getNewUsersInWindow(this.pool, minHours, maxDays);

    if (baseUsers.length === 0) {
      console.log(`[${this.name}] No new users found in time window`);
      return {
        success: true,
        csvFiles: [],
        audienceSize: 0,
        executionTimeMs: 0,
        metadata: { reason: 'no_users' },
      };
    }

    console.log(`[${this.name}] Found ${baseUsers.length} new users to process`);

    // Step 2: Sequential waterfall extraction
    const extractionResults = await this.extractWaterfallLevels(baseUsers);

    // Calculate total audience size
    const totalAudienceSize = Object.values(extractionResults)
      .reduce((sum, users) => sum + users.length, 0);

    if (dryRun) {
      console.log(`[${this.name}] Dry run - skipping CSV generation`);
      return {
        success: true,
        csvFiles: [],
        audienceSize: totalAudienceSize,
        executionTimeMs: 0,
        metadata: {
          level_1: extractionResults[1].length,
          level_2: extractionResults[2].length,
          level_3: extractionResults[3].length,
          level_4: extractionResults[4].length,
          level_5: extractionResults[5].length,
        },
      };
    }

    // Step 3: Generate CSV files
    const csvFiles = await this.generateAllCsvFiles(extractionResults, outputDir);

    return {
      success: true,
      csvFiles,
      audienceSize: totalAudienceSize,
      executionTimeMs: 0,
    };
  }

  /**
   * Sequential waterfall extraction - each level removes users from the remaining pool
   */
  private async extractWaterfallLevels(
    baseUsers: NewUser[]
  ): Promise<Record<WaterfallLevel, WaterfallUserRecord[]>> {
    let remainingUsers = [...baseUsers];
    const results: Record<WaterfallLevel, WaterfallUserRecord[]> = {
      1: [], 2: [], 3: [], 4: [], 5: [],
    };

    // Level 1: No Shoes
    const userIds = remainingUsers.map(u => u.user_id);
    const closetCompletion = await checkUsersClosetCompletion(this.pool, userIds);

    const level1Users = remainingUsers.filter(u => !closetCompletion.get(u.user_id));
    results[1] = level1Users.map(u => this.toWaterfallRecord(u, 1));
    remainingUsers = remainingUsers.filter(u => closetCompletion.get(u.user_id));
    console.log(`[${this.name}] Level 1 (No Shoes): ${results[1].length} extracted, ${remainingUsers.length} remaining`);

    if (remainingUsers.length === 0) return results;

    // Level 2: No Bio
    const bioCompletion = await checkUsersBioCompletion(
      this.pool,
      remainingUsers.map(u => u.user_id)
    );

    const level2Users = remainingUsers.filter(u => !bioCompletion.get(u.user_id));
    results[2] = level2Users.map(u => this.toWaterfallRecord(u, 2));
    remainingUsers = remainingUsers.filter(u => bioCompletion.get(u.user_id));
    console.log(`[${this.name}] Level 2 (No Bio): ${results[2].length} extracted, ${remainingUsers.length} remaining`);

    if (remainingUsers.length === 0) return results;

    // Level 3: No Offers
    const offerCompletion = await checkUsersOfferCompletion(
      this.pool,
      remainingUsers.map(u => u.user_id)
    );

    const level3Users = remainingUsers.filter(u => !offerCompletion.get(u.user_id));
    remainingUsers = remainingUsers.filter(u => offerCompletion.get(u.user_id));

    // Enrich Level 3 with target shoes
    if (level3Users.length > 0) {
      const targetShoes = await getTopTargetShoeForUsers(
        this.pool,
        level3Users.map(u => u.user_id)
      );
      results[3] = level3Users.map(u => this.toWaterfallRecordWithShoe(u, 3, targetShoes));
    }
    console.log(`[${this.name}] Level 3 (No Offers): ${results[3].length} extracted, ${remainingUsers.length} remaining`);

    if (remainingUsers.length === 0) return results;

    // Level 4: No Wishlist
    const wishlistCompletion = await checkUsersWishlistCompletion(
      this.pool,
      remainingUsers.map(u => u.user_id)
    );

    const level4Users = remainingUsers.filter(u => !wishlistCompletion.get(u.user_id));
    remainingUsers = remainingUsers.filter(u => wishlistCompletion.get(u.user_id));

    // Enrich Level 4 with target shoes
    if (level4Users.length > 0) {
      const targetShoes = await getTopTargetShoeForUsers(
        this.pool,
        level4Users.map(u => u.user_id)
      );
      results[4] = level4Users.map(u => this.toWaterfallRecordWithShoe(u, 4, targetShoes));
    }
    console.log(`[${this.name}] Level 4 (No Wishlist): ${results[4].length} extracted, ${remainingUsers.length} remaining`);

    // Level 5: New Stars (all remaining users)
    if (remainingUsers.length > 0) {
      const targetShoes = await getTopTargetShoeForUsers(
        this.pool,
        remainingUsers.map(u => u.user_id)
      );
      results[5] = remainingUsers.map(u => this.toWaterfallRecordWithShoe(u, 5, targetShoes));
    }
    console.log(`[${this.name}] Level 5 (New Stars): ${results[5].length} extracted`);

    return results;
  }

  private toWaterfallRecord(user: NewUser, level: WaterfallLevel): WaterfallUserRecord {
    return {
      user_id: user.user_id,
      username: user.username ?? '',
      firstName: user.first_name ?? '',
      new_user_level: level,
    };
  }

  private toWaterfallRecordWithShoe(
    user: NewUser,
    level: WaterfallLevel,
    targetShoes: Map<string, { product_variant_id: string; product_name: string }>
  ): WaterfallUserRecord {
    const targetShoe = targetShoes.get(user.user_id);
    return {
      user_id: user.user_id,
      username: user.username ?? '',
      firstName: user.first_name ?? '',
      new_user_level: level,
      top_target_shoe: targetShoe?.product_name,
      top_target_shoe_variantid: targetShoe?.product_variant_id,
    };
  }

  /**
   * Generate all production and test CSV files with atomic writes
   */
  private async generateAllCsvFiles(
    levels: Record<WaterfallLevel, WaterfallUserRecord[]>,
    outputDir: string
  ): Promise<CsvFileResult[]> {
    const fs = await import('fs/promises');
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const tempFiles: string[] = [];
    const finalResults: CsvFileResult[] = [];

    try {
      for (const config of LEVEL_CONFIGS) {
        const records = levels[config.level];

        // Skip empty levels
        if (records.length === 0) {
          console.log(`[${this.name}] Skipping ${config.name} - no records`);
          continue;
        }

        const columns = config.includesTargetShoe
          ? WATERFALL_CSV_COLUMNS.levels_3_4_5
          : WATERFALL_CSV_COLUMNS.levels_1_2;

        // Production CSV
        const prodPathTemp = `${outputDir}/${config.prefix}-${timestamp}.csv.tmp`;
        const prodPathFinal = `${outputDir}/${config.prefix}-${timestamp}.csv`;
        await this.csvGenerator.writeRecords(prodPathTemp, records, columns as string[]);
        tempFiles.push(prodPathTemp);
        finalResults.push({
          path: prodPathFinal,
          rowCount: records.length,
          isTestFile: false,
          audienceType: `level_${config.level}`,
        });

        // Test CSV (founder only)
        const testPathTemp = `${outputDir}/${config.prefix}-test-${timestamp}.csv.tmp`;
        const testPathFinal = `${outputDir}/${config.prefix}-test-${timestamp}.csv`;
        const testRecord = this.createTestRecord(config.level, records[0]);
        await this.csvGenerator.writeRecords(testPathTemp, [testRecord], columns as string[]);
        tempFiles.push(testPathTemp);
        finalResults.push({
          path: testPathFinal,
          rowCount: 1,
          isTestFile: true,
          audienceType: `level_${config.level}`,
        });
      }

      // Atomic rename
      for (let i = 0; i < tempFiles.length; i++) {
        await fs.rename(tempFiles[i], finalResults[i].path);
        console.log(`[${this.name}] Generated ${finalResults[i].path} (${finalResults[i].rowCount} rows)`);
      }

      return finalResults;

    } catch (error) {
      // Rollback temp files on failure
      console.error(`[${this.name}] CSV generation failed, rolling back...`);
      for (const tempFile of tempFiles) {
        try {
          await fs.unlink(tempFile);
        } catch {
          // Ignore - file may not exist
        }
      }
      throw error;
    }
  }

  private createTestRecord(
    level: WaterfallLevel,
    sourceRecord: WaterfallUserRecord | undefined
  ): WaterfallUserRecord {
    const record: WaterfallUserRecord = {
      user_id: FOUNDER_TEST_USER.user_id,
      username: FOUNDER_TEST_USER.username,
      firstName: FOUNDER_TEST_USER.firstName,
      new_user_level: level,
    };

    // Add target shoe for levels 3-5
    if (level >= 3) {
      record.top_target_shoe = sourceRecord?.top_target_shoe ?? 'Air Jordan 1 Retro High OG "Bred Toe"';
      record.top_target_shoe_variantid = sourceRecord?.top_target_shoe_variantid ?? 'sample-variant-id';
    }

    return record;
  }
}
```

### Modifications to Existing Files

#### `src/lib/generators/types.ts` - Add:

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

#### `src/lib/generators/index.ts` - Modify:

```typescript
// Add import
import { Layer5WaterfallGenerator } from './layer5/Layer5WaterfallGenerator';

// Add to exports
export { Layer5WaterfallGenerator } from './layer5/Layer5WaterfallGenerator';

// In doInitialize():
this.register(new Layer3BehaviorGenerator(pool));
this.register(new Layer5WaterfallGenerator(pool));  // ADD THIS

// In getLegacyScriptId():
const mapping: Record<string, string> = {
  'layer3-behavior': 'generate_layer_3_push_csvs',
  'layer5-waterfall': 'generate_new_user_waterfall',  // ADD THIS
};
```

#### `src/lib/queries/index.ts` - Add exports:

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

## User Experience
No user-facing changes. The automation continues to run on its 1:05 PM CT schedule, generating identical push notifications. Users receive the same waterfall onboarding messages.

## Testing Strategy

### Unit Tests

#### `__tests__/lib/queries/waterfallQueries.test.ts`
```typescript
// Test: getNewUsersInWindow returns users in correct time window
// Purpose: Validate base audience query respects min_hours and max_days bounds

// Test: checkUsersClosetCompletion correctly identifies users with/without closet
// Purpose: Ensure bulk query returns accurate boolean map

// Test: All completion checks handle empty arrays gracefully
// Purpose: Edge case - no users to check should return empty Map
```

#### `__tests__/lib/queries/targetShoeQueries.test.ts`
```typescript
// Test: getTopTargetShoeForUsers prioritizes desired_items over offers
// Purpose: Validate 4-step fallback order is correct

// Test: Fallback to wishlist when no desired_items or offers
// Purpose: Ensure tertiary fallback works

// Test: Handles users with no target shoes gracefully
// Purpose: Some new users have no activity - should not error
```

#### `__tests__/lib/generators/Layer5WaterfallGenerator.test.ts`
```typescript
// Test: Waterfall extraction produces mutually exclusive levels
// Purpose: Core invariant - no user should appear in multiple levels

// Test: Levels 3-5 include target shoe data
// Purpose: Validate enrichment happens for correct levels

// Test: Empty levels produce no CSV files
// Purpose: Avoid creating empty files

// Test: Dry run mode skips CSV generation
// Purpose: Validate dryRun option works

// Test: CSV columns match expected format for each level type
// Purpose: Ensure Python parity in output format
```

### Integration Tests

```typescript
// Test: Full waterfall generation with real database
// Purpose: End-to-end validation with production-like data

// Test: Generator registry correctly routes to Layer5WaterfallGenerator
// Purpose: Validate AUTOMATION_ENGINE_VERSION=v2 routing
```

### Manual Testing Checklist

1. [ ] Start local dev server: `npm run dev`
2. [ ] Navigate to waterfall automation in UI
3. [ ] Click "Run Now" to trigger execution
4. [ ] Verify CSV files appear in `.script-outputs/`
5. [ ] Check CSV column headers match Python output
6. [ ] Verify founder receives test push notifications (5 pushes, one per level)
7. [ ] Compare TypeScript output with Python output for same time window

## Performance Considerations

### Query Optimization
- All queries use bulk patterns with `ANY($1::uuid[])` to avoid N+1
- Target shoe lookup uses 4-step fallback to minimize queries
- Estimated execution time: < 30 seconds for typical audience (500-2000 users)

### Memory Usage
- User records held in memory during waterfall extraction
- Maximum ~15,000 records (14-day window × ~1000 signups/day worst case)
- Each record ~200 bytes → ~3MB maximum

### Database Load
- 6 queries for waterfall extraction
- 1-4 queries for target shoe lookup (depends on fallback depth)
- All queries complete in < 5 seconds each

## Security Considerations
- No new external inputs or attack surfaces
- Uses existing authenticated database connection
- CSV files written to application-controlled directory
- No PII beyond what Python version already handles

## Documentation
- Update `CLAUDE.md` migration status table
- Update `developer-guides/push-blaster-guide.md` with Layer 5 TypeScript info
- Add inline code comments matching Layer 3 style

## Implementation Phases

### Phase 1: Query Functions
- Create `waterfallQueries.ts` with all 5 functions
- Create `targetShoeQueries.ts` with 4-step fallback
- Update `queries/index.ts` exports
- Unit tests for query functions

### Phase 2: Generator Implementation
- Create `Layer5WaterfallGenerator.ts`
- Update `types.ts` with waterfall types
- Update `generators/index.ts` registry
- Unit tests for generator

### Phase 3: Integration & Testing
- Local testing with real database
- Compare output with Python version
- Verify push delivery in test mode

### Phase 4: Production Deployment
- Commit and push to main
- Rebuild Docker image
- Deploy via GitHub Action
- Monitor first scheduled execution

## Open Questions
None - all clarifications resolved in ideation phase.

## References
- Ideation Document: `docs/ideation/typescript-new-user-waterfall-generator.md`
- Layer 3 Implementation: `src/lib/generators/layer3/Layer3BehaviorGenerator.ts`
- Python Reference: `audience-generation-scripts/generate_new_user_waterfall.py`
- Prior Migration Spec: `specs/feat-typescript-audience-generators-layer3.md`

## Rollback Plan
If issues occur in production:
1. Set `AUTOMATION_ENGINE_VERSION=v1` in GCP secrets
2. Redeploy: `gh workflow run deploy-push.yml --repo Tradeblock-dev/main-backend`
3. System automatically falls back to Python script

No code changes required - Python script remains in place and functional.
