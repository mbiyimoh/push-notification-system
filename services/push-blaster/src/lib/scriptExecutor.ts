// Script Execution Engine
// Handles custom Python script execution for audience generation

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { automationLogger } from './automationLogger';

export interface ScriptConfig {
  scriptPath: string;
  scriptName: string;
  description: string;
  parameters?: Record<string, unknown>;
  outputFormat: 'csv' | 'json';
  estimatedRuntime: number; // seconds
}

export interface ScriptExecutionResult {
  success: boolean;
  error?: string;
  csvPath?: string;
  csvFiles?: string[];
  audienceSize?: number;
  executionTime?: number;
  stdout?: string;
  stderr?: string;
}

export interface ScriptAudience {
  name: string;
  description: string;
  isTestAudience?: boolean;
}

export interface AvailableScript {
  id: string;
  name: string;
  description: string;
  scriptPath: string;
  category: string;
  estimatedRuntime: number;
  lastModified: string;
  audiences: ScriptAudience[];
  requiresParameters?: string[];
}

// Known script audience configurations
const KNOWN_SCRIPT_AUDIENCES: Record<string, ScriptAudience[]> = {
  'generate_showcase_push_csvs': [
    { name: 'haves', description: 'Users who HAVE the focus shoe (OPEN_FOR_TRADE)' },
    { name: 'wants', description: 'Users who WANT the focus shoe (wishlist)' },
    { name: 'everybody_else', description: 'Users who do NOT have/want the focus shoe' }
  ],
  'generate_layer_2_push_csv': [
    { name: 'trending_main', description: 'Users who own #2-10 trending shoes' },
    { name: 'trending_top1', description: 'Users who own the #1 trending shoe' }
  ],
  'generate_layer_3_push_csvs': [
    { name: 'recent_offer_creators', description: 'Users who created offers recently' },
    { name: 'recent_closet_adders', description: 'Users who added shoes to closet recently' },
    { name: 'recent_wishlist_adders', description: 'Users who added shoes to wishlist recently' }
  ],
  'generate_new_user_nudges': [
    { name: 'new_stars', description: 'New users who are high-value prospects' },
    { name: 'new_prospects', description: 'New users with strong potential' },
    { name: 'no_shoe_added', description: 'New users who haven\'t added any shoes' },
    { name: 'no_offers_created', description: 'New users who haven\'t created any offers' },
    { name: 'profile_incomplete', description: 'New users with incomplete profiles' },
    { name: 'no_wishlist_items', description: 'New users who haven\'t added wishlist items' }
  ],
  'generate_new_user_waterfall': [
    { name: 'no_shoes_level_1', description: 'Level 1: Users who haven\'t added shoes to closet' },
    { name: 'no_bio_level_2', description: 'Level 2: Users who haven\'t updated their bio' },
    { name: 'no_offers_level_3', description: 'Level 3: Users who haven\'t created offers' },
    { name: 'no_wishlist_level_4', description: 'Level 4: Users who haven\'t added wishlist items' },
    { name: 'new_stars_level_5', description: 'Level 5: Users who completed all onboarding steps' }
  ]
};

export class ScriptExecutor {
  private logPrefix = '[ScriptExecutor]';
  private scriptsDirectory: string;
  private outputDirectory: string;

