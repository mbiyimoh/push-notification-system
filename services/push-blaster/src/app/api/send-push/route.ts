import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { fetchDeviceTokens } from '../../../lib/graphql';
import { admin, getPushClient } from '../../../lib/firebaseAdmin';
import { validateVariables, processVariableReplacements } from '../../../lib/variableProcessor';
import fs from 'fs';
import path from 'path';

// --- NEW JOB LOGGER ---
const LOGS_DIR = path.join(process.cwd(), '.push-logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR);
}

interface BatchLog {
  batchNumber: number;
  totalBatches: number;
  status: 'success' | 'failed';
  successCount: number;
  failureCount: number;
  successfulTokens: string[];
  failedTokens: string[];
  timestamp: string;
}

interface JobLog {
  jobId: string;
  status: 'in_progress' | 'completed' | 'failed';
  startTime: string;
  endTime?: string;
  request: any;
  batches: BatchLog[];
  summary: any;
}

const jobLogger = {
  getLogPath: (jobId: string) => path.join(LOGS_DIR, `${jobId}.json`),

  create: (jobId: string, requestData: any) => {
    const newLog: JobLog = {
      jobId,
      status: 'in_progress',
      startTime: new Date().toISOString(),
      request: requestData,
      batches: [],
      summary: {},
    };
    fs.writeFileSync(jobLogger.getLogPath(jobId), JSON.stringify(newLog, null, 2));
    return newLog;
  },

  read: (jobId: string) => {
    const logPath = jobLogger.getLogPath(jobId);
    if (!fs.existsSync(logPath)) return null;
    return JSON.parse(fs.readFileSync(logPath, 'utf-8')) as JobLog;
  },

  update: (jobId: string, logData: Partial<JobLog>) => {
    const currentLog = jobLogger.read(jobId);
    if (currentLog) {
      const updatedLog = { ...currentLog, ...logData };
      fs.writeFileSync(jobLogger.getLogPath(jobId), JSON.stringify(updatedLog, null, 2));
    }
  },

  addBatch: (jobId: string, batchResult: BatchLog) => {
    const logData = jobLogger.read(jobId);
    if (logData) {
      logData.batches.push(batchResult);
      jobLogger.update(jobId, logData);
    }
  },

  complete: (jobId: string, status: 'completed' | 'failed', summary: any) => {
    const logData = jobLogger.read(jobId);
    if (logData) {
      logData.status = status;
      logData.endTime = new Date().toISOString();
      logData.summary = summary;
      jobLogger.update(jobId, logData);
    }
  },
};
// --- END NEW JOB LOGGER ---


interface CsvRow {
  user_id: string;
  [key: string]: string | number; // Allow additional dynamic columns
}

const isValidTradeblockUrl = (url: string): boolean => {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'tradeblock.us' || parsedUrl.hostname.endsWith('.tradeblock.us');
  } catch {
    return false;
  }
};

