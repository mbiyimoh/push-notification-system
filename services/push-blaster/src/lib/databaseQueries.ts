import pool from './db';

interface AudienceFilters {
  lastActiveDays?: number;
  daysSinceLastActive_inactive?: number;
  tradedInLastDays?: number;
  notTradedInLastDays?: number;
  minLifetimeTrades?: number;
  maxLifetimeTrades?: number;
  hasTrustedTrader?: boolean | null;
  isTrustedTraderCandidate?: boolean | null;
  joinedAfterDate?: string;
  manualUserIds?: string[];
}

interface DataPacks {
  topTargetShoe: boolean;
  hottestShoeTraded: boolean;
  hottestShoeOffers: boolean;
}

export interface UserData {
  id: string;
  firstName?: string;
  username?: string;
  lastActive?: string;
  preferredSize?: string;
  top_target_shoe_name?: string;
  top_target_shoe_variantid?: string;
  hottest_shoe_traded_name?: string;
  hottest_shoe_traded_variantid?: string;
  hottest_shoe_traded_count?: number;
  hottest_shoe_offers_name?: string;
  hottest_shoe_offers_variantid?: string;
  hottest_shoe_offers_count?: number;
}

/**
 * Execute database query via Python script using our established sql_utils.py infrastructure
 * This directly executes Python without nested API calls
 */
export async function executeQuery(query: string, params: any[] = []): Promise<any[]> {
    const client = await pool.connect();
    try {
        const result = await client.query(query, params);
        return result.rows;
    } finally {
        client.release();
    }
}

/**
 * Query users based on filtering criteria using established database patterns
 */
export const queryUsers = async (filters: AudienceFilters): Promise<any[]> => {
  
  try {
    const whereClauses: string[] = [];
    
    whereClauses.push('u.deleted_at = 0');

    // User activity filtering
    if (filters.lastActiveDays) {
        whereClauses.push(`ua.last_active >= NOW() - INTERVAL '${filters.lastActiveDays} days'`);
    }

    // Trading activity filters
    if (filters.tradedInLastDays) {
      whereClauses.push(`
        EXISTS (
          SELECT 1 FROM offers o 
          JOIN trades t ON o.id = t.offer_id 
          WHERE (o.creator_user_id = u.id OR o.receiver_user_id = u.id)
          AND t.validation_passed_date IS NOT NULL
          AND t.validation_passed_date >= NOW() - INTERVAL '${filters.tradedInLastDays} days'
        )
      `);
    }

    if (filters.notTradedInLastDays) {
      whereClauses.push(`
        NOT EXISTS (
          SELECT 1 FROM offers o 
          JOIN trades t ON o.id = t.offer_id 
          WHERE (o.creator_user_id = u.id OR o.receiver_user_id = u.id)
          AND t.validation_passed_date IS NOT NULL
          AND t.validation_passed_date >= NOW() - INTERVAL '${filters.notTradedInLastDays} days'
        )
      `);
    }

    if (filters.minLifetimeTrades) {
      whereClauses.push(`u.completed_trades_count >= ${filters.minLifetimeTrades}`);
    }

    if (filters.maxLifetimeTrades) {
      whereClauses.push(`u.completed_trades_count <= ${filters.maxLifetimeTrades}`);
    }

    if (filters.hasTrustedTrader === false) {
      whereClauses.push(`u.is_trusted_trader = false`);
    }

    if (filters.isTrustedTraderCandidate === true) {
      whereClauses.push(`uai.is_trusted_trader_candidate = true`);
    } else if (filters.isTrustedTraderCandidate === false) {
      whereClauses.push(`(uai.is_trusted_trader_candidate = false OR uai.is_trusted_trader_candidate IS NULL)`);
    }

    if (filters.joinedAfterDate) {
      whereClauses.push(`u.created_at >= '${filters.joinedAfterDate}'`);
    }

    const query = `
      WITH user_offers_last_90_days AS (
        SELECT creator_user_id as user_id, COUNT(id) AS count
        FROM offers
        WHERE created_at >= NOW() - INTERVAL '90 days'
        GROUP BY creator_user_id
      ),
      user_validated_trades_last_90_days AS (
        SELECT user_id, COUNT(*) as count
        FROM (
            SELECT o.creator_user_id as user_id
            FROM trades t
            JOIN offers o ON t.offer_id = o.id
            WHERE t.validation_passed_date >= NOW() - INTERVAL '90 days'
                AND t.validation_passed_date IS NOT NULL
            UNION ALL
            SELECT o.receiver_user_id as user_id
            FROM trades t
            JOIN offers o ON t.offer_id = o.id
            WHERE t.validation_passed_date >= NOW() - INTERVAL '90 days'
                AND t.validation_passed_date IS NOT NULL
        ) all_trade_users
        GROUP BY user_id
      )
      SELECT DISTINCT u.id::text as user_id, ua.last_active
      FROM users u
      LEFT JOIN user_activities ua ON u.id = ua.user_id
      LEFT JOIN user_offers_last_90_days uo90 ON u.id = uo90.user_id
      LEFT JOIN user_validated_trades_last_90_days uvt90 ON u.id = uvt90.user_id
      LEFT JOIN user_admin_informations uai ON u.id = uai.user_id
      WHERE ${whereClauses.join(' AND ')}
      AND (uai.freeze_reason IS NULL OR uai.freeze_reason = '')
      ORDER BY user_id
    `;

    const result = await executeQuery(query);
    // The query returns an array of objects like [{user_id: '...'}], extract the IDs
    return result.map((row: any) => row.user_id);

  } catch (error) {
    console.error('Error in queryUsers:', error);
    throw new Error(`Failed to query users: ${error}`);
  }
};


