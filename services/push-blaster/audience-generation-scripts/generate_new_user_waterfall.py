#!/usr/bin/env python3
"""
New User Behavioral Nudge Waterfall System - Phase 4

Implements sequential audience extraction with mutually exclusive audiences.
Generates 5 push notification CSV files using true waterfall logic where users
are "peeled off" at each step, ensuring no user appears in multiple audiences.

Waterfall Steps:
1. No Shoes (Level 1): Users who haven't added shoes to closet
2. No Bio (Level 2): Users who haven't updated their bio  
3. No Offers (Level 3): Users who haven't created offers
4. No Wishlist (Level 4): Users who haven't added wishlist items
5. New Stars (Level 5): Users who completed all onboarding steps

Usage:
    python3 generate_new_user_waterfall.py [--min_hours 12] [--max_days 14] [--output_dir generated_csvs]

Author: @squad-agent-database-master (Push CSV Creation Project - Phase 4)
"""

import argparse
import csv
import hashlib
import json
import os
import sys
from datetime import datetime
from typing import List, Dict, Any

# Add the project root to the Python path
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from basic_capabilities.internal_db_queries_toolbox.push_csv_queries import (
    get_new_users_in_window,
    check_users_closet_completion,
    check_users_bio_completion,
    check_users_offer_completion,
    check_users_wishlist_completion,
    compare_and_remove
)

# Import SQL execution utilities
from basic_capabilities.internal_db_queries_toolbox.sql_utils import execute_query

# Test user data for test CSV generation (user with device tokens)
FOUNDER_DATA = {
    'user_id': '0e54067c-4c0e-4e4a-8a23-a47661578059',
    'username': 'beems',
    'first_name': 'Mbiyimoh',
    'bio': 'Founder of Tradeblock',
    'new_user_level': 1,  # Will be overridden per audience
    'top_target_shoe': 'Air Jordan 1 Retro High OG "Bred Toe"',
    'target_variantID': 'sample-variant-id-for-testing'
}


