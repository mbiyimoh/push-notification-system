// Automation Logging and Error Handling
// Extending existing patterns for comprehensive automation monitoring

import fs from 'fs';
import path from 'path';
import { UniversalAutomation, ExecutionConfig, AutomationPush } from '@/types/automation';

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  automationId: string;
  phase: string;
  event: string;
  data?: any;
  error?: any;
  duration?: number; // milliseconds
}

export interface ExecutionLog {
  automationId: string;
  automationName: string;
  executionId: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  phases: PhaseLog[];
  pushLogs: PushLog[];
  errors: ErrorLog[];
  metrics: ExecutionMetrics;
}

export interface PhaseLog {
  phase: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  duration?: number; // milliseconds
  data?: any;
  error?: string;
}

export interface PushLog {
  pushId: string;
  pushTitle: string;
  sequenceOrder: number;
  startTime: string;
  endTime?: string;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  audienceSize?: number;
  sentCount?: number;
  failureCount?: number;
  layerId: number;
  isTest: boolean;
}

export interface ErrorLog {
  timestamp: string;
  phase: string;
  errorType: string;
  message: string;
  stack?: string;
  data?: any;
  recoverable: boolean;
}

export interface ExecutionMetrics {
  totalDuration: number; // milliseconds
  audienceGenerationTime: number;
  testSendingTime: number;
  liveExecutionTime: number;
  totalPushes: number;
  successfulPushes: number;
  failedPushes: number;
  totalAudienceSize: number;
  totalSentCount: number;
  averagePushTime: number;
}

export class AutomationLogger {
  private logPrefix = '[AutomationLogger]';
  private logsDir: string;
  private activeExecutions: Map<string, ExecutionLog> = new Map();

  constructor() {
    this.logsDir = path.join(process.cwd(), '.automations', 'logs');
    this.ensureLogsDirectory();
  }

