// src/lib/queries/targetShoeQueries.ts

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

  const overallStartTime = Date.now();
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

  const overallTimeMs = Date.now() - overallStartTime;
  console.log(`[targetShoeQueries] Total target shoes found: ${targetShoes.size}/${userIds.length} (${overallTimeMs}ms)`);
  return targetShoes;
}
