"""
Push CSV Queries Module

This module contains reusable query functions for generating push notification audience CSVs.
Functions are designed to be modular, efficient, and leverage existing query-building-blocks patterns.
"""

import os
import sys
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

# Add the project root to the Python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from basic_capabilities.internal_db_queries_toolbox.sql_utils import execute_query


def get_daily_activity_data(lookback_hours: int = 24) -> List[Dict[str, Any]]:
    """
    Fetches all high-intent user actions from the last N hours as a "daily fact table".
    
    Returns combined data from closet adds, wishlist adds, and offer creations.
    Each record includes user_id, action_type, product_name, and variant_id.
    
    This function implements the daily activity query pattern for Layer 3 push notifications.
    
    Args:
        lookback_hours: Number of hours to look back for activity (default: 24)
        
    Returns:
        List of dictionaries with keys:
        - user_id: UUID of the user who performed the action
        - action_type: 'closet_add', 'wishlist_add', or 'offer_created'
        - product_name: Name of the product involved
        - variant_id: UUID of the specific product variant
        - created_at: Timestamp of the action
    """
    
    # SQL query combining all three activity types using UNION ALL
    # Based on technical notes from execution checklist
    query = """
    WITH recent_closet_adds AS (
        SELECT 
            ii.user_id,
            'closet_add' as action_type,
            p.name as product_name,
            ii.product_variant_id as variant_id,
            ii.created_at
        FROM inventory_items ii
        JOIN product_variants pv ON ii.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE ii.created_at >= NOW() - INTERVAL '%(lookback_hours)s hours'
        AND ii.status = 'OPEN_FOR_TRADE'
    ),
    recent_wishlist_adds AS (
        SELECT 
            wi.user_id,
            'wishlist_add' as action_type,
            p.name as product_name,
            wi.product_variant_id as variant_id,
            wi.created_at
        FROM wishlist_items wi
        JOIN product_variants pv ON wi.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE wi.created_at >= NOW() - INTERVAL '%(lookback_hours)s hours'
        AND wi.deleted_at = 0
    ),
    recent_offer_creations AS (
        SELECT 
            o.creator_user_id as user_id,
            'offer_created' as action_type,
            p.name as product_name,
            oi.product_variant_id as variant_id,
            o.created_at,
            ROW_NUMBER() OVER (
                PARTITION BY o.creator_user_id, o.id 
                ORDER BY oi.id ASC
            ) as item_rank
        FROM offers o
        JOIN offer_items oi ON o.id = oi.offer_id
        JOIN product_variants pv ON oi.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE o.created_at >= NOW() - INTERVAL '%(lookback_hours)s hours'
    )
    
    SELECT user_id, action_type, product_name, variant_id, created_at
    FROM recent_closet_adds
    
    UNION ALL
    
    SELECT user_id, action_type, product_name, variant_id, created_at
    FROM recent_wishlist_adds
    
    UNION ALL
    
    SELECT user_id, action_type, product_name, variant_id, created_at
    FROM recent_offer_creations
    WHERE item_rank = 1  -- Only first item for multi-item offers
    
    ORDER BY created_at DESC;
    """
    
    params = {'lookback_hours': lookback_hours}
    return execute_query(query, params)


def get_user_profile_data_by_ids(user_ids: List[str]) -> List[Dict[str, Any]]:
    """
    Fetches complete user profile data for a list of user IDs.
    
    Leverages the "Complete User Profile Data" pattern from query-building-blocks.
    
    Args:
        user_ids: List of user UUID strings
        
    Returns:
        List of dictionaries with keys:
        - user_id: UUID of the user
        - username: User's username
        - first_name: User's first name  
        - user_size: User's preferred shoe size
        - last_active: User's last activity timestamp
    """
    
    if not user_ids:
        return []
    
    # Based on "Complete User Profile Data" pattern from query-building-blocks
    query = """
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
        ua.last_active
    FROM users u
    LEFT JOIN user_size_preferences usp ON u.id = usp.user_id
    LEFT JOIN user_activities ua ON u.id = ua.user_id
    WHERE u.id = ANY(%(user_ids)s::uuid[])
    AND u.deleted_at = 0;
    """
    
    params = {'user_ids': user_ids}
    return execute_query(query, params)


def get_variant_inventory_count(variant_id: str) -> int:
    """
    Gets the count of available inventory for a specific product variant from active users only.
    
    Enhanced version of "Variant-Specific Inventory Count" pattern that ensures accuracy
    by filtering out inventory from deleted/inactive users.
    
    Args:
        variant_id: UUID of the product variant
        
    Returns:
        Integer count of OPEN_FOR_TRADE inventory items from active users
    """
    
    query = """
    SELECT COUNT(*) as inventory_count
    FROM inventory_items ii
    JOIN users u ON ii.user_id = u.id
    WHERE ii.product_variant_id = %(variant_id)s
    AND ii.status = 'OPEN_FOR_TRADE'
    AND u.deleted_at = 0
    """
    
    params = {'variant_id': variant_id}
    result = execute_query(query, params)
    return result[0]['inventory_count'] if result else 0