  /**
   * Ensure logs directory exists
   */
  private ensureLogsDirectory(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
      console.log(`${this.logPrefix} Created logs directory: ${this.logsDir}`);
    }
  }

  /**
   * Start execution logging
   */
  startExecution(automation: UniversalAutomation, executionId: string): ExecutionLog {
    const executionLog: ExecutionLog = {
      automationId: automation.id,
      automationName: automation.name,
      executionId,
      startTime: new Date().toISOString(),
      status: 'running',
      phases: [],
      pushLogs: [],
      errors: [],
      metrics: {
        totalDuration: 0,
        audienceGenerationTime: 0,
        testSendingTime: 0,
        liveExecutionTime: 0,
        totalPushes: automation.pushSequence.length,
        successfulPushes: 0,
        failedPushes: 0,
        totalAudienceSize: 0,
        totalSentCount: 0,
        averagePushTime: 0
      }
    };

    this.activeExecutions.set(executionId, executionLog);
    this.log('info', automation.id, 'execution', 'Execution started', { executionId });
    
    return executionLog;
  }

  /**
   * Log phase start
   */
  startPhase(executionId: string, phase: string, data?: any): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    const phaseLog: PhaseLog = {
      phase,
      startTime: new Date().toISOString(),
      status: 'running',
      data
    };

    execution.phases.push(phaseLog);
    this.log('info', execution.automationId, phase, 'Phase started', data);
  }

  /**
   * Log phase completion
   */
  completePhase(executionId: string, phase: string, data?: any, error?: any): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    const phaseLog = execution.phases.find(p => p.phase === phase && !p.endTime);
    if (!phaseLog) return;

    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(phaseLog.startTime).getTime();

    phaseLog.endTime = endTime;
    phaseLog.duration = duration;
    phaseLog.status = error ? 'failed' : 'completed';
    phaseLog.data = { ...phaseLog.data, ...data };

    if (error) {
      phaseLog.error = error.message || error;
      this.logError(execution.automationId, phase, 'Phase failed', error);
    } else {
      this.log('info', execution.automationId, phase, 'Phase completed', { duration });
    }

    // Update metrics
    this.updatePhaseMetrics(execution, phase, duration);
  }

  /**
   * Log push start
   */
  startPush(executionId: string, push: AutomationPush, isTest: boolean = false): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    const pushLog: PushLog = {
      pushId: push.id,
      pushTitle: push.title,
      sequenceOrder: push.sequenceOrder,
      startTime: new Date().toISOString(),
      status: 'sending',
      layerId: push.layerId,
      isTest
    };

    execution.pushLogs.push(pushLog);
    this.log('info', execution.automationId, 'push', `Push started: ${push.title}`, { 
      pushId: push.id, 
      isTest,
      layerId: push.layerId 
    });
  }

  /**
   * Log push completion
   */
  completePush(executionId: string, pushId: string, results: {
    audienceSize?: number;
    sentCount?: number;
    failureCount?: number;
    error?: any;
  }): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    const pushLog = execution.pushLogs.find(p => p.pushId === pushId && !p.endTime);
    if (!pushLog) return;

    const endTime = new Date().toISOString();
    pushLog.endTime = endTime;
    pushLog.audienceSize = results.audienceSize;
    pushLog.sentCount = results.sentCount || 0;
    pushLog.failureCount = results.failureCount || 0;
    pushLog.status = results.error ? 'failed' : 'sent';

    if (results.error) {
      this.logError(execution.automationId, 'push', 'Push failed', results.error, { pushId });
      execution.metrics.failedPushes++;
    } else {
      this.log('info', execution.automationId, 'push', 'Push completed', {
        pushId,
        sentCount: results.sentCount,
        audienceSize: results.audienceSize
      });
      execution.metrics.successfulPushes++;
    }

    // Update metrics
    if (results.audienceSize) execution.metrics.totalAudienceSize += results.audienceSize;
    if (results.sentCount) execution.metrics.totalSentCount += results.sentCount;
  }

  /**
   * Complete execution
   */
  completeExecution(executionId: string, status: 'completed' | 'failed' | 'cancelled', error?: any): void {
    const execution = this.activeExecutions.get(executionId);
    if (!execution) return;

    const endTime = new Date().toISOString();
    execution.endTime = endTime;
    execution.status = status;
    execution.metrics.totalDuration = new Date(endTime).getTime() - new Date(execution.startTime).getTime();

    // Calculate average push time
    const completedPushes = execution.pushLogs.filter(p => p.endTime);
    if (completedPushes.length > 0) {
      const totalPushTime = completedPushes.reduce((sum, push) => {
        const duration = new Date(push.endTime!).getTime() - new Date(push.startTime).getTime();
        return sum + duration;
      }, 0);
      execution.metrics.averagePushTime = totalPushTime / completedPushes.length;
    }

    if (error) {
      this.logError(execution.automationId, 'execution', 'Execution failed', error);
    }

    // Save execution log to file
    this.saveExecutionLog(execution);

    // Remove from active executions
    this.activeExecutions.delete(executionId);

    this.log('info', execution.automationId, 'execution', `Execution ${status}`, {
      executionId,
      duration: execution.metrics.totalDuration,
      pushes: execution.metrics.totalPushes,
      successful: execution.metrics.successfulPushes
    });
  }

  /**
   * Log general message
   */
  log(level: 'info' | 'warn' | 'error' | 'debug', automationId: string, phase: string, event: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      automationId,
      phase,
      event,
      data
    };

    this.writeLogEntry(entry);
    
    // Also log to console with appropriate level
    const message = `${this.logPrefix} [${level.toUpperCase()}] ${automationId}/${phase}: ${event}`;
    switch (level) {
      case 'error':
        console.error(message, data);
        break;
      case 'warn':
        console.warn(message, data);
        break;
      case 'debug':
        console.debug(message, data);
        break;
      default:
        console.log(message, data);
    }
  }

  /**
   * Log error with stack trace
   */
  logError(automationId: string, phase: string, event: string, error: any, data?: any): void {
    const errorEntry: ErrorLog = {
      timestamp: new Date().toISOString(),
      phase,
      errorType: error?.name || 'Error',
      message: error?.message || error,
      stack: error?.stack,
      data,
      recoverable: this.isRecoverableError(error)
    };

    // Add to execution log if exists
    const execution = Array.from(this.activeExecutions.values())
      .find(exec => exec.automationId === automationId);
    
    if (execution) {
      execution.errors.push(errorEntry);
    }

    this.log('error', automationId, phase, event, { error: errorEntry, data });
  }

  /**
   * Performance monitoring
   */
  logPerformance(automationId: string, phase: string, operation: string, startTime: number, data?: any): void {
    const duration = Date.now() - startTime;
    this.log('debug', automationId, phase, `Performance: ${operation}`, {
      duration,
      ...data
    });
  }

  /**
   * Get execution log
   */
  getExecutionLog(executionId: string): ExecutionLog | null {
    return this.activeExecutions.get(executionId) || null;
  }

  /**
   * Get all active executions
   */
  getActiveExecutions(): ExecutionLog[] {
    return Array.from(this.activeExecutions.values());
  }

  /**
   * Load execution history
   */
  async loadExecutionHistory(automationId: string, limit: number = 10): Promise<ExecutionLog[]> {
    try {
      const files = fs.readdirSync(this.logsDir)
        .filter(file => file.startsWith(`execution_${automationId}_`) && file.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      const logs: ExecutionLog[] = [];
      for (const file of files) {
        const filePath = path.join(this.logsDir, file);
        const data = fs.readFileSync(filePath, 'utf-8');
        logs.push(JSON.parse(data));
      }

      return logs;
    } catch (error) {
      console.error(`${this.logPrefix} Failed to load execution history:`, error);
      return [];
    }
  }

  /**
   * Private methods
   */
  private updatePhaseMetrics(execution: ExecutionLog, phase: string, duration: number): void {
    switch (phase) {
      case 'audience_generation':
        execution.metrics.audienceGenerationTime = duration;
        break;
      case 'test_sending':
        execution.metrics.testSendingTime = duration;
        break;
      case 'live_execution':
        execution.metrics.liveExecutionTime += duration;
        break;
    }
  }

  private isRecoverableError(error: any): boolean {
    if (!error) return false;
    
    // Define recoverable error patterns
    const recoverablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /rate limit/i,
      /temporary/i
    ];

    const message = error.message || error.toString();
    return recoverablePatterns.some(pattern => pattern.test(message));
  }

  private writeLogEntry(entry: LogEntry): void {
    try {
      const date = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.logsDir, `automation_${date}.log`);
      const logLine = JSON.stringify(entry) + '\n';
      
      fs.appendFileSync(logFile, logLine);
    } catch (error) {
      console.error(`${this.logPrefix} Failed to write log entry:`, error);
    }
  }

  private saveExecutionLog(execution: ExecutionLog): void {
    try {
      const filename = `execution_${execution.automationId}_${execution.executionId}.json`;
      const filePath = path.join(this.logsDir, filename);
      
      fs.writeFileSync(filePath, JSON.stringify(execution, null, 2));
    } catch (error) {
      console.error(`${this.logPrefix} Failed to save execution log:`, error);
    }
  }
}

// Export singleton instance
export const automationLogger = new AutomationLogger();