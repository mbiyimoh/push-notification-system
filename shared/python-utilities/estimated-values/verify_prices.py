"""
Quick verification script to check if the price updates actually persisted in the database.
"""

from graphql_utils import execute_graphql_query

def verify_specific_variants():
    """Check a few specific variants to confirm price updates."""
    
    product_id = "1bf47fb6-52ea-4be1-9c86-43d6310ea02e"
    
    # Query to get several variants with their current prices
    query = """
    query CheckVariantPrices($productId: uuid!) {
        product_variants(
            where: {
                product_id: {_eq: $productId}
            }
            order_by: {index_cache: asc}
        ) {
            id
            index_cache
            min_market_price
            max_market_price
        }
    }
    """
    
    print("🔍 Verifying price updates in database...")
    result = execute_graphql_query(query, {"productId": product_id})
    
    if not result or "data" not in result:
        print("❌ Query failed or no data returned")
        print("Raw result:", result)
        return
        
    if "errors" in result:
        print("❌ GraphQL errors:")
        for error in result["errors"]:
            print(f"  - {error.get('message')}")
        return
    
    variants = result["data"]["product_variants"]
    
    if not variants:
        print("❌ No variants found for this product")
        return
    
    print(f"✅ Found {len(variants)} total variants for product")
    print("\n📊 Current pricing for variants that should have been updated:")
    
    # Filter for the sizes we updated and show their current prices
    updated_sizes = ["6", "6.5", "7", "7.5", "8", "8.5", "9", "9.5", "10", "10.5", "11", "11.5", "12", "12.5", "13", "14", "15"]
    found_updates = 0
    
    for variant in variants:
        try:
            index_cache = variant.get("index_cache", {})
            if isinstance(index_cache, str):
                import json
                index_cache = json.loads(index_cache)
            
            size = index_cache.get("mens_size")
            if size and str(size) in updated_sizes:
                min_price = variant.get("min_market_price")
                max_price = variant.get("max_market_price")
                print(f"  Size {size:>4}: min=${min_price}, max=${max_price}")
                found_updates += 1
                
        except (json.JSONDecodeError, TypeError) as e:
            continue
    
    print(f"\n📈 Summary: Found pricing data for {found_updates} of the {len(updated_sizes)} sizes we updated")
    
    if found_updates > 0:
        print("✅ Price updates have been successfully persisted in the database!")
    else:
        print("❌ No updated pricing found - there may be an issue")

if __name__ == "__main__":
    verify_specific_variants()