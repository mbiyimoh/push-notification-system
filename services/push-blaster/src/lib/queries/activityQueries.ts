// src/lib/queries/activityQueries.ts

import { Pool } from 'pg';
import { ActivityRecord } from '../generators/types';

/**
 * Fetch recent high-intent user activity (offers, closet adds, wishlist adds)
 *
 * Time window: (now - lookbackHours) to (now - coolingHours)
 * The cooling period prevents spamming users who just performed actions
 *
 * Query Characteristics:
 * - Complexity: O(n) with 3-way UNION ALL
 * - Expected result size: 100-1000 rows for 48h window
 * - Average execution time: 200-500ms
 * - Uses parameterized queries to prevent SQL injection
 */
export async function getDailyActivityData(
  pool: Pool,
  lookbackHours: number,
  coolingHours: number
): Promise<ActivityRecord[]> {
  const effectiveLookback = lookbackHours - coolingHours;

  console.log(`[activityQueries] Fetching activity: lookback=${effectiveLookback}h, cooling=${coolingHours}h`);

  // Use make_interval() for parameterized interval values (prevents SQL injection)
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
      WHERE ii.created_at >= NOW() - make_interval(hours => $1)
        AND ii.created_at < NOW() - make_interval(hours => $2)
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
      WHERE wi.created_at >= NOW() - make_interval(hours => $1)
        AND wi.created_at < NOW() - make_interval(hours => $2)
        AND wi.deleted_at = 0
        AND u.deleted_at = 0

      UNION ALL

      -- Recent offer creations (first item only for multi-item offers)
      SELECT
        sub.creator_user_id as user_id,
        'offer_created'::text as action_type,
        p.name as product_name,
        sub.product_variant_id as variant_id,
        sub.created_at
      FROM (
        SELECT
          o.id,
          o.creator_user_id,
          o.created_at,
          oi.product_variant_id,
          ROW_NUMBER() OVER (PARTITION BY o.id ORDER BY oi.id ASC) as item_rank
        FROM offers o
        JOIN offer_items oi ON o.id = oi.offer_id
        WHERE o.created_at >= NOW() - make_interval(hours => $1)
          AND o.created_at < NOW() - make_interval(hours => $2)
      ) sub
      JOIN product_variants pv ON sub.product_variant_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN users u ON sub.creator_user_id = u.id
      WHERE sub.item_rank = 1
        AND u.deleted_at = 0
    )
    SELECT * FROM recent_activity
    ORDER BY created_at DESC
  `;

  const startTime = Date.now();
  const result = await pool.query(query, [effectiveLookback, coolingHours]);
  const queryTimeMs = Date.now() - startTime;

  console.log(`[activityQueries] Query completed in ${queryTimeMs}ms, found ${result.rows.length} records`);

  return result.rows as ActivityRecord[];
}
