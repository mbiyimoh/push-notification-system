// Sequence Execution Engine
// Multi-push sequence execution with timing, delays, and parallel processing

import { UniversalAutomation, AutomationPush, ExecutionPhase } from '@/types/automation';
import { automationLogger } from './automationLogger';
import { automationIntegration } from './automationIntegration';
import { safeguardMonitor } from './safeguardMonitor';
import { timelineCalculator } from './timelineCalculator';

export interface SequenceExecutionConfig {
  automationId: string;
  executionId: string;
  isDryRun: boolean;
  testMode: boolean;
  startTime: Date;
  audienceCache: Map<string, string[]>; // pushId -> userIds
}

export interface PushExecutionResult {
  pushId: string;
  success: boolean;
  sentCount: number;
  failureCount: number;
  audienceSize: number;
  executionTime: number;
  error?: string;
}

export interface SequenceExecutionResult {
  success: boolean;
  totalPushes: number;
  successfulPushes: number;
  failedPushes: number;
  totalAudienceReached: number;
  totalExecutionTime: number;
  pushResults: PushExecutionResult[];
  error?: string;
}

export class SequenceExecutor {
  private logPrefix = '[SequenceExecutor]';
  private activeSequences: Map<string, SequenceExecutionConfig> = new Map();

  /**
   * Execute complete push sequence with proper timing and delays
   */
  async executeSequence(
    automation: UniversalAutomation,
    executionId: string,
    isDryRun: boolean = false
  ): Promise<SequenceExecutionResult> {
    const startTime = Date.now();
    
    try {
      this.log(`Starting sequence execution: ${automation.id} (${automation.pushSequence.length} pushes)`);

      // Create execution config
      const config: SequenceExecutionConfig = {
        automationId: automation.id,
        executionId,
        isDryRun,
        testMode: automation.settings.testUserIds.length > 0,
        startTime: new Date(),
        audienceCache: new Map()
      };

      this.activeSequences.set(executionId, config);

      // Start execution logging
      automationLogger.startExecution(automation, executionId);

      // Validate sequence before execution
      const validation = await this.validateSequence(automation);
      if (!validation.valid) {
        throw new Error(`Sequence validation failed: ${validation.errors.join(', ')}`);
      }

      // Generate audiences for all pushes in parallel
      automationLogger.startPhase(executionId, 'audience_generation');
      await this.generateSequenceAudiences(automation, config);
      automationLogger.completePhase(executionId, 'audience_generation', {
        audiencesGenerated: automation.pushSequence.length,
        totalUsers: Array.from(config.audienceCache.values()).flat().length
      });

      // Execute push sequence with timing
      automationLogger.startPhase(executionId, 'sequence_execution');
      const sequenceResult = await this.executeSequenceWithTiming(automation, config);
      automationLogger.completePhase(executionId, 'sequence_execution', {
        successfulPushes: sequenceResult.successfulPushes,
        failedPushes: sequenceResult.failedPushes
      });

      // Complete execution logging
      automationLogger.completeExecution(executionId, 'completed');

      this.log(`Sequence execution completed: ${automation.id} - ${sequenceResult.successfulPushes}/${sequenceResult.totalPushes} successful`);

      return sequenceResult;

    } catch (error: any) {
      this.logError(`Sequence execution failed for ${automation.id}`, error);
      
      // Log execution failure
      automationLogger.completeExecution(executionId, 'failed', error);
      
      return {
        success: false,
        totalPushes: automation.pushSequence.length,
        successfulPushes: 0,
        failedPushes: automation.pushSequence.length,
        totalAudienceReached: 0,
        totalExecutionTime: Date.now() - startTime,
        pushResults: [],
        error: error.message
      };
    } finally {
      this.activeSequences.delete(executionId);
    }
  }

  /**
   * Generate audiences for all pushes in sequence (parallel processing)
   */
  private async generateSequenceAudiences(
    automation: UniversalAutomation,
    config: SequenceExecutionConfig
  ): Promise<void> {
    this.log(`Generating audiences for ${automation.pushSequence.length} pushes`);

    // Generate audiences in parallel for better performance
    const audiencePromises = automation.pushSequence.map(async (push) => {
      try {
        // Generate base audience
        const audienceResult = await automationIntegration.generateAudience(automation, push);
        
        if (!audienceResult.success) {
          throw new Error(`Audience generation failed for push ${push.id}: ${audienceResult.error}`);
        }

        // Load user IDs from generated CSV
        const userIds = await this.loadUserIdsFromCsv(audienceResult.csvPath);
        
        // Apply cadence filtering
        const filteredResult = await automationIntegration.filterAudienceWithCadence(
          automation, 
          push, 
          userIds
        );

        if (!filteredResult.success) {
          this.log(`Warning: Cadence filtering failed for push ${push.id}, proceeding without filtering`);
          config.audienceCache.set(push.id, userIds);
        } else {
          config.audienceCache.set(push.id, filteredResult.eligibleUserIds);
          
          if (filteredResult.excludedCount > 0) {
            this.log(`Push ${push.id}: ${filteredResult.excludedCount} users excluded by cadence rules`);
          }
        }

        this.log(`Push ${push.id}: ${config.audienceCache.get(push.id)?.length || 0} users in final audience`);

      } catch (error: any) {
        this.logError(`Failed to generate audience for push ${push.id}`, error);
        config.audienceCache.set(push.id, []); // Empty audience on failure
      }
    });

    await Promise.all(audiencePromises);
  }