  constructor() {
    // Railway-compatible relative paths using process.cwd()
    const projectRoot = process.cwd();
    // Navigate up from apps/push-blaster to main-ai-apps, then to projects
    this.scriptsDirectory = path.join(projectRoot, '..', '..', 'projects', 'push-automation', 'audience-generation-scripts');
    this.outputDirectory = path.join(projectRoot, '.script-outputs');

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDirectory)) {
      fs.mkdirSync(this.outputDirectory, { recursive: true });
    }

    this.log('Script Executor initialized');
  }

  /**
   * Discover all available audience generation scripts
   */
  async discoverAvailableScripts(): Promise<AvailableScript[]> {
    try {
      this.log('Discovering available scripts...');
      
      if (!fs.existsSync(this.scriptsDirectory)) {
        this.logError('Scripts directory not found', new Error(`Directory does not exist: ${this.scriptsDirectory}`));
        return [];
      }

      const files = fs.readdirSync(this.scriptsDirectory);
      const scripts: AvailableScript[] = [];

      for (const file of files) {
        if (file.endsWith('.py')) {
          const scriptPath = path.join(this.scriptsDirectory, file);
          const stats = fs.statSync(scriptPath);
          
          // Parse script metadata from filename and content
          const metadata = await this.parseScriptMetadata(scriptPath, file);
          
          scripts.push({
            id: this.generateScriptId(file),
            name: metadata.name,
            description: metadata.description,
            scriptPath: scriptPath,
            category: metadata.category,
            estimatedRuntime: metadata.estimatedRuntime,
            lastModified: stats.mtime.toISOString(),
            audiences: metadata.audiences,
            requiresParameters: metadata.requiresParameters
          });
        }
      }

      this.log(`Discovered ${scripts.length} available scripts`);
      return scripts;

    } catch (error: unknown) {
      this.logError('Failed to discover scripts', error);
      return [];
    }
  }

  /**
   * Execute a Python script for audience generation
   */
  async executeScript(
    scriptId: string,
    parameters: Record<string, unknown> = {},
    executionId: string,
    isDryRun: boolean = false
  ): Promise<ScriptExecutionResult> {
    const startTime = Date.now();
    
    try {
      this.log(`Executing script: ${scriptId} with execution ID: ${executionId}`);
      console.log(`[EXECUTOR] Starting executeScript: ${scriptId}, executionId: ${executionId}`);
      
      // Find the script
      const availableScripts = await this.discoverAvailableScripts();
      const script = availableScripts.find(s => s.id === scriptId);
      
      if (!script) {
        throw new Error(`Script not found: ${scriptId}`);
      }

      // Prepare output file path
      const outputFileName = `${executionId}-${scriptId}-${Date.now()}.csv`;
      const outputPath = path.join(this.outputDirectory, outputFileName);

      // Ensure output directory exists
      if (!fs.existsSync(this.outputDirectory)) {
        fs.mkdirSync(this.outputDirectory, { recursive: true });
        console.log(`[DEBUG] Created output directory: ${this.outputDirectory}`);
      }

      // Set project root for Python path - FIXED: need to go up to main-ai-apps level
      const projectRoot = path.resolve(__dirname, '../../../..');

      // Prepare environment variables for the script
      const scriptEnv = {
        ...process.env,
        PYTHONPATH: projectRoot,  // CRITICAL: Required for basic_capabilities imports
        OUTPUT_PATH: outputPath,
        EXECUTION_ID: executionId,
        ...this.formatScriptParameters(parameters)
      };

      // Execute the Python script using debug runner
      console.log(`[SCRIPTEXECUTOR] About to call debug runner with executionId: ${executionId}`);
      console.log(`[SCRIPTEXECUTOR] Script path: ${script.scriptPath}`);
      console.log(`[SCRIPTEXECUTOR] Working directory: ${projectRoot}`);
      
      const { runPython } = await import('./debugPythonRunner');
      
      const args = [];
      if (isDryRun) {
        args.push('--dry_run');
        console.log(`[DEBUG] Adding --dry_run flag`);
      }
      
      console.log(`[SCRIPTEXECUTOR] Calling runPython with args: ${JSON.stringify(args)}`);
      
      const debugResult = await runPython({
        pythonPath: '/usr/local/bin/python3',
        scriptPath: script.scriptPath,
        args,
        env: scriptEnv,
        cwd: projectRoot,
        executionId
      });
      
      console.log(`[SCRIPTEXECUTOR] Debug result received:`, debugResult);
      
      const result = {
        success: debugResult.code === 0,
        stdout: debugResult.stdout,
        stderr: debugResult.stderr,
        error: debugResult.code !== 0 ? `Python script exited with code ${debugResult.code}` : undefined
      };
      
      if (!result.success) {
        throw new Error(`Script execution failed: ${result.error}`);
      }

      let csvFiles: string[] = [];
      let audienceSize = 0;
      
      if (isDryRun) {
        // For dry run, script doesn't generate files - parse audience size from stdout
        const match = result.stdout.match(/Prioritized to (\d+) unique users/);
        audienceSize = match ? parseInt(match[1]) : 0;
        console.log(`[DEBUG] Dry run completed with ${audienceSize} users`);
      } else {
        // For regular runs, check the generated_csvs directory for actual files
        const generatedCsvsDir = path.join(projectRoot, 'generated_csvs');
        
        if (!fs.existsSync(generatedCsvsDir)) {
          throw new Error(`Script did not create the expected generated_csvs directory: ${generatedCsvsDir}`);
        }

        // Find all non-TEST CSV files in the generated_csvs directory
        csvFiles = fs.readdirSync(generatedCsvsDir)
          .filter(file => file.endsWith('.csv') && !file.includes('_TEST_'))
          .map(file => path.join(generatedCsvsDir, file));

        if (csvFiles.length === 0) {
          throw new Error(`Script did not generate any CSV files in: ${generatedCsvsDir}`);
        }

        console.log(`[DEBUG] Found ${csvFiles.length} generated CSV files:`, csvFiles);

        // Count total audience size from all CSV files
        for (const csvFile of csvFiles) {
          const fileSize = await this.countCSVRows(csvFile);
          audienceSize += fileSize;
          console.log(`[DEBUG] ${path.basename(csvFile)}: ${fileSize} rows`);
        }
      }
      
      const executionTime = Date.now() - startTime;
      
      this.log(`Script execution completed: ${scriptId} generated ${audienceSize} rows in ${executionTime}ms`);

      // Log to automation logger - using logPerformance to track script execution metrics
      // Note: Using executionId as automationId for now - this should be improved to use actual automationId
      automationLogger.logPerformance(executionId, 'script_execution', `${scriptId} execution`, startTime, {
        scriptId,
        scriptPath: script.scriptPath,
        audienceSize,
        outputPath
      });

      return {
        success: true,
        csvPath: csvFiles.length > 0 ? csvFiles[0] : undefined, // Return the first CSV file for backward compatibility
        csvFiles: csvFiles,   // Return all CSV files (empty array for dry run)
        audienceSize,
        executionTime,
        stdout: result.stdout,
        stderr: result.stderr
      };

    } catch (error: unknown) {
      const executionTime = Date.now() - startTime;

      this.logError(`Script execution failed for ${scriptId}`, error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return {
        success: false,
        executionTime,
        error: errorMessage
      };
    }
  }

  /**
   * Private helper methods
   */
  private async parseScriptMetadata(scriptPath: string, fileName: string): Promise<{
    name: string;
    description: string;
    category: string;
    estimatedRuntime: number;
    audiences: ScriptAudience[];
    requiresParameters?: string[];
  }> {
    try {
      // Read first 20 lines of script to extract metadata from comments
      const content = fs.readFileSync(scriptPath, 'utf-8');
      const lines = content.split('\n').slice(0, 20);
      
      let description = 'Audience generation script';
      let category = 'general';
      let estimatedRuntime = 60; // default 1 minute
      
      // Look for metadata in comments
      for (const line of lines) {
        const cleanLine = line.trim();
        if (cleanLine.startsWith('#') || cleanLine.startsWith('"""') || cleanLine.startsWith("'''")) {
          if (cleanLine.toLowerCase().includes('description:')) {
            description = cleanLine.split(':')[1]?.trim() || description;
          }
          if (cleanLine.toLowerCase().includes('category:')) {
            category = cleanLine.split(':')[1]?.trim() || category;
          }
          if (cleanLine.toLowerCase().includes('runtime:')) {
            const runtime = cleanLine.split(':')[1]?.trim();
            if (runtime && !isNaN(Number(runtime))) {
              estimatedRuntime = Number(runtime);
            }
          }
        }
      }

      // Generate readable name from filename
      const name = fileName
        .replace('.py', '')
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Get audiences from known configurations
      const scriptId = this.generateScriptId(fileName);
      const audiences = KNOWN_SCRIPT_AUDIENCES[scriptId] || [
        { name: 'default', description: 'Generated audience' }
      ];

      // Detect if script requires parameters (look for --product_id, etc.)
      const requiresParameters: string[] = [];
      if (content.includes('--product_id')) {
        requiresParameters.push('product_id');
      }

      return { name, description, category, estimatedRuntime, audiences, requiresParameters };

    } catch (error) {
      // Fallback metadata
      const scriptId = this.generateScriptId(fileName);
      const audiences = KNOWN_SCRIPT_AUDIENCES[scriptId] || [
        { name: 'default', description: 'Generated audience' }
      ];
      
      return {
        name: fileName.replace('.py', '').replace(/_/g, ' '),
        description: 'Audience generation script',
        category: 'general',
        estimatedRuntime: 60,
        audiences,
        requiresParameters: []
      };
    }
  }

  private generateScriptId(fileName: string): string {
    return fileName.replace('.py', '').toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  private formatScriptParameters(parameters: Record<string, unknown>): Record<string, string> {
    const formatted: Record<string, string> = {};

    for (const [key, value] of Object.entries(parameters)) {
      const envKey = `PARAM_${key.toUpperCase()}`;
      formatted[envKey] = String(value);
    }

    return formatted;
  }

  private async countCSVRows(csvPath: string): Promise<number> {
    try {
      const content = fs.readFileSync(csvPath, 'utf-8');
      const lines = content.trim().split('\n');
      // Subtract 1 for header row
      return Math.max(0, lines.length - 1);
    } catch (error) {
      this.logError('Failed to count CSV rows', error);
      return 0;
    }
  }

  private log(message: string): void {
    console.log(`${this.logPrefix} ${message}`);
  }

  private logError(message: string, error: unknown): void {
    console.error(`${this.logPrefix} ${message}:`, error);
  }
}

// Export singleton instance
export const scriptExecutor = new ScriptExecutor();