# Batch Variant Price Updater

Transform your pricing workflow from tedious one-by-one updates to efficient batch operations! 🚀

## Streamlined Workflow

**The Complete Process:**
1. **You provide:** Product ID + pricing screenshots
2. **AI creates:** CSV with +/- 5% price ranges automatically 
3. **Script executes:** Batch update with verification
4. **Result:** All variants updated with proper pricing ranges

**What the system does:**
- Extracts prices from your screenshots
- Calculates +/- 5% ranges (min = price * 0.95, max = price * 1.05)
- Finds all variants for your product
- Matches size-based pricing to correct variant IDs
- Updates min/max prices in batch
- Verifies all changes applied correctly

## How It Works

### Step 1: You Provide Input
```
Product ID: "f9066a1a-3664-4725-9fcc-6fa91057d6f8"
Screenshots: [pricing images showing size-specific values]
```

### Step 2: AI Creates CSV with Price Ranges
From your screenshots showing prices like:
- Size 8: $230
- Size 9: $235  
- Size 10: $246

AI automatically creates CSV with +/- 5% ranges:
```csv
size,min_price,max_price
8,218,242
9,223,247
10,233,259
```

### Step 3: Script Execution Options

**Option A: Command Line (Recommended)**
```bash
python batch_variant_price_updater.py <product_id> <csv_file>
```

**Option B: Interactive Mode**
```bash
python batch_variant_price_updater.py
# Follow prompts to enter product ID and CSV file
```

**Option C: Programmatic Use**
```python
from batch_variant_price_updater import programmatic_update
success = programmatic_update("product-id", "pricing.csv")
```

## Real Example Output

```
🏗️ Batch Variant Price Updater
📋 Command line mode:
  Product ID: f9066a1a-3664-4725-9fcc-6fa91057d6f8
  CSV File: new_product_pricing.csv

🎯 Updating prices for product: f9066a1a-3664-4725-9fcc-6fa91057d6f8

📋 Fetching product variants...
✅ Found 37 variants with sizes for product f9066a1a-3664-4725-9fcc-6fa91057d6f8
Available sizes: ['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '13.5', '14', '14.5', '15', '15.5', '16', '16.5', '17', '17.5', '18', '19', '20']

📊 Loading pricing data from CSV: new_product_pricing.csv
✅ Loaded 26 price entries from CSV
Loaded pricing for sizes: ['3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13', '13.5', '14', '15', '16', '17', '18']

✅ Validating pricing data...
✅ Validated 26 price updates

📋 Ready to update 26 variants:
  Size  3.5: $None-$None → $202-$224
  Size    4: $None-$None → $201-$223
  Size  4.5: $None-$None → $191-$213
  Size    6: $None-$None → $161-$179
  Size    7: $None-$None → $274-$304
  Size   15: $None-$None → $309-$343
  ...

❓ Proceed with updating 26 variants? (y/N): y

🚀 Starting batch update of 26 variants...
  ✅ Size 3.5: $None-$None → $202-$224
  ✅ Size 4: $None-$None → $201-$223
  ✅ Size 15: $None-$None → $309-$343
  ...

📊 FINAL SUMMARY:
  ✅ Successfully updated: 26 variants
  ❌ Failed to update: 0 variants

🎉 Successfully updated pricing for 26 variants!
Your product is now ready with the new pricing structure.
```

## Error Handling

The script handles common issues gracefully:

- **Missing sizes:** Warns you if pricing data includes sizes not available for the product
- **Invalid data:** Skips rows with missing min/max prices
- **GraphQL errors:** Reports specific mutation failures with details
- **Verification mismatches:** Catches cases where updates didn't persist correctly

## Key Features

### Automatic Price Range Calculation
- **Input:** Single price per size from screenshots
- **Output:** Min/max ranges using +/- 5% formula
- **Example:** $230 becomes $218-$242 range

### Smart Size Matching
- Finds all available sizes for your product
- Matches your pricing data to correct variant IDs
- Skips sizes not available for the product

### Complete Workflow Integration
- One script handles everything
- No need for separate files per product
- Command line, interactive, or programmatic usage

## Files in the Package

- **`batch_variant_price_updater.py`** - Main script (enhanced with all options)
- **`product_name_updater.py`** - Companion script for updating product names
- **`clear_pricing_data.py`** - Script to remove pricing (shows "estimated values not available")

## Pro Tips

1. **Screenshots:** Include all sizes you want to update in clear, readable format
2. **Product ID:** Double-check the UUID - the script will tell you if no variants found
3. **Size matching:** Script shows available sizes before processing your data
4. **Verification:** Green checkmarks confirm successful updates
5. **Price ranges:** System automatically creates reasonable 10% spread (±5%)

## Workflow Summary

**Traditional way:** Manual variant-by-variant updates (tedious!)
**New way:** Screenshots → AI processing → batch update (seconds!)

The system eliminates:
- ❌ Manual CSV creation
- ❌ Price range calculations  
- ❌ Per-product script files
- ❌ Variant ID lookups

And provides:
- ✅ Screenshot-to-update pipeline
- ✅ Automatic +/-5% range calculation
- ✅ Single reusable script
- ✅ Complete verification

Ready to update some prices? Send product ID + screenshots! 🔥