export async function POST(req: NextRequest) {
  console.log('=== PUSH NOTIFICATION API CALLED ===');
  
  const { searchParams } = new URL(req.url);
  const isDryRunFromQuery = searchParams.get('dryRun') === 'true';

  let title: string | null = null;
  let body: string | null = null;
  let deepLink: string | null = null;
  let dryRun: boolean = false;
  let jobId: string = crypto.randomUUID(); // Initialize immediately
  let layerId: number | null = null;

  try {
    const contentType = req.headers.get('content-type') || '';
    let file: File | null = null;
    let manualUserIds: string | null = null;
    
    if (contentType.includes('application/json')) {
      // Handle JSON requests
      const jsonData = await req.json();
      console.log('JSON data received:', jsonData);
      manualUserIds = jsonData.userIds || null;
      title = jsonData.title || null;
      body = jsonData.body || null;
      deepLink = jsonData.deepLink || null;
      dryRun = jsonData.dryRun === true;
      jobId = jsonData.jobId || crypto.randomUUID();
      layerId = jsonData.layerId || null;
    } else {
      // Handle form data requests
      const formData = await req.formData();
      file = formData.get('file') as File | null;
      manualUserIds = formData.get('userIds') as string | null;
      title = formData.get('title') as string | null;
      body = formData.get('body') as string | null;
      deepLink = formData.get('deepLink') as string | null;
      dryRun = isDryRunFromQuery || formData.get('dryRun') === 'true'; // Prioritize query param
      jobId = formData.get('jobId') as string || crypto.randomUUID();
      const layerIdValue = formData.get('layerId');
      if (layerIdValue) {
        layerId = parseInt(layerIdValue as string, 10);
      }
    }

    // --- Create Job Log ---
    jobLogger.create(jobId, {
      audienceDescription: file ? `CSV: ${file.name}` : `Manual: ${manualUserIds}`,
      audienceSize: 0, // Will update after parsing
      title,
      body,
      deepLink,
      dryRun,
      csvFileName: file ? file.name : null,
      layerId
    });
    // --------------------

    console.log(`--- Push Notification Job Started (ID: ${jobId}) ---`);
    console.log(`Job Type: ${dryRun ? 'DRY RUN' : 'LIVE SEND'}`);
    console.log('Parameters:', {
      hasFile: !!file,
      manualUserIds,
      title,
      body,
      deepLink
    });

    if (!title || !body) {
      console.log('Missing title or body');
      return NextResponse.json({ success: false, message: 'Missing title or body' }, { status: 400 });
    }

    // Validate deep link if provided
    if (deepLink && !isValidTradeblockUrl(deepLink)) {
      console.log('Invalid deep link:', deepLink);
      return NextResponse.json({ success: false, message: 'Deep link must be a valid tradeblock.us URL' }, { status: 400 });
    }

    if (layerId === undefined || layerId === null || ![1, 2, 3, 4, 5].includes(layerId)) {
      return NextResponse.json({ success: false, message: 'Invalid or missing notification layer. Must be 1, 2, 3, 4, or 5.' }, { status: 400 });
    }

    if (!file && !manualUserIds) {
      console.log('No file or manual user IDs provided');
      return NextResponse.json({ success: false, message: 'Please provide either a CSV file or manual user IDs' }, { status: 400 });
    }

    if (file && manualUserIds) {
      console.log('Both file and manual user IDs provided');
      return NextResponse.json({ success: false, message: 'Please provide either a CSV file or manual user IDs, not both' }, { status: 400 });
    }

    let userIds: string[] = [];
    let csvData: CsvRow[] = [];

    if (file) {
      console.log('Processing CSV file:', file.name);
      const text = await file.text();
      const result = Papa.parse(text, { header: true, skipEmptyLines: true, newline: "\r\n" });
      
      // Check for parsing errors
      if (result.errors && result.errors.length > 0) {
        console.log('Papa Parse errors:', result.errors);
        throw new Error(`CSV parsing errors: ${result.errors.map(err => err.message).join(', ')}`);
      }
      
      // Type guard to ensure parsed data exists and is valid
      const parsedData = result.data as any[];
      if (!Array.isArray(parsedData) || parsedData.length === 0) {
        throw new Error('CSV file appears to be empty or invalid.');
      }

      // Check for user ID column with flexible naming
      const firstRow = parsedData[0];
      const availableColumns = Object.keys(firstRow || {});
      console.log('Available CSV columns:', availableColumns);
      
      // Look for user ID column with various possible names
      const possibleUserIdColumns = ['user_id', 'userId', 'id', 'User ID', 'ID', 'user', 'User'];
      const userIdColumn = possibleUserIdColumns.find(col => availableColumns.includes(col));
      
      if (!userIdColumn) {
        throw new Error(`CSV must contain a user ID column. Found columns: [${availableColumns.join(', ')}]. Expected one of: [${possibleUserIdColumns.join(', ')}]`);
      }
      
      console.log(`Using '${userIdColumn}' as user ID column`);
      
      // Validate that all rows have the required structure
      const validRows = parsedData.filter(row => 
        typeof row === 'object' && 
        row !== null && 
        row[userIdColumn] && 
        String(row[userIdColumn]).trim()
      );
      
      if (validRows.length === 0) {
        throw new Error(`No valid user IDs found in the '${userIdColumn}' column. Please check your CSV data.`);
      }
      
      // Normalize the data structure to use 'user_id' as the standard key
      csvData = validRows.map(row => ({
        user_id: String(row[userIdColumn]).trim(),
        ...row // Include all original columns for variable substitution
      }));

      userIds = csvData.map(row => row.user_id).filter(Boolean);
      console.log('CSV data parsed:', csvData.length, 'rows');
      console.log('Valid user IDs extracted:', userIds.length);
      console.log('Sample user IDs:', userIds.slice(0, 5));
    } else if (manualUserIds) {
      console.log('Processing manual user IDs:', manualUserIds);
      userIds = manualUserIds.split(',').map(id => id.trim()).filter(Boolean);
      // Create minimal CSV data for manual IDs
      csvData = userIds.map(id => ({ user_id: id }));
      console.log('Parsed user IDs:', userIds);
      if (userIds.length === 0 || userIds.length > 5) {
        console.log('Invalid number of user IDs:', userIds.length);
        return NextResponse.json({ success: false, message: 'Please provide between 1 and 5 valid user IDs.' }, { status: 400 });
      }
    }

    if (userIds.length === 0) {
      console.log('No user IDs found after processing');
      return NextResponse.json({ success: false, message: 'No user IDs found to send notifications to.' }, { status: 400 });
    }


    let eligibleUserIds = userIds;
    let excludedCount = 0;

    if (layerId !== 4) { // Bypass cadence check for Layer 4 (Test)
      // CADENCE FILTERING
      const cadenceResponse = await fetch('http://localhost:3002/api/filter-audience', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds, layerId }),
      });

      if (!cadenceResponse.ok) {
          console.error('Cadence service error, failing open.');
          // In fail-open, we proceed with the original user list
      } else {
        const cadenceData = await cadenceResponse.json();
        eligibleUserIds = cadenceData.eligibleUserIds || userIds;
        excludedCount = cadenceData.excludedCount || 0;
      }
      
      console.log(`Cadence check: ${excludedCount} users excluded. ${eligibleUserIds.length} users remaining.`);
      
    } else {
      console.log('Layer 4 (Test) push, bypassing cadence check.');
    }
    // END CADENCE FILTERING

    if (eligibleUserIds.length === 0) {
      console.log('No user IDs remaining after cadence filtering');
      return NextResponse.json({ success: true, message: `All ${userIds.length} users were excluded by cadence rules. No notifications sent.` });
    }

    // Use the filtered list for the rest of the process
    userIds = eligibleUserIds;

    // Validate variables in title, body, and deep link
    const variableValidation = validateVariables(title, body, deepLink || undefined, csvData);
    if (!variableValidation.isValid) {
      console.log('Variable validation failed:', variableValidation.errors);
      return NextResponse.json({ 
        success: false, 
        message: `Variable validation failed: ${variableValidation.errors.join('; ')}`,
        details: {
          missingColumns: variableValidation.missingColumns,
          malformedVariables: variableValidation.malformedVariables
        }
      }, { status: 400 });
    }

    console.log('About to process notifications for user IDs:', userIds);

    // Step 1: Fetch all device tokens for all users in a single efficient query
    const allTokens = await fetchDeviceTokens(userIds);
    if (allTokens.length === 0) {
      console.log('No device tokens found for any of the provided user IDs.');
      return NextResponse.json({ success: false, message: 'No device tokens found for the target audience.' }, { status: 404 });
    }
    console.log(`Fetched ${allTokens.length} total tokens for ${userIds.length} users.`);

    // Create a map of userId -> tokens for easy lookup
    const userToTokensMap = new Map<string, string[]>();
    for (const tokenInfo of allTokens) {
      if (!userToTokensMap.has(tokenInfo.id)) {
        userToTokensMap.set(tokenInfo.id, []);
      }
      userToTokensMap.get(tokenInfo.id)!.push(tokenInfo.token);
    }

    // Step 2: Process variable replacements for the entire audience
    const variableReplacements = processVariableReplacements(title, body, deepLink || undefined, csvData);
    console.log(`Processed ${variableReplacements.length} personalized message variations.`);

    // Step 3: Group tokens by the exact message content to be sent
    const messageToTokensMap = new Map<string, string[]>();
    const uniqueTokensAdded = new Set<string>(); // Track unique tokens to prevent duplicates

    for (const replacement of variableReplacements) {
      const userTokens = userToTokensMap.get(replacement.userId);
      if (userTokens && userTokens.length > 0) {
        const messageKey = JSON.stringify({
          title: replacement.title,
          body: replacement.body,
          deepLink: replacement.deepLink
        });
        
        if (!messageToTokensMap.has(messageKey)) {
          messageToTokensMap.set(messageKey, []);
        }

        const tokenList = messageToTokensMap.get(messageKey)!;
        userTokens.forEach(token => {
          if (!uniqueTokensAdded.has(token)) {
            tokenList.push(token);
            uniqueTokensAdded.add(token);
          }
        });
      }
    }
    console.log(`Grouped tokens into ${messageToTokensMap.size} unique messages.`);

    // Step 4: Send notifications in batches of 500 per unique message
    const messaging = getPushClient();
    let successCount = 0;
    const failedTokens: string[] = [];
    const BATCH_SIZE = 500; // FCM recommended batch size

    const sendPromises = [];

    for (const [messageKey, tokens] of messageToTokensMap.entries()) {
      const messageContent = JSON.parse(messageKey);
      console.log(`[Processing Message Group] Found group with ${tokens.length} tokens for message:`, messageContent);
      const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);

      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const tokenBatch = tokens.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        
        console.log(`  - Preparing Batch ${batchNumber}/${totalBatches} with ${tokenBatch.length} tokens.`);

        if (dryRun) {
          console.log(`  - [DRY RUN] Skipping actual send for Batch ${batchNumber}.`);
          successCount += tokenBatch.length;
          // Log dry run batch
          jobLogger.addBatch(jobId, {
            batchNumber,
            totalBatches,
            status: 'success',
            successCount: tokenBatch.length,
            failureCount: 0,
            successfulTokens: tokenBatch,
            failedTokens: [],
            timestamp: new Date().toISOString(),
          });
          continue;
        }

        const message: admin.messaging.MulticastMessage = {
          notification: { 
            title: messageContent.title, 
            body: messageContent.body 
          },
          tokens: tokenBatch,
          ...(messageContent.deepLink && {
            data: {
              click_action: messageContent.deepLink,
              url: messageContent.deepLink
            }
          })
        };

        // Add the promise to the array
        const promise = messaging.sendEachForMulticast(message).then(response => {
          console.log(`  - Batch ${batchNumber}/${totalBatches} sent. Success: ${response.successCount}, Failure: ${response.failureCount}`);
          const failures = response.responses
            .map((resp, idx) => !resp.success ? tokenBatch[idx] : null)
            .filter((token): token is string => token !== null);
          const successes = response.responses
            .map((resp, idx) => resp.success ? tokenBatch[idx] : null)
            .filter((token): token is string => token !== null);

          // Track successful notifications
          if (!dryRun) {
            const userIdsForSuccessfulTokens = csvData
              .filter(row => userToTokensMap.get(row.user_id)?.some(token => successes.includes(token)))
              .map(row => row.user_id);
            
            for (const userId of userIdsForSuccessfulTokens) {
              fetch('http://localhost:3002/api/track-notification', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  userId,
                  layerId,
                  pushTitle: title,
                  pushBody: body,
                  audienceDescription: file ? `CSV: ${file.name}` : `Manual: ${manualUserIds}`,
                }),
              }).catch(err => console.error(`Failed to track notification for user ${userId}:`, err));
            }
          }

          return {
            success: response.successCount,
            failures: failures,
            successes: successes,
            batchNumber: batchNumber,
            totalBatches: totalBatches,
          };
        }).catch(error => {
          console.error(`  - Error sending Batch ${batchNumber}/${totalBatches}:`, error);
          // On error, assume all tokens in the batch failed
          return {
            success: 0,
            failures: tokenBatch,
            successes: [],
            batchNumber: batchNumber,
            totalBatches: totalBatches,
          };
        });
        sendPromises.push(promise);
      }
    }

    // Wait for all send operations to complete
    if (!dryRun) {
      const concurrencyLimit = 2; // Reduced from 10 to 2
      const finalResults = [];
      const executing = new Set<Promise<any>>();
      console.log(`Sending ${sendPromises.length} batches with a concurrency limit of ${concurrencyLimit}...`);

      for (const promise of sendPromises) {
        const p = promise.then(result => {
          executing.delete(p);
          if (result) {
            jobLogger.addBatch(jobId, {
              batchNumber: result.batchNumber,
              totalBatches: result.totalBatches,
              status: result.failures.length > 0 ? 'failed' : 'success',
              successCount: result.success,
              failureCount: result.failures.length,
              successfulTokens: result.successes,
              failedTokens: result.failures,
              timestamp: new Date().toISOString(),
            });
          }
          return result;
        });
        executing.add(p);
        finalResults.push(p);
        if (executing.size >= concurrencyLimit) {
          await Promise.race(executing);
        }
      }
      const results = await Promise.all(finalResults);

      // The logging is now done incrementally above. We just need to aggregate the final results here.
      results.forEach(result => {
        if (result) { // Check if result is not null
          successCount += result.success;
          failedTokens.push(...result.failures);
        }
      });
    }

    const totalTokens = uniqueTokensAdded.size;
    const finalMessage = dryRun
      ? `[DRY RUN COMPLETE] Simulated sending ${successCount} of ${totalTokens} notifications.`
      : `Successfully sent ${successCount} of ${totalTokens} notifications.`;

    const summary = {
      successCount,
      failedCount: failedTokens.length,
      totalTokens,
    };

    console.log('--- Push Notification Job Finished ---');
    console.log('Final Results:', summary);
    console.log(finalMessage);

    // Finalize the job log
    jobLogger.complete(jobId, 'completed', summary);

    return NextResponse.json({
      success: true,
      message: finalMessage,
      jobId,
      failedTokens: failedTokens.length > 0 ? failedTokens : undefined,
    });

  } catch (error: any) {
    console.error('ERROR in send-push API:', error);
    
    // Log failed push attempts
    if (jobId) {
      jobLogger.complete(jobId, 'failed', {
        errorMessage: error.message || 'Unknown error'
      });
    }
    
    return NextResponse.json({ success: false, message: error.message || 'An internal server error occurred.' }, { status: 500 });
  }
} 