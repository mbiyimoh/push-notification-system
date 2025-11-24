"""
Example: Rename a Specific Product

This shows how to use the ProductNameUpdater to rename a specific product.
Just customize the product_id and new_name variables below.
"""

from product_name_updater import ProductNameUpdater

def rename_example_product():
    """Rename a specific product - customize the values below."""
    
    # Initialize the updater
    updater = ProductNameUpdater()
    
    # 🚨 CUSTOMIZE THESE VALUES:
    product_id = "832b53d0-caae-409a-a7fb-7d2e86502eb4"  # Your product ID here
    new_name = "Air Jordan 4 Retro 'UNC' (2024)"         # Your desired name here
    
    print(f"🎯 Renaming Product")
    print(f"Product ID: {product_id}")
    print(f"New Name: '{new_name}'")
    
    # Execute the update
    success = updater.update_product_name(product_id, new_name)
    
    if success:
        print(f"\n🎉 Product successfully renamed to '{new_name}'!")
    else:
        print(f"\n❌ Failed to rename product!")
    
    return success

if __name__ == "__main__":
    rename_example_product()