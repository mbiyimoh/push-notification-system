"""
UND4 Price Update Script

Running batch price update for product 832b53d0-caae-409a-a7fb-7d2e86502eb4
using the provided CSV data.
"""

from batch_variant_price_updater import VariantPriceUpdater

def run_und4_update():
    """Execute the price update for UND4 product."""
    
    # Initialize the updater
    updater = VariantPriceUpdater()
    
    # Your product ID
    product_id = "832b53d0-caae-409a-a7fb-7d2e86502eb4"
    
    print(f"🎯 Updating prices for UND4 product: {product_id}")
    
    # Step 1: Get all variants for this product
    print("\n📋 Fetching product variants...")
    variants = updater.get_product_variants(product_id)
    
    if not variants:
        print("❌ No variants found. Check your product ID.")
        return
        
    print(f"Available sizes: {sorted(list(variants.keys()), key=lambda x: float(x) if x.replace('.','').isdigit() else 999)}")
    
    # Step 2: Load your pricing data
    print("\n📊 Loading pricing data from CSV...")
    pricing_data = updater.load_pricing_data_from_csv("UND4_pricing_data copy.csv")
    
    if not pricing_data:
        print("❌ No pricing data loaded. Check your file path.")
        return
    
    print(f"Loaded pricing for sizes: {[item['size'] for item in pricing_data]}")
    
    # Step 3: Validate the pricing data against available variants
    print("\n✅ Validating pricing data...")
    validated_updates = updater.validate_pricing_data(pricing_data)
    
    if not validated_updates:
        print("❌ No valid updates found. Check that your sizes match available variants.")
        return
    
    # Show what will be updated
    print(f"\n📋 Ready to update {len(validated_updates)} variants:")
    for update in validated_updates:
        current_min = update["current_min"] or "None"
        current_max = update["current_max"] or "None"
        print(f"  Size {update['size']:>4}: ${current_min}-${current_max} → ${update['min_price']}-${update['max_price']}")
    
    # Confirm before proceeding
    confirm = input(f"\n❓ Proceed with updating {len(validated_updates)} variants? (y/N): ").strip().lower()
    
    if confirm != 'y':
        print("❌ Update cancelled.")
        return
    
    # Step 4: Execute the batch updates
    print("\n🚀 Executing batch price updates...")
    results = updater.update_variant_prices(validated_updates)
    
    # Step 5: Verify the updates worked
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
    
    if results["success"] > 0:
        print(f"\n🎉 Successfully updated pricing for {results['success']} UND4 variants!")
        print("Your product is now ready with the new pricing structure.")
    
    return results

if __name__ == "__main__":
    run_und4_update()