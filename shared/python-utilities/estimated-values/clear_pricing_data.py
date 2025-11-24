"""
Clear Pricing Data Script

This script removes pricing data from all variants of a product by setting
min_market_price and max_market_price to null, so the frontend shows
"estimated values not available".
"""

from graphql_utils import execute_graphql_query

def clear_product_pricing(product_id: str):
    """
    Clears pricing data for all variants of a specific product.
    
    Args:
        product_id: The product ID to clear pricing for
    """
    
    print(f"🎯 Clearing pricing data for product: {product_id}")
    
    # Step 1: Get all variants for this product
    print("\n📋 Fetching product variants...")
    
    query = """
    query GetProductVariants($productId: uuid!) {
        product_variants(where: {product_id: {_eq: $productId}}) {
            id
            index_cache
            min_market_price
            max_market_price
        }
    }
    """
    
    result = execute_graphql_query(query, {"productId": product_id})
    
    if not result or "data" not in result:
        print("❌ Failed to fetch variants for product")
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
        
    print(f"✅ Found {len(variants)} variants")
    
    # Step 2: Show current pricing status
    variants_with_pricing = []
    variants_without_pricing = []
    
    for variant in variants:
        try:
            index_cache = variant.get("index_cache", {})
            if isinstance(index_cache, str):
                import json
                index_cache = json.loads(index_cache)
            
            size = index_cache.get("mens_size", "Unknown")
            min_price = variant.get("min_market_price")
            max_price = variant.get("max_market_price")
            
            if min_price is not None or max_price is not None:
                variants_with_pricing.append({
                    "variant_id": variant["id"],
                    "size": size,
                    "min_price": min_price,
                    "max_price": max_price
                })
            else:
                variants_without_pricing.append({
                    "variant_id": variant["id"],
                    "size": size
                })
                
        except (json.JSONDecodeError, TypeError) as e:
            print(f"⚠️ Warning: Could not parse variant {variant.get('id')}: {e}")
            continue
    
    print(f"\n📊 Current status:")
    print(f"  🔸 Variants with pricing: {len(variants_with_pricing)}")
    print(f"  🔸 Variants without pricing: {len(variants_without_pricing)}")
    
    if variants_with_pricing:
        print(f"\n📋 Variants that will be cleared:")
        for variant in sorted(variants_with_pricing, key=lambda x: float(x['size']) if str(x['size']).replace('.','').isdigit() else 999):
            print(f"  Size {variant['size']:>4}: ${variant['min_price']}-${variant['max_price']}")
    
    if not variants_with_pricing:
        print("✅ No variants have pricing data - nothing to clear!")
        return
        
    # Step 3: Confirm before proceeding
    confirm = input(f"\n❓ Proceed with clearing pricing for {len(variants_with_pricing)} variants? (y/N): ").strip().lower()
    
    if confirm != 'y':
        print("❌ Operation cancelled.")
        return
    
    # Step 4: Clear pricing data
    print(f"\n🧹 Clearing pricing data for {len(variants_with_pricing)} variants...")
    
    success_count = 0
    failed_count = 0
    errors = []
    
    for variant in variants_with_pricing:
        variant_id = variant["variant_id"]
        size = variant["size"]
        
        # Mutation to clear pricing data
        mutation = """
        mutation ClearVariantPricing($variantId: uuid!) {
            update_product_variants(
                where: {id: {_eq: $variantId}},
                _set: {
                    min_market_price: null,
                    max_market_price: null
                }
            ) {
                affected_rows
                returning {
                    id
                    min_market_price
                    max_market_price
                }
            }
        }
        """
        
        result = execute_graphql_query(mutation, {"variantId": variant_id})
        
        if result and "data" in result and not result.get("errors"):
            affected_rows = result["data"]["update_product_variants"]["affected_rows"]
            if affected_rows > 0:
                success_count += 1
                print(f"  ✅ Size {size}: Pricing cleared")
            else:
                failed_count += 1
                error_msg = f"No rows affected for size {size}"
                errors.append(error_msg)
                print(f"  ❌ Size {size}: {error_msg}")
        else:
            failed_count += 1
            error_msg = f"GraphQL error for size {size}"
            if result and "errors" in result:
                error_msg += f": {result['errors'][0].get('message', 'Unknown error')}"
            errors.append(error_msg)
            print(f"  ❌ Size {size}: {error_msg}")
    
    # Step 5: Summary
    print(f"\n📊 FINAL SUMMARY:")
    print(f"  ✅ Successfully cleared: {success_count} variants")
    print(f"  ❌ Failed to clear: {failed_count} variants")
    
    if errors:
        print(f"\n❌ Errors encountered:")
        for error in errors:
            print(f"  - {error}")
    
    if success_count > 0:
        print(f"\n🎉 Successfully cleared pricing for {success_count} variants!")
        print("The product will now show 'estimated values not available' on the frontend.")

def main():
    """Main function to clear pricing for the old version of UND4."""
    
    # Old version product ID
    old_product_id = "1bf47fb6-52ea-4be1-9c86-43d6310ea02e"
    
    clear_product_pricing(old_product_id)

if __name__ == "__main__":
    main()