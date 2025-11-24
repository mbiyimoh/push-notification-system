const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

const Papa = require('papaparse');

const LOGS_DIR = path.join(process.cwd(), '.push-logs');

async function fetchUserIdsFromTokens(tokens) {
  console.log(`fetchUserIdsFromTokens called with ${tokens.length} tokens.`);
  if (tokens.length === 0) {
    return [];
  }

  const GRAPHQL_ENDPOINT = process.env.GRAPHQL_ENDPOINT;
  const GRAPHQL_API_KEY = process.env.GRAPHQL_API_KEY;

  const GET_USER_IDS_FROM_TOKENS_QUERY = `
    query GetUserIdsFromTokens($tokens: [String!]) {
      devices(where: {token: {_in: $tokens}}) {
        user_id
      }
    }
  `;

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-hasura-admin-secret': GRAPHQL_API_KEY,
      },
      body: JSON.stringify({
        query: GET_USER_IDS_FROM_TOKENS_QUERY,
        variables: { tokens },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`GraphQL request failed with status ${response.status}: ${errorBody}`);
    }

    const json = await response.json();

    if (json.data && json.data.devices) {
      return json.data.devices.map(d => d.user_id);
    }

    return [];
  } catch (error) {
    console.error('Error fetching user IDs from tokens:', error);
    return [];
  }
}

async function recoverFailedJob(jobId, originalCsvPath) {
  console.log(`Starting recovery for job ID: ${jobId}`);
  console.log(`Original CSV path: ${originalCsvPath}`);

  // 1. Read the log file
  const logPath = path.join(LOGS_DIR, `${jobId}.json`);
  if (!fs.existsSync(logPath)) {
    console.error(`Error: Log file not found for job ID ${jobId} at ${logPath}`);
    return;
  }
  console.log(`Found log file: ${logPath}`);
  const logContent = fs.readFileSync(logPath, 'utf-8');
  const jobLog = JSON.parse(logContent);

  // 2. Extract all successful tokens
  const successfulTokens = jobLog.batches.flatMap(batch => batch.successfulTokens);
  console.log(`Found ${successfulTokens.length} successful tokens in the log.`);
  if (successfulTokens.length === 0) {
    console.log('No successful tokens found. No users to remove.');
    // Copy original file to new name as there's nothing to filter
    const remainingCsvPath = originalCsvPath.replace('.csv', '-remaining.csv');
    fs.copyFileSync(originalCsvPath, remainingCsvPath);
    console.log(`Created new CSV with all original users: ${remainingCsvPath}`);
    return;
  }

  // 3. Get user IDs from tokens
  console.log('Fetching user IDs for successful tokens...');
  const successfulUserIds = await fetchUserIdsFromTokens(successfulTokens);
  const successfulUserIdSet = new Set(successfulUserIds);
  console.log(`Found ${successfulUserIdSet.size} unique successful user IDs.`);

  // 4. Read the original CSV
  if (!fs.existsSync(originalCsvPath)) {
    console.error(`Error: Original CSV file not found at ${originalCsvPath}`);
    return;
  }
  const csvContent = fs.readFileSync(originalCsvPath, 'utf-8');
  const parsedCsv = Papa.parse(csvContent, { header: true });
  const originalUsers = parsedCsv.data;
  console.log(`Read ${originalUsers.length} users from the original CSV.`);

  // 5. Filter out successful users
  const remainingUsers = originalUsers.filter(user => {
    const userId = user.user_id || user.userId;
    return !successfulUserIdSet.has(userId);
  });
  console.log(`${remainingUsers.length} users remaining after filtering.`);

  // 6. Write to new CSV
  const remainingCsvPath = originalCsvPath.replace('.csv', '-remaining.csv');
  const newCsvContent = Papa.unparse(remainingUsers);
  fs.writeFileSync(remainingCsvPath, newCsvContent);
  console.log(`Successfully created new CSV with remaining users: ${remainingCsvPath}`);
}

// --- Main execution ---
const [jobId, originalCsvPath] = process.argv.slice(2);
if (!jobId || !originalCsvPath) {
  console.error('Usage: node recover-failed-job.js <jobId> <originalCsvPath>');
  process.exit(1);
}

recoverFailedJob(jobId, originalCsvPath); 