// src/lib/queries/waterfallQueries.ts

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
 * Generic bulk user completion checker
 * Returns Map<userId, hasCompleted>
 */
async function checkBulkUserCompletion(
  pool: Pool,
  userIds: string[],
  options: {
    tableName: string;
    userIdColumn: string;
    additionalConditions?: string;
    logLabel: string;
  }
): Promise<Map<string, boolean>> {
  if (userIds.length === 0) return new Map();

  const startTime = Date.now();
  const whereClause = options.additionalConditions
    ? `AND ${options.additionalConditions}`
    : '';

  const query = `
    SELECT DISTINCT ${options.userIdColumn} as user_id
    FROM ${options.tableName}
    WHERE ${options.userIdColumn} = ANY($1::uuid[])
    ${whereClause}
  `;

  const result = await pool.query(query, [userIds]);
  const completedSet = new Set(result.rows.map(r => r.user_id));

  const completionMap = new Map<string, boolean>();
  for (const userId of userIds) {
    completionMap.set(userId, completedSet.has(userId));
  }

  const queryTimeMs = Date.now() - startTime;
  console.log(`[waterfallQueries] ${options.logLabel}: ${result.rows.length}/${userIds.length} (${queryTimeMs}ms)`);
  return completionMap;
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
  const startTime = Date.now();
  console.log(`[waterfallQueries] Fetching new users (${minHours}h - ${maxDays}d window)`);

  // Convert days to hours for parameterized interval
  const maxHours = maxDays * 24;

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
    WHERE u.created_at BETWEEN NOW() - make_interval(hours => $1)
                           AND NOW() - make_interval(hours => $2)
    AND u.deleted_at = 0
    AND u.first_name IS NOT NULL
    ORDER BY u.created_at DESC
  `;

  const result = await pool.query(query, [maxHours, minHours]);
  const queryTimeMs = Date.now() - startTime;
  console.log(`[waterfallQueries] Found ${result.rows.length} new users (${queryTimeMs}ms)`);
  return result.rows;
}

/**
 * Check which users have added any items to their closet
 */
export async function checkUsersClosetCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>> {
  return checkBulkUserCompletion(pool, userIds, {
    tableName: 'inventory_items',
    userIdColumn: 'user_id',
    logLabel: 'Closet completion',
  });
}

/**
 * Check which users have updated their bio
 */
export async function checkUsersBioCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>> {
  if (userIds.length === 0) return new Map();

  const startTime = Date.now();

  // Bio check needs special handling - checking users table with bio condition
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

  const queryTimeMs = Date.now() - startTime;
  console.log(`[waterfallQueries] Bio completion: ${result.rows.length}/${userIds.length} (${queryTimeMs}ms)`);

  return completionMap;
}

/**
 * Check which users have created any offers
 */
export async function checkUsersOfferCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>> {
  return checkBulkUserCompletion(pool, userIds, {
    tableName: 'offers',
    userIdColumn: 'creator_user_id',
    logLabel: 'Offer completion',
  });
}

/**
 * Check which users have added any wishlist items
 */
export async function checkUsersWishlistCompletion(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, boolean>> {
  return checkBulkUserCompletion(pool, userIds, {
    tableName: 'wishlist_items',
    userIdColumn: 'user_id',
    additionalConditions: 'deleted_at = 0',
    logLabel: 'Wishlist completion',
  });
}