  /**
   * Execute sequence with proper timing and delays
   */
  private async executeSequenceWithTiming(
    automation: UniversalAutomation,
    config: SequenceExecutionConfig
  ): Promise<SequenceExecutionResult> {
    const pushResults: PushExecutionResult[] = [];
    let successfulPushes = 0;
    let failedPushes = 0;
    let totalAudienceReached = 0;

    for (const [index, push] of automation.pushSequence.entries()) {
      try {
        this.log(`Executing push ${index + 1}/${automation.pushSequence.length}: ${push.title}`);

        // Apply delay after previous push (except for first push)
        if (index > 0 && push.timing.delayAfterPrevious > 0) {
          const delayMs = push.timing.delayAfterPrevious * 60 * 1000; // Convert minutes to milliseconds
          this.log(`Applying delay: ${push.timing.delayAfterPrevious} minutes`);
          await this.delay(delayMs);
        }

        // Check for cancellation before each push
        if (await this.isExecutionCancelled(config.executionId)) {
          throw new Error('Sequence execution cancelled');
        }

        // Execute individual push
        const pushResult = await this.executeSinglePush(automation, push, config);
        pushResults.push(pushResult);

        if (pushResult.success) {
          successfulPushes++;
          totalAudienceReached += pushResult.audienceSize;
        } else {
          failedPushes++;
        }

        // Monitor for safeguard violations
        await safeguardMonitor.monitorExecution(automation.id, config.executionId);

      } catch (error: any) {
        this.logError(`Failed to execute push ${push.id}`, error);
        
        pushResults.push({
          pushId: push.id,
          success: false,
          sentCount: 0,
          failureCount: config.audienceCache.get(push.id)?.length || 0,
          audienceSize: config.audienceCache.get(push.id)?.length || 0,
          executionTime: 0,
          error: error.message
        });
        
        failedPushes++;

        // Stop sequence execution on critical errors
        if (error.message.includes('cancelled') || error.message.includes('emergency')) {
          break;
        }
      }
    }

    return {
      success: failedPushes === 0,
      totalPushes: automation.pushSequence.length,
      successfulPushes,
      failedPushes,
      totalAudienceReached,
      totalExecutionTime: Date.now() - config.startTime.getTime(),
      pushResults
    };
  }

  /**
   * Execute a single push within the sequence
   */
  private async executeSinglePush(
    automation: UniversalAutomation,
    push: AutomationPush,
    config: SequenceExecutionConfig
  ): Promise<PushExecutionResult> {
    const startTime = Date.now();
    const userIds = config.audienceCache.get(push.id) || [];

    try {
      // Start push logging
      automationLogger.startPush(config.executionId, push, config.isDryRun);

      // Check audience size against safeguards
      const audienceCheck = await safeguardMonitor.enforceAudienceLimit(automation.id, userIds.length);
      if (!audienceCheck.allowed) {
        throw new Error(`Audience limit violation: ${audienceCheck.reason}`);
      }

      // Use test users if in test mode
      const finalUserIds = config.testMode && automation.settings.testUserIds.length > 0 
        ? automation.settings.testUserIds 
        : userIds;

      if (finalUserIds.length === 0) {
        throw new Error('No users in audience after filtering');
      }

      // Send push notification
      const sendResult = await automationIntegration.sendPush(
        automation,
        push,
        finalUserIds,
        config.isDryRun
      );

      if (!sendResult.success) {
        throw new Error(sendResult.error || 'Push sending failed');
      }

      // Complete push logging
      automationLogger.completePush(config.executionId, push.id, {
        audienceSize: userIds.length,
        sentCount: sendResult.sentCount,
        failureCount: sendResult.failureCount
      });

      const result: PushExecutionResult = {
        pushId: push.id,
        success: true,
        sentCount: sendResult.sentCount,
        failureCount: sendResult.failureCount,
        audienceSize: userIds.length,
        executionTime: Date.now() - startTime
      };

      this.log(`Push ${push.id} completed: ${result.sentCount}/${result.audienceSize} sent`);
      return result;

    } catch (error: any) {
      // Complete push logging with error
      automationLogger.completePush(config.executionId, push.id, {
        audienceSize: userIds.length,
        sentCount: 0,
        failureCount: userIds.length,
        error
      });

      return {
        pushId: push.id,
        success: false,
        sentCount: 0,
        failureCount: userIds.length,
        audienceSize: userIds.length,
        executionTime: Date.now() - startTime,
        error: error.message
      };
    }
  }

