# /basic_capabilities/internal_db_queries_toolbox/email_csv_queries.py

"""
This file contains the reusable, modular database queries for generating
email marketing CSVs. These functions are the core "building blocks"
for all email-related data pipelines.
"""
import datetime
import time
from typing import List, Dict, Any, Optional
from .sql_utils import execute_query


def get_audience(days_since_last_active: int, min_closet_items: int, min_lifetime_trades: int):
    """
    Fetches a list of users based on activity and engagement criteria.

    Args:
        days_since_last_active: The maximum number of days since a user was last active.
        min_closet_items: The minimum number of items a user must have in their closet (open for trade).
        min_lifetime_trades: The minimum number of completed trades a user must have.

    Returns:
        A list of dictionaries, where each dictionary represents a unique user
        and contains 'user_id', 'email', 'first_name', and 'shoe_size'.
    """
    last_active_date = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days_since_last_active)
    
    sql_query = """
        WITH user_closet_counts AS (
            SELECT
                user_id,
                COUNT(id) AS open_for_trade_count
            FROM inventory_items
            WHERE status = 'OPEN_FOR_TRADE'
            GROUP BY user_id
        ),
        user_size_preferences AS (
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
            u.id AS user_id,
            u.email AS user_email,
            u.first_name AS user_first_name,
            usp.shoe_size
        FROM users u
        JOIN user_activities ua ON u.id = ua.user_id
        LEFT JOIN user_closet_counts ucc ON u.id = ucc.user_id
        JOIN user_size_preferences usp ON u.id = usp.user_id
        WHERE
            ua.last_active >= %(last_active)s
            AND u.completed_trades_count >= %(min_trades)s
            AND COALESCE(ucc.open_for_trade_count, 0) >= %(min_closet)s
            AND u.deleted_at = 0
            AND u.email IS NOT NULL
            AND u.first_name IS NOT NULL
            AND usp.shoe_size IS NOT NULL;
    """
    
    params = {
        "last_active": last_active_date.isoformat(),
        "min_trades": min_lifetime_trades,
        "min_closet": min_closet_items
    }

    results = execute_query(sql_query, params)
    
    return results

def get_products_by_ids(product_ids: List[str], days_since: int) -> List[Dict[str, Any]]:
    """
    Fetches detailed data for a list of products, including recent interaction stats.

    This function fetches basic product details (name, brand, model, image) and calculates
    key interaction statistics (offers, closet additions, wishlist additions) over a
    specified number of recent days.

    Args:
        product_ids: A list of product UUIDs to fetch data for.
        days_since: The lookback period in days for calculating recent stats.

    Returns:
        A list of dictionaries, where each dictionary represents a product
        and its associated data. Returns an empty list if no data is found.
    """
    sql_query = """
    WITH product_variants_of_interest AS (
        SELECT id, product_id FROM product_variants WHERE product_id = ANY(%(product_ids)s::uuid[])
    ),
    offers_created AS (
        SELECT pvi.product_id, COUNT(o.id) AS count
        FROM offers o
        JOIN offer_items oi ON o.id = oi.offer_id
        JOIN product_variants_of_interest pvi ON oi.product_variant_id = pvi.id
        WHERE o.created_at >= now() - interval '%(days_since)s days'
        GROUP BY pvi.product_id
    ),
    closet_adds AS (
        SELECT pvi.product_id, COUNT(ii.id) AS count
        FROM inventory_items ii
        JOIN product_variants_of_interest pvi ON ii.product_variant_id = pvi.id
        WHERE ii.created_at >= now() - interval '%(days_since)s days'
        GROUP BY pvi.product_id
    ),
    wishlist_adds AS (
        SELECT pvi.product_id, COUNT(wi.id) AS count
        FROM wishlist_items wi
        JOIN product_variants_of_interest pvi ON wi.product_variant_id = pvi.id
        WHERE wi.created_at >= now() - interval '%(days_since)s days'
        GROUP BY pvi.product_id
    )
    SELECT
        p.id,
        p.name,
        p.index_cache->>'brand' AS brand,
        p.index_cache->>'model' AS model,
        (SELECT f.path FROM files f WHERE f.product_id = p.id ORDER BY f."order" ASC NULLS LAST LIMIT 1) AS primary_image_path,
        COALESCE(oc.count, 0) AS recent_offers_to_get,
        COALESCE(ca.count, 0) AS recent_closet_adds,
        COALESCE(wa.count, 0) AS recent_wishlist_adds
    FROM
        products p
        LEFT JOIN offers_created oc ON p.id = oc.product_id
        LEFT JOIN closet_adds ca ON p.id = ca.product_id
        LEFT JOIN wishlist_adds wa ON p.id = wa.product_id
    WHERE
        p.id = ANY(%(product_ids)s::uuid[]);
    """
    params = {'product_ids': product_ids, 'days_since': days_since}
    
    try:
        results = execute_query(sql_query, params)
        return results
    except Exception as e:
        print(f"An error occurred in get_products_by_ids: {e}")
        return []