def get_top_target_shoe_for_users(user_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    """
    Implements the 4-step fallback method to find shoes users want to GET (not own):
    1. Primary: User's Top Desired Item (highest intent)
    2. Secondary: User's Most Recent Offer Target (medium intent)  
    3. Tertiary: User's Newest Wishlist Addition (low intent, but something)
    4. Quaternary: Comprehensive offer target search (handles deleted/malformed offer items)
    
    The quaternary fallback uses LEFT JOINs to find offer targets even when 
    product/variant records were deleted after offer creation.
    
    Args:
        user_ids: List of user UUIDs to get target shoes for
        
    Returns:
        Dictionary mapping user_id to their best available target shoe data
    """
    
    if not user_ids:
        return {}
    
    target_shoes = {}
    
    # Primary: User's Top Desired Item
    primary_query = """
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
        WHERE di.user_id = ANY(%(user_ids)s::uuid[]) 
        AND di.deleted_at = 0
    )
    SELECT
        user_id,
        product_variant_id,
        product_name,
        'desired_item' as source
    FROM ranked_desired_items
    WHERE rn = 1
    """
    
    try:
        primary_results = execute_query(primary_query, {'user_ids': user_ids})
        target_shoes = {item['user_id']: item for item in primary_results}
    except Exception as e:
        print(f"   ⚠️ Error fetching desired items: {e}")
    
    # Secondary: Recent offers for users without desired items
    users_needing_fallback = [uid for uid in user_ids if uid not in target_shoes]
    
    if users_needing_fallback:
        secondary_query = """
        WITH ranked_offers AS (
            SELECT
                o.creator_user_id,
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
            WHERE o.creator_user_id = ANY(%(user_ids)s::uuid[])
        )
        SELECT
            creator_user_id as user_id,
            product_variant_id,
            product_name,
            'recent_offer' as source
        FROM ranked_offers
        WHERE rn = 1
        """
        
        try:
            secondary_results = execute_query(secondary_query, {'user_ids': users_needing_fallback})
            for item in secondary_results:
                target_shoes[item['user_id']] = item
        except Exception as e:
            print(f"   ⚠️ Error fetching recent offers: {e}")
    
    # Tertiary: Wishlist items for users still without data
    users_still_needing_fallback = [uid for uid in user_ids if uid not in target_shoes]
    
    if users_still_needing_fallback:
        tertiary_query = """
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
            WHERE wi.user_id = ANY(%(user_ids)s::uuid[])
            AND wi.deleted_at = 0
        )
        SELECT
            user_id,
            product_variant_id,
            product_name,
            'wishlist_item' as source
        FROM ranked_wishlist
        WHERE rn = 1
        """
        
        try:
            tertiary_results = execute_query(tertiary_query, {'user_ids': users_still_needing_fallback})
            for item in tertiary_results:
                target_shoes[item['user_id']] = item
        except Exception as e:
            print(f"   ⚠️ Error fetching wishlist items: {e}")
    
    # Quaternary: ALL offer items (including deleted/malformed) for comprehensive coverage
    users_final_fallback = [uid for uid in user_ids if uid not in target_shoes]
    
    if users_final_fallback:
        quaternary_query = """
        WITH all_offer_targets AS (
            SELECT
                o.creator_user_id as user_id,
                oi.product_variant_id,
                p.name as product_name,
                o.created_at,
                ROW_NUMBER() OVER (
                    PARTITION BY o.creator_user_id 
                    ORDER BY o.created_at DESC
                ) as rn
            FROM offers o
            JOIN offer_items oi ON o.id = oi.offer_id
            LEFT JOIN product_variants pv ON oi.product_variant_id = pv.id
            LEFT JOIN products p ON pv.product_id = p.id
            WHERE o.creator_user_id = ANY(%(user_ids)s::uuid[])
            AND oi.product_variant_id IS NOT NULL
        )
        SELECT
            user_id,
            product_variant_id,
            COALESCE(product_name, 'Unknown Product') as product_name,
            'comprehensive_offer_target' as source
        FROM all_offer_targets
        WHERE rn = 1
        """
        
        try:
            quaternary_results = execute_query(quaternary_query, {'user_ids': users_final_fallback})
            for item in quaternary_results:
                target_shoes[item['user_id']] = item
        except Exception as e:
            print(f"   ⚠️ Error in comprehensive offer target search: {e}")
    
    return target_shoes


def parse_args():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate waterfall CSVs for new user behavioral nudges",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 generate_new_user_waterfall.py
  python3 generate_new_user_waterfall.py --min_hours 24 --max_days 7 --output_dir custom_csvs
  python3 generate_new_user_waterfall.py --dry_run
        """
    )
    
    parser.add_argument(
        "--min_hours", 
        type=int, 
        default=12,
        help="Minimum hours since signup (default: 12)"
    )
    parser.add_argument(
        "--max_days", 
        type=int, 
        default=14,
        help="Maximum days since signup (default: 14)"
    )
    parser.add_argument(
        "--output_dir", 
        default="generated_csvs",
        help="Output directory for generated CSV files (default: generated_csvs)"
    )
    parser.add_argument(
        "--dry_run", 
        action="store_true",
        help="Print statistics without generating files"
    )
    
    return parser.parse_args()


def extract_level_1_no_shoes(remaining_users: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extract Level 1 audience: Users who have not added shoes to their closet.
    
    Args:
        remaining_users: List of all new users to check
        
    Returns:
        Tuple of (extracted_users, new_remaining_users)
    """
    
    if not remaining_users:
        return [], []
    
    user_ids = [user['user_id'] for user in remaining_users]
    closet_completion = check_users_closet_completion(user_ids)
    
    # Filter for users WITHOUT closet items
    no_closet_user_ids = [user_id for user_id, has_closet in closet_completion.items() if not has_closet]
    
    # Extract users who don't have closet items
    extracted_users = [
        user for user in remaining_users 
        if user['user_id'] in no_closet_user_ids
    ]
    
    # Add level assignment
    for user in extracted_users:
        user['new_user_level'] = 1
    
    # Remove extracted users from remaining pool
    new_remaining = compare_and_remove(remaining_users, extracted_users)
    
    print(f"🎯 Level 1 (No Shoes): Extracted {len(extracted_users)} users, {len(new_remaining)} remaining")
    
    return extracted_users, new_remaining


def extract_level_2_no_bio(remaining_users: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extract Level 2 audience: Users who have not updated their bio.
    
    Args:
        remaining_users: List of users remaining after Level 1 extraction
        
    Returns:
        Tuple of (extracted_users, new_remaining_users)
    """
    
    if not remaining_users:
        return [], []
    
    user_ids = [user['user_id'] for user in remaining_users]
    bio_completion = check_users_bio_completion(user_ids)
    
    # Filter for users WITHOUT bio
    no_bio_user_ids = [user_id for user_id, has_bio in bio_completion.items() if not has_bio]
    
    # Extract users who don't have bio
    extracted_users = [
        user for user in remaining_users 
        if user['user_id'] in no_bio_user_ids
    ]
    
    # Add level assignment
    for user in extracted_users:
        user['new_user_level'] = 2
    
    # Remove extracted users from remaining pool
    new_remaining = compare_and_remove(remaining_users, extracted_users)
    
    print(f"🎯 Level 2 (No Bio): Extracted {len(extracted_users)} users, {len(new_remaining)} remaining")
    
    return extracted_users, new_remaining


def extract_level_3_no_offers(remaining_users: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extract Level 3 audience: Users who have not created offers.
    
    Args:
        remaining_users: List of users remaining after Level 2 extraction
        
    Returns:
        Tuple of (extracted_users, new_remaining_users)
    """
    
    if not remaining_users:
        return [], []
    
    user_ids = [user['user_id'] for user in remaining_users]
    offer_completion = check_users_offer_completion(user_ids)
    
    # Filter for users WITHOUT offers
    no_offers_user_ids = [user_id for user_id, has_offers in offer_completion.items() if not has_offers]
    
    # Extract users who don't have offers
    extracted_users = [
        user for user in remaining_users 
        if user['user_id'] in no_offers_user_ids
    ]
    
    # Add level assignment and target shoe data for Level 3+
    target_shoes = get_top_target_shoe_for_users([user['user_id'] for user in extracted_users])
    
    for user in extracted_users:
        user['new_user_level'] = 3
        target_shoe_data = target_shoes.get(user['user_id'], {})
        user['top_target_shoe'] = target_shoe_data.get('product_name')
        user['target_variantID'] = target_shoe_data.get('product_variant_id')
    
    # Remove extracted users from remaining pool
    new_remaining = compare_and_remove(remaining_users, extracted_users)
    
    print(f"🎯 Level 3 (No Offers): Extracted {len(extracted_users)} users, {len(new_remaining)} remaining")
    
    return extracted_users, new_remaining


def extract_level_4_no_wishlist(remaining_users: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extract Level 4 audience: Users who have not added wishlist items.
    
    Args:
        remaining_users: List of users remaining after Level 3 extraction
        
    Returns:
        Tuple of (extracted_users, new_remaining_users)
    """
    
    if not remaining_users:
        return [], []
    
    user_ids = [user['user_id'] for user in remaining_users]
    wishlist_completion = check_users_wishlist_completion(user_ids)
    
    # Filter for users WITHOUT wishlist items
    no_wishlist_user_ids = [user_id for user_id, has_wishlist in wishlist_completion.items() if not has_wishlist]
    
    # Extract users who don't have wishlist items
    extracted_users = [
        user for user in remaining_users 
        if user['user_id'] in no_wishlist_user_ids
    ]
    
    # Add level assignment and target shoe data for Level 4+
    target_shoes = get_top_target_shoe_for_users([user['user_id'] for user in extracted_users])
    
    for user in extracted_users:
        user['new_user_level'] = 4
        target_shoe_data = target_shoes.get(user['user_id'], {})
        user['top_target_shoe'] = target_shoe_data.get('product_name')
        user['target_variantID'] = target_shoe_data.get('product_variant_id')
    
    # Remove extracted users from remaining pool
    new_remaining = compare_and_remove(remaining_users, extracted_users)
    
    print(f"🎯 Level 4 (No Wishlist): Extracted {len(extracted_users)} users, {len(new_remaining)} remaining")
    
    return extracted_users, new_remaining


def extract_level_5_new_stars(remaining_users: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Extract Level 5 audience: Users who completed all onboarding steps (New Stars).
    
    Args:
        remaining_users: List of users remaining after Level 4 extraction
        
    Returns:
        Tuple of (extracted_users, final_remaining_users)
    """
    
    if not remaining_users:
        return [], []
    
    # All remaining users become New Stars
    extracted_users = remaining_users.copy()
    
    # Add level assignment and target shoe data for Level 5
    target_shoes = get_top_target_shoe_for_users([user['user_id'] for user in extracted_users])
    
    for user in extracted_users:
        user['new_user_level'] = 5
        target_shoe_data = target_shoes.get(user['user_id'], {})
        user['top_target_shoe'] = target_shoe_data.get('product_name')
        user['target_variantID'] = target_shoe_data.get('product_variant_id')
    
    # Final remaining users (should be small or empty)
    final_remaining = compare_and_remove(remaining_users, extracted_users)
    
    print(f"🎯 Level 5 (New Stars): Extracted {len(extracted_users)} users, {len(final_remaining)} final remaining")
    
    return extracted_users, final_remaining


def generate_csv_file(users: List[Dict[str, Any]], filename: str, output_dir: str) -> str:
    """
    Generate a single CSV file for an audience.
    
    Args:
        users: List of user dictionaries
        filename: Name of the CSV file
        output_dir: Output directory
        
    Returns:
        Path to the generated CSV file
    """
    
    os.makedirs(output_dir, exist_ok=True)
    file_path = os.path.join(output_dir, filename)
    
    # Determine columns based on level
    base_columns = ['user_id', 'username', 'firstName', 'new_user_level']
    
    # Add target shoe columns for levels 3-5
    has_target_shoes = any(user.get('new_user_level', 0) >= 3 for user in users)
    if has_target_shoes:
        columns = base_columns + ['top_target_shoe', 'top_target_shoe_variantid']
    else:
        columns = base_columns
    
    with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=columns)
        writer.writeheader()
        
        for user in users:
            csv_record = {
                'user_id': user.get('user_id'),
                'username': user.get('username'),
                'firstName': user.get('first_name'),
                'new_user_level': user.get('new_user_level')
            }
            
            # Add target shoe data if applicable
            if has_target_shoes:
                csv_record['top_target_shoe'] = user.get('top_target_shoe')
                csv_record['top_target_shoe_variantid'] = user.get('target_variantID')
            
            writer.writerow(csv_record)
    
    print(f"✅ Generated {file_path} with {len(users)} records")
    return file_path


def generate_test_csvs(extraction_results: Dict[str, Any], output_dir: str, timestamp: str) -> List[str]:
    """
    Generates 2-line test CSVs for each audience type: header + single founder row only.
    Uses founder's info with level-appropriate data structure.
    This allows testing push notifications before sending to full audience.
    
    Args:
        extraction_results: Dictionary containing extraction data
        output_dir: Directory to save test files
        timestamp: Timestamp for file naming
        
    Returns:
        List of generated test file paths
    """
    
    test_file_paths = []
    
    # Define test audience configurations
    test_configs = [
        {
            'level': 1,
            'filename': f'no-shoes-new-user-test-{timestamp}.csv',
            'columns': ['user_id', 'username', 'firstName', 'new_user_level']
        },
        {
            'level': 2, 
            'filename': f'no-bio-new-user-test-{timestamp}.csv',
            'columns': ['user_id', 'username', 'firstName', 'new_user_level']
        },
        {
            'level': 3,
            'filename': f'no-offers-new-user-test-{timestamp}.csv', 
            'columns': ['user_id', 'username', 'firstName', 'new_user_level', 'top_target_shoe', 'top_target_shoe_variantid']
        },
        {
            'level': 4,
            'filename': f'no-wishlist-new-user-test-{timestamp}.csv',
            'columns': ['user_id', 'username', 'firstName', 'new_user_level', 'top_target_shoe', 'top_target_shoe_variantid']
        },
        {
            'level': 5,
            'filename': f'new-stars-new-user-test-{timestamp}.csv',
            'columns': ['user_id', 'username', 'firstName', 'new_user_level', 'top_target_shoe', 'top_target_shoe_variantid']
        }
    ]
    
    os.makedirs(output_dir, exist_ok=True)
    
    for config in test_configs:
        # Only generate test CSV if the actual audience has users
        actual_extraction = extraction_results['extractions'].get(str(config['level']), {})
        if actual_extraction.get('extracted_count', 0) > 0:
            
            file_path = os.path.join(output_dir, config['filename'])
            
            with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=config['columns'])
                writer.writeheader()
                
                # Create founder test record
                test_record = {
                    'user_id': FOUNDER_DATA['user_id'],
                    'username': FOUNDER_DATA['username'],
                    'firstName': FOUNDER_DATA['first_name'],
                    'new_user_level': config['level']
                }
                
                # Add target shoe data for levels 3-5
                if config['level'] >= 3:
                    test_record['top_target_shoe'] = FOUNDER_DATA['top_target_shoe']
                    test_record['top_target_shoe_variantid'] = FOUNDER_DATA['target_variantID']
                
                writer.writerow(test_record)
            
            test_file_paths.append(file_path)
            print(f"🧪 Generated test CSV: {config['filename']}")
    
    return test_file_paths


def calculate_file_checksum(file_path: str) -> str:
    """Calculate SHA256 checksum for a file."""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def validate_waterfall_integrity(extraction_results: Dict[str, Any]) -> bool:
    """
    Comprehensive validation of waterfall extraction results.
    
    Args:
        extraction_results: Dictionary containing all extraction data
        
    Returns:
        True if all validations pass, False otherwise
    """
    
    print(f"\n🔍 Validating waterfall integrity...")
    
    validation_passed = True
    initial_count = extraction_results['initial_count']
    extractions = extraction_results['extractions']
    final_remaining = extraction_results['final_remaining']
    
    # 1. Monotonicity Check
    remaining_counts = [initial_count]
    for level, data in extractions.items():
        remaining_counts.append(data['remaining_after'])
    
    is_monotonic = all(remaining_counts[i] >= remaining_counts[i+1] for i in range(len(remaining_counts)-1))
    if is_monotonic:
        print(f"✅ Monotonicity check passed: {' → '.join(map(str, remaining_counts))}")
    else:
        print(f"❌ Monotonicity check failed: {' → '.join(map(str, remaining_counts))}")
        validation_passed = False
    
    # 2. Full Coverage Accounting
    total_extracted = sum(data['extracted_count'] for data in extractions.values())
    expected_total = total_extracted + len(final_remaining)
    
    if initial_count == expected_total:
        print(f"✅ Full coverage check passed: {initial_count} = {total_extracted} + {len(final_remaining)}")
    else:
        print(f"❌ Full coverage check failed: {initial_count} ≠ {expected_total}")
        validation_passed = False
    
    # 3. Disjointness Check
    all_extracted_ids = set()
    for level, data in extractions.items():
        level_ids = {user['user_id'] for user in data['extracted_users']}
        overlap = all_extracted_ids.intersection(level_ids)
        if overlap:
            print(f"❌ Disjointness check failed: Level {level} overlaps with previous levels")
            validation_passed = False
        else:
            all_extracted_ids.update(level_ids)
    
    if validation_passed:
        print(f"✅ Disjointness check passed: No user appears in multiple extractions")
    
    return validation_passed


def main():
    """Main execution function."""
    args = parse_args()
    
    print(f"🚀 Starting New User Waterfall System...")
    print(f"   Time window: {args.min_hours}h - {args.max_days}d since signup")
    print(f"   Output directory: {args.output_dir}")
    
    # Step 1: Get base audience of new users
    print(f"\n👤 Fetching new users in time window...")
    base_users = get_new_users_in_window(args.min_hours, args.max_days)
    
    if not base_users:
        print("⚠️  No new users found in time window. Exiting.")
        return
    
    initial_count = len(base_users)
    print(f"   ✅ Found {initial_count} new users to process")
    
    # Initialize tracking variables
    extraction_results = {
        'initial_count': initial_count,
        'extractions': {},
        'final_remaining': [],
        'generated_files': []
    }
    
    remaining_users = base_users.copy()
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Step 2: Sequential waterfall extraction
    print(f"\n🌊 Starting waterfall extraction...")
    
    # Level 1: No Shoes
    level_1_users, remaining_users = extract_level_1_no_shoes(remaining_users)
    extraction_results['extractions']['1'] = {
        'extracted_users': level_1_users,
        'extracted_count': len(level_1_users),
        'remaining_after': len(remaining_users)
    }
    
    # Level 2: No Bio
    level_2_users, remaining_users = extract_level_2_no_bio(remaining_users)
    extraction_results['extractions']['2'] = {
        'extracted_users': level_2_users,
        'extracted_count': len(level_2_users),
        'remaining_after': len(remaining_users)
    }
    
    # Level 3: No Offers
    level_3_users, remaining_users = extract_level_3_no_offers(remaining_users)
    extraction_results['extractions']['3'] = {
        'extracted_users': level_3_users,
        'extracted_count': len(level_3_users),
        'remaining_after': len(remaining_users)
    }
    
    # Level 4: No Wishlist
    level_4_users, remaining_users = extract_level_4_no_wishlist(remaining_users)
    extraction_results['extractions']['4'] = {
        'extracted_users': level_4_users,
        'extracted_count': len(level_4_users),
        'remaining_after': len(remaining_users)
    }
    
    # Level 5: New Stars
    level_5_users, final_remaining = extract_level_5_new_stars(remaining_users)
    extraction_results['extractions']['5'] = {
        'extracted_users': level_5_users,
        'extracted_count': len(level_5_users),
        'remaining_after': len(final_remaining)
    }
    
    extraction_results['final_remaining'] = final_remaining
    
    if args.dry_run:
        print("\n🔍 Dry run complete. No files generated.")
        return
    
    # Step 3: Generate production CSV files
    print(f"\n📝 Generating production CSV files...")
    
    file_configs = [
        (level_1_users, f'no-shoes-new-user-{timestamp}.csv'),
        (level_2_users, f'no-bio-new-user-{timestamp}.csv'),
        (level_3_users, f'no-offers-new-user-{timestamp}.csv'),
        (level_4_users, f'no-wishlist-new-user-{timestamp}.csv'),
        (level_5_users, f'new-stars-new-user-{timestamp}.csv')
    ]
    
    for users, filename in file_configs:
        if users:  # Only generate if there are users
            file_path = generate_csv_file(users, filename, args.output_dir)
            checksum = calculate_file_checksum(file_path)
            extraction_results['generated_files'].append({
                'path': file_path,
                'count': len(users),
                'checksum': checksum
            })
    
    # Step 4: Generate test CSV files (founder-only)
    print(f"\n🧪 Generating test CSV files...")
    test_file_paths = generate_test_csvs(extraction_results, args.output_dir, timestamp)
    
    # Add test files to results with checksums
    for test_file_path in test_file_paths:
        checksum = calculate_file_checksum(test_file_path)
        extraction_results['generated_files'].append({
            'path': test_file_path,
            'count': 1,  # Always 1 for test files (founder only)
            'checksum': checksum,
            'is_test': True
        })
    
    # Step 5: Generate remaining users file
    if final_remaining:
        remaining_file = generate_csv_file(final_remaining, f'residual-remaining-{timestamp}.csv', args.output_dir)
        checksum = calculate_file_checksum(remaining_file)
        extraction_results['generated_files'].append({
            'path': remaining_file,
            'count': len(final_remaining),
            'checksum': checksum
        })
    
    # Step 6: Validation
    validation_passed = validate_waterfall_integrity(extraction_results)
    
    # Step 7: Generate metrics report
    metrics_report = {
        'timestamp': timestamp,
        'initial_users': initial_count,
        'extractions': {
            level: {'count': data['extracted_count'], 'remaining_after': data['remaining_after']}
            for level, data in extraction_results['extractions'].items()
        },
        'final_remaining': len(final_remaining),
        'generated_files': extraction_results['generated_files'],
        'validation_passed': validation_passed
    }
    
    # Save metrics report
    metrics_file = os.path.join(args.output_dir, f'waterfall-metrics-{timestamp}.json')
    with open(metrics_file, 'w') as f:
        json.dump(metrics_report, f, indent=2)
    
    print(f"\n📊 Metrics report saved: {metrics_file}")
    
    if validation_passed:
        print(f"\n🎉 Waterfall extraction completed successfully!")
        print(f"   Total files generated: {len(extraction_results['generated_files'])}")
        print(f"   Total users processed: {initial_count}")
    else:
        print(f"\n❌ Waterfall extraction completed with validation errors!")
        sys.exit(1)


if __name__ == "__main__":
    main()
