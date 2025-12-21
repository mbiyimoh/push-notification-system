// Universal Automation Engine
// Core orchestrator for all automation types building on existing push-blaster patterns

import * as cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import {
  UniversalAutomation,
  ExecutionConfig,
  AutomationStatus,
  ExecutionPhase,
  AutomationPush,
  ExecutionResponse
} from '@/types/automation';
import pool from '@/lib/db';
import { emitExecutionLog, emitExecutionProgress } from '@/lib/executionEventEmitter';
import { generatorRegistry, GeneratorOptions } from '@/lib/generators';
import * as executionProgressDB from '@/lib/executionProgressDB';

// Feature flag for V1 (Python) vs V2 (TypeScript) audience generation
const AUTOMATION_ENGINE_VERSION = process.env.AUTOMATION_ENGINE_VERSION ?? 'v1';

interface ScheduledJob {
  automationId: string;
  cronJob: cron.ScheduledTask;
  executionConfig: ExecutionConfig;
}

export class AutomationEngine {
  private scheduledJobs: Map<string, ScheduledJob> = new Map();
  private activeExecutions: Map<string, {
    automationId: string;
    startTime: Date;
    currentPhase: string;
    abortController?: AbortController;
  }> = new Map();
  private logPrefix = '[AutomationEngine]';
  private instanceId: string = `engine-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  private lastRestorationAttempt: string | null = null;
  private lastRestorationSuccess: boolean = false;

  /**
   * Get the base URL for internal API calls.
   * Uses RAILWAY_STATIC_URL in production, localhost in development.
   */
  private getInternalApiBaseUrl(): string {
    return process.env.RAILWAY_STATIC_URL
      ? `https://${process.env.RAILWAY_STATIC_URL}`
      : `http://localhost:${process.env.PORT || 3001}`;
  }

  constructor() {
    this.log(`🚀 Automation Engine initialized - Instance ID: ${this.instanceId}`);

    // Process exit cleanup - destroy all cron jobs when server stops
    this.setupProcessCleanup();

    // Startup restoration with loud logging
    this.performStartupRestoration();
  }

  /**
   * Perform startup restoration with loud logging banners
   */
  private performStartupRestoration(): void {
    const startTime = Date.now();

    console.log('═'.repeat(80));
    console.log(`[STARTUP] AutomationEngine Restoration Starting`);
    console.log(`[STARTUP] Instance ID: ${this.instanceId}`);
    console.log(`[STARTUP] Timestamp: ${new Date().toISOString()}`);
    console.log('═'.repeat(80));

    try {
      // Restore active automations (existing method)
      this.restoreActiveAutomations();

      const duration = Date.now() - startTime;
      const scheduledCount = this.scheduledJobs.size;

      // Success banner
      console.log('═'.repeat(80));
      console.log(`[STARTUP] ✅ Restoration SUCCESS`);
      console.log(`[STARTUP] Scheduled Jobs: ${scheduledCount}`);
      console.log(`[STARTUP] Duration: ${duration}ms`);
      console.log(`[STARTUP] Jobs:`);

      this.scheduledJobs.forEach((jobInfo, automationId) => {
        console.log(`[STARTUP]   - Automation ${automationId.substring(0, 8)}...`);
      });

      console.log('═'.repeat(80));

      // Store restoration metadata
      this.lastRestorationAttempt = new Date().toISOString();
      this.lastRestorationSuccess = true;

    } catch (error) {
      const duration = Date.now() - startTime;

      // Failure banner
      console.error('═'.repeat(80));
      console.error(`[STARTUP] ❌ Restoration FAILED`);
      console.error(`[STARTUP] Duration: ${duration}ms`);
      console.error(`[STARTUP] Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error('═'.repeat(80));

      // Store restoration metadata
      this.lastRestorationAttempt = new Date().toISOString();
      this.lastRestorationSuccess = false;

      // Don't throw - allow service to start in degraded mode
    }
  }

  /**
   * Restore active automations from storage on startup
   */
  private async restoreActiveAutomations(): Promise<void> {
    try {
      this.log('🔄 Restoring active automations from storage...');
      
      // Import automationStorage dynamically to avoid circular dependencies
      const { automationStorage } = await import('@/lib/automationStorage');
      const automations = await automationStorage.listAutomations();
      
      // Filter for automations that should be scheduled
      const activeAutomations = automations.filter(automation => {
        // Type-safe validation - check for required properties without unsafe casting
        const isValidForScheduling = 
          automation && 
          automation.hasOwnProperty('isActive') && 
          automation.hasOwnProperty('status') &&
          typeof automation.isActive === 'boolean' && 
          typeof automation.status === 'string';

        if (!isValidForScheduling) {
          this.logError(`[Validation] Automation file ${automation.id} is missing required properties (isActive, status) for scheduling. Skipping.`, automation);
          return false;
        }
        
        return automation.isActive && (automation.status === 'active' || automation.status === 'scheduled');
      });
      
      this.log(`📋 Found ${activeAutomations.length} active automations to restore`);
      
      // Schedule each active automation
      for (const automation of activeAutomations) {
        try {
          await this.scheduleAutomation(automation);
          this.log(`✅ Restored automation: ${automation.name}`);
        } catch (error) {
          this.logError(`Failed to restore automation ${automation.name}`, error);
        }
      }
      
      this.log(`🎉 Restoration complete: ${activeAutomations.length} automations scheduled`);
      
    } catch (error) {
      this.logError('Failed to restore active automations', error);
    }
  }

  /**
   * Setup process cleanup to destroy all cron jobs when server stops
   * This prevents zombie cron jobs from surviving server restarts
   */
  private setupProcessCleanup(): void {
    // Handle various exit scenarios
    const cleanup = () => {
      if (this.scheduledJobs.size > 0) {
        this.log(`🧹 Process cleanup: Destroying ${this.scheduledJobs.size} cron jobs from instance ${this.instanceId}`);
        
        for (const [automationId, jobInfo] of this.scheduledJobs) {
          try {
            jobInfo.cronJob.stop();
            jobInfo.cronJob.destroy();
            this.log(`✅ Destroyed cron job for automation: ${automationId}`);
          } catch (error) {
            this.log(`⚠️ Error destroying cron job for ${automationId}: ${error}`);
          }
        }
        
        this.scheduledJobs.clear();
        this.log(`🧹 Process cleanup complete - All cron jobs destroyed`);
      }
    };

    // Handle graceful shutdown
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    
    // Handle development server restart (Next.js)
    process.on('exit', cleanup);
    
    // Handle uncaught exceptions (cleanup before crash)
    process.on('uncaughtException', (error) => {
      this.log(`🚨 Uncaught exception - cleaning up before exit: ${error.message}`);
      cleanup();
    });

    this.log(`🛡️ Process cleanup handlers registered for instance ${this.instanceId}`);
  }

  /**
   * SIMPLE restoration - just reschedule active automations
   * NO RECOVERY LOGIC - NO RACE CONDITIONS - JUST SCHEDULING
   */


  /**
   * Schedule an automation for execution
   * Builds on existing scheduling patterns from push-blaster
   */
  async scheduleAutomation(automation: UniversalAutomation): Promise<{ success: boolean; message: string }> {
    try {
      // EXECUTION-AWARE RESCHEDULING: Kill active execution first
      if (this.isExecutionActive(automation.id)) {
        const status = this.getExecutionStatus(automation.id);
        this.log(`🚨 Active execution detected (phase: ${status?.phase}) - terminating before rescheduling`);
        
        await this.terminateExecution(automation.id, 'Rescheduling with new time');
        this.log(`✅ Active execution terminated for rescheduling`);
      }

      // Cancel existing scheduled job if it exists (simple replace)
      if (this.scheduledJobs.has(automation.id)) {
        const existingJob = this.scheduledJobs.get(automation.id);
        if (existingJob) {
          existingJob.cronJob.stop();
          existingJob.cronJob.destroy();
          this.scheduledJobs.delete(automation.id);
          this.log(`✅ [${this.instanceId}] Cancelled existing cron job for automation: ${automation.id}`);
        }
      } else {
        this.log(`ℹ️  [${this.instanceId}] No existing cron job found for automation: ${automation.id} (scheduledJobs size: ${this.scheduledJobs.size})`);
      }

      // Validate automation
      if (!this.validateAutomation(automation)) {
        throw new Error('Invalid automation configuration');
      }

      // Convert schedule to cron expression
      const cronExpression = this.buildCronExpression(automation);
      this.log(`Building cron expression for automation ${automation.id}: ${cronExpression}`);
      
      // Create execution config
      const executionConfig: ExecutionConfig = {
        currentPhase: 'waiting',
        startTime: '',
        expectedEndTime: '',
        audienceGenerated: false,
        testsSent: false,
        cancellationDeadline: '',
        canCancel: true,
        emergencyStopRequested: false
      };

      // Schedule the cron job
      const cronJob = cron.schedule(cronExpression, async () => {
        // [CRON-FIRE] - Debug checkpoint 1: Cron callback triggered
        console.log(`[CRON-FIRE] ═══════════════════════════════════════════════════════════════`);
        console.log(`[CRON-FIRE] Cron triggered for automation: ${automation.id}`);
        console.log(`[CRON-FIRE] Automation name: ${automation.name}`);
        console.log(`[CRON-FIRE] Timestamp: ${new Date().toISOString()}`);
        console.log(`[CRON-FIRE] ═══════════════════════════════════════════════════════════════`);

        // Execution locking: prevent duplicate executions
        if (this.isExecutionActive(automation.id)) {
          console.log(`[CRON-SKIP] Execution already active for ${automation.id}, skipping this cron trigger`);
          return;
        }

        // Execute automation
        await this.executeAutomation(automation.id);
      }, {
        timezone: automation.schedule.timezone || 'America/Chicago'
      });

      // Store the scheduled job
      this.scheduledJobs.set(automation.id, {
        automationId: automation.id,
        cronJob,
        executionConfig
      });
      
      this.log(`✅ [${this.instanceId}] Automation scheduled successfully: ${automation.name} (${automation.id})`);
      this.log(`⏰ [${this.instanceId}] Next execution: ${cronExpression} (${this.formatTime(new Date())})`);
      this.log(`📊 [${this.instanceId}] Total scheduled jobs: ${this.scheduledJobs.size}`);

      // Start the job
      cronJob.start();

      this.log(`🚀 [${this.instanceId}] Cron job started for automation: ${automation.id}`);
      
      return {
        success: true,
        message: `Automation "${automation.name}" scheduled successfully`
      };

    } catch (error: unknown) {
      this.logError('Failed to schedule automation', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to schedule automation: ${errorMessage}`
      };
    }
  }

  /**
   * Execute automation timeline (30-minute lead time process)
   */
  private async executeAutomation(automationId: string, providedExecutionId?: string): Promise<void> {
    const startTime = new Date();
    let executionRecordId = '';
    // Use provided execution ID or generate a new one
    const executionId = providedExecutionId || uuidv4();

    // [EXEC-START] - Debug checkpoint 2: Execution entry point
    console.log(`[EXEC-START] ═══════════════════════════════════════════════════════════════`);
    console.log(`[EXEC-START] Starting execution for automation: ${automationId}`);
    console.log(`[EXEC-START] Execution ID: ${executionId}`);
    console.log(`[EXEC-START] Start time: ${startTime.toISOString()}`);
    console.log(`[EXEC-START] Instance ID: ${this.instanceId}`);
    console.log(`[EXEC-START] ═══════════════════════════════════════════════════════════════`);

    // Emit progress event for UI (SSE - legacy, kept for backwards compatibility)
    emitExecutionProgress(automationId, executionId, 'starting', 'init', 'Starting execution...');
    emitExecutionLog(automationId, executionId, 'init', `Execution started at ${startTime.toISOString()}`, 'info');

    try {
      this.log(`Starting execution timeline for automation: ${automationId}`);

      // Load automation data
      console.log(`[EXEC-START] Loading automation from storage...`);
      const automation = await this.loadAutomation(automationId);
      if (!automation) {
        console.log(`[EXEC-START] ❌ FAILED: Automation ${automationId} not found in storage`);
        throw new Error(`Automation ${automationId} not found`);
      }
      console.log(`[EXEC-START] ✅ Automation loaded: ${automation.name}`);
      console.log(`[EXEC-START] Test mode: ${automation.audienceCriteria?.testMode ?? false}`);
      console.log(`[EXEC-START] Push count: ${automation.pushSequence.length}`);

      // Start tracking in polling database (for reliable long-running execution monitoring)
      await executionProgressDB.startExecution(executionId, automationId, automation.name, this.instanceId);
      await executionProgressDB.appendLog(executionId, automationId, 'info', 'init', `Execution started at ${startTime.toISOString()}`);
      await executionProgressDB.appendLog(executionId, automationId, 'success', 'init', `Loaded automation: ${automation.name}`);
      await executionProgressDB.appendLog(executionId, automationId, 'info', 'init', `Test mode: ${automation.audienceCriteria?.testMode ?? false}, Push count: ${automation.pushSequence.length}`);

      emitExecutionLog(automationId, executionId, 'init', `Loaded automation: ${automation.name}`, 'success');
      emitExecutionLog(automationId, executionId, 'init', `Test mode: ${automation.audienceCriteria?.testMode ?? false}, Push count: ${automation.pushSequence.length}`, 'info');

      // Track execution start in main database (for historical records)
      console.log(`[EXEC-START] Starting database tracking...`);
      executionRecordId = await this.trackExecutionStart(
        automation.id,
        automation.name,
        this.instanceId
      );
      console.log(`[EXEC-START] Database tracking started: ${executionRecordId || '(no record ID)'}`);


      // Track active execution in memory
      const abortController = new AbortController();
      this.activeExecutions.set(automationId, {
        automationId,
        startTime,
        currentPhase: 'starting',
        abortController
      });

      // Initialize execution config
      const executionConfig: ExecutionConfig = {
        currentPhase: 'audience_generation',
        startTime: startTime.toISOString(),
        expectedEndTime: this.calculateExpectedEndTime(automation),
        audienceGenerated: false,
        testsSent: false,
        cancellationDeadline: this.calculateCancellationDeadline(automation),
        canCancel: true,
        emergencyStopRequested: false
      };

      // Initialize metrics tracking
      const metrics = {
        audienceSize: 0,
        pushesSent: 0,
        pushesFailed: 0,
        errorMessage: undefined as string | undefined,
        errorStack: undefined as string | undefined
      };

      try {
        // Execute the timeline (with abort signal)
        await this.executeTimeline(automation, executionConfig, abortController.signal, executionRecordId, executionId);

        // Track successful completion in both databases
        await this.trackExecutionComplete(executionRecordId, 'completed', metrics, startTime);
        await executionProgressDB.completeExecution(executionId, 'completed', 'complete', 'Automation completed successfully');

        this.log(`Completed execution for automation: ${automationId}`);
      } catch (error: unknown) {
        // Track failure with error details
        metrics.errorMessage = error instanceof Error ? error.message : String(error);
        metrics.errorStack = error instanceof Error ? error.stack : undefined;
        await this.trackExecutionComplete(executionRecordId, 'failed', metrics, startTime);
        await executionProgressDB.completeExecution(executionId, 'failed', 'error', metrics.errorMessage);

        // Emit failure events to SSE stream
        const errorMsg = error instanceof Error ? error.message : String(error);
        emitExecutionLog(automationId, executionId, 'error', `Execution failed: ${errorMsg}`, 'error');
        emitExecutionProgress(automationId, executionId, 'failed', 'error', `Execution failed: ${errorMsg}`);
        await executionProgressDB.appendLog(executionId, automationId, 'error', 'error', `Execution failed: ${errorMsg}`);

        throw error; // Re-throw to be caught by outer catch
      } finally {
        // Always remove from active executions when done
        this.activeExecutions.delete(automationId);
      }

    } catch (error: unknown) {
      this.logError(`Automation execution failed for ${automationId}`, error);
      // No complex failure handling - just log and continue
    }
  }

  /**
   * Execute the automation timeline phases
   */
  private async executeTimeline(
    automation: UniversalAutomation,
    executionConfig: ExecutionConfig,
    abortSignal: AbortSignal | undefined,
    executionRecordId: string,
    executionId: string
  ): Promise<void> {
    const startTime = new Date();

    // [TIMELINE] - Debug checkpoint: Timeline execution start
    console.log(`[TIMELINE] ═══════════════════════════════════════════════════════════════`);
    console.log(`[TIMELINE] TIMELINE START: Automation ${automation.id}`);
    console.log(`[TIMELINE] Automation name: ${automation.name}`);
    console.log(`[TIMELINE] Send scheduled for: ${automation.schedule.executionTime} (${automation.schedule.timezone})`);
    console.log(`[TIMELINE] Lead time: ${automation.schedule.leadTimeMinutes || 30} minutes`);
    console.log(`[TIMELINE] Push count: ${automation.pushSequence.length}`);
    console.log(`[TIMELINE] Test mode: ${automation.audienceCriteria?.testMode ?? false}`);
    console.log(`[TIMELINE] dryRunFirst: ${automation.settings.dryRunFirst}`);
    console.log(`[TIMELINE] ═══════════════════════════════════════════════════════════════`);

    this.log(`🚀 TIMELINE START: Automation ${automation.id} execution pipeline beginning`);
    this.log(`📅 Send scheduled for: ${automation.schedule.executionTime} (${automation.schedule.timezone})`);
    this.log(`⏱️  Lead time: ${automation.schedule.leadTimeMinutes || 30} minutes`);

    try {
      // Phase 1: Audience Generation (T-30 minutes)
      console.log(`[TIMELINE] === PHASE 1: AUDIENCE GENERATION ===`);
      console.log(`[TIMELINE] Phase 1 entry at ${new Date().toISOString()}`);
      emitExecutionProgress(automation.id, executionId, 'running', 'audience_generation', 'Generating audience...', { current: 1, total: 5 });
      emitExecutionLog(automation.id, executionId, 'audience_generation', 'Starting audience generation phase', 'info');
      await executionProgressDB.updateProgress(executionId, 'running', 'audience_generation', 'Generating audience...', { current: 1, total: 5 });
      await executionProgressDB.appendLog(executionId, automation.id, 'info', 'audience_generation', 'Starting audience generation phase');
      await this.trackExecutionPhase(executionRecordId, 'audience_generation');
      this.updateExecutionPhase(automation.id, 'audience_generation');
      this.checkAbortSignal(abortSignal, automation.id);
      console.log(`[TIMELINE] Calling generatePushAudience() for ${automation.pushSequence.length} pushes`);
      emitExecutionLog(automation.id, executionId, 'audience_generation', `Generating audience for ${automation.pushSequence.length} push(es)`, 'info');
      await executionProgressDB.appendLog(executionId, automation.id, 'info', 'audience_generation', `Generating audience for ${automation.pushSequence.length} push(es)`);
      this.log(`📊 PHASE 1: Starting audience generation phase`);
      await this.executeAudienceGeneration(automation, executionConfig);
      console.log(`[TIMELINE] Phase 1 complete at ${new Date().toISOString()}`);
      emitExecutionLog(automation.id, executionId, 'audience_generation', 'Audience generation completed successfully', 'success');
      await executionProgressDB.appendLog(executionId, automation.id, 'success', 'audience_generation', 'Audience generation completed successfully');
      this.log(`✅ PHASE 1: Audience generation completed successfully`);

      // Phase 2: Test Push Sending (T-25 minutes)
      console.log(`[TIMELINE] === PHASE 2: TEST SENDING ===`);
      console.log(`[TIMELINE] Phase 2 entry at ${new Date().toISOString()}`);
      console.log(`[TIMELINE] dryRunFirst: ${automation.settings.dryRunFirst}`);
      emitExecutionProgress(automation.id, executionId, 'running', 'test_sending', 'Sending test push...', { current: 2, total: 5 });
      emitExecutionLog(automation.id, executionId, 'test_sending', `Starting test push phase (dryRunFirst: ${automation.settings.dryRunFirst})`, 'info');
      await executionProgressDB.updateProgress(executionId, 'running', 'test_sending', 'Sending test push...', { current: 2, total: 5 });
      await executionProgressDB.appendLog(executionId, automation.id, 'info', 'test_sending', `Starting test push phase (dryRunFirst: ${automation.settings.dryRunFirst})`);
      await this.trackExecutionPhase(executionRecordId, 'test_sending');
      this.updateExecutionPhase(automation.id, 'test_sending');
      this.checkAbortSignal(abortSignal, automation.id);
      this.log(`🧪 PHASE 2: Starting test push sending phase`);
      await this.executeTestSending(automation, executionConfig);
      console.log(`[TIMELINE] Phase 2 complete at ${new Date().toISOString()}`);
      emitExecutionLog(automation.id, executionId, 'test_sending', 'Test push completed', 'success');
      await executionProgressDB.appendLog(executionId, automation.id, 'success', 'test_sending', 'Test push completed');
      this.log(`✅ PHASE 2: Test push sending completed successfully`);

      // Phase 3: Cancellation Window (T-25 to T-0)
      console.log(`[TIMELINE] === PHASE 3: CANCELLATION WINDOW ===`);
      console.log(`[TIMELINE] Phase 3 entry at ${new Date().toISOString()}`);
      console.log(`[TIMELINE] Window duration: ${this.getCancellationWindowMinutes(automation)} minutes`);
      console.log(`[TIMELINE] Deadline: ${executionConfig.cancellationDeadline}`);
      emitExecutionProgress(automation.id, executionId, 'running', 'cancellation_window', 'Cancellation window active...', { current: 3, total: 5 });
      emitExecutionLog(automation.id, executionId, 'cancellation_window', `Cancellation window: ${this.getCancellationWindowMinutes(automation)} minutes`, 'info');
      await executionProgressDB.updateProgress(executionId, 'running', 'cancellation_window', `Cancellation window: ${this.getCancellationWindowMinutes(automation)} minutes`, { current: 3, total: 5 });
      await executionProgressDB.appendLog(executionId, automation.id, 'info', 'cancellation_window', `Cancellation window: ${this.getCancellationWindowMinutes(automation)} minutes`);
      await this.trackExecutionPhase(executionRecordId, 'cancellation_window');
      this.updateExecutionPhase(automation.id, 'cancellation_window');
      this.checkAbortSignal(abortSignal, automation.id);
      this.log(`⏳ PHASE 3: Starting cancellation window (until ${this.formatTime(new Date(executionConfig.cancellationDeadline))})`);
      await this.executeCancellationWindow(automation, executionConfig);
      console.log(`[TIMELINE] Phase 3 complete - proceeding to live at ${new Date().toISOString()}`);
      emitExecutionLog(automation.id, executionId, 'cancellation_window', 'Cancellation window closed - proceeding to live send', 'success');
      await executionProgressDB.appendLog(executionId, automation.id, 'success', 'cancellation_window', 'Cancellation window closed - proceeding to live send');
      this.log(`✅ PHASE 3: Cancellation window completed - proceeding to live execution`);

      // Phase 4: Live Execution (T-0)
      console.log(`[TIMELINE] === PHASE 4: LIVE EXECUTION ===`);
      console.log(`[TIMELINE] Phase 4 entry at ${new Date().toISOString()}`);
      const isTestMode = this.isTestMode(automation);
      const mode = isTestMode ? 'real-dry-run' : 'live-send';
      console.log(`[TIMELINE] Mode: ${mode} (test mode: ${isTestMode})`);
      emitExecutionProgress(automation.id, executionId, 'running', 'live_execution', 'Sending push notifications...', { current: 4, total: 5 });
      emitExecutionLog(automation.id, executionId, 'live_execution', `Starting live execution (mode: ${mode})`, 'info');
      await executionProgressDB.updateProgress(executionId, 'running', 'live_execution', 'Sending push notifications...', { current: 4, total: 5 });
      await executionProgressDB.appendLog(executionId, automation.id, 'info', 'live_execution', `Starting live execution (mode: ${mode})`);
      await this.trackExecutionPhase(executionRecordId, 'live_execution');
      this.updateExecutionPhase(automation.id, 'live_execution');
      this.checkAbortSignal(abortSignal, automation.id);
      this.log(`🔴 PHASE 4: Starting live execution phase`);
      await this.executeLiveSending(automation, executionConfig);
      console.log(`[TIMELINE] Phase 4 complete at ${new Date().toISOString()}`);
      emitExecutionLog(automation.id, executionId, 'live_execution', 'Live execution completed successfully', 'success');
      await executionProgressDB.appendLog(executionId, automation.id, 'success', 'live_execution', 'Live execution completed successfully');
      this.log(`✅ PHASE 4: Live execution completed successfully`);

      // Phase 5: Cleanup (for test automations)
      console.log(`[TIMELINE] === PHASE 5: CLEANUP ===`);
      console.log(`[TIMELINE] Phase 5 entry at ${new Date().toISOString()}`);
      emitExecutionProgress(automation.id, executionId, 'running', 'cleanup', 'Running cleanup...', { current: 5, total: 5 });
      emitExecutionLog(automation.id, executionId, 'cleanup', 'Starting cleanup phase', 'info');
      await executionProgressDB.updateProgress(executionId, 'running', 'cleanup', 'Running cleanup...', { current: 5, total: 5 });
      await executionProgressDB.appendLog(executionId, automation.id, 'info', 'cleanup', 'Starting cleanup phase');
      await this.trackExecutionPhase(executionRecordId, 'cleanup');
      this.updateExecutionPhase(automation.id, 'cleanup');
      this.checkAbortSignal(abortSignal, automation.id);
      this.log(`🧹 PHASE 5: Starting cleanup phase`);
      await this.executeCleanup(automation, executionConfig);
      console.log(`[TIMELINE] Phase 5 complete at ${new Date().toISOString()}`);
      emitExecutionLog(automation.id, executionId, 'cleanup', 'Cleanup completed successfully', 'success');
      await executionProgressDB.appendLog(executionId, automation.id, 'success', 'cleanup', 'Cleanup completed successfully');
      this.log(`✅ PHASE 5: Cleanup completed successfully`);

      const totalDuration = Date.now() - startTime.getTime();
      this.log(`🎉 TIMELINE COMPLETE: Total execution time ${Math.round(totalDuration / 1000)}s`);

      // Emit completion events
      emitExecutionLog(automation.id, executionId, 'complete', `Execution completed in ${Math.round(totalDuration / 1000)}s`, 'success');
      emitExecutionProgress(automation.id, executionId, 'completed', 'complete', 'Automation completed successfully');
      await executionProgressDB.appendLog(executionId, automation.id, 'success', 'complete', `Execution completed in ${Math.round(totalDuration / 1000)}s`);

    } catch (error: unknown) {
      const totalDuration = Date.now() - startTime.getTime();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logError(`❌ TIMELINE FAILED: After ${Math.round(totalDuration / 1000)}s - ${errorMessage}`, error);

      // Emit failure events
      emitExecutionLog(automation.id, executionId, 'error', `Execution failed: ${errorMessage}`, 'error');
      emitExecutionProgress(automation.id, executionId, 'failed', 'error', errorMessage);
      await executionProgressDB.appendLog(executionId, automation.id, 'error', 'error', `Execution failed: ${errorMessage}`);

      throw error;
    }
  }

  /**
   * Helper methods for execution tracking and termination
   */
  private updateExecutionPhase(automationId: string, phase: string): void {
    const execution = this.activeExecutions.get(automationId);
    if (execution) {
      execution.currentPhase = phase;
    }
  }

  private checkAbortSignal(abortSignal: AbortSignal | undefined, automationId: string): void {
    if (abortSignal?.aborted) {
      this.log(`🛑 Execution aborted for automation: ${automationId}`);
      throw new Error(`Execution aborted for automation: ${automationId}`);
    }
  }

  /**
   * Check if automation is currently executing
   */
  public isExecutionActive(automationId: string): boolean {
    return this.activeExecutions.has(automationId);
  }

  /**
   * Get current execution status
   */
  public getExecutionStatus(automationId: string): { 
    phase: string; 
    startTime: Date;
    canCancel: boolean;
    cancellationDeadline: string | null;
  } | null {
    const execution = this.activeExecutions.get(automationId);
    if (!execution) return null;

    // Find the corresponding scheduled job to get the execution config
    const job = this.scheduledJobs.get(automationId);
    
    return {
      phase: execution.currentPhase,
      startTime: execution.startTime,
      canCancel: job?.executionConfig.canCancel ?? false,
      cancellationDeadline: job?.executionConfig.cancellationDeadline ?? null
    };
  }

  /**
   * Terminate active execution for an automation
   */
  public async terminateExecution(automationId: string, reason: string = 'Manual termination'): Promise<boolean> {
    const execution = this.activeExecutions.get(automationId);
    if (!execution) {
      this.log(`No active execution found for automation: ${automationId}`);
      return false;
    }

    this.log(`🛑 Terminating execution for automation: ${automationId} - ${reason}`);
    
    // Abort the execution
    if (execution.abortController) {
      execution.abortController.abort();
    }
    
    // Remove from active executions
    this.activeExecutions.delete(automationId);
    
    this.log(`✅ Execution terminated for automation: ${automationId}`);
    return true;
  }

  /**
   * Generate audiences for all pushes in sequence
   */
  private async executeAudienceGeneration(automation: UniversalAutomation, executionConfig: ExecutionConfig): Promise<void> {
    this.log(`Generating audiences for automation: ${automation.id}`);
    executionConfig.currentPhase = 'audience_generation';

    try {
      // For sequences, generate audience for each push
      for (const push of automation.pushSequence) {
        await this.generatePushAudience(automation, push);
      }

      executionConfig.audienceGenerated = true;
      this.log(`Audience generation completed for automation: ${automation.id}`);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      // Emit error to SSE stream before throwing
      emitExecutionLog(automation.id, automation.id, 'audience_generation', `Audience generation failed: ${errorMessage}`, 'error');
      throw new Error(`Audience generation failed: ${errorMessage}`);
    }
  }

  /**
   * Send test pushes to configured test users
   * 
   * CRITICAL FIX: Call test API only ONCE for entire automation sequence
   * Previously: Loop through each push → call test API 3x → API processes full sequence each time = 9 total
   * Now: Call test API once → API processes full sequence once = 3 total (correct)
   */
  private async executeTestSending(automation: UniversalAutomation, executionConfig: ExecutionConfig): Promise<void> {
    this.log(`Sending test pushes for automation: ${automation.id}`);
    executionConfig.currentPhase = 'test_sending';

    try {
      if (automation.settings.dryRunFirst) {
        this.log(`🧪 Executing test send for entire sequence (${automation.pushSequence.length} pushes)`);
        
        // FIXED: Call test API only ONCE for the entire automation (not per push)
        await this.sendTestPushSequence(automation);
        
        this.log(`✅ Test sequence completed: ${automation.pushSequence.length} pushes sent to test audience`);
      }

      executionConfig.testsSent = true;
      this.log(`Test sending completed for automation: ${automation.id}`);
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Test sending failed: ${errorMessage}`);
    }
  }

  /**
   * Monitor for cancellation requests during window
   */
  private async executeCancellationWindow(automation: UniversalAutomation, executionConfig: ExecutionConfig): Promise<void> {
    executionConfig.currentPhase = 'cancellation_window';
    
    const cancellationDeadline = new Date(executionConfig.cancellationDeadline);
    const checkInterval = 30000; // Check every 30 seconds
    const totalWindowMinutes = this.getCancellationWindowMinutes(automation);
    
    this.log(`⏰ Cancellation window: ${totalWindowMinutes} minutes remaining until live send`);
    this.log(`🛑 Emergency stop available until: ${this.formatTime(cancellationDeadline)}`);

    return new Promise((resolve, reject) => {
      const monitor = setInterval(() => {
        const now = new Date();
        const remainingMinutes = Math.max(0, Math.ceil((cancellationDeadline.getTime() - now.getTime()) / 60000));
        
        // Log countdown every 5 minutes and final minute
        if (remainingMinutes % 5 === 0 || remainingMinutes <= 1) {
          this.log(`⏳ Cancellation window: ${remainingMinutes} minutes remaining`);
        }
        
        // Check for emergency stop
        if (executionConfig.emergencyStopRequested) {
          clearInterval(monitor);
          this.log(`🚨 Emergency stop requested during cancellation window`);
          reject(new Error('Emergency stop requested'));
          return;
        }
        
        // Check if cancellation window has expired
        if (now >= cancellationDeadline) {
          clearInterval(monitor);
          executionConfig.canCancel = false;
          this.log(`🔒 Cancellation window closed - proceeding to live execution`);
          resolve();
          return;
        }
      }, checkInterval);
    });
  }

  /**
   * Execute live push sending using the PROVEN test-automation API
   *
   * CRITICAL CHANGE: Instead of custom sendLivePush loop, use the same proven API
   * that test pushes use. This ensures identical processing logic and eliminates
   * the architectural divergence that was causing live send failures.
   *
   * NEW: Test Mode Support
   * - Test mode: Executes "real-dry-run" (real audiences but no actual sends)
   * - Real mode: Executes "live-send" (real audiences with actual push delivery)
   *
   * CRITICAL FIX: The test-automation API returns an SSE stream. We MUST read the
   * stream to completion to wait for the actual push sends to finish. Just checking
   * response.ok only confirms the SSE connection was established, not that sends completed.
   */
  private async executeLiveSending(automation: UniversalAutomation, executionConfig: ExecutionConfig): Promise<void> {
    const isTestMode = this.isTestMode(automation);
    const mode = isTestMode ? 'real-dry-run' : 'live-send';
    const operation = isTestMode ? 'real audiences dry run' : 'live send';

    // [PHASE-4] - Debug checkpoint: Live execution details
    console.log(`[PHASE-4] ═══════════════════════════════════════════════════════════════`);
    console.log(`[PHASE-4] Starting ${operation} for automation: ${automation.id}`);
    console.log(`[PHASE-4] Mode: ${mode}`);
    console.log(`[PHASE-4] Is test mode: ${isTestMode}`);
    console.log(`[PHASE-4] Push count: ${automation.pushSequence.length}`);
    console.log(`[PHASE-4] ═══════════════════════════════════════════════════════════════`);

    this.log(`🚀 Starting ${operation} for automation: ${automation.id}`);
    this.log(`📬 Using proven test-automation API with '${mode}' mode`);
    this.log(`📬 Sequence: ${automation.pushSequence.length} pushes to ${isTestMode ? 'validate' : 'send'}`);
    executionConfig.currentPhase = 'live_execution';

    try {
      // Use centralized URL helper for Railway/localhost compatibility
      const baseUrl = this.getInternalApiBaseUrl();
      const apiUrl = `${baseUrl}/api/automation/test/${automation.id}?mode=${mode}`;

      console.log(`[PHASE-4] Base URL: ${baseUrl}`);
      console.log(`[PHASE-4] RAILWAY_STATIC_URL: ${process.env.RAILWAY_STATIC_URL || '(not set)'}`);
      console.log(`[PHASE-4] PORT: ${process.env.PORT || '(not set, using 3001)'}`);
      console.log(`[PHASE-4] Full API URL: ${apiUrl}`);
      console.log(`[PHASE-4] API call initiated at ${new Date().toISOString()}`);

      // Use the SAME proven API that test pushes use, but with appropriate mode
      // Test mode: real-dry-run validates real audiences without sending
      // Real mode: live-send processes real audiences with actual delivery
      this.log(`🔗 Calling unified test-automation API for ${operation}`);
      this.log(`🔗 API URL: ${apiUrl}`);

      // CRITICAL: Request SSE stream with correct Accept header
      // Use retry logic for transient network failures
      const response = await this.fetchWithRetry(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' }
      });

      console.log(`[PHASE-4] API response received at ${new Date().toISOString()}`);
      console.log(`[PHASE-4] Response status: ${response.status}`);
      console.log(`[PHASE-4] Response ok: ${response.ok}`);

      if (!response.ok) {
        console.log(`[PHASE-4] ❌ API call FAILED: ${response.status} ${response.statusText}`);
        throw new Error(`${operation} API failed: ${response.status} ${response.statusText}`);
      }

      // CRITICAL FIX: Read the SSE stream to wait for actual push completion
      // Use longer timeout for live sends (10 minutes) since real audiences can be large
      const timeoutMs = 600000; // 10 minutes for live sends
      console.log(`[PHASE-4] Reading SSE stream (timeout: ${timeoutMs / 1000}s)...`);

      const result = await this.readSSEStream(response, automation.id, timeoutMs);

      if (result.success) {
        console.log(`[PHASE-4] ✅ ${operation} completed successfully: ${result.message}`);
        this.log(`✅ ${operation} completed successfully: ${result.message}`);
      } else {
        console.log(`[PHASE-4] ❌ ${operation} failed: ${result.message}`);
        throw new Error(`${operation} failed: ${result.message}`);
      }

      executionConfig.currentPhase = 'completed';
      this.log(`🎉 ${operation} completed successfully for automation: ${automation.id}`);
      this.log(`📊 All pushes processed through unified test-automation pipeline`);

    } catch (error: unknown) {
      console.log(`[PHASE-4] ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
      this.logError(`❌ ${operation} failed for automation ${automation.id}`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`${operation} failed: ${errorMessage}`);
    }
  }

  /**
   * Determine if automation is in test mode
   */


  /**
   * Build cron expression from automation schedule
   * 
   * CRITICAL TIMING LOGIC (FIXED - eliminates double subtraction):
   * - schedule.executionTime = SEND TIME from UI (when user wants pushes delivered)  
   * - schedule.leadTimeMinutes = automation start offset (30 for real, 3 for test mode)
   * - AUTOMATION START TIME = executionTime - leadTimeMinutes
   * - This eliminates the double subtraction bug by using leadTimeMinutes consistently
   * - executionTime should now store the UI send time directly (no subtraction at save time)
   */
  private buildCronExpression(automation: UniversalAutomation): string {
    const schedule = automation.schedule;
    
    if (schedule.cronExpression) {
      return schedule.cronExpression;
    }

    // Parse the SEND TIME from executionTime field (HH:MM) 
    const [sendHours, sendMinutes] = schedule.executionTime.split(':').map(Number);
    
    // Calculate AUTOMATION START TIME using mode-appropriate lead time
    const isTestMode = this.isTestMode(automation);
    const leadTime = this.getLeadTimeMinutes(automation);
    const totalMinutesFromMidnight = (sendHours * 60) + sendMinutes;
    const executionMinutesFromMidnight = totalMinutesFromMidnight - leadTime;
    
    // Handle day rollover if execution time goes negative (e.g., 12:15 AM send - 30 min = 11:45 PM previous day)
    let actualExecutionMinutes = executionMinutesFromMidnight;
    if (actualExecutionMinutes < 0) {
      actualExecutionMinutes += 24 * 60; // Add 24 hours worth of minutes
      // Note: For daily automation, this means it will run the previous day
      // For one-time automation, we'd need special handling
    }
    
    const executionHours = Math.floor(actualExecutionMinutes / 60);
    const executionMinutes = actualExecutionMinutes % 60;
    
    this.log(`Schedule calculation: Send time ${schedule.executionTime} - ${leadTime}min lead (${isTestMode ? 'TEST' : 'REAL'} mode) = Automation starts at ${executionHours.toString().padStart(2, '0')}:${executionMinutes.toString().padStart(2, '0')}`);

    switch (schedule.frequency) {
      case 'once':
        // For one-time execution, we'll use the start date with calculated execution time
        // Parse the date in the automation's timezone to avoid UTC conversion issues
        const startDate = new Date(`${schedule.startDate}T${schedule.executionTime}`);
        const day = startDate.getDate();
        const month = startDate.getMonth() + 1;
        this.log(`One-time schedule: ${schedule.startDate} ${schedule.executionTime} (send) -> execution cron: ${executionMinutes} ${executionHours} ${day} ${month} *`);
        return `${executionMinutes} ${executionHours} ${day} ${month} *`;
      
      case 'daily':
        return `${executionMinutes} ${executionHours} * * *`;
      
      case 'weekly':
        // Default to Monday (1), can be extended for specific days
        return `${executionMinutes} ${executionHours} * * 1`;
      
      case 'monthly':
        // Default to 1st of month, can be extended
        return `${executionMinutes} ${executionHours} 1 * *`;
      
      default:
        throw new Error(`Unsupported schedule frequency: ${schedule.frequency}`);
    }
  }

  /**
   * Manual trigger for testing - reschedule an existing automation
   */
  async rescheduleAutomation(automationId: string): Promise<{ success: boolean; message: string }> {
    try {
      const { automationStorage } = await import('./automationStorage');
      const automation = await automationStorage.loadAutomation(automationId);
      
      if (!automation) {
        return { success: false, message: 'Automation not found' };
      }
      
      // Cancel existing job if it exists
      const existingJob = this.scheduledJobs.get(automationId);
      if (existingJob) {
        existingJob.cronJob.stop();
        existingJob.cronJob.destroy();
        this.scheduledJobs.delete(automationId);
        this.log(`Cancelled existing job for automation: ${automationId}`);
      }
      
      // Reschedule
      return await this.scheduleAutomation(automation);
      
    } catch (error: unknown) {
      this.logError('Failed to reschedule automation', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, message: `Failed to reschedule: ${errorMessage}` };
    }
  }

  /**
   * Cleanup after automation execution
   */
  private async executeCleanup(automation: UniversalAutomation, executionConfig: ExecutionConfig): Promise<void> {
    this.log(`🧹 Executing cleanup for automation: ${automation.id}`);
    
    try {
      // Simple cleanup - no complex state tracking
      
      // For test automations, clean up the scheduled job and delete the automation file
      const settingsWithTest = automation.settings as unknown as { isTest?: boolean };
      if (settingsWithTest?.isTest || automation.name?.includes('TEST SCHEDULED:')) {
        this.log(`Cleaning up test automation: ${automation.id}`);
        
        // Remove from scheduled jobs
        if (this.scheduledJobs.has(automation.id)) {
          const jobInfo = this.scheduledJobs.get(automation.id);
          if (jobInfo) {
            jobInfo.cronJob.stop();
            jobInfo.cronJob.destroy();
          }
          this.scheduledJobs.delete(automation.id);
        }
        
        // Delete the automation file
        try {
          const { automationStorage } = await import('./automationStorage');
          await automationStorage.deleteAutomation(automation.id);
          this.log(`Deleted test automation file: ${automation.id}`);
        } catch (error: unknown) {
          this.logError(`Failed to delete test automation file ${automation.id}`, error);
        }
      }
      
      executionConfig.currentPhase = 'completed';
      this.log(`Cleanup completed for automation: ${automation.id}`);
      
    } catch (error: unknown) {
      this.logError(`Cleanup failed for automation ${automation.id}`, error);
    }
  }

  /**
   * Validation methods
   */
  private validateAutomation(automation: UniversalAutomation): boolean {
    if (!automation.id || !automation.name) return false;
    if (!automation.schedule.executionTime) return false;
    if (automation.pushSequence.length === 0) return false;
    return true;
  }

  /**
   * Utility methods for timeline calculation
   */
  private calculateExpectedEndTime(automation: UniversalAutomation): string {
    const startTime = new Date();
    const totalDuration = 30 + automation.settings.cancellationWindowMinutes; // Lead time + cancellation window
    return new Date(startTime.getTime() + totalDuration * 60 * 1000).toISOString();
  }

  private calculateCancellationDeadline(automation: UniversalAutomation): string {
    const leadTime = automation.schedule.leadTimeMinutes || 30;
    const cancellationBuffer = automation.settings.cancellationWindowMinutes || 30;
    const deadline = new Date();
    deadline.setMinutes(deadline.getMinutes() + leadTime - cancellationBuffer);
    return deadline.toISOString();
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Integration methods (to be implemented with existing systems)
   */
  private async loadAutomation(automationId: string): Promise<UniversalAutomation | null> {
    try {
      const { automationStorage } = await import('./automationStorage');
      const automation = await automationStorage.loadAutomation(automationId);
      return automation;
    } catch (error: unknown) {
      this.logError(`Failed to load automation ${automationId}`, error);
      return null;
    }
  }

  /**
   * Database execution tracking methods
   */
  private async trackExecutionStart(
    automationId: string,
    automationName: string,
    instanceId: string
  ): Promise<string> {
    try {
      const result = await pool.query(
        `INSERT INTO automation_executions
         (automation_id, automation_name, status, current_phase, instance_id)
         VALUES ($1, $2, 'running', 'audience_generation', $3)
         RETURNING id`,
        [automationId, automationName, instanceId]
      );

      const executionRecordId = result.rows[0].id;
      console.log(`[TRACKING] Execution started: ${executionRecordId}`);
      return executionRecordId;
    } catch (error) {
      console.error('[TRACKING] Failed to track execution start:', error);
      return ''; // Continue execution even if tracking fails
    }
  }

  private async trackExecutionComplete(
    executionRecordId: string,
    status: 'completed' | 'failed' | 'aborted',
    metrics: {
      audienceSize?: number;
      pushesSent?: number;
      pushesFailed?: number;
      errorMessage?: string;
      errorStack?: string;
    },
    startTime: Date
  ): Promise<void> {
    if (!executionRecordId) return;

    try {
      const durationMs = Date.now() - startTime.getTime();

      await pool.query(
        `UPDATE automation_executions
         SET status = $1,
             completed_at = NOW(),
             duration_ms = $2,
             audience_size = $3,
             pushes_sent = $4,
             pushes_failed = $5,
             error_message = $6,
             error_stack = $7
         WHERE id = $8`,
        [
          status,
          durationMs,
          metrics.audienceSize || 0,
          metrics.pushesSent || 0,
          metrics.pushesFailed || 0,
          metrics.errorMessage || null,
          metrics.errorStack || null,
          executionRecordId
        ]
      );

      console.log(`[TRACKING] Execution completed: ${executionRecordId} (${status})`);
    } catch (error) {
      console.error('[TRACKING] Failed to track execution complete:', error);
    }
  }

  private async trackExecutionPhase(
    executionRecordId: string,
    phase: string
  ): Promise<void> {
    if (!executionRecordId) return;

    try {
      await pool.query(
        `UPDATE automation_executions SET current_phase = $1 WHERE id = $2`,
        [phase, executionRecordId]
      );
    } catch (error) {
      console.error('[TRACKING] Failed to track execution phase:', error);
    }
  }

  private async generatePushAudience(automation: UniversalAutomation, push: AutomationPush): Promise<void> {
    this.log(`Generating audience for push: ${push.title} (Layer ${push.layerId})`);

    try {
      const scriptId = automation.audienceCriteria?.customScript?.scriptId;

      if (!scriptId) {
        this.log(`No script specified for automation - skipping audience generation`);
        return;
      }

      // V2 path: Use TypeScript generators if available and enabled
      if (AUTOMATION_ENGINE_VERSION === 'v2' && await generatorRegistry.has(scriptId)) {
        this.log(`🚀 Using V2 TypeScript generator for ${scriptId}`);

        const generator = await generatorRegistry.get(scriptId);
        if (!generator) {
          throw new Error(`Generator not found for scriptId: ${scriptId}`);
        }
        const options: Partial<GeneratorOptions> = {
          lookbackHours: automation.audienceCriteria?.customScript?.parameters?.lookback_hours ?? 48,
          coolingHours: automation.audienceCriteria?.customScript?.parameters?.cooling_hours ?? 12,
          outputDir: '.script-outputs',
          dryRun: false,
          automationId: automation.id,
        };

        const result = await generator.generate(options);

        if (result.success) {
          this.log(`✅ V2 generator completed: ${result.audienceSize} users, ${result.csvFiles.length} files`);
          this.log(`Generated files: ${result.csvFiles.map(f => f.path).join(', ')}`);
          emitExecutionLog(automation.id, automation.id, 'audience_generation',
            `V2 generator: ${result.audienceSize} users in ${result.executionTimeMs}ms`, 'success');
        } else {
          throw new Error(`V2 generator failed: ${result.error}`);
        }

        return;
      }

      // V1 path: Use Python scripts (existing behavior)
      this.log(`📜 Using V1 Python script executor for ${scriptId}`);
      const { scriptExecutor } = await import('./scriptExecutor');

      this.log(`Executing script: ${scriptId} for audience generation`);

      // Execute the script to generate CSV files
      const executionId = `automation-${automation.id}-${Date.now()}`;
      const result = await scriptExecutor.executeScript(scriptId, {}, executionId, false); // isDryRun = false

      if (result.success) {
        this.log(`Successfully generated audiences using script: ${scriptId}`);
        this.log(`Generated files: ${(result as unknown as { generatedFiles?: string[] }).generatedFiles?.join(', ') || 'none'}`);
      } else {
        // Create enhanced error with Python output for debugging
        const enhancedError = new Error(`Script execution failed: ${result.error}`) as Error & { stdout?: string; stderr?: string };
        enhancedError.stdout = result.stdout;
        enhancedError.stderr = result.stderr;
        throw enhancedError;
      }

    } catch (error: unknown) {
      this.logError(`Failed to generate audience for automation ${automation.id}`, error);
      const errorMsg = error instanceof Error ? error.message : String(error);

      // Extract Python stdout/stderr if available (for debugging)
      const errorWithOutput = error as { stdout?: string; stderr?: string };
      const pythonStderr = errorWithOutput.stderr || '';
      const pythonStdout = errorWithOutput.stdout || '';

      // Log full Python output for debugging
      if (pythonStderr) {
        console.error(`[PYTHON_STDERR] ${pythonStderr}`);
      }
      if (pythonStdout) {
        console.log(`[PYTHON_STDOUT] ${pythonStdout}`);
      }

      // Emit detailed error to SSE stream - include Python stderr for visibility
      const detailedError = pythonStderr
        ? `Script failed: ${errorMsg}\n\nPython Error:\n${pythonStderr.slice(0, 2000)}`
        : `Script failed: ${errorMsg}`;
      emitExecutionLog(automation.id, automation.id, 'audience_generation', detailedError, 'error');
      throw error;
    }
  }

  /**
   * Helper to fetch with retry for transient network failures
   * Retries on connection errors, timeouts, and 5xx server errors
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    maxRetries: number = 3,
    retryDelayMs: number = 2000
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[FETCH-RETRY] Attempt ${attempt}/${maxRetries} for ${url}`);
        const response = await fetch(url, options);

        // Retry on 5xx server errors
        if (response.status >= 500 && attempt < maxRetries) {
          console.log(`[FETCH-RETRY] Server error ${response.status}, retrying in ${retryDelayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }

        return response;
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMessage = lastError.message;

        // Check if it's a retryable network error
        const isRetryable = errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('ECONNRESET') ||
          errorMessage.includes('ETIMEDOUT') ||
          errorMessage.includes('fetch failed') ||
          errorMessage.includes('network');

        if (isRetryable && attempt < maxRetries) {
          console.log(`[FETCH-RETRY] Network error: ${errorMessage}, retrying in ${retryDelayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Fetch failed after all retries');
  }

  /**
   * Send test push sequence to configured test users
   *
   * CRITICAL FIX: This method calls the test API ONCE for the entire automation
   * The test API processes all pushes in the sequence, so we only need one call
   *
   * The test API returns a Server-Sent Events (SSE) stream, so we need to:
   * 1. Connect to the stream
   * 2. Read all events until we get a 'result' or 'error' event
   * 3. Parse the final result to determine success/failure
   */
  private async sendTestPushSequence(automation: UniversalAutomation): Promise<void> {
    this.log(`🧪 Sending test sequence for automation: ${automation.id} (${automation.pushSequence.length} pushes)`);

    try {
      // Use centralized URL helper for Railway/localhost compatibility
      const baseUrl = this.getInternalApiBaseUrl();
      const apiUrl = `${baseUrl}/api/automation/test/${automation.id}?mode=test-live-send`;

      console.log(`[TEST-SEND] Base URL: ${baseUrl}`);
      console.log(`[TEST-SEND] Full API URL: ${apiUrl}`);

      // Call the test-automation API for TEST audience - returns SSE stream
      // Use retry logic for transient network failures
      const response = await this.fetchWithRetry(apiUrl, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' }
      });

      console.log(`[TEST-SEND] Response status: ${response.status}`);

      if (!response.ok) {
        console.log(`[TEST-SEND] ❌ Test sequence failed: ${response.status}`);
        throw new Error(`Test sequence failed: HTTP ${response.status}`);
      }

      // Read the SSE stream and wait for the final result
      const result = await this.readSSEStream(response, automation.id);

      if (result.success) {
        console.log(`[TEST-SEND] ✅ Test sequence completed successfully: ${result.message}`);
        this.log(`✅ Successfully sent test sequence: ${automation.pushSequence.length} pushes to test audience`);
      } else {
        console.log(`[TEST-SEND] ❌ Test sequence failed: ${result.message}`);
        throw new Error(`Test sequence failed: ${result.message}`);
      }
    } catch (error: unknown) {
      console.log(`[TEST-SEND] ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
      this.logError(`Failed to send test sequence for automation ${automation.id}`, error);
      throw error;
    }
  }

  /**
   * Read Server-Sent Events stream and wait for the final result
   * Returns the final result event (success or error)
   *
   * @param response - The fetch response containing the SSE stream
   * @param automationId - The automation ID for logging context
   * @param timeoutMs - Maximum time to wait for completion (default 5 minutes for test, 10 for live)
   */
  private async readSSEStream(
    response: Response,
    automationId: string,
    timeoutMs: number = 300000 // 5 minutes default
  ): Promise<{ success: boolean; message: string }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body is not readable');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    // Create timeout controller to prevent infinite hangs
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let timedOut = false;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        console.error(`[TEST-SEND-SSE] Stream timeout after ${timeoutMs}ms for automation ${automationId}`);
        reject(new Error(`SSE stream timeout after ${timeoutMs}ms - test API may have hung`));
      }, timeoutMs);
    });

    try {
      while (true) {
        // Race between reading next chunk and timeout
        const readPromise = reader.read();
        const { done, value } = await Promise.race([readPromise, timeoutPromise]);

        if (done) {
          console.log(`[TEST-SEND-SSE] Stream ended without final result`);
          return { success: false, message: 'Stream ended unexpectedly without final result' };
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events (separated by double newlines)
        const events = buffer.split('\n\n');
        buffer = events.pop() || ''; // Keep incomplete event in buffer

        for (const event of events) {
          if (!event.trim()) continue;

          // Parse SSE data line
          const dataMatch = event.match(/^data:\s*(.+)$/m);
          if (!dataMatch) continue;

          try {
            const data = JSON.parse(dataMatch[1]);

            // Log progress events
            if (data.type === 'log') {
              const level = data.level || 'info';
              const stage = data.stage || '';
              const message = data.message || '';
              console.log(`[TEST-SEND-SSE] [${level.toUpperCase()}] [${stage}] ${message}`);
            }

            // Handle final result event
            if (data.type === 'result') {
              console.log(`[TEST-SEND-SSE] Received final result: success=${data.success}, message=${data.message}`);
              return { success: data.success, message: data.message || 'No message provided' };
            }

            // Handle error event
            if (data.type === 'error') {
              console.log(`[TEST-SEND-SSE] Received error: ${data.message}`);
              return { success: false, message: data.message || 'Unknown error' };
            }
          } catch {
            // Ignore parse errors for non-JSON events (like heartbeats)
          }
        }
      }
    } finally {
      // Always clear timeout and release reader lock
      if (timeoutId) clearTimeout(timeoutId);
      reader.releaseLock();
    }
  }

  /**
   * @deprecated Use sendTestPushSequence() instead
   * Legacy method - kept for reference but should not be called per-push
   */
  private async sendTestPush(automation: UniversalAutomation, push: AutomationPush): Promise<void> {
    this.log(`⚠️  DEPRECATED: sendTestPush() called for individual push. Use sendTestPushSequence() instead.`);
    
    // For backwards compatibility, just log the push info but don't make API calls
    this.log(`Would send test push: "${push.title}" to test audience (Layer ${push.layerId})`);
  }

  /**
   * @deprecated This method is no longer used. Live pushes now go through the unified
   * test-automation API (executeLiveSending) to ensure identical processing logic.
   * Kept for reference but should not be called.
   */
  private async sendLivePush(automation: UniversalAutomation, push: AutomationPush): Promise<void> {
    this.log(`⚠️  DEPRECATED: sendLivePush() called. Live pushes now use unified test-automation API.`);
    this.log(`❌ Individual push processing has been replaced with comprehensive sequence processing.`);
    throw new Error(`sendLivePush() is deprecated. Use executeLiveSending() with unified test-automation API.`);
  }

  /**
   * Load user IDs from CSV file (same logic as test automation API)
   */
  private async loadUserIdsFromCsv(csvPath: string | undefined): Promise<string[]> {
    if (!csvPath) {
      return [];
    }

    try {
      const fs = require('fs');
      const Papa = require('papaparse');
      
      // Check if file exists
      if (!fs.existsSync(csvPath)) {
        throw new Error(`CSV file not found: ${csvPath}`);
      }
      
      // Read and parse CSV file
      const csvContent = fs.readFileSync(csvPath, 'utf8');
      const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
      const userIds = parseResult.data.map((row: unknown) => {
        const rowData = row as { user_id?: string };
        return rowData.user_id;
      }).filter(Boolean);

      this.log(`Loaded ${userIds.length} user IDs from CSV: ${csvPath}`);
      return userIds;

    } catch (error: unknown) {
      this.logError(`Failed to load user IDs from CSV: ${csvPath}`, error);
      return [];
    }
  }

  private async handleExecutionFailure(automationId: string, error: string): Promise<void> {
    // TODO: Implement failure handling and notifications
    this.logError(`Execution failure for ${automationId}`, error);
  }

  /**
   * Control methods
   */
  async cancelAutomation(automationId: string, reason: string = 'User requested'): Promise<ExecutionResponse> {
    // Simplified: just cancel the scheduled job, no execution tracking
    const jobInfo = this.scheduledJobs.get(automationId);
    if (!jobInfo) {
      return {
        success: false,
        executionId: automationId,
        status: 'failed',
        message: 'Automation not found or not scheduled'
      };
    }

    // Cancel the scheduled job
    jobInfo.cronJob.stop();
    jobInfo.cronJob.destroy();
    this.scheduledJobs.delete(automationId);
    
    this.log(`Automation ${automationId} cancelled: ${reason}`);
    
    return {
      success: true,
      executionId: automationId,
      status: 'cancelled',
      message: `Automation cancelled: ${reason}`
    };
  }

  async emergencyStop(automationId: string): Promise<ExecutionResponse> {
    return this.cancelAutomation(automationId, 'Emergency stop activated');
  }

  async executeAutomationNow(automation: UniversalAutomation, providedExecutionId?: string): Promise<{ success: boolean; message: string; executionId?: string }> {
    // Generate execution ID if not provided
    const executionId = providedExecutionId || uuidv4();

    // [EXEC-NOW] - Debug checkpoint: Manual execution entry point
    console.log(`[EXEC-NOW] ═══════════════════════════════════════════════════════════════`);
    console.log(`[EXEC-NOW] Manual execution requested: ${automation.id}`);
    console.log(`[EXEC-NOW] Automation name: ${automation.name}`);
    console.log(`[EXEC-NOW] Execution ID: ${executionId}`);
    console.log(`[EXEC-NOW] Timestamp: ${new Date().toISOString()}`);
    console.log(`[EXEC-NOW] ═══════════════════════════════════════════════════════════════`);

    try {
      this.log(`Executing automation immediately: ${automation.name} (${automation.id})`);

      // Check if automation is already running
      const alreadyRunning = this.isExecutionActive(automation.id);
      console.log(`[EXEC-NOW] Already running check: ${alreadyRunning}`);

      if (alreadyRunning) {
        console.log(`[EXEC-NOW] ❌ BLOCKED: Automation is already running`);
        return {
          success: false,
          message: 'Automation is already running'
        };
      }

      // Execute the automation with the execution ID
      console.log(`[EXEC-NOW] ✅ Delegating to executeAutomation()`);
      await this.executeAutomation(automation.id, executionId);

      console.log(`[EXEC-NOW] ✅ executeAutomation() completed successfully`);
      return {
        success: true,
        message: 'Automation execution started successfully',
        executionId: executionId
      };
    } catch (error: unknown) {
      console.log(`[EXEC-NOW] ❌ FAILED: ${error instanceof Error ? error.message : String(error)}`);
      this.logError('Failed to execute automation immediately', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        message: `Failed to execute automation: ${errorMessage}`
      };
    }
  }

  async unscheduleAutomation(automationId: string): Promise<{ success: boolean; message: string }> {
    // Unschedule automation when it becomes inactive
    const jobInfo = this.scheduledJobs.get(automationId);
    if (!jobInfo) {
      this.log(`⚠️ [${this.instanceId}] Unschedule request for ${automationId} - no scheduled job found`);
      this.log(`📊 [${this.instanceId}] Current scheduled jobs: ${this.scheduledJobs.size}`);
      return {
        success: true, // Success because desired state (unscheduled) is achieved
        message: 'Automation was not scheduled'
      };
    }

    // Stop and destroy the cron job
    jobInfo.cronJob.stop();
    jobInfo.cronJob.destroy();
    this.scheduledJobs.delete(automationId);
    
    this.log(`✅ [${this.instanceId}] Automation ${automationId} unscheduled successfully`);
    this.log(`📊 [${this.instanceId}] Remaining scheduled jobs: ${this.scheduledJobs.size}`);
    
    return {
      success: true,
      message: 'Automation unscheduled successfully'
    };
  }

  /**
   * Status and monitoring
   */

  getAllActiveExecutions(): Record<string, { automationId: string; startTime: Date; currentPhase: string; abortController?: AbortController }> {
    return Object.fromEntries(this.activeExecutions);
  }

  /**
   * Cleanup methods
   */
  async shutdownEngine(): Promise<void> {
    this.log('Shutting down automation engine...');
    
    // Stop all cron jobs
    for (const [automationId, job] of this.scheduledJobs) {
      job.cronJob.stop();
      this.log(`Stopped scheduled job for automation: ${automationId}`);
    }
    
    // Clear all maps
    this.scheduledJobs.clear();
    // No execution tracking to clear in simplified mode
    
    this.log('Automation engine shutdown complete');
  }

  /**
   * Logging utilities
   */
  private log(message: string): void {
    console.log(`${this.logPrefix} ${new Date().toISOString()} - ${message}`);
  }

  private logError(message: string, error: unknown): void {
    console.error(`${this.logPrefix} ${new Date().toISOString()} - ERROR: ${message}`, error);
  }

  // Get instance ID for debugging
  getInstanceId(): string {
    return this.instanceId;
  }

  // Get last restoration timestamp for health endpoint
  public getLastRestorationTimestamp(): string | null {
    return this.lastRestorationAttempt;
  }

  // Public method to manually trigger restoration (for emergency fixes)
  async manualRestore(): Promise<void> {
    this.log('🔧 Manual restoration triggered');
    await this.restoreActiveAutomations();
  }

  // Test mode detection and configuration
  private isTestMode(automation: UniversalAutomation): boolean {
    return automation.audienceCriteria?.testMode === true;
  }

  private getLeadTimeMinutes(automation: UniversalAutomation): number {
    const isTest = this.isTestMode(automation);
    if (isTest) {
      return 3; // Test mode: short lead time for quick feedback
    }
    return automation.schedule.leadTimeMinutes || 30; // Real mode: full lead time
  }

  private getCancellationWindowMinutes(automation: UniversalAutomation): number {
    const isTest = this.isTestMode(automation);
    if (isTest) {
      return 2; // Test mode: short cancellation window
    }
    return automation.settings?.cancellationWindowMinutes || 25; // Real mode: full window
  }

  // Debug method to inspect internal state and detect zombie jobs
  getDebugInfo(): {
    instanceId: string;
    scheduledJobsCount: number;
    activeExecutionsCount: number;
    scheduledJobs: Array<{
      automationId: string;
      isRunning: boolean;
      nextExecution: string;
      executionConfig: ExecutionConfig;
    }>;
    activeExecutions: Array<{
      executionId: string;
      automationId: string;
      startTime: string;
      currentPhase: string;
    }>;
  } {
    return {
      instanceId: this.instanceId,
      scheduledJobsCount: this.scheduledJobs.size,
      activeExecutionsCount: this.activeExecutions.size,
      scheduledJobs: Array.from(this.scheduledJobs.entries()).map(([id, job]) => ({
        automationId: id,
        isRunning: job.cronJob.getStatus() === 'scheduled',
        nextExecution: 'scheduled',
        executionConfig: job.executionConfig
      })),
      activeExecutions: Array.from(this.activeExecutions.entries()).map(([id, exec]) => ({
        executionId: id,
        automationId: exec.automationId,
        startTime: exec.startTime.toISOString(),
        currentPhase: exec.currentPhase
      }))
    };
  }

  private formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      timeZone: 'America/Chicago',
      hour12: true 
    });
  }
}

// --- ATOMIC MODULE-LEVEL SINGLETON ---
// Eliminates race conditions by creating instance at module load time.
// Node.js module loading is synchronous and single-threaded, making this truly atomic.

// Add a type definition for our custom global variable to avoid TypeScript errors
declare const global: typeof globalThis & {
  _automationEngineInstance: AutomationEngine | null;
  _automationEngineProductionInstance: AutomationEngine | null;
};

// Production: Use global scope to ensure true singleton across all module loads
// This prevents multiple instances during Next.js build phase (which loads modules multiple times)
// CRITICAL: Skip instance creation during Next.js build phase to prevent crashes
const productionInstance: AutomationEngine | null =
  process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build'
    ? (global._automationEngineProductionInstance || (global._automationEngineProductionInstance = new AutomationEngine()))
    : null;

// Log production instance creation only if we just created it
if (productionInstance && productionInstance === global._automationEngineProductionInstance) {
  console.log('[AutomationEngine] Production mode: Created global singleton instance.');
}

// Log if skipped during build
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE === 'phase-production-build') {
  console.log('[AutomationEngine] Skipping instance creation during Next.js build phase');
}

export function getAutomationEngineInstance(): AutomationEngine {
  if (process.env.NODE_ENV === 'production') {
    // Skip during build phase - return dummy instance to prevent crashes
    if (process.env.NEXT_PHASE === 'phase-production-build') {
      console.log('[AutomationEngine] Build phase detected - skipping engine access');
      throw new Error('AutomationEngine not available during build phase');
    }

    // Always return the global instance (guaranteed unique across all module loads)
    if (!global._automationEngineProductionInstance) {
      global._automationEngineProductionInstance = new AutomationEngine();
    }
    return global._automationEngineProductionInstance!;
  } else {
    // Development: Use global caching for hot-reload resistance
    if (!global._automationEngineInstance) {
      global._automationEngineInstance = new AutomationEngine();
      console.log('[AutomationEngine] Development mode: Created and cached new singleton instance on global.');
    }
    return global._automationEngineInstance;
  }
}