const dotenv = require('dotenv');
const path = require('path');
const { fetchDataPacks } = require('../src/lib/databaseQueries');

// Load environment variables from the root .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const testUserId = '0e54067c-4c0e-4e4a-8a23-a47661578059'; // A known user ID from logs

async function runTests() {
  console.log('--- 🧪 TESTING DATA PACKS ---');

  // Test 1: Hottest Shoe Traded
  try {
    console.log(`\n[1/2] Testing 'hottestShoeTraded' for user: ${testUserId}...`);
    const tradedResult = await fetchDataPacks(
      [testUserId],
      { topTargetShoe: false, hottestShoeTraded: true, hottestShoeOffers: false }
    );
    console.log('✅ Success! Result:', JSON.stringify(tradedResult, null, 2));
  } catch (error) {
    console.error("❌ Test Failed for 'hottestShoeTraded':", error);
  }

  // Test 2: Hottest Shoe Offers
  try {
    console.log(`\n[2/2] Testing 'hottestShoeOffers' for user: ${testUserId}...`);
    const offersResult = await fetchDataPacks(
      [testUserId],
      { topTargetShoe: false, hottestShoeTraded: false, hottestShoeOffers: true }
    );
    console.log('✅ Success! Result:', JSON.stringify(offersResult, null, 2));
  } catch (error) {
    console.error("❌ Test Failed for 'hottestShoeOffers':", error);
  }

  console.log('\n--- TESTS COMPLETE ---');
}

runTests(); 