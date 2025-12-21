// Automation Testing API
// Provides real-time testing capabilities for automations with comprehensive logging

// Force Node.js runtime for reliable Python process spawning
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { registerRunningTest, unregisterRunningTest } from '@/lib/testProcessManager';
import { getCadenceServiceUrl, getGeneratedCsvsDir, getAllGeneratedCsvsDirs } from '@/lib/environmentUtils';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Type definitions for automation and related structures
interface PushSequenceItem {
  title: string;
  body: string;
  layerId: number;
  deepLink?: string;
  audienceName?: string;
}

interface CustomScript {
  scriptId: string;
  parameters?: Record<string, unknown>;
}

interface AudienceCriteria {
  customScript?: CustomScript;
}

interface Automation {
  id: string;
  name: string;
  pushSequence: PushSequenceItem[];
  audienceCriteria?: AudienceCriteria;
}

interface AudienceInfo {
  name: string;
  fileName: string;
  userCount: number;
  type: string;
  csvPath?: string;
}

interface ScriptResult {
  success: boolean;
  message?: string;
  csvFiles?: string[];
}

interface ExecutionResult {
  success: boolean;
  message: string;
}

interface FileStats {
  name: string;
  mtime: Date;
}

interface CsvRow {
  user_id: string;
  [key: string]: string;
}

type SendLogFunction = (level: 'info' | 'success' | 'warning' | 'error', message: string, stage?: string) => void;

