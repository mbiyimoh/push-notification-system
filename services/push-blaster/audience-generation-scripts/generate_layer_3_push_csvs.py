#!/usr/bin/env python3
"""
Layer 3 Push CSV Generator

Generates audience CSVs for Layer 3 push notifications based on recent user activity.
Layer 3 pushes target users who have shown immediate intent signals in the last 24 hours:
- Adding shoes to closet (medium intent)
- Adding shoes to wishlist (low intent) 
- Creating offers (high intent)

Users are prioritized by intent level and only appear in one output file.
"""

# --- BEGIN NEXTJS DEBUG SHIM ---
import os, sys, json, time, traceback
_ts = str(int(time.time()*1000))
_log_dir = os.path.join(os.getcwd(), "tmp")
os.makedirs(_log_dir, exist_ok=True)
_log_path = os.path.join(_log_dir, f"_pydebug_{_ts}.log")
try:
    with open(_log_path, "w", buffering=1) as f:
        f.write("[start]\n")
        f.write("argv=" + json.dumps(sys.argv) + "\n")
        f.write("executable=" + sys.executable + "\n")
        f.write("version=" + sys.version + "\n")
        f.write("cwd=" + os.getcwd() + "\n")
        keys = ["PATH","PYTHONPATH","VIRTUAL_ENV","OUTPUT_PATH","EXECUTION_ID","ENV","NODE_ENV","DATABASE_URL"]
        env_dump = {k: os.environ.get(k) for k in keys}
        f.write("env_subset=" + json.dumps(env_dump) + "\n")
except Exception:
    pass
# --- END NEXTJS DEBUG SHIM ---

import csv
import argparse
from datetime import datetime
from typing import List, Dict, Any, Set
from collections import defaultdict

# Step 6: Use sys.path manipulation for module imports
# Handle both local development (monorepo) and Docker/Railway deployment
import sys, os
script_dir = os.path.dirname(os.path.abspath(__file__))
# In Docker: /app/audience-generation-scripts, cwd is /app
# In local dev: services/push-blaster/audience-generation-scripts, repo root is 3 levels up
cwd = os.getcwd()
repo_root = os.path.abspath(os.path.join(script_dir, "..", "..", ".."))

# Check if basic_capabilities exists in cwd (Docker case) or repo_root (local dev)
print(f"[DIAG] cwd={cwd}", flush=True)
print(f"[DIAG] script_dir={script_dir}", flush=True)
print(f"[DIAG] repo_root={repo_root}", flush=True)
print(f"[DIAG] cwd/basic_capabilities exists: {os.path.exists(os.path.join(cwd, 'basic_capabilities'))}", flush=True)
print(f"[DIAG] repo_root/basic_capabilities exists: {os.path.exists(os.path.join(repo_root, 'basic_capabilities'))}", flush=True)

if os.path.exists(os.path.join(cwd, "basic_capabilities")):
    # Docker/Railway: basic_capabilities is at /app/basic_capabilities
    print(f"[DIAG] Using cwd path: {cwd}", flush=True)
    if cwd not in sys.path:
        sys.path.insert(0, cwd)
    # List contents to verify structure
    bc_path = os.path.join(cwd, "basic_capabilities")
    print(f"[DIAG] basic_capabilities contents: {os.listdir(bc_path)}", flush=True)
    subdir = os.path.join(bc_path, "internal_db_queries_toolbox")
    if os.path.exists(subdir):
        print(f"[DIAG] internal_db_queries_toolbox contents: {os.listdir(subdir)}", flush=True)
elif os.path.exists(os.path.join(repo_root, "basic_capabilities")):
    # Local development: basic_capabilities is at monorepo root
    print(f"[DIAG] Using repo_root path: {repo_root}", flush=True)
    if repo_root not in sys.path:
        sys.path.insert(0, repo_root)

print(f"[DIAG] sys.path[0:3]={sys.path[:3]}", flush=True)

# Log the sys.path for debugging
with open(_log_path, "a", buffering=1) as f:
    f.write(f"[sys_path] repo_root={repo_root}\n")
    f.write(f"[sys_path] sys.path={sys.path[:3]}\n")  # First 3 entries

try:
    from basic_capabilities.internal_db_queries_toolbox.push_csv_queries import (
        get_daily_activity_data,
        get_user_profile_data_by_ids,
        get_variant_inventory_count,
        get_variant_wishlist_count,
        get_bulk_variant_inventory_counts,
        get_bulk_variant_wishlist_counts,
        get_bulk_variant_sizes
    )
