import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env.local') });

import Papa from 'papaparse';
import { fetchUserIdsFromTokens } from '../src/lib/graphql';

const LOGS_DIR = path.join(process.cwd(), 'apps/push-blaster/.push-logs');

interface BatchLog {
  successfulTokens: string[];
}

interface JobLog {
  jobId: string;
  batches: BatchLog[];
}

async function recoverFailedJob(jobId: string, originalCsvPath: string) {
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
  const jobLog: JobLog = JSON.parse(logContent);

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
  const originalUsers = parsedCsv.data as any[];
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
  console.error('Usage: ts-node recover-failed-job.ts <jobId> <originalCsvPath>');
  process.exit(1);
}

recoverFailedJob(jobId, originalCsvPath); 