def get_variants_by_product_ids(product_ids: List[str], days_since: int) -> List[Dict[str, Any]]:
    """
    Retrieves detailed statistics for all variants of a given list of product IDs.

    This function takes a list of product IDs, finds all associated product variants (sizes),
    and then calculates both lifetime and time-bound statistics for each variant.

    Args:
        product_ids: A list of product UUIDs.
        days_since: The lookback period in days for time-bound statistics.

    Returns:
        A list of dictionaries, each containing comprehensive stats for a single product variant.
    """
    if not product_ids:
        return []

    sql_query = """
    WITH variant_base AS (
        SELECT
            pv.id,
            p.id as product_id,
            p.name as product_name,
            pv.index_cache->>'mens_size' AS size
        FROM product_variants pv
        JOIN products p ON pv.product_id = p.id
        WHERE p.id = ANY(%(product_ids)s::uuid[])
    ),
    total_offers_get AS (
        SELECT vb.id as product_variant_id, COUNT(oi.id) as count
        FROM variant_base vb
        JOIN offer_items oi ON vb.id = oi.product_variant_id
        JOIN offers o ON oi.offer_id = o.id
        WHERE oi.offer_item_owner = 'RECEIVER' AND o.offer_status = 'OPEN'
        GROUP BY vb.id
    ),
    total_offers_give AS (
        SELECT vb.id as product_variant_id, COUNT(oi.id) as count
        FROM variant_base vb
        JOIN offer_items oi ON vb.id = oi.product_variant_id
        JOIN offers o ON oi.offer_id = o.id
        WHERE oi.offer_item_owner = 'CREATOR' AND o.offer_status = 'OPEN'
        GROUP BY vb.id
    ),
    total_closet_owners AS (
        SELECT vb.id as product_variant_id, COUNT(ii.id) as count
        FROM variant_base vb
        JOIN inventory_items ii ON vb.id = ii.product_variant_id
        WHERE ii.status = 'OPEN_FOR_TRADE'
        GROUP BY vb.id
    ),
    total_wishlist_adds AS (
        SELECT vb.id as product_variant_id, COUNT(wi.id) as count
        FROM variant_base vb
        JOIN wishlist_items wi ON vb.id = wi.product_variant_id
        WHERE wi.deleted_at = 0
        GROUP BY vb.id
    ),
    recent_offers_get AS (
        SELECT vb.id as product_variant_id, COUNT(oi.id) as count
        FROM variant_base vb
        JOIN offer_items oi ON vb.id = oi.product_variant_id
        JOIN offers o ON oi.offer_id = o.id
        WHERE oi.offer_item_owner = 'RECEIVER' AND o.created_at >= NOW() - make_interval(days => %(days_since)s)
        GROUP BY vb.id
    ),
    recent_offers_give AS (
        SELECT vb.id as product_variant_id, COUNT(oi.id) as count
        FROM variant_base vb
        JOIN offer_items oi ON vb.id = oi.product_variant_id
        JOIN offers o ON oi.offer_id = o.id
        WHERE oi.offer_item_owner = 'CREATOR' AND o.created_at >= NOW() - make_interval(days => %(days_since)s)
        GROUP BY vb.id
    ),
    recent_closet_adds AS (
        SELECT vb.id as product_variant_id, COUNT(ii.id) as count
        FROM variant_base vb
        JOIN inventory_items ii ON vb.id = ii.product_variant_id
        WHERE ii.created_at >= NOW() - make_interval(days => %(days_since)s)
        GROUP BY vb.id
    ),
    recent_wishlist_adds AS (
        SELECT vb.id as product_variant_id, COUNT(wi.id) as count
        FROM variant_base vb
        JOIN wishlist_items wi ON vb.id = wi.product_variant_id
        WHERE wi.created_at >= NOW() - make_interval(days => %(days_since)s)
        GROUP BY vb.id
    ),
    recent_trades AS (
        SELECT vb.id as product_variant_id, COUNT(t.id) as count
        FROM variant_base vb
        JOIN offer_items oi ON vb.id = oi.product_variant_id
        JOIN trades t ON oi.offer_id = t.offer_id
        WHERE t.validation_passed_date >= NOW() - make_interval(days => %(days_since)s)
        GROUP BY vb.id
    )
    SELECT
        vb.id as variant_id,
        vb.product_id,
        vb.product_name,
        vb.size,
        COALESCE(tog.count, 0) as total_offers_to_get,
        COALESCE(tov.count, 0) as total_offers_to_give,
        COALESCE(tco.count, 0) as total_closet_owners,
        COALESCE(twa.count, 0) as total_wishlist_adds,
        COALESCE(rog.count, 0) as recent_offers_to_get,
        COALESCE(rfg.count, 0) as recent_offers_to_give,
        COALESCE(rca.count, 0) as recent_closet_adds,
        COALESCE(rwa.count, 0) as recent_wishlist_adds,
        COALESCE(rt.count, 0) as recent_trades
    FROM
        variant_base vb
        LEFT JOIN total_offers_get tog ON vb.id = tog.product_variant_id
        LEFT JOIN total_offers_give tov ON vb.id = tov.product_variant_id
        LEFT JOIN total_closet_owners tco ON vb.id = tco.product_variant_id
        LEFT JOIN total_wishlist_adds twa ON vb.id = twa.product_variant_id
        LEFT JOIN recent_offers_get rog ON vb.id = rog.product_variant_id
        LEFT JOIN recent_offers_give rfg ON vb.id = rfg.product_variant_id
        LEFT JOIN recent_closet_adds rca ON vb.id = rca.product_variant_id
        LEFT JOIN recent_wishlist_adds rwa ON vb.id = rwa.product_variant_id
        LEFT JOIN recent_trades rt ON vb.id = rt.product_variant_id
    ORDER BY
        vb.product_name, vb.size;
    """

    params = {'product_ids': product_ids, 'days_since': days_since}
    results = execute_query(sql_query, params)
    return results