except Exception:
    with open(_log_path, "a", buffering=1) as f:
        f.write("[import_exception]\n")
        f.write(traceback.format_exc() + "\n")
    raise


def parse_args():
    """Parses command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Generate Layer 3 push notification audience CSVs based on recent user activity."
    )
    parser.add_argument(
        "--lookback_hours", 
        type=int, 
        default=48,
        help="Number of hours to look back for activity (default: 48)"
    )
    parser.add_argument(
        "--cooling_hours", 
        type=int, 
        default=12,
        help="Recent hours to exclude to avoid immediate follow-ups (default: 12)"
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


def prioritize_user_actions(activity_data: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """
    Implements Layer 3 prioritization logic for users with multiple actions.
    
    Priority order (highest to lowest intent):
    1. offer_created - User actively targeted a shoe in an offer
    2. closet_add - User added a shoe to their tradeable inventory  
    3. wishlist_add - User expressed casual interest
    
    Args:
        activity_data: List of activity records from get_daily_activity_data()
        
    Returns:
        Dictionary mapping user_id to their highest-priority action record
    """
    
    # Priority mapping (lower number = higher priority)
    priority_map = {
        'offer_created': 1,
        'closet_add': 2, 
        'wishlist_add': 3
    }
    
    user_priority_actions = {}
    
    for record in activity_data:
        user_id = record['user_id']
        action_type = record['action_type']
        current_priority = priority_map[action_type]
        
        if user_id not in user_priority_actions:
            user_priority_actions[user_id] = record
        else:
            existing_priority = priority_map[user_priority_actions[user_id]['action_type']]
            if current_priority < existing_priority:
                user_priority_actions[user_id] = record
                
    return user_priority_actions


def enrich_activity_data(prioritized_actions: Dict[str, Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Enriches prioritized activity data with user profiles and variant statistics.
    
    HIGH-PERFORMANCE version using bulk queries to eliminate N+1 query problem.
    
    Args:
        prioritized_actions: Output from prioritize_user_actions()
        
    Returns:
        Dictionary mapping action_type to list of enriched records ready for CSV
    """
    
    # Get user profile data
    user_ids = list(prioritized_actions.keys())
    user_profiles = get_user_profile_data_by_ids(user_ids)
    user_profile_map = {profile['user_id']: profile for profile in user_profiles}
    
    # Group variants by the type of statistics needed (using ACTUAL activity variants)
    inventory_variants = []  # For offer_created and wishlist_add actions
    wishlist_variants = []   # For closet_add actions
    variant_size_map = {}    # To store variant sizes for the new column
    
    print("🔧 Analyzing activity variants and fetching sizes...")
    
    # Pre-process to collect all variant IDs by type
    all_variant_ids = set()
    for user_id, activity_record in prioritized_actions.items():
        user_profile = user_profile_map.get(user_id)
        
        # Skip users without complete profile data
        if not user_profile or not user_profile.get('first_name') or not user_profile.get('user_size'):
            continue
            
        variant_id = activity_record['variant_id']  # Use ACTUAL activity variant
        action_type = activity_record['action_type']
        
        # Collect all unique variant IDs for bulk size query
        all_variant_ids.add(variant_id)
        
        # Collect variants for bulk queries
        if action_type in ['offer_created', 'wishlist_add']:
            inventory_variants.append(variant_id)
        elif action_type == 'closet_add':
            wishlist_variants.append(variant_id)
    
    # Get ALL variant sizes in one efficient bulk query (fixes N+1 problem)
    print(f"🔧 Fetching sizes for {len(all_variant_ids)} unique variants...")
    variant_size_map = get_bulk_variant_sizes(list(all_variant_ids))
    
    # Get all statistics in just 2 bulk queries instead of N individual queries
    inventory_counts = get_bulk_variant_inventory_counts(inventory_variants) if inventory_variants else {}
    wishlist_counts = get_bulk_variant_wishlist_counts(wishlist_variants) if wishlist_variants else {}
    
    # Group by action type for separate CSV files
    enriched_by_action = defaultdict(list)
    
    for user_id, activity_record in prioritized_actions.items():
        user_profile = user_profile_map.get(user_id)
        
        # Skip users without complete profile data
        if not user_profile or not user_profile.get('first_name') or not user_profile.get('user_size'):
            continue
            
        variant_id = activity_record['variant_id']  # Use ACTUAL activity variant
        action_type = activity_record['action_type']
        
        # Build base record with NEW relevant_variant_size column
        enriched_record = {
            'user_id': user_id,
            'username': user_profile.get('username', ''),
            'firstName': user_profile['first_name'],
            'usersize': user_profile['user_size'],  # User's preferred size
            'relevant_variant_size': variant_size_map.get(variant_id, 'Unknown'),  # NEW: Size of actual shoe they interacted with
            'product_name': activity_record['product_name'],
            'variantID': variant_id,  # ACTUAL variant they interacted with
            'lastActive': user_profile.get('last_active', '')
        }
        
        # Add action-specific statistics using pre-fetched bulk data
        if action_type == 'offer_created':
            # For offer creators: show how many people have the shoe they're targeting
            enriched_record['inventory_count'] = inventory_counts.get(variant_id, 0)
        elif action_type == 'closet_add':
            # For closet adders: show how many people want the shoe they just added
            enriched_record['wishlist_count'] = wishlist_counts.get(variant_id, 0)
        elif action_type == 'wishlist_add':
            # For wishlist adders: show how many people have the shoe they want
            enriched_record['inventory_count'] = inventory_counts.get(variant_id, 0)
            
        enriched_by_action[action_type].append(enriched_record)
    
    return dict(enriched_by_action)


