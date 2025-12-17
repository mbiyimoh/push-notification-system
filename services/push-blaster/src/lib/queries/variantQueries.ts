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

  console.log(`[variantQueries] Fetching sizes for ${variantIds.length} variants`);

  const query = `
    SELECT
      pv.id as variant_id,
      COALESCE(pv.index_cache->>'mens_size', 'Unknown') as size
    FROM product_variants pv
    WHERE pv.id = ANY($1::uuid[])
  `;

  const startTime = Date.now();
  const result = await pool.query(query, [variantIds]);
  const queryTimeMs = Date.now() - startTime;

  console.log(`[variantQueries] Size query completed in ${queryTimeMs}ms`);

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

  console.log(`[variantQueries] Fetching inventory counts for ${variantIds.length} variants`);

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

  const startTime = Date.now();
  const result = await pool.query(query, [variantIds]);
  const queryTimeMs = Date.now() - startTime;

  console.log(`[variantQueries] Inventory query completed in ${queryTimeMs}ms`);

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

  console.log(`[variantQueries] Fetching wishlist counts for ${variantIds.length} variants`);

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

  const startTime = Date.now();
  const result = await pool.query(query, [variantIds]);
  const queryTimeMs = Date.now() - startTime;

  console.log(`[variantQueries] Wishlist query completed in ${queryTimeMs}ms`);

  const countMap = new Map<string, number>();
  for (const row of result.rows) {
    countMap.set(row.variant_id, row.wishlist_count);
  }

  return countMap;
}
