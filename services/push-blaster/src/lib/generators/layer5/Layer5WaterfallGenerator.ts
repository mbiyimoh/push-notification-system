// src/lib/generators/layer5/Layer5WaterfallGenerator.ts

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

    // Level 1: No Shoes (users who haven't added anything to closet)
    const userIds = remainingUsers.map(u => u.user_id);
    const closetCompletion = await checkUsersClosetCompletion(this.pool, userIds);

    const level1Users = remainingUsers.filter(u => !closetCompletion.get(u.user_id));
    results[1] = level1Users.map(u => this.toWaterfallRecord(u, 1));
    remainingUsers = remainingUsers.filter(u => closetCompletion.get(u.user_id));
    console.log(`[${this.name}] Level 1 (No Shoes): ${results[1].length} extracted, ${remainingUsers.length} remaining`);

    if (remainingUsers.length === 0) return results;

    // Level 2: No Bio (users with closet but no bio)
    const bioCompletion = await checkUsersBioCompletion(
      this.pool,
      remainingUsers.map(u => u.user_id)
    );

    const level2Users = remainingUsers.filter(u => !bioCompletion.get(u.user_id));
    results[2] = level2Users.map(u => this.toWaterfallRecord(u, 2));
    remainingUsers = remainingUsers.filter(u => bioCompletion.get(u.user_id));
    console.log(`[${this.name}] Level 2 (No Bio): ${results[2].length} extracted, ${remainingUsers.length} remaining`);

    if (remainingUsers.length === 0) return results;

    // Level 3: No Offers (users with closet + bio but no offers)
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

    // Level 4: No Wishlist (users with closet + bio + offers but no wishlist)
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

    // Level 5: New Stars (all remaining users - have completed everything)
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
          ? [...WATERFALL_CSV_COLUMNS.levels_3_4_5]
          : [...WATERFALL_CSV_COLUMNS.levels_1_2];

        // Production CSV
        const prodPathTemp = `${outputDir}/${config.prefix}-${timestamp}.csv.tmp`;
        const prodPathFinal = `${outputDir}/${config.prefix}-${timestamp}.csv`;
        await this.csvGenerator.writeRecords(prodPathTemp, records, columns);
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
        await this.csvGenerator.writeRecords(testPathTemp, [testRecord], columns);
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