/**
 * Fetch data packs for specific user IDs using established query patterns
 */
export const fetchDataPacks = async (userIds: string[], dataPacks: DataPacks): Promise<UserData[]> => {
  console.log(`Real database query - fetching data packs for ${userIds.length} users with packs:`, dataPacks);
  
  if (userIds.length === 0) {
    return [];
  }

  const userMap: { [key: string]: UserData } = {};
  const batchSize = 5000; // Process 5000 users at a time to avoid E2BIG

  try {
    for (let i = 0; i < userIds.length; i += batchSize) {
      const batchUserIds = userIds.slice(i, i + batchSize);
      console.log(`--- Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(userIds.length / batchSize)} (size: ${batchUserIds.length}) ---`);

      // Base user data with firstName for the current batch
      const baseUserQuery = `
        SELECT 
          u.id::text as user_id,
          u.first_name as firstName,
          u.username,
          ua.last_active
        FROM users u
        LEFT JOIN user_activities ua ON u.id = ua.user_id
        WHERE u.id = ANY($1::uuid[])
        AND u.deleted_at = 0
      `;
      const baseUsersInBatch = await executeQuery(baseUserQuery, [batchUserIds]);
      
      baseUsersInBatch.forEach((user: any) => {
        userMap[user.user_id] = {
          id: user.user_id,
          firstName: user.firstname, // Corrected from firstName to firstname
          username: user.username,
          lastActive: user.last_active,
        };
      });

      // Fetch top target shoe data using a 3-step fallback process for the current batch
      if (dataPacks.topTargetShoe) {
        let usersToEnrich = [...batchUserIds];

        // Step 1: User's Top Desired Item (strongest signal)
        if (usersToEnrich.length > 0) {
          const topTargetQuery = `
            WITH ranked_desired_items AS (
              SELECT
                di.user_id::text,
                di.product_variant_id::text as top_target_shoe_variantid,
                p.name as top_target_shoe_name,
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
            SELECT user_id, top_target_shoe_variantid, top_target_shoe_name
            FROM ranked_desired_items
            WHERE rn = 1
          `;
          const topTargetResults = await executeQuery(topTargetQuery, [usersToEnrich]);
          topTargetResults.forEach((row: any) => {
            if (userMap[row.user_id]) {
              userMap[row.user_id].top_target_shoe_name = row.top_target_shoe_name;
              userMap[row.user_id].top_target_shoe_variantid = row.top_target_shoe_variantid;
            }
          });
          usersToEnrich = usersToEnrich.filter(id => !userMap[id].top_target_shoe_name);
        }

        // Step 2: User's Most Recent Offer Target (fallback)
        if (usersToEnrich.length > 0) {
          const recentOfferQuery = `
            WITH ranked_offers AS (
                SELECT
                    o.creator_user_id,
                    oi.product_variant_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY o.creator_user_id 
                        ORDER BY o.created_at DESC
                    ) as rn
                FROM offers o
                JOIN offer_items oi ON o.id = oi.offer_id
                WHERE o.creator_user_id = ANY($1::uuid[])
            )
            SELECT
                ro.creator_user_id as user_id,
                p.name as top_target_shoe_name,
                pv.id::text as top_target_shoe_variantid
            FROM ranked_offers ro
            JOIN product_variants pv ON ro.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE ro.rn = 1
          `;
          const recentOfferResults = await executeQuery(recentOfferQuery, [usersToEnrich]);
          recentOfferResults.forEach((row: any) => {
            if (userMap[row.user_id]) {
              userMap[row.user_id].top_target_shoe_name = row.top_target_shoe_name;
              userMap[row.user_id].top_target_shoe_variantid = row.top_target_shoe_variantid;
            }
          });
          usersToEnrich = usersToEnrich.filter(id => !userMap[id].top_target_shoe_name);
        }
        
        // Step 3: User's Newest Wishlist Addition (final fallback)
        if (usersToEnrich.length > 0) {
          const wishlistQuery = `
            WITH ranked_wishlist AS (
                SELECT
                    wi.user_id,
                    wi.product_variant_id,
                    ROW_NUMBER() OVER (
                        PARTITION BY wi.user_id 
                        ORDER BY wi.created_at DESC
                    ) as rn
                FROM wishlist_items wi
                WHERE wi.user_id = ANY($1::uuid[])
                AND wi.deleted_at = 0
            )
            SELECT
                rw.user_id::text,
                p.name as top_target_shoe_name,
                pv.id::text as top_target_shoe_variantid
            FROM ranked_wishlist rw
            JOIN product_variants pv ON rw.product_variant_id = pv.id
            JOIN products p ON pv.product_id = p.id
            WHERE rw.rn = 1
          `;
          const wishlistResults = await executeQuery(wishlistQuery, [usersToEnrich]);
          wishlistResults.forEach((row: any) => {
              if (userMap[row.user_id]) {
                  userMap[row.user_id].top_target_shoe_name = row.top_target_shoe_name;
                  userMap[row.user_id].top_target_shoe_variantid = row.top_target_shoe_variantid;
              }
          });
        }
      }

      // Fetch hottest shoe traded data for the current batch
      if (dataPacks.hottestShoeTraded) {
        const hottestTradedQuery = `
          WITH TradeCounts AS (
            SELECT
              oi.product_variant_id,
              COUNT(t.id) AS trade_count
            FROM trades t
            JOIN offers o ON t.offer_id = o.id
            JOIN offer_items oi ON o.id = oi.offer_id
            WHERE t.validation_passed_date >= NOW() - INTERVAL '30 days'
            GROUP BY oi.product_variant_id
          ),
          UserInventory AS (
            SELECT
              inv.user_id,
              inv.product_variant_id
            FROM inventory_items inv
            WHERE inv.user_id = ANY($1::uuid[]) AND inv.status = 'OPEN_FOR_TRADE' AND inv.deleted_at = 0
          ),
          RankedInventory AS (
            SELECT
              ui.user_id,
              ui.product_variant_id,
              tc.trade_count,
              ROW_NUMBER() OVER(PARTITION BY ui.user_id ORDER BY tc.trade_count DESC, ui.product_variant_id) as rn
            FROM UserInventory ui
            JOIN TradeCounts tc ON ui.product_variant_id = tc.product_variant_id
          )
          SELECT
            ri.user_id,
            p.name as hottest_shoe_traded_name,
            pv.id::text as hottest_shoe_traded_variantid,
            ri.trade_count as hottest_shoe_traded_count
          FROM RankedInventory ri
          JOIN product_variants pv ON ri.product_variant_id = pv.id
          JOIN products p ON pv.product_id = p.id
          WHERE ri.rn = 1
        `;

        const hottestTradedResults = await executeQuery(hottestTradedQuery, [batchUserIds]);
        hottestTradedResults.forEach((row: any) => {
          if (userMap[row.user_id]) {
            userMap[row.user_id].hottest_shoe_traded_name = row.hottest_shoe_traded_name;
            userMap[row.user_id].hottest_shoe_traded_variantid = row.hottest_shoe_traded_variantid;
            userMap[row.user_id].hottest_shoe_traded_count = parseInt(row.hottest_shoe_traded_count);
          }
        });
      }

      // Fetch hottest shoe offers data for the current batch
      if (dataPacks.hottestShoeOffers) {
        const hottestOffersQuery = `
          WITH OfferCounts AS (
            SELECT
              oi.product_variant_id,
              COUNT(o.id) AS offer_count
            FROM offers o
            JOIN offer_items oi ON o.id = oi.offer_id
            WHERE o.created_at >= NOW() - INTERVAL '7 days' AND o.offer_status = 'OPEN'
            GROUP BY oi.product_variant_id
          ),
          UserInventory AS (
            SELECT
              inv.user_id,
              inv.product_variant_id
            FROM inventory_items inv
            WHERE inv.user_id = ANY($1::uuid[]) AND inv.status = 'OPEN_FOR_TRADE' AND inv.deleted_at = 0
          ),
          RankedInventory AS (
            SELECT
              ui.user_id,
              ui.product_variant_id,
              oc.offer_count,
              ROW_NUMBER() OVER(PARTITION BY ui.user_id ORDER BY oc.offer_count DESC, ui.product_variant_id) as rn
            FROM UserInventory ui
            JOIN OfferCounts oc ON ui.product_variant_id = oc.product_variant_id
          )
          SELECT
            ri.user_id,
            p.name as hottest_shoe_offers_name,
            pv.id::text as hottest_shoe_offers_variantid,
            ri.offer_count as hottest_shoe_offers_count
          FROM RankedInventory ri
          JOIN product_variants pv ON ri.product_variant_id = pv.id
          JOIN products p ON pv.product_id = p.id
          WHERE ri.rn = 1
        `;
        const hottestOffersResults = await executeQuery(hottestOffersQuery, [batchUserIds]);
        hottestOffersResults.forEach((row: any) => {
          if (userMap[row.user_id]) {
            userMap[row.user_id].hottest_shoe_offers_name = row.hottest_shoe_offers_name;
            userMap[row.user_id].hottest_shoe_offers_variantid = row.hottest_shoe_offers_variantid;
            userMap[row.user_id].hottest_shoe_offers_count = parseInt(row.hottest_shoe_offers_count);
          }
        });
      }
    }
    return Object.values(userMap);
  } catch (error) {
    console.error('Error in fetchDataPacks:', error);
    throw new Error(`Failed to fetch data packs: ${error}`);
  }
};

/**
 * Manual audience creation - fetch data packs for manually provided user IDs
 */
export const fetchManualAudienceData = async (userIds: string[], dataPacks: DataPacks): Promise<UserData[]> => {
  console.log('Manual audience creation - fetching data packs for user IDs:', userIds);
  
  return await fetchDataPacks(userIds, dataPacks);
}; 