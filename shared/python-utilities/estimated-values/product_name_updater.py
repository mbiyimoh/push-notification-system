"""
Product Name Updater

This script enables updating product names by providing a product ID and new name.
It queries the current name, updates it, and then verifies the change was applied.

Usage:
1. Provide a product ID 
2. Provide the new desired product name
3. Script shows current name, updates it, and confirms the change

Example usage:
    updater = ProductNameUpdater()
    updater.update_product_name("product-id-here", "New Product Name")
"""

from graphql_utils import execute_graphql_query

class ProductNameUpdater:
    def __init__(self):
        pass
        
    def get_current_product_name(self, product_id: str) -> str:
        """
        Fetches the current name for a given product.
        
        Args:
            product_id: The product ID to get the name for
            
        Returns:
            Current product name or None if not found
        """
        query = """
        query GetProductName($productId: uuid!) {
            products(where: {id: {_eq: $productId}}) {
                id
                name
            }
        }
        """
        
        variables = {"productId": product_id}
        result = execute_graphql_query(query, variables)
        
        if not result or "data" not in result:
            print(f"❌ Failed to fetch product {product_id}")
            return None
            
        if "errors" in result:
            print("❌ GraphQL errors:")
            for error in result["errors"]:
                print(f"  - {error.get('message')}")
            return None
            
        products = result["data"]["products"]
        if not products:
            print(f"❌ No product found with ID {product_id}")
            return None
            
        current_name = products[0].get("name")
        print(f"✅ Found product: '{current_name}'")
        return current_name
        
    def update_product_name(self, product_id: str, new_name: str) -> bool:
        """
        Updates the product name and verifies the change.
        
        Args:
            product_id: The product ID to update
            new_name: The new name for the product
            
        Returns:
            True if successful, False otherwise
        """
        print(f"🎯 Updating product name for: {product_id}")
        
        # Step 1: Get current name
        print("\n📋 Fetching current product name...")
        current_name = self.get_current_product_name(product_id)
        
        if current_name is None:
            return False
            
        # Step 2: Check if name is already the same
        if current_name == new_name:
            print(f"✅ Product name is already '{new_name}' - no update needed!")
            return True
            
        # Step 3: Show what will be changed
        print(f"\n📋 Ready to update product name:")
        print(f"  Current: '{current_name}'")
        print(f"  New:     '{new_name}'")
        
        # Step 4: Confirm before proceeding
        confirm = input(f"\n❓ Proceed with updating product name? (y/N): ").strip().lower()
        
        if confirm != 'y':
            print("❌ Update cancelled.")
            return False
        
        # Step 5: Execute the update
        print(f"\n🚀 Updating product name...")
        
        mutation = """
        mutation UpdateProductName($productId: uuid!, $newName: String!) {
            update_products(
                where: {id: {_eq: $productId}},
                _set: {
                    name: $newName
                }
            ) {
                affected_rows
                returning {
                    id
                    name
                }
            }
        }
        """
        
        variables = {
            "productId": product_id,
            "newName": new_name
        }
        
        result = execute_graphql_query(mutation, variables)
        
        if result and "data" in result and not result.get("errors"):
            affected_rows = result["data"]["update_products"]["affected_rows"]
            if affected_rows > 0:
                returned_product = result["data"]["update_products"]["returning"][0]
                updated_name = returned_product.get("name")
                print(f"  ✅ Product name updated: '{current_name}' → '{updated_name}'")
                
                # Step 6: Verify the update
                print(f"\n🔍 Verifying update...")
                verified_name = self.get_current_product_name(product_id)
                
                if verified_name == new_name:
                    print(f"  ✅ Confirmed: Product name is now '{verified_name}'")
                    print(f"\n🎉 Successfully updated product name!")
                    return True
                else:
                    print(f"  ❌ Verification failed: Expected '{new_name}', got '{verified_name}'")
                    return False
            else:
                print(f"  ❌ No rows affected - product may not exist or name unchanged")
                return False
        else:
            error_msg = "GraphQL error"
            if result and "errors" in result:
                error_msg += f": {result['errors'][0].get('message', 'Unknown error')}"
            print(f"  ❌ {error_msg}")
            return False

def update_specific_product():
    """
    Example function showing how to update a specific product name.
    Customize this with your product ID and desired name.
    """
    
    updater = ProductNameUpdater()
    
    # 🚨 CUSTOMIZE THESE VALUES:
    product_id = "your-product-id-here"  # Replace with actual product ID
    new_name = "Your New Product Name"   # Replace with desired name
    
    print(f"🏗️ Product Name Updater")
    print(f"Product ID: {product_id}")
    print(f"New Name: {new_name}")
    
    success = updater.update_product_name(product_id, new_name)
    
    if success:
        print("\n✅ Product name update completed successfully!")
    else:
        print("\n❌ Product name update failed!")
    
    return success

def interactive_update():
    """
    Interactive function that prompts for product ID and new name.
    """
    
    updater = ProductNameUpdater()
    
    print(f"🏗️ Interactive Product Name Updater")
    
    # Get product ID from user
    product_id = input("\n📝 Enter Product ID: ").strip()
    if not product_id:
        print("❌ Product ID is required!")
        return False
    
    # Get new name from user
    new_name = input("📝 Enter New Product Name: ").strip()
    if not new_name:
        print("❌ Product name is required!")
        return False
    
    success = updater.update_product_name(product_id, new_name)
    
    if success:
        print("\n✅ Product name update completed successfully!")
    else:
        print("\n❌ Product name update failed!")
    
    return success

def main():
    """
    Main function - choose your preferred method.
    """
    print("🏗️ Product Name Updater")
    print("\nChoose an option:")
    print("1. Interactive mode (enter product ID and name)")
    print("2. Programmatic mode (edit the script with your values)")
    
    choice = input("\nEnter choice (1 or 2): ").strip()
    
    if choice == "1":
        interactive_update()
    elif choice == "2":
        print("\n📝 Edit the 'update_specific_product()' function with your values, then run it.")
        # Uncomment the next line to run programmatic mode:
        # update_specific_product()
    else:
        print("❌ Invalid choice!")

if __name__ == "__main__":
    main()