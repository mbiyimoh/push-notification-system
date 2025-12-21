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
  // Index signature for CsvGenerator compatibility
  [key: string]: string | number | undefined;
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