def get_user_data_by_ids(user_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Fetches basic user data (email, first name, shoe size) for a list of user IDs.
    """
    if not user_ids:
        return []

    query = """
    SELECT
        u.id AS user_id,
        u.email,
        u.first_name,
        av.value AS user_size
    FROM users u
    LEFT JOIN user_preferences up ON u.id = up.user_id
    LEFT JOIN attribute_preferences ap ON up.id = ap.user_preference_id
    LEFT JOIN attributes a ON ap.attribute_id = a.id AND a.name = 'mens_size'
    LEFT JOIN attribute_values av ON ap.attribute_value_id = av.id
    WHERE u.id = ANY(%(user_ids)s::uuid[]) AND ap.preferred = TRUE;
    """
    params = {'user_ids': user_ids}
    return execute_query(query, params)

def get_top_target_shoe_for_users(user_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Fetches the top target shoe for a list of users based on the highest offer count.
    """
    if not user_ids:
        return []

    query = """
    WITH ranked_desired_items AS (
        SELECT
            di.user_id,
            di.product_variant_id,
            p.name as product_name,
            ROW_NUMBER() OVER(PARTITION BY di.user_id ORDER BY di.offers_count DESC, di.created_at DESC) as rn
        FROM desired_items di
        JOIN product_variants pv ON di.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE di.user_id = ANY(%(user_ids)s::uuid[]) AND di.deleted_at = 0
    )
    SELECT
        user_id,
        product_variant_id as top_target_shoe_variantid,
        product_name as top_target_shoe_name
    FROM ranked_desired_items
    WHERE rn = 1;
    """
    params = {'user_ids': user_ids}
    return execute_query(query, params) 