def get_variant_wishlist_count(variant_id: str) -> int:
    """
    Gets the count of non-deleted wishlist items for a specific product variant from active users only.
    
    Enhanced version adapted from "Variant-Specific Inventory Count" pattern that ensures accuracy
    by filtering out wishlist items from deleted/inactive users.
    
    Args:
        variant_id: UUID of the product variant
        
    Returns:
        Integer count of active wishlist items from active users
    """
    
    query = """
    SELECT COUNT(*) as wishlist_count
    FROM wishlist_items wi
    JOIN users u ON wi.user_id = u.id
    WHERE wi.product_variant_id = %(variant_id)s
    AND wi.deleted_at = 0
    AND u.deleted_at = 0
    """
    
    params = {'variant_id': variant_id}
    result = execute_query(query, params)
    return result[0]['wishlist_count'] if result else 0


def get_bulk_variant_inventory_counts(variant_ids: List[str]) -> Dict[str, int]:
    """
    Gets inventory counts for multiple variants in a single efficient query.
    
    HIGH-PERFORMANCE bulk version that eliminates N+1 query problem.
    
    Args:
        variant_ids: List of product variant UUIDs
        
    Returns:
        Dictionary mapping variant_id to inventory count from active users
    """
    
    if not variant_ids:
        return {}
    
    query = """
    SELECT 
        ii.product_variant_id,
        COUNT(*) as inventory_count
    FROM inventory_items ii
    JOIN users u ON ii.user_id = u.id
    WHERE ii.product_variant_id = ANY(%(variant_ids)s::uuid[])
    AND ii.status = 'OPEN_FOR_TRADE'
    AND u.deleted_at = 0
    GROUP BY ii.product_variant_id
    """
    
    params = {'variant_ids': variant_ids}
    results = execute_query(query, params)
    
    # Create lookup dictionary, defaulting to 0 for variants with no inventory
    counts = {variant_id: 0 for variant_id in variant_ids}
    for row in results:
        counts[row['product_variant_id']] = row['inventory_count']
    
    return counts


def get_bulk_variant_wishlist_counts(variant_ids: List[str]) -> Dict[str, int]:
    """
    Gets wishlist counts for multiple variants in a single efficient query.
    
    HIGH-PERFORMANCE bulk version that eliminates N+1 query problem.
    
    Args:
        variant_ids: List of product variant UUIDs
        
    Returns:
        Dictionary mapping variant_id to wishlist count from active users
    """
    
    if not variant_ids:
        return {}
    
    query = """
    SELECT 
        wi.product_variant_id,
        COUNT(*) as wishlist_count
    FROM wishlist_items wi
    JOIN users u ON wi.user_id = u.id
    WHERE wi.product_variant_id = ANY(%(variant_ids)s::uuid[])
    AND wi.deleted_at = 0
    AND u.deleted_at = 0
    GROUP BY wi.product_variant_id
    """
    
    params = {'variant_ids': variant_ids}
    results = execute_query(query, params)
    
    # Create lookup dictionary, defaulting to 0 for variants with no wishlist items
    counts = {variant_id: 0 for variant_id in variant_ids}
    for row in results:
        counts[row['product_variant_id']] = row['wishlist_count']
    
    return counts


def get_variant_for_product_and_size(product_id: str, user_size: str) -> str:
    """
    Finds the variant ID for a specific product in the user's preferred size.
    
    Args:
        product_id: UUID of the product
        user_size: User's preferred shoe size (e.g., "10.5")
        
    Returns:
        Variant ID for that product in the specified size, or None if not found
    """
    
    query = """
    SELECT id
    FROM product_variants 
    WHERE product_id = %(product_id)s 
    AND index_cache->>'mens_size' = %(user_size)s
    LIMIT 1
    """
    
    params = {'product_id': product_id, 'user_size': user_size}
    result = execute_query(query, params)
    return result[0]['id'] if result else None


def get_product_id_from_variant(variant_id: str) -> str:
    """
    Gets the product ID for a given variant.
    
    Args:
        variant_id: UUID of the product variant
        
    Returns:
        Product ID for that variant, or None if not found
    """
    
    query = """
    SELECT product_id
    FROM product_variants 
    WHERE id = %(variant_id)s
    """
    
    params = {'variant_id': variant_id}
    result = execute_query(query, params)
    return result[0]['product_id'] if result else None


def debug_variant_analysis(variant_id: str) -> Dict[str, Any]:
    """
    Analyzes a specific variant to debug size/product relationships.
    
    Args:
        variant_id: UUID of the product variant to analyze
        
    Returns:
        Dictionary with variant details for debugging
    """
    
    query = """
    SELECT 
        pv.id as variant_id,
        pv.product_id,
        p.name as product_name,
        pv.index_cache->>'mens_size' as size
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    WHERE pv.id = %(variant_id)s
    """
    
    params = {'variant_id': variant_id}
    result = execute_query(query, params)
    return result[0] if result else None


