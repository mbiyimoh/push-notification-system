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
