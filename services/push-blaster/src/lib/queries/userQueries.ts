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
 * Uses bulk query with ANY() to avoid N+1 problem
 */
export async function getUserProfilesByIds(
  pool: Pool,
  userIds: string[]
): Promise<Map<string, UserProfile>> {
  if (userIds.length === 0) return new Map();

  console.log(`[userQueries] Fetching ${userIds.length} user profiles`);

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

  const startTime = Date.now();
  const result = await pool.query(query, [userIds]);
  const queryTimeMs = Date.now() - startTime;

  console.log(`[userQueries] Query completed in ${queryTimeMs}ms, found ${result.rows.length} profiles`);

  const profileMap = new Map<string, UserProfile>();
  for (const row of result.rows) {
    profileMap.set(row.user_id, row as UserProfile);
  }

  return profileMap;
}