def get_bulk_variant_sizes(variant_ids: List[str]) -> Dict[str, str]:
    """
    Gets sizes for multiple variants in a single efficient query.
    
    HIGH-PERFORMANCE bulk version that eliminates N+1 query problem for variant sizes.
    
    Args:
        variant_ids: List of product variant UUIDs
        
    Returns:
        Dictionary mapping variant_id to size from active variants
    """
    
    if not variant_ids:
        return {}
    
    query = """
    SELECT 
        pv.id as variant_id,
        pv.index_cache->>'mens_size' as size
    FROM product_variants pv
    WHERE pv.id = ANY(%(variant_ids)s::uuid[])
    """
    
    params = {'variant_ids': variant_ids}
    results = execute_query(query, params)
    
    # Create lookup dictionary, defaulting to 'Unknown' for variants with no size data
    sizes = {variant_id: 'Unknown' for variant_id in variant_ids}
    for row in results:
        size = row.get('size')
        if size:
            sizes[row['variant_id']] = size
    
    return sizes


def get_bulk_variant_offers_7d(variant_ids: List[str]) -> Dict[str, int]:
    """
    Gets offer counts for multiple variants from the last 7 days in a single query.
    
    Uses bulk query pattern to avoid N+1 performance issues.
    
    Args:
        variant_ids: List of variant UUIDs to get offer counts for
        
    Returns:
        Dictionary mapping variant_id to offer count from past 7 days
    """
    
    if not variant_ids:
        return {}
    
    query = """
    SELECT 
        oi.product_variant_id as variant_id,
        COUNT(DISTINCT oi.offer_id) as variant_offers_7d
    FROM offer_items oi
    JOIN offers o ON oi.offer_id = o.id
    WHERE oi.product_variant_id = ANY(%(variant_ids)s::uuid[])
    AND o.created_at >= NOW() - INTERVAL '7 days'
    GROUP BY oi.product_variant_id
    """
    
    params = {'variant_ids': variant_ids}
    results = execute_query(query, params)
    
    # Initialize all variants with 0 counts
    counts = {variant_id: 0 for variant_id in variant_ids}
    
    # Update with actual counts
    for row in results:
        counts[row['variant_id']] = row['variant_offers_7d']
    
    return counts


def get_bulk_variant_open_offers_targeting(variant_ids: List[str]) -> Dict[str, int]:
    """
    Gets count of currently active offers targeting multiple variants.
    
    For demand filtering purposes - shows how many live offers are actively targeting each variant.
    This indicates current market demand better than historical offer counts.
    
    Args:
        variant_ids: List of variant UUIDs to get open offer counts for
        
    Returns:
        Dictionary mapping variant_id to count of active offers targeting that variant
    """
    
    if not variant_ids:
        return {}
    
    query = """
    SELECT 
        oi.product_variant_id as variant_id,
        COUNT(DISTINCT oi.offer_id) as variant_open_offers
    FROM offer_items oi
    JOIN offers o ON oi.offer_id = o.id
    WHERE oi.product_variant_id = ANY(%(variant_ids)s::uuid[])
    AND o.offer_status IN ('OPEN', 'PENDING')  -- Only count open/pending offers
    AND o.created_at >= NOW() - INTERVAL '30 days'  -- Reasonable recency filter
    AND o.deleted_at = 0  -- Exclude deleted offers
    GROUP BY oi.product_variant_id
    """
    
    params = {'variant_ids': variant_ids}
    results = execute_query(query, params)
    
    # Initialize all variants with 0 counts
    counts = {variant_id: 0 for variant_id in variant_ids}
    
    # Update with actual counts
    for row in results:
        counts[row['variant_id']] = row['variant_open_offers']
    
    return counts


def get_product_showcase_stats(product_id: str) -> Dict[str, Any]:
    """
    Gets product-level statistics for showcase pushes.
    
    Adapted from building block #9 "Product Details with Recent Statistics" 
    with custom lookback periods: 7 days for offers, 30 days for trades.
    
    Args:
        product_id: UUID of the product to analyze
        
    Returns:
        Dictionary with product_offers_7d and product_trades_30d
    """
    
    query = """
    SELECT 
        p.id as product_id,
        p.name as product_name,
        COUNT(DISTINCT CASE WHEN o.created_at >= NOW() - INTERVAL '7 days' THEN oi.offer_id END) as product_offers_7d,
        COUNT(DISTINCT CASE WHEN t.validation_passed_date >= NOW() - INTERVAL '30 days' 
                               AND t.validation_passed_date IS NOT NULL THEN t.id END) as product_trades_30d
    FROM products p
    LEFT JOIN product_variants pv ON p.id = pv.product_id
    LEFT JOIN offer_items oi ON pv.id = oi.product_variant_id
    LEFT JOIN offers o ON oi.offer_id = o.id
    LEFT JOIN trades t ON o.id = t.offer_id
    WHERE p.id = %(product_id)s
    GROUP BY p.id, p.name
    """
    
    params = {'product_id': product_id}
    result = execute_query(query, params)
    return result[0] if result else {'product_offers_7d': 0, 'product_trades_30d': 0}