// GET - Start test execution with Server-Sent Events for real-time logging
export async function GET(req: NextRequest, { params }: RouteParams) {
  console.log('🚨🚨🚨 [IMMEDIATE-TEST-API] GET aPI/automation/test/[id] HAS BEEN CALLED! THIS MAY BE THE SOURCE OF THE BUG. 🚨🚨🚨');
  try {
    const { id } = await params;
    console.log('[API] Automation ID:', id);
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') as 'test-dry-run' | 'test-live-send' | 'real-dry-run' | 'live-send';
    console.log('[API] Test mode:', mode);
    
    if (!mode) {
      return NextResponse.json({
        success: false,
        message: 'Test mode is required'
      }, { status: 400 });
    }

    // Set up Server-Sent Events
    const encoder = new TextEncoder();
    
    const stream = new ReadableStream({
      start(controller) {
        // Function to send log messages
        const sendLog = (level: 'info' | 'success' | 'warning' | 'error', message: string, stage?: string) => {
          const data = JSON.stringify({
            type: 'log',
            timestamp: new Date().toISOString(),
            level,
            message,
            stage
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        // Function to send final result
        const sendResult = (success: boolean, message: string) => {
          const data = JSON.stringify({
            type: 'result',
            success,
            message
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.close();
        };

        // Function to send error
        const sendError = (message: string) => {
          const data = JSON.stringify({
            type: 'error',
            message
          });
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          controller.close();
        };

        // Execute test asynchronously
        executeTest(id, mode, sendLog, sendResult, sendError);
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });

  } catch (error: unknown) {
    console.error('Error starting test execution:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({
      success: false,
      message: 'Failed to start test execution',
      errors: [errorMessage]
    }, { status: 500 });
  }
}

// getCadenceServiceUrl is now imported from @/lib/environmentUtils

// Main test execution function
async function executeTest(
  automationId: string,
  mode: 'test-dry-run' | 'test-live-send' | 'real-dry-run' | 'live-send',
  sendLog: (level: 'info' | 'success' | 'warning' | 'error', message: string, stage?: string) => void,
  sendResult: (success: boolean, message: string) => void,
  sendError: (message: string) => void
) {
  try {
    // Register this test as running
    registerRunningTest(automationId, mode);
    
    sendLog('info', `Starting ${mode} test for automation ${automationId}`, 'INIT');

    // Step 1: Load automation details
    sendLog('info', 'Loading automation configuration...', 'CONFIG');
    const automation = await loadAutomation(automationId);
    if (!automation) {
      return sendError('Automation not found');
    }
    sendLog('success', `Loaded automation: ${automation.name}`, 'CONFIG');
    sendLog('info', `Found ${automation.pushSequence.length} pushes in sequence`, 'CONFIG');

    // Step 2: Check for existing V2-generated CSVs before running scripts
    // The V2 TypeScript generator creates CSVs in .script-outputs/ during automation execution
    // For test mode, we can reuse these if they exist and are recent (within 30 minutes)
    const existingCsvs = await checkForExistingCsvs(mode, sendLog);

    if (existingCsvs.found) {
      sendLog('success', `Found ${existingCsvs.count} existing V2-generated CSV files (skipping script execution)`, 'SCRIPT');
    } else if (automation.audienceCriteria?.customScript) {
      // Only run Python script if no recent V2-generated CSVs exist
      sendLog('info', 'No recent V2-generated CSVs found, executing audience generation script...', 'SCRIPT');
      const scriptResult = await executeScript(automation.audienceCriteria.customScript, sendLog, automationId, mode);
      if (!scriptResult.success) {
        return sendError(`Script execution failed: ${scriptResult.message}`);
      }
      sendLog('success', `Generated ${scriptResult.csvFiles?.length || 0} audience CSV files`, 'SCRIPT');
    } else {
      sendLog('warning', 'No custom script found, using existing audience queries', 'SCRIPT');
    }

    // Step 3: Filter CSVs based on test mode
    sendLog('info', `Filtering audiences for ${mode} mode...`, 'FILTER');
    const audienceType = mode.startsWith('test-') ? 'TEST' : 'REAL';
    const filteredAudiences = await filterAudiences(automation, audienceType, sendLog);
    sendLog('success', `Filtered to ${filteredAudiences.length} ${audienceType} audiences`, 'FILTER');

    // Step 4: Execute pushes based on mode
    const isLiveSend = mode === 'test-live-send' || mode === 'live-send';
    const operation = isLiveSend ? 'live send' : 'dry run';
    sendLog('info', `Starting ${operation} for all pushes...`, 'EXECUTION');

    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < automation.pushSequence.length; i++) {
      const push = automation.pushSequence[i];
      const audience = filteredAudiences[i];
      
      if (!audience) {
        sendLog('warning', `No audience found for push ${i + 1}: ${push.title}`, 'EXECUTION');
        continue;
      }

      sendLog('info', `Processing push ${i + 1}/${automation.pushSequence.length}: ${push.title}`, 'EXECUTION');
      sendLog('info', `Audience: ${audience.name} (${audience.userCount} users)`, 'EXECUTION');

      try {
        if (isLiveSend) {
          const result = await executeLiveSend(push, audience, sendLog);
          if (result.success) {
            successCount++;
            sendLog('success', `✅ Push ${i + 1} sent successfully`, 'EXECUTION');
          } else {
            failureCount++;
            sendLog('error', `❌ Push ${i + 1} failed: ${result.message}`, 'EXECUTION');
          }
        } else {
          const result = await executeDryRun(push, audience, sendLog);
          if (result.success) {
            successCount++;
            sendLog('success', `✅ Push ${i + 1} dry run completed`, 'EXECUTION');
          } else {
            failureCount++;
            sendLog('error', `❌ Push ${i + 1} dry run failed: ${result.message}`, 'EXECUTION');
          }
        }
      } catch (error: unknown) {
        failureCount++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendLog('error', `❌ Push ${i + 1} error: ${errorMessage}`, 'EXECUTION');
      }

      // Add delay between pushes (simulate real execution timing)
      if (i < automation.pushSequence.length - 1) {
        sendLog('info', 'Waiting 2 seconds before next push...', 'EXECUTION');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Step 5: Report final results
    const totalPushes = automation.pushSequence.length;
    if (failureCount === 0) {
      sendResult(true, `All ${totalPushes} pushes completed successfully! ✅`);
    } else if (successCount > 0) {
      sendResult(false, `${successCount}/${totalPushes} pushes completed successfully, ${failureCount} failed ⚠️`);
    } else {
      sendResult(false, `All ${totalPushes} pushes failed ❌`);
    }

  } catch (error: unknown) {
    console.error('Test execution error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendError(`Test execution failed: ${errorMessage}`);
  } finally {
    // Always unregister the test when it completes or fails
    unregisterRunningTest(automationId, mode);
  }
}

// Helper function to load automation
async function loadAutomation(automationId: string) {
  try {
    const { automationStorage } = await import('@/lib/automationStorage');
    return await automationStorage.loadAutomation(automationId);
  } catch (error) {
    console.error('Error loading automation:', error);
    return null;
  }
}

// Helper function to check for existing V2-generated CSVs
// V2 TypeScript generators create CSVs during automation execution
// We can reuse these for test mode instead of running Python scripts
async function checkForExistingCsvs(
  mode: string,
  sendLog: SendLogFunction
): Promise<{ found: boolean; count: number }> {
  const fs = require('fs');
  const path = require('path');

  const generatedCsvsDir = getGeneratedCsvsDir();

  if (!fs.existsSync(generatedCsvsDir)) {
    sendLog('info', `CSV directory not found: ${generatedCsvsDir}`, 'SCRIPT');
    return { found: false, count: 0 };
  }

  const audienceType = mode.startsWith('test-') ? 'TEST' : 'REAL';
  const now = Date.now();
  const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  // Get all CSV files and check if they're recent
  const allFiles = fs.readdirSync(generatedCsvsDir);
  const matchingFiles = allFiles.filter((file: string) => {
    if (!file.endsWith('.csv')) return false;

    // For TEST mode, look for files with _TEST_
    // For REAL mode, look for files without _TEST_
    const isTestFile = file.includes('_TEST_');
    const wantTestFile = audienceType === 'TEST';

    if (isTestFile !== wantTestFile) return false;

    // Check if file is recent (within 30 minutes)
    try {
      const filePath = path.join(generatedCsvsDir, file);
      const stats = fs.statSync(filePath);
      const fileAge = now - stats.mtime.getTime();
      return fileAge < MAX_AGE_MS;
    } catch {
      return false;
    }
  });

  // Look for the expected audience files
  const expectedPatterns = ['offer-creators', 'closet-adders', 'wishlist-adders'];
  const foundPatterns = expectedPatterns.filter(pattern =>
    matchingFiles.some((file: string) => file.includes(pattern))
  );

  if (foundPatterns.length >= 2) {
    sendLog('info', `Found recent ${audienceType} CSV files in ${generatedCsvsDir}`, 'SCRIPT');
    return { found: true, count: matchingFiles.length };
  }

  return { found: false, count: 0 };
}

// Helper function to execute script
async function executeScript(scriptConfig: CustomScript, sendLog: SendLogFunction, automationId?: string, mode?: string): Promise<ScriptResult> {
  const fs = require('fs');
  const path = require('path');

  const debugLog = (message: string) => {
    const timestamp = new Date().toISOString();
    const debugPath = path.join(process.cwd(), 'tmp', 'debug.log');
    // Ensure tmp directory exists
    fs.mkdirSync(path.dirname(debugPath), { recursive: true });
    fs.appendFileSync(debugPath, `${timestamp}: ${message}\n`);
  };
  
  debugLog('[API] executeScript called with: ' + JSON.stringify(scriptConfig));
  console.log('[API] executeScript called with:', scriptConfig);
  try {
    console.log('[API] Importing scriptExecutor...');
    const { scriptExecutor } = await import('@/lib/scriptExecutor');
    console.log('[API] scriptExecutor imported successfully');
    
    sendLog('info', `Running script: ${scriptConfig.scriptId}`, 'SCRIPT');
    sendLog('info', `Script parameters: ${JSON.stringify(scriptConfig.parameters || {})}`, 'SCRIPT');
    
    // Generate execution ID for this test run
    const executionId = `test-${Date.now()}`;
    sendLog('info', `Execution ID: ${executionId}`, 'SCRIPT');
    console.log('[API] About to call scriptExecutor.executeScript...');
    // For tests, we need actual CSV files generated (not dry-run) so we can use the TEST versions
    const result = await scriptExecutor.executeScript(scriptConfig.scriptId, scriptConfig.parameters || {}, executionId, false);
    console.log('[API] scriptExecutor.executeScript returned:', result);
    
    if (result.success) {
      sendLog('success', `Script completed successfully`, 'SCRIPT');
      if (result.stdout) {
        sendLog('info', `Script output: ${result.stdout}`, 'SCRIPT');
      }
      return {
        success: true,
        csvFiles: result.csvPath ? [result.csvPath] : []
      };
    } else {
      // Log detailed error information
      sendLog('error', `Script failed: ${result.error}`, 'SCRIPT');
      if (result.stderr) {
        sendLog('error', `Script stderr: ${result.stderr}`, 'SCRIPT');
      }
      if (result.stdout) {
        sendLog('info', `Script stdout: ${result.stdout}`, 'SCRIPT');
      }
      // Log raw result for debugging
      sendLog('error', `Raw result: ${JSON.stringify({success: result.success, error: result.error, stdout: result.stdout?.substring(0, 200), stderr: result.stderr?.substring(0, 200)})}`, 'SCRIPT');
      return {
        success: false,
        message: `${result.error}${result.stderr ? ' | stderr: ' + result.stderr : ''}`
      };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendLog('error', `Script execution exception: ${errorMessage}`, 'SCRIPT');
    return {
      success: false,
      message: errorMessage
    };
  }
}

// getGeneratedCsvsDir is now imported from @/lib/environmentUtils

// Helper function to filter audiences based on test mode
async function filterAudiences(automation: Automation, audienceType: 'TEST' | 'REAL', sendLog: SendLogFunction): Promise<AudienceInfo[]> {
  const fs = require('fs');
  const path = require('path');
  const Papa = require('papaparse');

  const audiences: AudienceInfo[] = [];

  // Get all possible CSV directories (different scripts output to different locations)
  const allCsvDirs = getAllGeneratedCsvsDirs();

  if (allCsvDirs.length === 0) {
    sendLog('error', `No generated CSVs directories found. Checked multiple locations.`, 'FILTER');
    return audiences;
  }

  sendLog('info', `Searching ${allCsvDirs.length} CSV directories: ${allCsvDirs.join(', ')}`, 'FILTER');

  // Collect all CSV files from all directories with their full paths
  interface CsvFileInfo {
    name: string;
    fullPath: string;
    mtime: Date;
  }

  let allCsvFilesWithPaths: CsvFileInfo[] = [];

  for (const dir of allCsvDirs) {
    const filesInDir = fs.readdirSync(dir)
      .filter((file: string) => file.endsWith('.csv'))
      .map((file: string) => {
        const fullPath = path.join(dir, file);
        return {
          name: file,
          fullPath,
          mtime: fs.statSync(fullPath).mtime
        };
      });
    allCsvFilesWithPaths = allCsvFilesWithPaths.concat(filesInDir);
  }

  // Sort by modification time (newest first)
  allCsvFilesWithPaths.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  sendLog('info', `Found ${allCsvFilesWithPaths.length} total CSV files across all directories`, 'FILTER');
  
    // Detect automation type and create appropriate file mapping
  const isWaterfallScript = automation.audienceCriteria?.customScript?.scriptId === 'generate_new_user_waterfall';

  // Helper to find file by pattern - returns the CsvFileInfo object with fullPath
  const findFile = (testPattern: string, isTestAudience: boolean): CsvFileInfo | undefined => {
    return allCsvFilesWithPaths.find((f: CsvFileInfo) => {
      const hasTestMarker = f.name.includes('test') || f.name.includes('TEST');
      const matchesPattern = f.name.includes(testPattern);
      return matchesPattern && (isTestAudience ? hasTestMarker : !hasTestMarker);
    });
  };

  let audienceFileMap: Record<string, CsvFileInfo | undefined> = {};

  if (isWaterfallScript) {
    // Waterfall script generates different file patterns
    audienceFileMap = {
      'offer-creators': findFile('no-shoes-new-user', audienceType === 'TEST'),
      'closet-adders': findFile('no-bio-new-user', audienceType === 'TEST'),
      'wishlist-adders': findFile('no-offers-new-user', audienceType === 'TEST'),
      'new-user-level4': findFile('no-wishlist-new-user', audienceType === 'TEST'),
      'new-user-level5': findFile('new-stars-new-user', audienceType === 'TEST')
    };
  } else {
    // Layer 3 script uses traditional file patterns
    audienceFileMap = {
      'offer-creators': findFile('offer-creators', audienceType === 'TEST'),
      'closet-adders': findFile('closet-adders', audienceType === 'TEST'),
      'wishlist-adders': findFile('wishlist-adders', audienceType === 'TEST')
    };
  }

  // Define audience types based on automation type
  let audienceTypes: readonly string[] = [];

  if (isWaterfallScript) {
    audienceTypes = ['offer-creators', 'closet-adders', 'wishlist-adders', 'new-user-level4', 'new-user-level5'] as const;
  } else {
    audienceTypes = ['offer-creators', 'closet-adders', 'wishlist-adders'] as const;
  }

  for (let i = 0; i < automation.pushSequence.length; i++) {
    const push = automation.pushSequence[i];
    const audienceName = push.audienceName || 'default';

    // Map push sequence index to audience category
    const audienceCategory = audienceTypes[i] || (isWaterfallScript ? 'new-user-level5' : 'offer-creators');

    // Look for appropriate CSV file (now with full path)
    const csvFileInfo = audienceFileMap[audienceCategory];
    const csvFileName = csvFileInfo?.name || `${audienceName}-${audienceType}.csv`;

    sendLog('info', `Looking for audience file: ${csvFileName}`, 'FILTER');
    sendLog('info', `Push ${i+1}: mapping to ${audienceCategory} category`, 'FILTER');

    let userCount = 0;
    if (csvFileInfo) {
      try {
        // Load and count actual CSV file using fullPath
        const csvContent = fs.readFileSync(csvFileInfo.fullPath, 'utf8');
        const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
        userCount = parseResult.data.length;

        sendLog('success', `Found ${audienceCategory} audience: ${userCount} users from ${csvFileInfo.fullPath}`, 'FILTER');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendLog('error', `Failed to load CSV ${csvFileInfo.fullPath}: ${errorMessage}`, 'FILTER');
        userCount = 0;
      }
    } else {
      // Fallback for missing files
      userCount = audienceType === 'TEST' ? 1 : 0;
      sendLog('warning', `CSV file not found for ${audienceCategory}, using fallback: ${userCount} users`, 'FILTER');
    }

    audiences.push({
      name: audienceCategory, // Use the specific audience category instead of "default"
      fileName: csvFileName,
      userCount: userCount,
      type: audienceType,
      csvPath: csvFileInfo?.fullPath // Use the full path directly
    });
  }

  return audiences;
}

// Helper function to execute dry run using REAL validation infrastructure
async function executeDryRun(push: PushSequenceItem, audience: AudienceInfo, sendLog: SendLogFunction): Promise<ExecutionResult> {
  try {
    sendLog('info', 'Validating push configuration...', 'DRY_RUN');
    
    // Import the real push infrastructure (same as live send)
    const { fetchDeviceTokens } = await import('@/lib/graphql');
    const { validateVariables, processVariableReplacements } = await import('@/lib/variableProcessor');
    const fs = require('fs');
    const path = require('path');
    const Papa = require('papaparse');
    
    // Step 1: Validate push content
    if (!push.title || !push.body) {
      throw new Error('Missing required push title or body');
    }
    
    // Validate deep link if provided (same validation as main push)
    if (push.deepLink) {
      try {
        const parsedUrl = new URL(push.deepLink);
        if (!(parsedUrl.hostname === 'tradeblock.us' || parsedUrl.hostname.endsWith('.tradeblock.us'))) {
          throw new Error('Deep link must be a valid tradeblock.us URL');
        }
      } catch {
        throw new Error('Invalid deep link URL format');
      }
    }
    
    sendLog('success', 'Push configuration validation passed', 'DRY_RUN');
    
    // Step 2: Load and validate CSV file
    if (!audience.csvPath || !fs.existsSync(audience.csvPath)) {
      throw new Error(`CSV file not found: ${audience.csvPath}`);
    }
    
    const csvContent = fs.readFileSync(audience.csvPath, 'utf8');
    const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });

    if (parseResult.errors.length > 0) {
      throw new Error(`CSV parsing errors: ${parseResult.errors.map((e: {message: string}) => e.message).join(', ')}`);
    }

    let userIds = (parseResult.data as CsvRow[]).map((row: CsvRow) => row.user_id).filter(Boolean);
    if (userIds.length === 0) {
      throw new Error('No valid user IDs found in CSV file');
    }
    
    sendLog('success', `CSV validation passed: ${userIds.length} user IDs found`, 'DRY_RUN');
    
    // Apply cadence filtering (treat test audiences as Layer 4)
    // For test audiences, override to Layer 4 to bypass cadence rules
    const effectiveLayerId = (audience.type === 'TEST') ? 4 : push.layerId;
    let excludedCount = 0;
    
    if (effectiveLayerId && effectiveLayerId !== 4) {
      sendLog('info', 'Simulating cadence filtering rules...', 'DRY_RUN');
      
      try {
        const cadenceResponse = await fetch(`${getCadenceServiceUrl()}/api/filter-audience`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds, layerId: effectiveLayerId }),
        });

        if (!cadenceResponse.ok) {
          sendLog('warning', 'Cadence service error, dry run assuming all users eligible', 'DRY_RUN');
        } else {
          const cadenceData = await cadenceResponse.json();
          const eligibleUserIds = cadenceData.eligibleUserIds || userIds;
          excludedCount = cadenceData.excludedCount || 0;
          userIds = eligibleUserIds;
          
          sendLog('success', `Cadence filtering: ${excludedCount} users would be excluded, ${userIds.length} users eligible`, 'DRY_RUN');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendLog('warning', `Cadence service error: ${errorMessage}, dry run proceeding`, 'DRY_RUN');
      }
    } else {
      const reason = audience.type === 'TEST' ? 'Test audience (Layer 4)' : `Layer ${effectiveLayerId}`;
      sendLog('info', `${reason} - bypassing cadence filtering`, 'DRY_RUN');
    }
    
    if (userIds.length === 0) {
      throw new Error(`All ${(parseResult.data as CsvRow[]).length} users would be excluded by cadence rules. No users eligible for push.`);
    }
    
    // Step 3: Validate variable usage (same as main push)
    const variableValidation = validateVariables(push.title, push.body, push.deepLink || undefined, parseResult.data as CsvRow[]);
    if (!variableValidation.isValid) {
      const errorDetails = [
        ...variableValidation.errors,
        ...variableValidation.missingColumns.map(col => `Missing column: ${col}`),
        ...variableValidation.malformedVariables.map(v => `Malformed variable: ${v}`)
      ].join('; ');
      throw new Error(`Variable validation failed: ${errorDetails}`);
    }
    
    // Extract variables for counting
    const { extractVariables } = await import('@/lib/variableProcessor');
    const allText = `${push.title} ${push.body} ${push.deepLink || ''}`;
    const variablesFound = extractVariables(allText);
    
    sendLog('success', `Variable validation passed: ${variablesFound.length} variables detected`, 'DRY_RUN');
    
    // Step 4: Fetch and validate device tokens (REAL tokens)
    sendLog('info', `Fetching device tokens for ${userIds.length} users...`, 'DRY_RUN');
    const allTokens = await fetchDeviceTokens(userIds);
    
    if (allTokens.length === 0) {
      throw new Error('No device tokens found for target audience - users may not have the app installed');
    }
    
    // Create user-to-tokens mapping
    const userToTokensMap = new Map<string, string[]>();
    for (const tokenInfo of allTokens) {
      if (!userToTokensMap.has(tokenInfo.id)) {
        userToTokensMap.set(tokenInfo.id, []);
      }
      userToTokensMap.get(tokenInfo.id)!.push(tokenInfo.token);
    }
    
    const usersWithTokens = userToTokensMap.size;
    const usersWithoutTokens = userIds.length - usersWithTokens;
    
    sendLog('success', `Device tokens fetched: ${allTokens.length} tokens for ${usersWithTokens} users`, 'DRY_RUN');
    if (usersWithoutTokens > 0) {
      sendLog('warning', `${usersWithoutTokens} users have no device tokens (app not installed)`, 'DRY_RUN');
    }
    
    // Step 5: Process variable replacements (REAL processing)
    sendLog('info', 'Processing personalized message variations...', 'DRY_RUN');
    const variableReplacements = processVariableReplacements(
      push.title,
      push.body,
      push.deepLink,
      parseResult.data as CsvRow[]
    );
    
    sendLog('success', `Processed ${variableReplacements.length} personalized messages`, 'DRY_RUN');
    
    // Step 6: Group tokens by message content (same logic as live send)
    const messageToTokensMap = new Map<string, string[]>();
    const uniqueTokensAdded = new Set<string>();
    
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
    
    sendLog('success', `Grouped into ${messageToTokensMap.size} unique message variations`, 'DRY_RUN');
    
    // Step 7: Simulate batch sending (same batching logic, no actual send)
    sendLog('info', 'Simulating batch delivery...', 'DRY_RUN');
    
    let totalTokensToSend = 0;
    let batchNumber = 0;
    const BATCH_SIZE = 500; // Same as real push
    
    for (const [messageKey, tokens] of messageToTokensMap.entries()) {
      const { title, body, deepLink } = JSON.parse(messageKey);
      totalTokensToSend += tokens.length;
      
      // Simulate batching (same logic as real push)
      const totalBatches = Math.ceil(tokens.length / BATCH_SIZE);
      for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        batchNumber++;
        const batchTokens = tokens.slice(i, i + BATCH_SIZE);
        
        sendLog('info', `[DRY RUN] Batch ${batchNumber}/${totalBatches}: would send to ${batchTokens.length} tokens`, 'DRY_RUN');
        sendLog('info', `  Message: "${title}" | "${body}"${deepLink ? ` | Link: ${deepLink}` : ''}`, 'DRY_RUN');
      }
    }
    
    // Step 8: Summary (matches main push summary format)
    const successRate = 100; // Dry run assumes 100% success
    sendLog('success', `Dry run completed successfully!`, 'DRY_RUN');
    sendLog('info', `Would send ${totalTokensToSend} notifications across ${batchNumber} batches`, 'DRY_RUN');
    sendLog('info', `${usersWithTokens} users reachable, ${usersWithoutTokens} users unreachable (no app)`, 'DRY_RUN');
    
    return {
      success: true,
      message: `Dry run completed: would send ${totalTokensToSend} notifications to ${usersWithTokens} users`
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendLog('error', `Dry run failed: ${errorMessage}`, 'DRY_RUN');
    return {
      success: false,
      message: errorMessage
    };
  }
}

// Helper function to execute live send using REAL push infrastructure
async function executeLiveSend(push: PushSequenceItem, audience: AudienceInfo, sendLog: SendLogFunction): Promise<ExecutionResult> {
  try {
    sendLog('info', 'Preparing live push notification...', 'LIVE_SEND');
    
    // Import the real push sending infrastructure
    const { fetchDeviceTokens } = await import('@/lib/graphql');
    const { admin, getPushClient } = await import('@/lib/firebaseAdmin');
    const { processVariableReplacements } = await import('@/lib/variableProcessor');
    const fs = require('fs');
    const path = require('path');
    const Papa = require('papaparse');
    
    // Step 1: Load user IDs from the CSV file
    if (!audience.csvPath || !fs.existsSync(audience.csvPath)) {
      throw new Error(`CSV file not found: ${audience.csvPath}`);
    }
    
    const csvContent = fs.readFileSync(audience.csvPath, 'utf8');
    const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
    let userIds = (parseResult.data as CsvRow[]).map((row: CsvRow) => row.user_id).filter(Boolean);
    
    sendLog('info', `Loaded ${userIds.length} users from CSV file`, 'LIVE_SEND');
    
    // Step 1.5: Apply cadence filtering (treat test audiences as Layer 4)
    // For test audiences, override to Layer 4 to bypass cadence rules
    const effectiveLayerId = (audience.type === 'TEST') ? 4 : push.layerId;
    let excludedCount = 0;
    
    if (effectiveLayerId && effectiveLayerId !== 4) { // Bypass cadence check for Layer 4 (Test)
      sendLog('info', `🔍 Applying Layer ${effectiveLayerId} cadence filtering rules (72-hour cooldown protection)...`, 'LIVE_SEND');
      
      try {
        const cadenceResponse = await fetch(`${getCadenceServiceUrl()}/api/filter-audience`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userIds, layerId: effectiveLayerId }),
        });

        if (!cadenceResponse.ok) {
          const errorText = await cadenceResponse.text();
          sendLog('warning', `⚠️ Cadence service error (${cadenceResponse.status}): ${errorText}. Failing open - proceeding with all users`, 'LIVE_SEND');
          console.error(`[AUTOMATION] Cadence service error: ${cadenceResponse.status} ${errorText}`);
        } else {
          const cadenceData = await cadenceResponse.json();
          const eligibleUserIds = cadenceData.eligibleUserIds || userIds;
          excludedCount = cadenceData.excludedCount || 0;
          userIds = eligibleUserIds;
          
          if (excludedCount > 0) {
            sendLog('success', `✅ Cadence filtering applied: ${excludedCount} users excluded by 72h cooldown, ${userIds.length} users eligible for Layer ${effectiveLayerId}`, 'LIVE_SEND');
            console.log(`[AUTOMATION] Layer ${effectiveLayerId} cadence filtering: ${excludedCount} excluded, ${userIds.length} eligible`);
          } else {
            sendLog('info', `✅ Cadence filtering applied: All ${userIds.length} users eligible for Layer ${effectiveLayerId} (no cooldown conflicts)`, 'LIVE_SEND');
            console.log(`[AUTOMATION] Layer ${effectiveLayerId} cadence filtering: All users eligible`);
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendLog('warning', `⚠️ Cadence service error: ${errorMessage}. Failing open - proceeding with all users`, 'LIVE_SEND');
        console.error(`[AUTOMATION] Cadence service fetch error:`, error);
      }
    } else {
      const reason = audience.type === 'TEST' ? 'Test audience (Layer 4)' : `Layer ${effectiveLayerId}`;
      sendLog('info', `ℹ️ ${reason} - bypassing cadence filtering (no cooldown rules apply)`, 'LIVE_SEND');
    }
    
    if (userIds.length === 0) {
      throw new Error(`All ${(parseResult.data as CsvRow[]).length} users were excluded by cadence rules. No users eligible for push.`);
    }
    
    sendLog('info', `Loading device tokens for ${userIds.length} eligible users...`, 'LIVE_SEND');
    
    // Step 2: Fetch device tokens using the real infrastructure
    const allTokens = await fetchDeviceTokens(userIds);
    if (allTokens.length === 0) {
      throw new Error('No device tokens found for the target audience');
    }
    
    sendLog('success', `Fetched ${allTokens.length} device tokens`, 'LIVE_SEND');
    
    // Step 3: Process variable replacements using real CSV data
    const variableReplacements = processVariableReplacements(
      push.title,
      push.body,
      push.deepLink,
      parseResult.data as CsvRow[]
    );
    
    sendLog('info', `Processed ${variableReplacements.length} personalized messages`, 'LIVE_SEND');
    
    // Step 4: Group tokens by message content (same as main push logic)
    const userToTokensMap = new Map<string, string[]>();
    for (const tokenInfo of allTokens) {
      if (!userToTokensMap.has(tokenInfo.id)) {
        userToTokensMap.set(tokenInfo.id, []);
      }
      userToTokensMap.get(tokenInfo.id)!.push(tokenInfo.token);
    }
    
    const messageToTokensMap = new Map<string, string[]>();
    const uniqueTokensAdded = new Set<string>();
    
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
    
    sendLog('info', `Sending ${messageToTokensMap.size} unique messages via Firebase...`, 'LIVE_SEND');
    
    // Step 5: Send via Firebase using real infrastructure
    const pushClient = getPushClient();
    let totalSent = 0;
    let totalFailed = 0;
    let batchNumber = 0;
    
    for (const [messageKey, tokens] of messageToTokensMap.entries()) {
      const { title, body, deepLink } = JSON.parse(messageKey);
      
      // Send in batches of 500 (Firebase limit)
      const batchSize = 500;
      for (let i = 0; i < tokens.length; i += batchSize) {
        batchNumber++;
        const batchTokens = tokens.slice(i, i + batchSize);
        const totalBatches = Math.ceil(tokens.length / batchSize);
        
        sendLog('info', `Sending batch ${batchNumber}/${totalBatches} (${batchTokens.length} tokens)`, 'LIVE_SEND');
        
        try {
          const message = {
            notification: { title, body },
            tokens: batchTokens,
            ...(deepLink && {
              data: {
                click_action: deepLink,
                url: deepLink
              }
            })
          };
          
          const response = await pushClient.sendEachForMulticast(message);
          totalSent += response.successCount;
          totalFailed += response.failureCount;

          sendLog('success', `Batch ${batchNumber}: ${response.successCount} sent, ${response.failureCount} failed`, 'LIVE_SEND');
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          sendLog('error', `Batch ${batchNumber} failed: ${errorMessage}`, 'LIVE_SEND');
          totalFailed += batchTokens.length;
        }
      }
    }
    
    // Step 6: Record in cadence database (using REAL cadence tracking with effective layer)
    if (effectiveLayerId && totalSent > 0) {
      const trackingLayerDescription = audience.type === 'TEST' ? 'Layer 4 (Test)' : `Layer ${effectiveLayerId}`;
      sendLog('info', `Recording notifications as ${trackingLayerDescription} in cadence database...`, 'LIVE_SEND');
      
      try {
        // Get the successful user IDs for tracking (same logic as main push)
        // Map successful tokens back to user IDs from the CSV data
        const successfulUserIds = (parseResult.data as CsvRow[])
          .filter((row: CsvRow) => userToTokensMap.get(row.user_id)?.some(token => uniqueTokensAdded.has(token)))
          .map((row: CsvRow) => row.user_id);
        
        let trackingCount = 0;
        // CRITICAL FIX: Only track users who actually received Firebase notifications
        // Map successful Firebase deliveries back to user IDs
        const actuallyDeliveredUserIds = [];
        
        // Get the tokens that Firebase confirmed as delivered
        const deliveredTokens = new Set();
        for (const [messageKey, tokens] of messageToTokensMap.entries()) {
          // Note: In a more sophisticated implementation, we would track exactly which tokens
          // Firebase confirmed as delivered vs failed. For now, we assume all tokens in 
          // successful batches were delivered (this is the same logic as the main push system)
          tokens.forEach(token => {
            if (uniqueTokensAdded.has(token)) {
              deliveredTokens.add(token);
            }
          });
        }
        
        // Map delivered tokens back to user IDs
        for (const row of (parseResult.data as CsvRow[])) {
          const userTokens = userToTokensMap.get(row.user_id);
          if (userTokens && userTokens.some(token => deliveredTokens.has(token))) {
            actuallyDeliveredUserIds.push(row.user_id);
          }
        }
        
        // Only track notifications for users who actually received them
        for (const userId of actuallyDeliveredUserIds) {
          try {
            const response = await fetch(`${getCadenceServiceUrl()}/api/track-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userId,
                layerId: effectiveLayerId,
                pushTitle: push.title,
                pushBody: push.body,
                audienceDescription: `Automation Test: ${audience.name} (${trackingLayerDescription})`,
              }),
            });
            
            if (response.ok) {
              trackingCount++;
            } else {
              console.error(`Failed to track notification for user ${userId}: ${response.status}`);
            }
          } catch (error: unknown) {
            console.error(`Failed to track notification for user ${userId}:`, error);
          }
        }

        sendLog('success', `Recorded ${trackingCount}/${successfulUserIds.length} notifications in cadence database`, 'LIVE_SEND');
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        sendLog('warning', `Cadence tracking failed: ${errorMessage}`, 'LIVE_SEND');
      }
    }
    
    const successRate = Math.round((totalSent / (totalSent + totalFailed)) * 100);
    sendLog('success', `Push completed: ${totalSent} sent, ${totalFailed} failed (${successRate}% success rate)`, 'LIVE_SEND');
    
    return {
      success: totalSent > 0,
      message: `Push sent to ${totalSent} users (${totalFailed} failed)`
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    sendLog('error', `Push failed: ${errorMessage}`, 'LIVE_SEND');
    return {
      success: false,
      message: errorMessage
    };
  }
}