"""
Example Usage Script for Batch Variant Price Updater

This shows exactly how to use the batch price updater with your product.
"""

from batch_variant_price_updater import VariantPriceUpdater

def update_product_prices():
    """
    Example of how to update prices for a product.
    """
    
    # Initialize the updater
    updater = VariantPriceUpdater()
    
    # 1. STEP ONE: Set your product ID here
    # Replace this with your actual product ID
    product_id = "your-product-id-goes-here"  # ⚠️ CHANGE THIS!
    
    print(f"🎯 Updating prices for product: {product_id}")
    
    # 2. STEP TWO: Get all variants for this product
    print("\n📋 Fetching product variants...")
    variants = updater.get_product_variants(product_id)
    
    if not variants:
        print("❌ No variants found. Check your product ID.")
        return
        
    print("Available sizes:", list(variants.keys()))
    
    # 3. STEP THREE: Load your pricing data
    # Option A: From CSV file
    print("\n📊 Loading pricing data from CSV...")
    pricing_data = updater.load_pricing_data_from_csv("example_pricing_data.csv")
    
    # Option B: From JSON file (uncomment to use instead)
    # print("\n📊 Loading pricing data from JSON...")
    # pricing_data = updater.load_pricing_data_from_json("example_pricing_data.json")
    
    # Option C: Define directly in code (uncomment to use instead)
    # pricing_data = [
    #     {"size": "8", "min_price": "120", "max_price": "190"},
    #     {"size": "8.5", "min_price": "125", "max_price": "195"},
    #     {"size": "9", "min_price": "130", "max_price": "200"},
    #     # ... add more sizes as needed
    # ]
    
    if not pricing_data:
        print("❌ No pricing data loaded. Check your file path or data format.")
        return
    
    # 4. STEP FOUR: Validate the pricing data against available variants
    print("\n✅ Validating pricing data...")
    validated_updates = updater.validate_pricing_data(pricing_data)
    
    if not validated_updates:
        print("❌ No valid updates found. Check that your sizes match available variants.")
        return
    
    # Show what will be updated
    print("\n📋 Ready to update:")
    for update in validated_updates:
        current_min = update["current_min"] or "None"
        current_max = update["current_max"] or "None"
        print(f"  Size {update['size']}: {current_min}-{current_max} → {update['min_price']}-{update['max_price']}")
    
    # Confirm before proceeding
    confirm = input(f"\n❓ Proceed with updating {len(validated_updates)} variants? (y/N): ").strip().lower()
    
    if confirm != 'y':
        print("❌ Update cancelled.")
        return
    
    # 5. STEP FIVE: Execute the batch updates
    print("\n🚀 Executing batch price updates...")
    results = updater.update_variant_prices(validated_updates)
    
    # 6. STEP SIX: Verify the updates worked
    if results["updated_variants"]:
        print("\n🔍 Verifying updates...")
        updater.verify_updates(product_id, results["updated_variants"])
    
    # Summary
    print(f"\n📊 FINAL SUMMARY:")
    print(f"  ✅ Successfully updated: {results['success']} variants")
    print(f"  ❌ Failed to update: {results['failed']} variants")
    
    if results["errors"]:
        print(f"\n❌ Errors encountered:")
        for error in results["errors"]:
            print(f"  - {error}")
    
    print("\n🎉 Batch price update completed!")


if __name__ == "__main__":
    update_product_prices()