def get_showcase_audience_haves(product_id: str, activity_days: int = 90) -> List[Dict[str, Any]]:
    """
    Gets users who HAVE the focus shoe in their closet (marked OPEN FOR TRADE).
    
    Adapted from building block #8 "Dynamic User Segmentation" with product-specific filtering.
    Enhanced with last_active timestamp for comprehensive user data.
    
    Args:
        product_id: UUID of the focus product
        activity_days: Number of days for "active user" definition (default: 90)
        
    Returns:
        List of users with their info, variant details, and last_active timestamp
    """
    
    activity_hours = activity_days * 24
    
    query = f"""
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
        u.first_name,
        usp.shoe_size as user_size,
        pv.id as variant_id,
        ua.last_active
    FROM users u
    JOIN user_activities ua ON u.id = ua.user_id
    JOIN user_size_preferences usp ON u.id = usp.user_id
    JOIN inventory_items ii ON u.id = ii.user_id
    JOIN product_variants pv ON ii.product_variant_id = pv.id
    WHERE u.deleted_at = 0
    AND u.email IS NOT NULL
    AND u.first_name IS NOT NULL
    AND usp.shoe_size IS NOT NULL
    AND ua.last_active >= NOW() - INTERVAL '{activity_hours} hours'
    AND ii.status = 'OPEN_FOR_TRADE'
    AND pv.product_id = '{product_id}'
    """
    
    try:
        result = execute_query(query, {})
        print(f"👥 Found {len(result)} users who HAVE the focus product (OPEN_FOR_TRADE)")
        return result
    except Exception as e:
        print(f"Error fetching 'haves' audience: {e}")
        return []


def get_showcase_audience_wants(product_id: str, activity_days: int = 90) -> List[Dict[str, Any]]:
    """
    Gets users who WANT the focus shoe (non-deleted wishlist record).
    
    Adapted from building block #8 "Dynamic User Segmentation" with wishlist-specific filtering.
    Enhanced with last_active timestamp for comprehensive user data.
    
    Args:
        product_id: UUID of the focus product
        activity_days: Number of days for "active user" definition (default: 90)
        
    Returns:
        List of users with their info, variant details, and last_active timestamp
    """
    
    activity_hours = activity_days * 24
    
    query = f"""
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
        u.first_name,
        usp.shoe_size as user_size,
        pv.id as variant_id,
        ua.last_active
    FROM users u
    JOIN user_activities ua ON u.id = ua.user_id
    JOIN user_size_preferences usp ON u.id = usp.user_id
    JOIN wishlist_items wi ON u.id = wi.user_id
    JOIN product_variants pv ON wi.product_variant_id = pv.id
    WHERE u.deleted_at = 0
    AND u.email IS NOT NULL
    AND u.first_name IS NOT NULL
    AND usp.shoe_size IS NOT NULL
    AND ua.last_active >= NOW() - INTERVAL '{activity_hours} hours'
    AND wi.deleted_at = 0
    AND pv.product_id = '{product_id}'
    """
    
    try:
        result = execute_query(query, {})
        print(f"💭 Found {len(result)} users who WANT the focus product (wishlist)")
        return result
    except Exception as e:
        print(f"Error fetching 'wants' audience: {e}")
        return []


def get_showcase_audience_everybody_else(product_id: str, activity_days: int = 90) -> List[Dict[str, Any]]:
    """
    Gets users who do NOT have the shoe in closet or wishlist ("everybody else").
    
    Adapted from building block #8 "Dynamic User Segmentation" with exclusion logic.
    Enhanced with variant_id lookup based on user's preferred size for the showcased product.
    
    Args:
        product_id: UUID of the focus product
        activity_days: Number of days for "active user" definition (default: 90)
        
    Returns:
        List of users with their info, variant_id for their size of the showcased product, and last_active timestamp
    """
    
    activity_hours = activity_days * 24
    
    query = f"""
    WITH user_size_preferences AS (
        SELECT
            up.user_id,
            av.value AS shoe_size
        FROM user_preferences up
        JOIN attribute_preferences ap ON up.id = ap.user_preference_id
        JOIN attributes a ON ap.attribute_id = a.id
        JOIN attribute_values av ON ap.attribute_value_id = av.id
        WHERE a.name = 'mens_size' AND ap.preferred = TRUE
    ),
    users_with_product AS (
        -- Users who have it in closet
        SELECT DISTINCT u.id as user_id
        FROM users u
        JOIN inventory_items ii ON u.id = ii.user_id
        JOIN product_variants pv ON ii.product_variant_id = pv.id
        WHERE ii.status = 'OPEN_FOR_TRADE'
        AND pv.product_id = '{product_id}'
        
        UNION
        
        -- Users who want it (wishlist)
        SELECT DISTINCT u.id as user_id
        FROM users u
        JOIN wishlist_items wi ON u.id = wi.user_id
        JOIN product_variants pv ON wi.product_variant_id = pv.id
        WHERE wi.deleted_at = 0
        AND pv.product_id = '{product_id}'
    )
    SELECT 
        u.id as user_id,
        u.first_name,
        usp.shoe_size as user_size,
        pv.id as variant_id,  -- Variant ID for showcased product in user's preferred size
        ua.last_active
    FROM users u
    JOIN user_activities ua ON u.id = ua.user_id
    JOIN user_size_preferences usp ON u.id = usp.user_id
    LEFT JOIN users_with_product uwp ON u.id = uwp.user_id
    LEFT JOIN product_variants pv ON pv.product_id = '{product_id}' 
        AND pv.index_cache->>'mens_size' = usp.shoe_size
    WHERE u.deleted_at = 0
    AND u.email IS NOT NULL
    AND u.first_name IS NOT NULL
    AND usp.shoe_size IS NOT NULL
    AND ua.last_active >= NOW() - INTERVAL '{activity_hours} hours'
    AND uwp.user_id IS NULL  -- Exclude users who have or want the product
    AND pv.id IS NOT NULL  -- Ensure we found a variant for their size
    """
    
    try:
        result = execute_query(query, {})
        print(f"🌍 Found {len(result)} users who are EVERYBODY ELSE (with variant IDs for their preferred sizes)")
        return result
    except Exception as e:
        print(f"Error fetching 'everybody else' audience: {e}")
        return []