  /**
   * Validate sequence before execution
   */
  private async validateSequence(automation: UniversalAutomation): Promise<{
    valid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check sequence length
    if (automation.pushSequence.length === 0) {
      errors.push('No pushes in sequence');
    }

    if (automation.pushSequence.length > 20) {
      warnings.push('Very long sequence may impact performance');
    }

    // Check sequence ordering
    const sequenceOrders = automation.pushSequence.map(p => p.sequenceOrder).sort((a, b) => a - b);
    for (let i = 0; i < sequenceOrders.length; i++) {
      if (sequenceOrders[i] !== i + 1) {
        errors.push(`Invalid sequence ordering: expected ${i + 1}, got ${sequenceOrders[i]}`);
        break;
      }
    }

    // Check timing configuration
    let totalDelay = 0;
    for (const push of automation.pushSequence) {
      if (push.timing.delayAfterPrevious < 0) {
        errors.push(`Invalid delay for push ${push.id}: cannot be negative`);
      }
      totalDelay += push.timing.delayAfterPrevious;
    }

    if (totalDelay > 10080) { // 7 days in minutes
      warnings.push(`Total sequence delay (${Math.round(totalDelay / 60)} hours) is very long`);
    }

    // Check push content
    for (const push of automation.pushSequence) {
      if (!push.title || !push.body) {
        errors.push(`Push ${push.id} missing title or body`);
      }
      
      if (push.layerId < 1 || push.layerId > 5) {
        errors.push(`Push ${push.id} has invalid layer ID: ${push.layerId}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if execution has been cancelled
   */
  private async isExecutionCancelled(executionId: string): Promise<boolean> {
    const execution = automationLogger.getExecutionLog(executionId);
    return execution?.status === 'cancelled' || false;
  }

  /**
   * Load user IDs from CSV file
   */
  private async loadUserIdsFromCsv(csvPath: string | undefined): Promise<string[]> {
    if (!csvPath) {
      return [];
    }

    try {
      // This would normally read the CSV file and extract user IDs
      // For now, we'll simulate this by returning a sample array
      // In production, this would use a CSV parsing library
      return ['user_1', 'user_2', 'user_3']; // Placeholder
    } catch (error) {
      this.logError('Failed to load user IDs from CSV', error);
      return [];
    }
  }

  /**
   * Pause sequence execution
   */
  async pauseSequence(executionId: string): Promise<boolean> {
    const config = this.activeSequences.get(executionId);
    if (!config) {
      return false;
    }

    // Mark execution as paused in logging
    automationLogger.log('info', config.automationId, 'sequence', 'Sequence paused', { executionId });
    return true;
  }

  /**
   * Cancel sequence execution
   */
  async cancelSequence(executionId: string, reason: string): Promise<boolean> {
    const config = this.activeSequences.get(executionId);
    if (!config) {
      return false;
    }

    // Mark execution as cancelled
    automationLogger.log('warn', config.automationId, 'sequence', 'Sequence cancelled', { 
      executionId, 
      reason 
    });
    
    automationLogger.completeExecution(executionId, 'cancelled');
    this.activeSequences.delete(executionId);
    
    return true;
  }

  /**
   * Get sequence progress
   */
  getSequenceProgress(executionId: string): {
    found: boolean;
    currentPush?: number;
    totalPushes?: number;
    completedPushes?: number;
    startTime?: string;
  } {
    const config = this.activeSequences.get(executionId);
    if (!config) {
      return { found: false };
    }

    const execution = automationLogger.getExecutionLog(executionId);
    const completedPushes = execution?.pushLogs.filter(p => p.status === 'sent').length || 0;

    return {
      found: true,
      currentPush: completedPushes + 1,
      totalPushes: execution?.metrics.totalPushes || 0,
      completedPushes,
      startTime: config.startTime.toISOString()
    };
  }

  /**
   * Get all active sequences
   */
  getActiveSequences(): { [executionId: string]: SequenceExecutionConfig } {
    return Object.fromEntries(this.activeSequences);
  }

  /**
   * Utility methods
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private log(message: string): void {
    console.log(`${this.logPrefix} ${new Date().toISOString()} - ${message}`);
  }

  private logError(message: string, error: any): void {
    console.error(`${this.logPrefix} ${new Date().toISOString()} - ERROR: ${message}`, error);
  }
}

// Export singleton instance
export const sequenceExecutor = new SequenceExecutor();