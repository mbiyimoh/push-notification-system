#!/usr/bin/env python3
"""
Layer 2 Push CSV Generation Script

Generates audience CSV for trending closet items push notifications.
Identifies users who own currently trending shoes (top 10 most targeted in past week).

Usage:
    python3 generate_layer_2_push_csv.py [--lookback_days 7] [--activity_days 90] [--output_dir generated_csvs]
"""

import sys
import os
import csv
import argparse
from datetime import datetime
from typing import Dict, List, Any
from collections import defaultdict

# Add the project root to the Python path
# Handle both local development (monorepo) and Docker/Railway deployment
script_dir = os.path.dirname(os.path.abspath(__file__))
cwd = os.getcwd()
repo_root = os.path.abspath(os.path.join(script_dir, "..", "..", ".."))

# Check if basic_capabilities exists in cwd (Docker case) or repo_root (local dev)
if os.path.exists(os.path.join(cwd, "basic_capabilities")):
    # Docker/Railway: basic_capabilities is at /app/basic_capabilities
    if cwd not in sys.path:
        sys.path.insert(0, cwd)
elif os.path.exists(os.path.join(repo_root, "basic_capabilities")):
    # Local development: basic_capabilities is at monorepo root
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

from basic_capabilities.internal_db_queries_toolbox.push_csv_queries import (
    get_trending_products_weekly,
    get_users_with_trending_products,
    get_user_profile_data_by_ids,
    get_bulk_variant_wishlist_counts,
    get_bulk_variant_sizes,
    get_bulk_variant_open_offers_targeting
)


def parse_args():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate Layer 2 push notification CSV for users with trending shoes."
    )
    parser.add_argument(
        "--lookback_days", 
        type=int, 
        default=7,
        help="Number of days to look back for trending analysis (default: 7)"
    )
    parser.add_argument(
        "--activity_days", 
        type=int, 
        default=90,
        help="Number of days for active user definition (default: 90)"
    )
    parser.add_argument(
        "--output_dir", 
        type=str, 
        default="generated_csvs",
        help="Directory to save generated CSV files"
    )
    parser.add_argument(
        "--dry_run", 
        action="store_true",
        help="Print statistics without generating files"
    )
    return parser.parse_args()