def debug_inventory_breakdown(variant_id: str) -> Dict[str, Any]:
    """
    Provides detailed breakdown of all inventory items for a specific variant.
    
    Args:
        variant_id: UUID of the product variant to analyze
        
    Returns:
        Dictionary with comprehensive inventory status breakdown
    """
    
    query = """
    SELECT 
        ii.status,
        u.deleted_at,
        COUNT(*) as count
    FROM inventory_items ii
    LEFT JOIN users u ON ii.user_id = u.id
    WHERE ii.product_variant_id = %(variant_id)s
    GROUP BY ii.status, u.deleted_at
    ORDER BY ii.status, u.deleted_at NULLS FIRST
    """
    
    params = {'variant_id': variant_id}
    results = execute_query(query, params)
    
    # Organize results into a readable format
    breakdown = {
        'total_lifetime_adds': 0,
        'by_status': {},
        'active_users_only': {},
        'deleted_users_only': {}
    }
    
    for row in results:
        status = row['status']
        deleted_at = row['deleted_at']
        count = row['count']
        
        breakdown['total_lifetime_adds'] += count
        
        if status not in breakdown['by_status']:
            breakdown['by_status'][status] = 0
        breakdown['by_status'][status] += count
        
        if deleted_at == 0:  # Active users
            if status not in breakdown['active_users_only']:
                breakdown['active_users_only'][status] = 0
            breakdown['active_users_only'][status] += count
        else:  # Deleted users
            if status not in breakdown['deleted_users_only']:
                breakdown['deleted_users_only'][status] = 0
            breakdown['deleted_users_only'][status] += count
    
    return breakdown


def debug_wishlist_breakdown(variant_id: str) -> Dict[str, Any]:
    """
    Provides detailed breakdown of all wishlist items for a specific variant.
    
    Args:
        variant_id: UUID of the product variant to analyze
        
    Returns:
        Dictionary with comprehensive wishlist status breakdown
    """
    
    query = """
    SELECT 
        CASE WHEN wi.deleted_at = 0 THEN 'active' ELSE 'deleted' END as wishlist_status,
        CASE WHEN u.deleted_at = 0 THEN 'active_user' ELSE 'deleted_user' END as user_status,
        COUNT(*) as count
    FROM wishlist_items wi
    LEFT JOIN users u ON wi.user_id = u.id
    WHERE wi.product_variant_id = %(variant_id)s
    GROUP BY 
        CASE WHEN wi.deleted_at = 0 THEN 'active' ELSE 'deleted' END,
        CASE WHEN u.deleted_at = 0 THEN 'active_user' ELSE 'deleted_user' END
    ORDER BY wishlist_status, user_status
    """
    
    params = {'variant_id': variant_id}
    results = execute_query(query, params)
    
    # Organize results into a readable format
    breakdown = {
        'total_lifetime_adds': 0,
        'active_wishlist_active_user': 0,
        'active_wishlist_deleted_user': 0,
        'deleted_wishlist_active_user': 0,
        'deleted_wishlist_deleted_user': 0
    }
    
    for row in results:
        wishlist_status = row['wishlist_status']
        user_status = row['user_status']
        count = row['count']
        
        breakdown['total_lifetime_adds'] += count
        breakdown[f'{wishlist_status}_wishlist_{user_status}'] = count
    
    return breakdown