def apply_demand_filtering(enriched_data: Dict[str, List[Dict[str, Any]]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    Applies demand-based filtering to ensure compelling push notifications:
    - recent-closet-adders: Remove if wishlist_count < 2 (not enough demand)  
    - recent-wishlist-adders: Remove if inventory_count < 3 (not enough supply)
    - recent-offer-creators: Remove if inventory_count < 3 (not enough supply)
    
    Args:
        enriched_data: Dictionary mapping action types to lists of enriched records
        
    Returns:
        Filtered enriched data with demand-based filtering applied
    """
    
    filtered_data = {}
    
    for action_type, records in enriched_data.items():
        filtered_records = []
        original_count = len(records)
        
        for record in records:
            should_include = True
            
            if action_type == 'closet_add':
                # For closet adds, need at least 2 people wanting it to be compelling
                wishlist_count = record.get('wishlist_count', 0)
                if wishlist_count < 2:
                    should_include = False
                    
            elif action_type in ['wishlist_add', 'offer_created']:
                # For wishlist adds and offers, need at least 3 people with inventory
                inventory_count = record.get('inventory_count', 0)
                if inventory_count < 3:
                    should_include = False
            
            if should_include:
                filtered_records.append(record)
        
        filtered_data[action_type] = filtered_records
        filtered_count = len(filtered_records)
        
        if original_count > filtered_count:
            print(f"🎯 {action_type}: Filtered {original_count} → {filtered_count} records (removed {original_count - filtered_count} low-demand items)")
        else:
            print(f"✅ {action_type}: {filtered_count} records passed demand filtering")
    
    return filtered_data


def generate_test_csvs(enriched_data: Dict[str, List[Dict[str, Any]]], output_dir: str, timestamp: str) -> Dict[str, str]:
    """
    Generates 2-line test CSVs for each audience type: header + single founder row only.
    Uses founder's info with product data from row 2 of production data.
    This allows testing push notifications before sending to full audience.
    
    Args:
        enriched_data: Filtered data from apply_demand_filtering()
        output_dir: Directory to save test CSV files
        timestamp: Timestamp string for file naming
        
    Returns:
        Dictionary mapping action types to test file paths
    """
    
    # Founder's test info
    TEST_USER_INFO = {
        'user_id': '0e54067c-4c0e-4e4a-8a23-a47661578059',
        'username': 'beems',
        'firstName': 'Mbiyimoh',
        'usersize': '13',
        'lastActive': '2025-08-05 20:00:00.000000+00:00'  # Current timestamp
    }
    
    test_files = {}
    
    csv_configs = {
        'offer_created': {
            'filename': f'recent-offer-creators_TEST_{timestamp}.csv',
            'columns': ['user_id', 'username', 'firstName', 'usersize', 'relevant_variant_size', 'product_name', 'variantID', 'lastActive', 'inventory_count']
        },
        'closet_add': {
            'filename': f'recent-closet-adders_TEST_{timestamp}.csv', 
            'columns': ['user_id', 'username', 'firstName', 'usersize', 'relevant_variant_size', 'product_name', 'variantID', 'lastActive', 'wishlist_count']
        },
        'wishlist_add': {
            'filename': f'recent-wishlist-adders_TEST_{timestamp}.csv',
            'columns': ['user_id', 'username', 'firstName', 'usersize', 'relevant_variant_size', 'product_name', 'variantID', 'lastActive', 'inventory_count']
        }
    }
    
    for action_type, records in enriched_data.items():
        if not records or len(records) < 1:
            print(f"⚠️  Skipping test CSV for {action_type} - insufficient data")
            continue
            
        config = csv_configs[action_type]
        file_path = os.path.join(output_dir, config['filename'])
        
        # Create test record by copying row 2's product info with founder's user info
        row_2 = records[1] if len(records) > 1 else records[0]  # Use row 2 or fallback to row 1
        
        test_record = TEST_USER_INFO.copy()
        test_record.update({
            'relevant_variant_size': row_2.get('relevant_variant_size'),
            'product_name': row_2.get('product_name'),
            'variantID': row_2.get('variantID'),
        })
        
        # Add the action-specific count field
        if action_type == 'closet_add':
            test_record['wishlist_count'] = row_2.get('wishlist_count')
        else:  # offer_created or wishlist_add
            test_record['inventory_count'] = row_2.get('inventory_count')
        
        with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=config['columns'])
            writer.writeheader()
            
            # Write ONLY the test record (founder's info + row 2 product) - single user audience
            filtered_test_record = {col: test_record.get(col, '') for col in config['columns']}
            writer.writerow(filtered_test_record)
        
        test_files[action_type] = file_path
        print(f"🧪 Generated test CSV: {file_path} (header + 1 user row)")
    
    return test_files


def generate_csv_files(enriched_data: Dict[str, List[Dict[str, Any]]], output_dir: str) -> Dict[str, str]:
    """
    Generates separate CSV files for each action type.
    
    Args:
        enriched_data: Output from enrich_activity_data()
        output_dir: Directory to save CSV files
        
    Returns:
        Dictionary mapping action_type to generated file path
    """
    
    os.makedirs(output_dir, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    generated_files = {}
    
    # CSV file mapping and column definitions
    csv_configs = {
        'offer_created': {
            'filename': f'recent-offer-creators_{timestamp}.csv',
            'columns': ['user_id', 'username', 'firstName', 'usersize', 'relevant_variant_size', 'product_name', 'variantID', 'lastActive', 'inventory_count']
        },
        'closet_add': {
            'filename': f'recent-closet-adders_{timestamp}.csv', 
            'columns': ['user_id', 'username', 'firstName', 'usersize', 'relevant_variant_size', 'product_name', 'variantID', 'lastActive', 'wishlist_count']
        },
        'wishlist_add': {
            'filename': f'recent-wishlist-adders_{timestamp}.csv',
            'columns': ['user_id', 'username', 'firstName', 'usersize', 'relevant_variant_size', 'product_name', 'variantID', 'lastActive', 'inventory_count']
        }
    }
    
    for action_type, records in enriched_data.items():
        if not records:
            print(f"⚠️  No records found for {action_type}")
            continue
            
        config = csv_configs[action_type]
        file_path = os.path.join(output_dir, config['filename'])
        
        with open(file_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=config['columns'])
            writer.writeheader()
            
            for record in records:
                # Only write columns that exist in the record
                filtered_record = {col: record.get(col, '') for col in config['columns']}
                writer.writerow(filtered_record)
        
        generated_files[action_type] = file_path
        print(f"✅ Generated {file_path} with {len(records)} records")
    
    return generated_files


def validate_csv_files(generated_files: Dict[str, str]) -> bool:
    """
    Validates generated CSV files for basic data integrity.
    
    Args:
        generated_files: Output from generate_csv_files()
        
    Returns:
        True if all files pass validation, False otherwise
    """
    
    validation_passed = True
    
    for action_type, file_path in generated_files.items():
        if not os.path.exists(file_path):
            print(f"❌ Validation failed: {file_path} does not exist")
            validation_passed = False
            continue
            
        # Check file is not empty and has expected structure
        try:
            with open(file_path, 'r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                rows = list(reader)
                
                if not rows:
                    print(f"❌ Validation failed: {file_path} is empty")
                    validation_passed = False
                    continue
                
                # Check required columns exist
                required_cols = ['user_id', 'firstName', 'usersize', 'relevant_variant_size', 'product_name', 'variantID']
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
    
    print(f"🚀 Starting Layer 3 Push CSV generation...")
    print(f"   Lookback period: {args.lookback_hours} hours")
    print(f"   Cooling period: {args.cooling_hours} hours")
    print(f"   Time window: {args.lookback_hours}-{args.cooling_hours} hours ago")
    print(f"   Output directory: {args.output_dir}")
    
    # Step 1: Get raw activity data with cooling period
    print("\n📊 Fetching recent activity data...")
    # Calculate effective lookback to exclude cooling period
    # Original: lookback_hours=48, cooling_hours=12 → get activity from 48-12=36 hours ago
    effective_lookback = args.lookback_hours - args.cooling_hours
    activity_data = get_daily_activity_data(effective_lookback)

    # Handle database query failure - activity_data is None if DB connection failed
    if activity_data is None:
        import sys
        # Print to stderr so it appears in the error output
        print("❌ ERROR: Database query failed - activity_data is None", file=sys.stderr, flush=True)
        print("   This usually means DATABASE_URL is not set or database is unreachable", file=sys.stderr, flush=True)
        db_url = os.environ.get('DATABASE_URL', '')
        db_url_set = db_url is not None and len(db_url) > 0
        print(f"   DATABASE_URL set: {db_url_set}", file=sys.stderr, flush=True)
        print(f"   DATABASE_URL length: {len(db_url) if db_url else 0}", file=sys.stderr, flush=True)
        # Show first 20 chars (safe - just protocol/prefix) to help diagnose format issues
        if db_url:
            prefix = db_url[:30] if len(db_url) > 30 else db_url
            # Mask anything after :// that might be username
            if '://' in prefix:
                protocol = prefix.split('://')[0]
                print(f"   DATABASE_URL prefix: {protocol}://...", file=sys.stderr, flush=True)
            else:
                print(f"   DATABASE_URL prefix: {prefix[:10]}...", file=sys.stderr, flush=True)
        if db_url and '@' in db_url:
            host_part = db_url.split('@')[-1][:60]
            print(f"   DATABASE_URL host: ...@{host_part}", file=sys.stderr, flush=True)
        else:
            print(f"   DATABASE_URL missing '@' - may be malformed", file=sys.stderr, flush=True)
        raise RuntimeError("Database query failed - check DATABASE_URL format and database connectivity")

    print(f"   Found {len(activity_data)} total activity records")

    if not activity_data:
        print("⚠️  No recent activity found. Exiting.")
        return
    
    # Step 2: Apply prioritization logic
    print("\n🎯 Applying prioritization logic...")
    prioritized_actions = prioritize_user_actions(activity_data)
    
    # Print prioritization statistics
    action_counts = defaultdict(int)
    for action in prioritized_actions.values():
        action_counts[action['action_type']] += 1
    
    print(f"   Prioritized to {len(prioritized_actions)} unique users:")
    for action_type, count in action_counts.items():
        print(f"   - {action_type}: {count} users")
    
    if args.dry_run:
        print("\n🔍 Dry run complete. No files generated.")
        return
    
    # Step 3: Enrich with user profiles and statistics
    print("\n🔧 Enriching data with user profiles and statistics...")
    enriched_data = enrich_activity_data(prioritized_actions)
    
    # Step 4: Apply demand-based filtering
    print("\n🎯 Applying demand-based filtering...")
    filtered_data = apply_demand_filtering(enriched_data)
    
    # Step 5: Generate CSV files
    print("\n📝 Generating CSV files...")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    generated_files = generate_csv_files(filtered_data, args.output_dir)
    
    # Step 5.1: Generate test CSVs
    print("\n🧪 Generating test CSVs...")
    test_files = generate_test_csvs(filtered_data, args.output_dir, timestamp)
    
    # Step 6: Validate outputs
    print("\n✅ Validating generated files...")
    validation_passed = validate_csv_files(generated_files)
    
    if validation_passed:
        print(f"\n🎉 Layer 3 Push CSV generation completed successfully!")
        print(f"   Generated {len(generated_files)} CSV files in {args.output_dir}")
    else:
        print(f"\n❌ Layer 3 Push CSV generation completed with validation errors!")
        sys.exit(1)


if __name__ == "__main__":
    main()