def enrich_with_wishlist_counts_and_variant_sizes(user_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Enriches user data with wishlist counts, variant sizes, and open offer counts.
    
    Args:
        user_data: List of user records with variant_id
        
    Returns:
        List of enriched user records with wishlist_count, relevant_variant_size, and variant_open_offers
    """
    
    if not user_data:
        return user_data
    
    # Extract unique variant IDs
    variant_ids = list({record['variant_id'] for record in user_data if record.get('variant_id')})
    
    if not variant_ids:
        print("⚠️  No variant IDs found for enrichment")
        return user_data
    
    print(f"🔧 Enriching {len(user_data)} records with wishlist counts, variant sizes, and open offers for {len(variant_ids)} variants...")
    
    # Get bulk data using efficient bulk queries
    wishlist_count_map = get_bulk_variant_wishlist_counts(variant_ids)
    variant_size_map = get_bulk_variant_sizes(variant_ids)
    open_offers_map = get_bulk_variant_open_offers_targeting(variant_ids)
    
    # Enrich user data
    enriched_data = []
    for record in user_data:
        enriched_record = record.copy()
        variant_id = record.get('variant_id')
        if variant_id:
            enriched_record['wishlist_count'] = wishlist_count_map.get(variant_id, 0)
            enriched_record['relevant_variant_size'] = variant_size_map.get(variant_id, 'Unknown')
            enriched_record['variant_open_offers'] = open_offers_map.get(variant_id, 0)
        else:
            enriched_record['wishlist_count'] = 0
            enriched_record['relevant_variant_size'] = 'Unknown'
            enriched_record['variant_open_offers'] = 0
        enriched_data.append(enriched_record)
    
    print(f"✅ Enrichment complete: {len(enriched_data)} records with wishlist counts, variant sizes, and open offers")
    return enriched_data


def match_users_to_highest_ranked_products(user_data: List[Dict[str, Any]], trending_products: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Matches users to their highest-ranked trending product.
    If a user owns multiple trending shoes, selects the one with the best rank.
    
    Args:
        user_data: List of users with their trending products
        trending_products: List of trending products with rankings
        
    Returns:
        List of users with their single highest-ranked trending product
    """
    
    # Create lookup map for product rankings
    product_rank_map = {}
    for product in trending_products:
        product_rank_map[product['product_id']] = {
            'rank_number': product['rank_number'],
            'trending_rank': product['trending_rank']
        }
    
    # Group users by user_id and find their best-ranked product
    user_products = defaultdict(list)
    for user in user_data:
        user_products[user['user_id']].append(user)
    
    final_users = []
    for user_id, products in user_products.items():
        # Find the product with the best (lowest) rank number
        best_product = None
        best_rank = float('inf')
        
        for product in products:
            product_id = product['product_id']
            if product_id in product_rank_map:
                rank_number = product_rank_map[product_id]['rank_number']
                if rank_number < best_rank:
                    best_rank = rank_number
                    best_product = product
                    # Add ranking info to the product
                    best_product['trending_rank'] = product_rank_map[product_id]['trending_rank']
        
        if best_product:
            final_users.append(best_product)
    
    return final_users


def apply_demand_filtering(user_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filters out users with low demand for their trending products.
    
    For Layer 2 pushes, we only want to notify users when there's meaningful demand.
    Excludes rows where variant_open_offers < 2 (not compelling enough).
    
    Args:
        user_data: List of enriched user records
        
    Returns:
        List of user records with sufficient demand for push notifications
    """
    
    if not user_data:
        return user_data
        
    initial_count = len(user_data)
    
    # Filter out rows with insufficient demand
    filtered_data = [
        record for record in user_data 
        if record.get('variant_open_offers', 0) >= 2
    ]
    
    filtered_count = len(filtered_data)
    removed_count = initial_count - filtered_count
    
    print(f"📊 Demand filtering: {initial_count} → {filtered_count} users ({removed_count} removed for low demand)")
    
    return filtered_data


def generate_test_csv(user_data: List[Dict[str, Any]], output_dir: str, timestamp: str, suffix: str = "") -> str:
    """
    Generates a 2-line test CSV with founder's info + row 2 product data.
    
    Args:
        user_data: Production user data
        output_dir: Directory to save test CSV
        timestamp: Timestamp string for file naming
        
    Returns:
        Path to generated test CSV file
    """
    
    # Founder's test info
    TEST_USER_INFO = {
        'user_id': '0e54067c-4c0e-4e4a-8a23-a47661578059',
        'username': 'beems',
        'firstName': 'Mbiyimoh',
        'usersize': '13',
        'lastActive': '2025-08-05 20:00:00.000000+00:00'
    }
    
    test_file_path = os.path.join(output_dir, f'trending-closet-items{suffix}_TEST_{timestamp}.csv')
    columns = ['user_id', 'username', 'firstName', 'usersize', 'product_name', 'trending_rank', 'variantID', 'relevant_variant_size', 'wishlist_count', 'variant_open_offers', 'lastActive']
    
    if not user_data or len(user_data) < 1:
        print("⚠️  Insufficient data for test CSV generation")
        return test_file_path
    
    # Use row 2 data if available, otherwise row 1
    row_2 = user_data[1] if len(user_data) > 1 else user_data[0]
    
    test_record = TEST_USER_INFO.copy()
    test_record.update({
        'product_name': row_2.get('product_name'),
        'trending_rank': row_2.get('trending_rank'),
        'variantID': row_2.get('variant_id'),
        'relevant_variant_size': row_2.get('relevant_variant_size', 'Unknown'),
        'wishlist_count': row_2.get('wishlist_count', 0),
        'variant_open_offers': row_2.get('variant_open_offers', 0),
    })
    
    with open(test_file_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=columns)
        writer.writeheader()
        
        # Write ONLY the test record (founder's info + row 2 product) - single user audience
        filtered_test_record = {col: test_record.get(col, '') for col in columns}
        writer.writerow(filtered_test_record)
    
    print(f"🧪 Generated test CSV: {test_file_path} (header + 1 user row)")
    return test_file_path


def write_csv_data(user_data: List[Dict[str, Any]], file_path: str, columns: List[str]) -> None:
    """
    Helper function to write user data to a CSV file.
    
    Args:
        user_data: List of user records to write
        file_path: Path to the CSV file
        columns: List of column names
    """
    
    with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=columns)
        writer.writeheader()
        
        for record in user_data:
            # Map fields to CSV columns
            csv_record = {
                'user_id': record.get('user_id'),
                'username': record.get('username'),
                'firstName': record.get('first_name'),
                'usersize': record.get('user_size'),
                'product_name': record.get('product_name'),
                'trending_rank': record.get('trending_rank'),
                'variantID': record.get('variant_id'),
                'relevant_variant_size': record.get('relevant_variant_size', 'Unknown'),
                'wishlist_count': record.get('wishlist_count', 0),
                'variant_open_offers': record.get('variant_open_offers', 0),
                'lastActive': record.get('last_active')
            }
            writer.writerow(csv_record)


def separate_top_trending_users(user_data: List[Dict[str, Any]]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Separates users who own the #1 trending shoe from users who own #2-10 trending shoes.
    
    Args:
        user_data: List of enriched user records
        
    Returns:
        Tuple of (top_trending_users, other_trending_users)
    """
    
    top_trending_users = []
    other_trending_users = []
    
    for record in user_data:
        trending_rank = record.get('trending_rank', '')
        if trending_rank == '1st':
            top_trending_users.append(record)
        else:
            other_trending_users.append(record)
    
    return top_trending_users, other_trending_users


def generate_csv_files(user_data: List[Dict[str, Any]], output_dir: str) -> tuple[str, str]:
    """
    Generates separate CSV files for #1 trending shoe users and #2-10 trending shoe users.
    
    Args:
        user_data: List of enriched user records
        output_dir: Directory to save CSV files
        
    Returns:
        Tuple of (main_csv_path, top_trending_csv_path)
    """
    
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    columns = ['user_id', 'username', 'firstName', 'usersize', 'product_name', 'trending_rank', 'variantID', 'relevant_variant_size', 'wishlist_count', 'variant_open_offers', 'lastActive']
    
    # Separate users by trending rank
    top_trending_users, other_trending_users = separate_top_trending_users(user_data)
    
    # Generate main CSV for #2-10 trending shoes
    main_file_path = os.path.join(output_dir, f'trending-closet-items_{timestamp}.csv')
    write_csv_data(other_trending_users, main_file_path, columns)
    print(f"✅ Generated {main_file_path} with {len(other_trending_users)} records (#2-10 trending shoes)")
    
    # Generate separate CSV for #1 trending shoe
    top_trending_file_path = os.path.join(output_dir, f'trending-closet-items-top1_{timestamp}.csv')
    write_csv_data(top_trending_users, top_trending_file_path, columns)
    print(f"✅ Generated {top_trending_file_path} with {len(top_trending_users)} records (#1 trending shoe)")
    
    # Generate test CSVs
    generate_test_csv(other_trending_users, output_dir, timestamp, suffix="")
    generate_test_csv(top_trending_users, output_dir, timestamp, suffix="-top1")
    
    return main_file_path, top_trending_file_path


def validate_csv_file(file_path: str) -> bool:
    """
    Validates the generated CSV file for basic data integrity.
    
    Args:
        file_path: Path to the CSV file to validate
        
    Returns:
        True if validation passes, False otherwise
    """
    
    if not os.path.exists(file_path):
        print(f"❌ Validation failed: {file_path} does not exist")
        return False
    
    try:
        with open(file_path, 'r', encoding='utf-8') as csvfile:
            reader = csv.DictReader(csvfile)
            rows = list(reader)
            
            if not rows:
                print(f"❌ Validation failed: {file_path} is empty")
                return False
            
            # Check required columns exist
            required_cols = ['user_id', 'firstName', 'usersize', 'product_name', 'trending_rank', 'variantID', 'variant_open_offers']
            missing_cols = [col for col in required_cols if col not in reader.fieldnames]
            
            if missing_cols:
                print(f"❌ Validation failed: {file_path} missing columns: {missing_cols}")
                return False
            
            # Check for unexpected null values in critical columns
            null_count = sum(1 for row in rows if not row.get('firstName') or not row.get('usersize'))
            if null_count > 0:
                print(f"⚠️  Warning: {file_path} has {null_count} rows with missing firstName or usersize")
            
            print(f"✅ Validation passed: {file_path} ({len(rows)} rows)")
            return True
            
    except Exception as e:
        print(f"❌ Validation failed: Error reading {file_path}: {e}")
        return False


def main():
    """Main execution function."""
    args = parse_args()
    
    print(f"🚀 Starting Layer 2 Push CSV generation...")
    print(f"   Trending analysis lookback: {args.lookback_days} days")
    print(f"   Active user window: {args.activity_days} days")
    print(f"   Output directory: {args.output_dir}")
    
    # Step 1: Get trending products
    print(f"\n🔥 Fetching trending products...")
    trending_products = get_trending_products_weekly(args.lookback_days, limit=10)
    
    if not trending_products:
        print("⚠️  No trending products found. Exiting.")
        return
    
    print(f"   Top trending products:")
    for product in trending_products[:5]:  # Show top 5
        print(f"   {product['trending_rank']}: {product['product_name']} ({product['offer_count']} offers)")
    
    # Step 2: Get users who own these trending products
    trending_product_ids = [p['product_id'] for p in trending_products]
    print(f"\n👥 Finding users with trending products...")
    user_data = get_users_with_trending_products(trending_product_ids, args.activity_days)
    
    if not user_data:
        print("⚠️  No users found with trending products. Exiting.")
        return
    
    print(f"   Found {len(user_data)} user-product combinations")
    
    # Step 3: Match users to their highest-ranked trending product
    print(f"\n🎯 Matching users to highest-ranked products...")
    final_user_data = match_users_to_highest_ranked_products(user_data, trending_products)
    
    print(f"   Final audience: {len(final_user_data)} unique users")
    
    # Step 4: Enrich with wishlist counts and variant sizes
    print(f"\n🔧 Enriching data with wishlist counts and variant sizes...")
    enriched_user_data = enrich_with_wishlist_counts_and_variant_sizes(final_user_data)
    
    # Step 5: Apply demand filtering to ensure compelling push notifications
    print(f"\n🎯 Applying demand filtering...")
    filtered_user_data = apply_demand_filtering(enriched_user_data)
    
    if not filtered_user_data:
        print("⚠️  No users remain after demand filtering. Exiting.")
        return
    
    if args.dry_run:
        print("\n🔍 Dry run complete. No files generated.")
        return
    
    # Step 6: Generate CSV files (separate for #1 trending vs #2-10 trending)
    print(f"\n📝 Generating CSV files...")
    main_csv_path, top_trending_csv_path = generate_csv_files(filtered_user_data, args.output_dir)
    
    # Step 7: Validate output files
    print(f"\n✅ Validating generated files...")
    main_validation_passed = validate_csv_file(main_csv_path)
    top_validation_passed = validate_csv_file(top_trending_csv_path)
    
    if main_validation_passed and top_validation_passed:
        print(f"\n🎉 Layer 2 Push CSV generation completed successfully!")
        print(f"   Main CSV (#2-10 trending): {main_csv_path}")
        print(f"   Top Trending CSV (#1): {top_trending_csv_path}")
    else:
        print(f"\n❌ Layer 2 Push CSV generation completed with validation errors!")
        if not main_validation_passed:
            print(f"   Main CSV validation failed: {main_csv_path}")
        if not top_validation_passed:
            print(f"   Top trending CSV validation failed: {top_trending_csv_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()