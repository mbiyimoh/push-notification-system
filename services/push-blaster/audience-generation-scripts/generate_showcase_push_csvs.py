#!/usr/bin/env python3
"""
Generate Specific Shoe Showcase Push CSVs

This script creates three distinct audience CSVs for Phase 3 push notifications:
1. "Haves" - Users who own the focus shoe (OPEN_FOR_TRADE)
2. "Wants" - Users who have the focus shoe on their wishlist  
3. "Everybody-else" - Users who don't have/want the focus shoe

Usage:
    python3 generate_showcase_push_csvs.py --product_id <UUID> [options]

Author: @squad-agent-database-master (Push CSV Creation Project - Phase 3)
"""

import argparse
import csv
import os
import sys
from datetime import datetime
from typing import List, Dict, Any

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
    get_product_showcase_stats,
    get_showcase_audience_haves,
    get_showcase_audience_wants,
    get_showcase_audience_everybody_else,
    get_bulk_variant_wishlist_counts,
    get_bulk_variant_inventory_counts,
    get_bulk_variant_sizes,
    get_bulk_variant_offers_7d,
    get_bulk_variant_open_offers_targeting
)


def parse_args():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate three distinct CSV audiences for specific shoe showcase push notifications",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python3 generate_showcase_push_csvs.py --product_id 832b53d0-caae-409a-a7fb-7d2e86502eb4
  python3 generate_showcase_push_csvs.py --product_id 832b53d0-caae-409a-a7fb-7d2e86502eb4 --activity_days 60 --output_dir custom_csvs
        """
    )
    
    parser.add_argument(
        "--product_id", 
        required=True,
        help="UUID of the focus product for showcase push notifications"
    )
    parser.add_argument(
        "--activity_days", 
        type=int, 
        default=90,
        help="Number of days for 'active user' definition (default: 90)"
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


def enrich_with_variant_stats(audience_data: List[Dict[str, Any]], audience_type: str) -> List[Dict[str, Any]]:
    """
    Enriches audience data with variant-specific counts and sizes.
    
    Args:
        audience_data: List of user records
        audience_type: "haves", "wants", or "everybody_else"
        
    Returns:
        List of enriched user records with appropriate variant counts, sizes, and offers
    """
    
    if not audience_data:
        return audience_data
    
    # Extract variant IDs, filtering out None values for "everybody_else"
    variant_ids = [record['variant_id'] for record in audience_data if record.get('variant_id')]
    
    if not variant_ids:
        print(f"⚠️  No variant IDs found for {audience_type} audience enrichment")
        # Fallback: add default columns with zero values
        enriched_data = []
        for record in audience_data:
            enriched_record = record.copy()
            enriched_record['wishlist_count'] = 0
            enriched_record['inventory_count'] = 0
            enriched_record['relevant_variant_size'] = 'N/A'
            enriched_record['variant_offers_7d'] = 0
            enriched_data.append(enriched_record)
        return enriched_data
    
    print(f"🔧 Enriching {len(audience_data)} {audience_type} records with variant stats for {len(set(variant_ids))} unique variants...")
    
    # Get bulk stats
    unique_variant_ids = list(set(variant_ids))
    wishlist_count_map = get_bulk_variant_wishlist_counts(unique_variant_ids)
    inventory_count_map = get_bulk_variant_inventory_counts(unique_variant_ids)
    variant_size_map = get_bulk_variant_sizes(unique_variant_ids)
    variant_offers_map = get_bulk_variant_offers_7d(unique_variant_ids)
    variant_open_offers_map = get_bulk_variant_open_offers_targeting(unique_variant_ids)
    
    # Enrich data
    enriched_data = []
    for record in audience_data:
        enriched_record = record.copy()
        variant_id = record.get('variant_id')
        if variant_id:
            enriched_record['wishlist_count'] = wishlist_count_map.get(variant_id, 0)
            enriched_record['inventory_count'] = inventory_count_map.get(variant_id, 0)
            enriched_record['relevant_variant_size'] = variant_size_map.get(variant_id, 'Unknown')
            enriched_record['variant_offers_7d'] = variant_offers_map.get(variant_id, 0)
            enriched_record['variant_open_offers'] = variant_open_offers_map.get(variant_id, 0)
        else:
            # For "everybody_else" records with no variant_id
            enriched_record['wishlist_count'] = 0
            enriched_record['inventory_count'] = 0
            enriched_record['relevant_variant_size'] = 'N/A'
            enriched_record['variant_offers_7d'] = 0
            enriched_record['variant_open_offers'] = 0
        enriched_data.append(enriched_record)
    
    print(f"✅ Enrichment complete: {len(enriched_data)} {audience_type} records with variant stats, sizes, offers, and open offers")
    return enriched_data


def apply_demand_filtering_to_haves(user_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Filters out "haves" users with low demand for their owned shoes.
    
    For showcase pushes targeting users who own the shoe, we only want to notify them 
    when there's meaningful demand. Excludes rows where variant_open_offers < 2.
    
    Args:
        user_data: List of enriched "haves" user records
        
    Returns:
        List of "haves" user records with sufficient demand for push notifications
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
    
    print(f"📊 Demand filtering for 'haves': {initial_count} → {filtered_count} users ({removed_count} removed for low demand)")
    
    return filtered_data


def generate_csv_files(audience_data: Dict[str, List[Dict[str, Any]]], product_stats: Dict[str, Any], 
                      output_dir: str, product_id: str) -> List[str]:
    """
    Generates the three showcase CSV files.
    
    Args:
        audience_data: Dictionary with 'haves', 'wants', 'everybody_else' audiences
        product_stats: Product-level statistics (offers_7d, trades_30d)
        output_dir: Directory to save CSV files
        product_id: Product ID for file naming
        
    Returns:
        List of paths to generated CSV files
    """
    
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    generated_files = []
    
    # CSV configurations for each audience type
    csv_configs = {
        'haves': {
            'filename': f'showcase-haves_{product_id[:8]}_{timestamp}.csv',
            'columns': ['firstName', 'usersize', 'variantID', 'relevant_variant_size', 'wishlist_count', 'variant_open_offers', 'variant_offers_7d', 'product_offers_7d', 'product_trades_30d', 'lastActive'],
            'variant_stat': 'wishlist_count',  # "Haves" need wishlist count for their variant
            'description': 'Users who HAVE the focus shoe (OPEN_FOR_TRADE)'
        },
        'wants': {
            'filename': f'showcase-wants_{product_id[:8]}_{timestamp}.csv',
            'columns': ['firstName', 'usersize', 'variantID', 'relevant_variant_size', 'inventory_count', 'variant_offers_7d', 'product_offers_7d', 'product_trades_30d', 'lastActive'],
            'variant_stat': 'inventory_count',  # "Wants" need inventory count for their variant
            'description': 'Users who WANT the focus shoe (wishlist)'
        },
        'everybody_else': {
            'filename': f'showcase-everybody-else_{product_id[:8]}_{timestamp}.csv',
            'columns': ['firstName', 'usersize', 'variantID', 'relevant_variant_size', 'inventory_count', 'variant_offers_7d', 'product_offers_7d', 'product_trades_30d', 'lastActive'],
            'variant_stat': 'inventory_count',  # "Everybody-else" needs inventory count (will be 0)
            'description': 'Users who do NOT have/want the focus shoe'
        }
    }
    
    for audience_type, config in csv_configs.items():
        file_path = os.path.join(output_dir, config['filename'])
        data = audience_data.get(audience_type, [])
        
        with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=config['columns'])
            writer.writeheader()
            
            for record in data:
                # Map fields to CSV columns
                csv_record = {
                    'firstName': record.get('first_name'),
                    'usersize': record.get('user_size'),
                    'variantID': record.get('variant_id', ''),  # All audiences now have variant_id
                    'relevant_variant_size': record.get('relevant_variant_size', 'N/A'),
                    config['variant_stat']: record.get(config['variant_stat'], 0),
                    'variant_offers_7d': record.get('variant_offers_7d', 0),
                    'product_offers_7d': product_stats.get('product_offers_7d', 0),
                    'product_trades_30d': product_stats.get('product_trades_30d', 0),
                    'lastActive': record.get('last_active')
                }
                
                # Add variant_open_offers only for 'haves' audience
                if audience_type == 'haves':
                    csv_record['variant_open_offers'] = record.get('variant_open_offers', 0)
                writer.writerow(csv_record)
        
        print(f"✅ Generated {file_path} with {len(data)} records ({config['description']})")
        generated_files.append(file_path)
    
    return generated_files


def generate_test_csvs(audience_data: Dict[str, List[Dict[str, Any]]], product_stats: Dict[str, Any], 
                      output_dir: str, product_id: str) -> List[str]:
    """
    Generates test CSV files with only the founder as the audience member.
    
    Args:
        audience_data: Dictionary with 'haves', 'wants', 'everybody_else' audiences
        product_stats: Product-level statistics 
        output_dir: Directory to save test CSV files
        product_id: Product ID for file naming
        
    Returns:
        List of paths to generated test CSV files
    """
    
    # Founder test user info
    TEST_USER_INFO = {
        'user_id': '0e54067c-4c0e-4e4a-8a23-a47661578059',
        'first_name': 'Mbiyimoh',
        'user_size': '13'
    }
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    generated_test_files = []
    
    # CSV configurations for test files
    csv_configs = {
        'haves': {
            'filename': f'showcase-haves_{product_id[:8]}_TEST_{timestamp}.csv',
            'columns': ['firstName', 'usersize', 'variantID', 'relevant_variant_size', 'wishlist_count', 'variant_open_offers', 'variant_offers_7d', 'product_offers_7d', 'product_trades_30d', 'lastActive'],
            'variant_stat': 'wishlist_count'
        },
        'wants': {
            'filename': f'showcase-wants_{product_id[:8]}_TEST_{timestamp}.csv',
            'columns': ['firstName', 'usersize', 'variantID', 'relevant_variant_size', 'inventory_count', 'variant_offers_7d', 'product_offers_7d', 'product_trades_30d', 'lastActive'],
            'variant_stat': 'inventory_count'
        },
        'everybody_else': {
            'filename': f'showcase-everybody-else_{product_id[:8]}_TEST_{timestamp}.csv',
            'columns': ['firstName', 'usersize', 'variantID', 'relevant_variant_size', 'inventory_count', 'variant_offers_7d', 'product_offers_7d', 'product_trades_30d', 'lastActive'],
            'variant_stat': 'inventory_count'
        }
    }
    
    for audience_type, config in csv_configs.items():
        file_path = os.path.join(output_dir, config['filename'])
        production_data = audience_data.get(audience_type, [])
        
        # Get data from row 2 of production CSV, or create default if not enough data
        if len(production_data) >= 2:
            row_2 = production_data[1]  # Second row (index 1)
        else:
            # Default values if not enough production data
            row_2 = {
                'variant_id': '',  # Default empty variant_id for fallback cases
                'relevant_variant_size': 'N/A',
                'wishlist_count': 0,
                'inventory_count': 0,
                'variant_offers_7d': 0,
                'variant_open_offers': 0,
                'last_active': '2025-08-06'
            }
        
        with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=config['columns'])
            writer.writeheader()
            
            # Create single test record combining founder info with row 2 product data
            test_record = {
                'firstName': TEST_USER_INFO['first_name'],
                'usersize': TEST_USER_INFO['user_size'],
                'variantID': row_2.get('variant_id', ''),
                'relevant_variant_size': row_2.get('relevant_variant_size', 'N/A'),
                config['variant_stat']: row_2.get(config['variant_stat'], 0),
                'variant_offers_7d': row_2.get('variant_offers_7d', 0),
                'product_offers_7d': product_stats.get('product_offers_7d', 0),
                'product_trades_30d': product_stats.get('product_trades_30d', 0),
                'lastActive': row_2.get('last_active', '2025-08-06')
            }
            
            # Add variant_open_offers only for 'haves' test audience
            if audience_type == 'haves':
                test_record['variant_open_offers'] = row_2.get('variant_open_offers', 0)
            
            writer.writerow(test_record)
        
        print(f"✅ Generated test CSV: {file_path} (founder as {audience_type} audience)")
        generated_test_files.append(file_path)
    
    return generated_test_files


def validate_csv_files(file_paths: List[str]) -> bool:
    """
    Validates the generated CSV files for basic data integrity.
    
    Args:
        file_paths: List of paths to CSV files to validate
        
    Returns:
        True if all validation passes, False otherwise
    """
    
    validation_passed = True
    
    for file_path in file_paths:
        if not os.path.exists(file_path):
            print(f"❌ Validation failed: {file_path} does not exist")
            validation_passed = False
            continue
        
        try:
            with open(file_path, 'r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                rows = list(reader)
                
                # Check for empty file
                if len(rows) == 0:
                    print(f"⚠️  Warning: {file_path} is empty")
                    continue
                
                # Check required columns (variant_open_offers only required for haves audience)
                base_required_cols = ['firstName', 'usersize', 'variantID', 'relevant_variant_size', 'variant_offers_7d', 'product_offers_7d', 'product_trades_30d', 'lastActive']
                required_cols = base_required_cols.copy()
                
                # Add variant_open_offers requirement for haves files
                if 'haves' in file_path:
                    required_cols.append('variant_open_offers')
                missing_cols = [col for col in required_cols if col not in reader.fieldnames]
                if missing_cols:
                    print(f"❌ Validation failed: {file_path} missing columns: {missing_cols}")
                    validation_passed = False
                    continue
                
                # Check for unexpected null values in critical columns
                null_count = sum(1 for row in rows if not row.get('firstName') or not row.get('usersize'))
                if null_count > 0:
                    print(f"⚠️  Warning: {file_path} has {null_count} rows with missing firstName or usersize")
                
                print(f"✅ Validation passed: {file_path} ({len(rows)} rows)")
                
        except Exception as e:
            print(f"❌ Validation failed: Error reading {file_path}: {e}")
            validation_passed = False
    
    return validation_passed


def main():
    """Main execution function."""
    args = parse_args()
    
    print(f"🚀 Starting Specific Shoe Showcase CSV generation...")
    print(f"   Focus Product ID: {args.product_id}")
    print(f"   Active user window: {args.activity_days} days")
    print(f"   Output directory: {args.output_dir}")
    
    # Step 1: Get product-level statistics
    print(f"\n📊 Fetching product statistics...")
    product_stats = get_product_showcase_stats(args.product_id)
    
    if not product_stats:
        print("⚠️  Could not fetch product statistics. Exiting.")
        return
    
    print(f"   Product offers (7d): {product_stats.get('product_offers_7d', 0)}")
    print(f"   Product trades (30d): {product_stats.get('product_trades_30d', 0)}")
    
    # Step 2: Get three distinct audiences
    print(f"\n👥 Fetching audiences...")
    
    audience_data = {}
    audience_data['haves'] = get_showcase_audience_haves(args.product_id, args.activity_days)
    audience_data['wants'] = get_showcase_audience_wants(args.product_id, args.activity_days)
    audience_data['everybody_else'] = get_showcase_audience_everybody_else(args.product_id, args.activity_days)
    
    # Check if we have any audiences
    total_users = sum(len(audience) for audience in audience_data.values())
    if total_users == 0:
        print("⚠️  No users found in any audience. Exiting.")
        return
    
    print(f"   Total audiences: {len([k for k, v in audience_data.items() if v])} with {total_users} total users")
    
    # Step 3: Enrich with variant statistics
    print(f"\n🔧 Enriching audiences with variant statistics...")
    for audience_type, data in audience_data.items():
        if data:  # Only enrich non-empty audiences
            audience_data[audience_type] = enrich_with_variant_stats(data, audience_type)
    
    # Step 4: Apply demand filtering to 'haves' audience
    print(f"\n🎯 Applying demand filtering to 'haves' audience...")
    if audience_data.get('haves'):
        audience_data['haves'] = apply_demand_filtering_to_haves(audience_data['haves'])
        if not audience_data['haves']:
            print("⚠️  No 'haves' users remain after demand filtering.")
    
    if args.dry_run:
        print("\n🔍 Dry run complete. No files generated.")
        return
    
    # Step 5: Generate CSV files
    print(f"\n📝 Generating CSV files...")
    generated_files = generate_csv_files(audience_data, product_stats, args.output_dir, args.product_id)
    
    # Step 6: Generate test CSV files
    print(f"\n🧪 Generating test CSV files...")
    test_files = generate_test_csvs(audience_data, product_stats, args.output_dir, args.product_id)
    
    # Step 7: Validate output
    print(f"\n✅ Validating generated files...")
    all_files = generated_files + test_files
    validation_passed = validate_csv_files(all_files)
    
    if validation_passed:
        print(f"\n🎉 Specific Shoe Showcase CSV generation completed successfully!")
        print(f"   Production files:")
        for file_path in generated_files:
            print(f"   - {file_path}")
        print(f"   Test files:")
        for file_path in test_files:
            print(f"   - {file_path}")
    else:
        print(f"\n❌ Specific Shoe Showcase CSV generation completed with validation errors!")
        sys.exit(1)


if __name__ == "__main__":
    main()