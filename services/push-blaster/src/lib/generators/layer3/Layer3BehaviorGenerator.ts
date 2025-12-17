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
   * Generate all production and test CSV files with atomic writes
   * - Skips empty audiences (no empty CSV files)
   * - Uses temp files + rename for atomic writes
   * - Rolls back on failure
   */
  private async generateAllCsvFiles(
    groups: Record<ActionType, EnrichedUserRecord[]>,
    outputDir: string
  ): Promise<CsvFileResult[]> {
    const fs = await import('fs/promises');
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const tempFiles: string[] = [];
    const finalResults: CsvFileResult[] = [];

    const fileConfigs: { type: ActionType; prefix: string }[] = [
      { type: 'offer_created', prefix: 'recent-offer-creators' },
      { type: 'closet_add', prefix: 'recent-closet-adders' },
      { type: 'wishlist_add', prefix: 'recent-wishlist-adders' },
    ];

    try {
      for (const { type, prefix } of fileConfigs) {
        const records = groups[type];

        // Skip empty audiences - don't generate empty CSV files
        if (records.length === 0) {
          console.log(`[${this.name}] Skipping ${prefix} - no records after filtering`);
          continue;
        }

        const columns = CSV_COLUMNS[type];

        // Write to temp files first (atomic write pattern)
        const prodPathTemp = `${outputDir}/${prefix}_${timestamp}.csv.tmp`;
        const prodPathFinal = `${outputDir}/${prefix}_${timestamp}.csv`;
        await this.csvGenerator.writeRecords(prodPathTemp, records, columns);
        tempFiles.push(prodPathTemp);
        finalResults.push({
          path: prodPathFinal,
          rowCount: records.length,
          isTestFile: false,
          audienceType: type,
        });

        // Test CSV (founder only) - only if we have production data
        const testPathTemp = `${outputDir}/${prefix}_TEST_${timestamp}.csv.tmp`;
        const testPathFinal = `${outputDir}/${prefix}_TEST_${timestamp}.csv`;
        const testRecord = this.createTestRecord(records[0], type);
        await this.csvGenerator.writeRecords(testPathTemp, [testRecord], columns);
        tempFiles.push(testPathTemp);
        finalResults.push({
          path: testPathFinal,
          rowCount: 1,
          isTestFile: true,
          audienceType: type,
        });
      }

      // Atomic rename - only if all files generated successfully
      for (let i = 0; i < tempFiles.length; i++) {
        const tempFile = tempFiles[i];
        const finalFile = finalResults[i].path;
        await fs.rename(tempFile, finalFile);
        console.log(`[${this.name}] Generated ${finalFile} (${finalResults[i].rowCount} rows)`);
      }

      return finalResults;

    } catch (error) {
      // Rollback - delete all temp files on failure
      console.error(`[${this.name}] CSV generation failed, rolling back temp files...`);
      for (const tempFile of tempFiles) {
        try {
          await fs.unlink(tempFile);
          console.log(`[${this.name}] Deleted temp file: ${tempFile}`);
        } catch {
          // Ignore unlink errors - file may not exist
        }
      }
      throw error;
    }
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