def debug_raw_inventory_data(variant_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Gets raw inventory data for detailed investigation.
    
    Args:
        variant_id: UUID of the product variant to analyze
        limit: Maximum number of records to return
        
    Returns:
        List of raw inventory records with user and status info
    """
    
    query = """
    SELECT 
        ii.id as inventory_id,
        ii.user_id,
        ii.status,
        ii.created_at,
        ii.updated_at,
        u.deleted_at as user_deleted_at,
        u.username
    FROM inventory_items ii
    LEFT JOIN users u ON ii.user_id = u.id
    WHERE ii.product_variant_id = %(variant_id)s
    ORDER BY ii.created_at DESC
    LIMIT %(limit)s
    """
    
    params = {'variant_id': variant_id, 'limit': limit}
    return execute_query(query, params)


def get_trending_products_weekly(lookback_days: int = 7, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Identifies the top most-targeted products in the past week with formatted rankings.
    Adapted from building block #21 for Layer 2 push notifications.
    
    Args:
        lookback_days: Number of days to look back for trending analysis (default: 7)
        limit: Maximum number of trending products to return (default: 20)
        
    Returns:
        List of trending products with id, name, offer_count, and formatted trending_rank
    """
    
    # Convert days to hours
    lookback_hours = lookback_days * 24
    
    # Use f-string to avoid parameter mixing issues
    query = f"""
    SELECT 
        p.id as product_id,
        p.name as product_name,
        COUNT(DISTINCT oi.offer_id) as offer_count,
        ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT oi.offer_id) DESC) as rank_number,
        CASE 
            WHEN ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT oi.offer_id) DESC) = 1 THEN '1st'
            WHEN ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT oi.offer_id) DESC) = 2 THEN '2nd' 
            WHEN ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT oi.offer_id) DESC) = 3 THEN '3rd'
            ELSE CONCAT(ROW_NUMBER() OVER (ORDER BY COUNT(DISTINCT oi.offer_id) DESC)::text, 'th')
        END as trending_rank
    FROM products p
    JOIN product_variants pv ON p.id = pv.product_id
    JOIN offer_items oi ON pv.id = oi.product_variant_id
    JOIN offers o ON oi.offer_id = o.id
    WHERE o.created_at >= NOW() - INTERVAL '{lookback_hours} hours'
    GROUP BY p.id, p.name
    HAVING COUNT(DISTINCT oi.offer_id) > 0
    ORDER BY COUNT(DISTINCT oi.offer_id) DESC
    LIMIT {limit}
    """
    
    try:
        result = execute_query(query, {})
        print(f"🔥 Found {len(result)} trending products from past {lookback_days} days")
        return result
    except Exception as e:
        print(f"Error fetching trending products: {e}")
        return []


def get_users_with_trending_products(trending_product_ids: List[str], activity_days: int = 90) -> List[Dict[str, Any]]:
    """
    Finds users active in the past N days who own at least one trending product in their closet.
    Adapted from building blocks #8 (Dynamic User Segmentation) and #13 (Size-Based Matching).
    
    Args:
        trending_product_ids: List of trending product IDs to search for
        activity_days: Number of days for "active user" definition (default: 90)
        
    Returns:
        List of users with their info and highest-ranked trending product they own
    """
    
    if not trending_product_ids:
        return []
    
    # Convert days to hours
    activity_hours = activity_days * 24
    
    # Use f-string to avoid parameter mixing issues, similar to trending products query
    trending_ids_str = "', '".join(trending_product_ids)
    
    query = f"""
    WITH user_size_preferences AS (
        SELECT
            up.user_id,
            av.value AS shoe_size
        FROM user_preferences up
        JOIN attribute_preferences ap ON up.id = ap.user_preference_id
        JOIN attributes a ON ap.attribute_id = a.id
        JOIN attribute_values av ON ap.attribute_value_id = av.id
        WHERE a.name = 'mens_size' AND ap.preferred = TRUE
    ),
    user_trending_products AS (
        SELECT 
            u.id as user_id,
            u.username,
            u.first_name,
            usp.shoe_size as user_size,
            ua.last_active,
            pv.product_id,
            p.name as product_name,
            pv.id as variant_id,
            -- We'll join with trending rank data in the main query
            ROW_NUMBER() OVER (
                PARTITION BY u.id 
                ORDER BY 
                    -- This will be replaced with actual trending rank in the application layer
                    p.name  -- Temporary ordering, will be overridden by application logic
            ) as product_rank_for_user
        FROM users u
        JOIN user_activities ua ON u.id = ua.user_id
        JOIN user_size_preferences usp ON u.id = usp.user_id
        JOIN inventory_items ii ON u.id = ii.user_id
        JOIN product_variants pv ON ii.product_variant_id = pv.id
        JOIN products p ON pv.product_id = p.id
        WHERE u.deleted_at = 0
        AND u.email IS NOT NULL
        AND u.first_name IS NOT NULL
        AND u.username IS NOT NULL
        AND usp.shoe_size IS NOT NULL
        AND ua.last_active >= NOW() - INTERVAL '{activity_hours} hours'
        AND ii.status = 'OPEN_FOR_TRADE'
        AND pv.product_id::text IN ('{trending_ids_str}')
    )
    SELECT 
        user_id,
        username,
        first_name,
        user_size,
        last_active,
        product_id,
        product_name,
        variant_id
    FROM user_trending_products
    WHERE product_rank_for_user = 1  -- One product per user (will be refined by application logic)
    """
    
    try:
        result = execute_query(query, {})
        print(f"👥 Found {len(result)} users with trending products from past {activity_days} days")
        return result
    except Exception as e:
        print(f"Error fetching users with trending products: {e}")
        return []


# ============================================================================
# PHASE 4: NEW USER BEHAVIORAL NUDGE QUERIES
# ============================================================================

def get_new_users_in_window(min_hours: int = 12, max_days: int = 14) -> List[Dict[str, Any]]:
    """
    Fetches new users who signed up between min_hours and max_days ago.
    
    This is the base query for Phase 4 new user behavioral nudge system.
    Designed to identify users in the optimal time window for onboarding nudges.
    
    Args:
        min_hours: Minimum hours since signup (default: 12) - prevents nudging brand new users
        max_days: Maximum days since signup (default: 14) - focuses on recent signups
        
    Returns:
        List of dictionaries with user profile data:
        - user_id: UUID of the user
        - username: User's display name
        - first_name: User's first name  
        - user_size: User's preferred shoe size
        - created_at: Account creation timestamp
        - last_active: Most recent activity timestamp
    """
    
    query = f"""
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
        ua.last_active
    FROM users u
    LEFT JOIN user_size_preferences usp ON u.id = usp.user_id
    LEFT JOIN user_activities ua ON u.id = ua.user_id
    WHERE u.created_at BETWEEN NOW() - INTERVAL '{max_days} days' AND NOW() - INTERVAL '{min_hours} hours'
    AND u.deleted_at = 0
    AND u.first_name IS NOT NULL
    ORDER BY u.created_at DESC
    """
    
    try:
        result = execute_query(query, {})
        print(f"👤 Found {len(result)} new users in {min_hours}h-{max_days}d window")
        return result
    except Exception as e:
        print(f"Error fetching new users: {e}")
        return []


def check_users_closet_completion(user_ids: List[str]) -> Dict[str, bool]:
    """
    Checks which users have added any items to their closet.
    
    Uses bulk query pattern to efficiently check closet completion status
    for multiple users simultaneously.
    
    Args:
        user_ids: List of user UUIDs to check
        
    Returns:
        Dictionary mapping user_id to boolean (True if has closet items, False if empty)
    """
    
    if not user_ids:
        return {}
    
    query = """
    SELECT DISTINCT user_id
    FROM inventory_items
    WHERE user_id = ANY(%(user_ids)s::uuid[])
    """
    
    try:
        result = execute_query(query, {'user_ids': user_ids})
        users_with_closet = {row['user_id'] for row in result}
        
        # Create completion map for all users
        completion_map = {user_id: user_id in users_with_closet for user_id in user_ids}
        
        completed_count = sum(completion_map.values())
        print(f"👕 Closet completion: {completed_count}/{len(user_ids)} users have added items")
        
        return completion_map
    except Exception as e:
        print(f"Error checking closet completion: {e}")
        return {user_id: False for user_id in user_ids}


def check_users_offer_completion(user_ids: List[str]) -> Dict[str, bool]:
    """
    Checks which users have created any trade offers.
    
    Uses bulk query pattern to efficiently check offer creation status
    for multiple users simultaneously.
    
    Args:
        user_ids: List of user UUIDs to check
        
    Returns:
        Dictionary mapping user_id to boolean (True if has created offers, False if none)
    """
    
    if not user_ids:
        return {}
    
    query = """
    SELECT DISTINCT creator_user_id as user_id
    FROM offers
    WHERE creator_user_id = ANY(%(user_ids)s::uuid[])
    """
    
    try:
        result = execute_query(query, {'user_ids': user_ids})
        users_with_offers = {row['user_id'] for row in result}
        
        # Create completion map for all users
        completion_map = {user_id: user_id in users_with_offers for user_id in user_ids}
        
        completed_count = sum(completion_map.values())
        print(f"🤝 Offer completion: {completed_count}/{len(user_ids)} users have created offers")
        
        return completion_map
    except Exception as e:
        print(f"Error checking offer completion: {e}")
        return {user_id: False for user_id in user_ids}


def check_users_bio_completion(user_ids: List[str]) -> Dict[str, bool]:
    """
    Checks which users have updated their bio field.
    
    Uses bulk query pattern to efficiently check bio completion status
    for multiple users simultaneously.
    
    Args:
        user_ids: List of user UUIDs to check
        
    Returns:
        Dictionary mapping user_id to boolean (True if has bio, False if empty/null)
    """
    
    if not user_ids:
        return {}
    
    query = """
    SELECT id as user_id
    FROM users
    WHERE id = ANY(%(user_ids)s::uuid[])
    AND bio IS NOT NULL 
    AND TRIM(bio) != ''
    """
    
    try:
        result = execute_query(query, {'user_ids': user_ids})
        users_with_bio = {row['user_id'] for row in result}
        
        # Create completion map for all users
        completion_map = {user_id: user_id in users_with_bio for user_id in user_ids}
        
        completed_count = sum(completion_map.values())
        print(f"📝 Bio completion: {completed_count}/{len(user_ids)} users have updated their bio")
        
        return completion_map
    except Exception as e:
        print(f"Error checking bio completion: {e}")
        return {user_id: False for user_id in user_ids}


def check_users_wishlist_completion(user_ids: List[str]) -> Dict[str, bool]:
    """
    Checks which users have added any items to their wishlist.
    
    Uses bulk query pattern to efficiently check wishlist completion status
    for multiple users simultaneously.
    
    Args:
        user_ids: List of user UUIDs to check
        
    Returns:
        Dictionary mapping user_id to boolean (True if has wishlist items, False if empty)
    """
    
    if not user_ids:
        return {}
    
    query = """
    SELECT DISTINCT user_id
    FROM wishlist_items
    WHERE user_id = ANY(%(user_ids)s::uuid[])
    AND deleted_at = 0
    """
    
    try:
        result = execute_query(query, {'user_ids': user_ids})
        users_with_wishlist = {row['user_id'] for row in result}
        
        # Create completion map for all users
        completion_map = {user_id: user_id in users_with_wishlist for user_id in user_ids}
        
        completed_count = sum(completion_map.values())
        print(f"❤️ Wishlist completion: {completed_count}/{len(user_ids)} users have wishlist items")
        
        return completion_map
    except Exception as e:
        print(f"Error checking wishlist completion: {e}")
        return {user_id: False for user_id in user_ids}


def check_users_profile_completion(user_ids: List[str]) -> Dict[str, bool]:
    """
    Checks which users have completed their profile (avatar + bio).
    
    Profile completion requires:
    - bio: Not null and not empty string
    - avatar_id: Not null (indicates user has uploaded an avatar)
    
    Uses bulk query pattern to efficiently check profile completion status
    for multiple users simultaneously.
    
    Args:
        user_ids: List of user UUIDs to check
        
    Returns:
        Dictionary mapping user_id to boolean (True if profile complete, False if incomplete)
    """
    
    if not user_ids:
        return {}
    
    query = """
    SELECT id as user_id
    FROM users
    WHERE id = ANY(%(user_ids)s::uuid[])
    AND bio IS NOT NULL 
    AND bio != ''
    AND avatar_id IS NOT NULL
    """
    
    try:
        result = execute_query(query, {'user_ids': user_ids})
        users_with_complete_profile = {row['user_id'] for row in result}
        
        # Create completion map for all users
        completion_map = {user_id: user_id in users_with_complete_profile for user_id in user_ids}
        
        completed_count = sum(completion_map.values())
        print(f"👤 Profile completion: {completed_count}/{len(user_ids)} users have complete profiles")
        
        return completion_map
    except Exception as e:
        print(f"Error checking profile completion: {e}")
        return {user_id: False for user_id in user_ids}


def compare_and_remove(remaining_users: List[Dict[str, Any]], extracted_users: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Memory-safe function for set difference operations in waterfall extraction.
    
    Returns users from remaining_users that are NOT in extracted_users,
    preserving all user data fields.
    
    Args:
        remaining_users: List of user dictionaries (previous step's remaining audience)
        extracted_users: List of user dictionaries (current step's extracted audience)
        
    Returns:
        List of user dictionaries: users in remaining_users but not in extracted_users
    """
    
    if not remaining_users:
        return []
    
    if not extracted_users:
        return remaining_users.copy()
    
    # Create set of extracted user IDs for efficient lookup
    extracted_ids = {user.get('user_id') for user in extracted_users if user.get('user_id')}
    
    # Filter remaining users by excluding those in extracted set
    new_remaining = [
        user for user in remaining_users 
        if user.get('user_id') not in extracted_ids
    ]
    
    print(f"🔄 Compare/Remove: {len(remaining_users)} → {len(new_remaining)} remaining after removing {len(extracted_users)} extracted users")
    
    return new_remaining


def check_level_appearance_history(user_ids: List[str], level: int) -> Dict[str, int]:
    """
    Checks historical level appearance count for users to prevent duplicate nudge spam.
    
    Queries historical push records to count prior appearances at the specified level.
    
    Args:
        user_ids: List of user UUIDs to check
        level: The new_user_level to check appearances for (1-5)
        
    Returns:
        Dictionary mapping user_id to count of prior appearances at that level
    """
    
    if not user_ids:
        return {}
    
    # NOTE: This is a placeholder query - actual implementation will depend on 
    # the push tracking table schema which needs to be implemented
    query = """
    SELECT user_id, COUNT(*) as appearance_count
    FROM push_logs
    WHERE user_id = ANY(%(user_ids)s::uuid[])
    AND new_user_level = %(level)s
    AND created_at >= NOW() - INTERVAL '90 days'  -- Look back 90 days
    GROUP BY user_id
    """
    
    try:
        result = execute_query(query, {'user_ids': user_ids, 'level': level})
        appearance_counts = {row['user_id']: row['appearance_count'] for row in result}
        
        # Fill in zero counts for users not in results
        complete_counts = {user_id: appearance_counts.get(user_id, 0) for user_id in user_ids}
        
        excluded_count = sum(1 for count in complete_counts.values() if count >= 2)
        print(f"📊 Level {level} history: {excluded_count}/{len(user_ids)} users excluded (≥2 prior appearances)")
        
        return complete_counts
    except Exception as e:
        print(f"⚠️ Error checking level appearance history (table may not exist yet): {e}")
        # Return zero counts for all users if table doesn't exist yet
        return {user_id: 0 for user_id in user_ids}


def filter_users_by_level_appearance(user_ids: List[str], level: int, max_appearances: int = 2) -> List[str]:
    """
    Filters users to exclude those who have appeared at this level ≥ max_appearances times.
    
    Args:
        user_ids: List of user UUIDs to filter
        level: The new_user_level to check (1-5)
        max_appearances: Maximum allowed appearances (default: 2)
        
    Returns:
        List of user UUIDs that have < max_appearances at this level
    """
    
    appearance_counts = check_level_appearance_history(user_ids, level)
    
    filtered_users = [
        user_id for user_id in user_ids 
        if appearance_counts.get(user_id, 0) < max_appearances
    ]
    
    excluded_count = len(user_ids) - len(filtered_users)
    if excluded_count > 0:
        print(f"🚫 Excluded {excluded_count} users from Level {level} (≥{max_appearances} prior appearances)")
    
    return filtered_users