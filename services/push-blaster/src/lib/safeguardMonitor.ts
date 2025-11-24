// Safeguard Monitoring System
// Real-time monitoring and enforcement of automation safety limits

import { UniversalAutomation, SafeguardConfig } from '@/types/automation';
// Temporarily disabled to fix memory issues
import { automationLogger } from './automationLogger';
import { getAutomationEngineInstance } from './automationEngine';

export interface SafeguardViolation {
  id: string;
  automationId: string;
  type: SafeguardType;
  severity: 'warning' | 'critical';
  message: string;
  data: any;
  timestamp: string;
  resolved: boolean;
  actionTaken?: string;
}

export interface MonitoringMetrics {
  totalAutomations: number;
  activeExecutions: number;
  totalViolations: number;
  criticalViolations: number;
  lastViolationTime?: string;
  systemHealthScore: number; // 0-100
}

export type SafeguardType = 
  | 'audience_size_exceeded'
  | 'failure_rate_exceeded' 
  | 'execution_timeout'
  | 'memory_limit_exceeded'
  | 'concurrent_limit_exceeded'
  | 'invalid_schedule'
  | 'missing_emergency_contact'
  | 'unsafe_configuration';

export class SafeguardMonitor {
  private violations: Map<string, SafeguardViolation> = new Map();
  private metrics: MonitoringMetrics;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private logPrefix = '[SafeguardMonitor]';

  // Global safety limits
  private readonly GLOBAL_LIMITS = {
    MAX_CONCURRENT_EXECUTIONS: 10,
    MAX_TOTAL_AUDIENCE_SIZE: 100000,
    MAX_EXECUTION_TIME_MINUTES: 240, // 4 hours
    MAX_MEMORY_USAGE_MB: 512,
    MIN_CANCELLATION_WINDOW_MINUTES: 5,
    MAX_PUSH_SEQUENCE_LENGTH: 20
  };

  constructor() {
    this.metrics = {
      totalAutomations: 0,
      activeExecutions: 0,
      totalViolations: 0,
      criticalViolations: 0,
      systemHealthScore: 100
    };
    
    this.startMonitoring();
  }

  /**
   * Start continuous monitoring
   */
  startMonitoring(): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    this.log('Starting safeguard monitoring');
    
    // Monitor every 30 seconds
    this.monitoringInterval = setInterval(() => {
      this.performSafetyCheck();
    }, 30000);

    // Initial check
    this.performSafetyCheck();
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      this.log('Safeguard monitoring stopped');
    }
  }

  /**
   * Validate automation configuration before scheduling
   */
  async validateAutomationSafety(automation: UniversalAutomation): Promise<{
    safe: boolean;
    violations: SafeguardViolation[];
    warnings: string[];
  }> {
    const violations: SafeguardViolation[] = [];
    const warnings: string[] = [];

    // Check audience size limits
    if (automation.settings.safeguards.maxAudienceSize > this.GLOBAL_LIMITS.MAX_TOTAL_AUDIENCE_SIZE) {
      violations.push(this.createViolation(
        automation.id,
        'audience_size_exceeded',
        'critical',
        `Audience size limit (${automation.settings.safeguards.maxAudienceSize}) exceeds global maximum (${this.GLOBAL_LIMITS.MAX_TOTAL_AUDIENCE_SIZE})`,
        { configuredLimit: automation.settings.safeguards.maxAudienceSize }
      ));
    }

    // Check push sequence length
    if (automation.pushSequence.length > this.GLOBAL_LIMITS.MAX_PUSH_SEQUENCE_LENGTH) {
      violations.push(this.createViolation(
        automation.id,
        'unsafe_configuration',
        'critical',
        `Push sequence length (${automation.pushSequence.length}) exceeds maximum (${this.GLOBAL_LIMITS.MAX_PUSH_SEQUENCE_LENGTH})`,
        { sequenceLength: automation.pushSequence.length }
      ));
    }

    // Check cancellation window
    if (automation.settings.cancellationWindowMinutes < this.GLOBAL_LIMITS.MIN_CANCELLATION_WINDOW_MINUTES) {
      violations.push(this.createViolation(
        automation.id,
        'unsafe_configuration',
        'warning',
        `Cancellation window (${automation.settings.cancellationWindowMinutes}min) is below recommended minimum (${this.GLOBAL_LIMITS.MIN_CANCELLATION_WINDOW_MINUTES}min)`,
        { cancellationWindow: automation.settings.cancellationWindowMinutes }
      ));
    }

    // Check emergency contacts
    if (automation.settings.safeguards.emergencyContacts.length === 0) {
      warnings.push('No emergency contacts configured');
    }

    // Check safety features
    if (!automation.settings.emergencyStopEnabled) {
      warnings.push('Emergency stop is disabled');
    }

    if (!automation.settings.dryRunFirst) {
      warnings.push('Dry run testing is disabled');
    }

    // Check schedule validity
    if (automation.schedule.frequency === 'once' && new Date(automation.schedule.startDate) <= new Date()) {
      violations.push(this.createViolation(
        automation.id,
        'invalid_schedule',
        'critical',
        'One-time execution is scheduled in the past',
        { startDate: automation.schedule.startDate }
      ));
    }

    return {
      safe: violations.filter(v => v.severity === 'critical').length === 0,
      violations,
      warnings
    };
  }

  /**
   * Monitor execution in real-time
   */
  async monitorExecution(automationId: string, executionId: string): Promise<void> {
    const execution = automationLogger.getExecutionLog(executionId);
    if (!execution) {
      return;
    }

    // Check execution time
    const startTime = new Date(execution.startTime);
    const now = new Date();
    const runningMinutes = (now.getTime() - startTime.getTime()) / (60 * 1000);

    if (runningMinutes > this.GLOBAL_LIMITS.MAX_EXECUTION_TIME_MINUTES) {
      const violation = this.createViolation(
        automationId,
        'execution_timeout',
        'critical',
        `Execution time (${Math.round(runningMinutes)}min) exceeds maximum (${this.GLOBAL_LIMITS.MAX_EXECUTION_TIME_MINUTES}min)`,
        { runningMinutes, executionId }
      );

      await this.handleViolation(violation);
    }

    // Check failure rate
    if (execution.metrics.totalPushes > 0) {
      const failureRate = execution.metrics.failedPushes / execution.metrics.totalPushes;
      const automation = await this.getAutomation(automationId);
      
      if (automation && failureRate > automation.settings.safeguards.alertThresholds.failureRate) {
        const violation = this.createViolation(
          automationId,
          'failure_rate_exceeded',
          'warning',
          `Failure rate (${(failureRate * 100).toFixed(1)}%) exceeds threshold (${(automation.settings.safeguards.alertThresholds.failureRate * 100).toFixed(1)}%)`,
          { failureRate, threshold: automation.settings.safeguards.alertThresholds.failureRate, executionId }
        );

        await this.handleViolation(violation);
      }
    }
  }

  /**
   * Enforce audience size limits
   */
  async enforceAudienceLimit(automationId: string, proposedAudienceSize: number): Promise<{
    allowed: boolean;
    maxAllowed?: number;
    reason?: string;
  }> {
    const automation = await this.getAutomation(automationId);
    if (!automation) {
      return { allowed: false, reason: 'Automation not found' };
    }

    // Check automation-specific limit
    if (proposedAudienceSize > automation.settings.safeguards.maxAudienceSize) {
      return {
        allowed: false,
        maxAllowed: automation.settings.safeguards.maxAudienceSize,
        reason: 'Exceeds automation audience limit'
      };
    }

    // Check global limit
    if (proposedAudienceSize > this.GLOBAL_LIMITS.MAX_TOTAL_AUDIENCE_SIZE) {
      return {
        allowed: false,
        maxAllowed: this.GLOBAL_LIMITS.MAX_TOTAL_AUDIENCE_SIZE,
        reason: 'Exceeds global audience limit'
      };
    }

    // Check alert threshold
    if (proposedAudienceSize > automation.settings.safeguards.alertThresholds.audienceSize) {
      const violation = this.createViolation(
        automationId,
        'audience_size_exceeded',
        'warning',
        `Audience size (${proposedAudienceSize}) exceeds alert threshold (${automation.settings.safeguards.alertThresholds.audienceSize})`,
        { audienceSize: proposedAudienceSize, threshold: automation.settings.safeguards.alertThresholds.audienceSize }
      );

      await this.handleViolation(violation);
    }

    return { allowed: true };
  }

  /**
   * Check concurrent execution limits
   */
  async checkConcurrentLimits(): Promise<boolean> {
    const automationEngine = getAutomationEngineInstance();
    const activeExecutions = automationEngine.getAllActiveExecutions();
    const activeCount = Object.keys(activeExecutions).length;

    if (activeCount >= this.GLOBAL_LIMITS.MAX_CONCURRENT_EXECUTIONS) {
      const violation = this.createViolation(
        'system',
        'concurrent_limit_exceeded',
        'critical',
        `Active executions (${activeCount}) exceed maximum (${this.GLOBAL_LIMITS.MAX_CONCURRENT_EXECUTIONS})`,
        { activeCount, limit: this.GLOBAL_LIMITS.MAX_CONCURRENT_EXECUTIONS }
      );

      await this.handleViolation(violation);
      return false;
    }

    return true;
  }

  /**
   * Perform comprehensive safety check
   */
  private async performSafetyCheck(): Promise<void> {
    try {
      // Update metrics
      await this.updateMetrics();

      // Check memory usage
      const memoryUsage = this.getMemoryUsage();
      if (memoryUsage > this.GLOBAL_LIMITS.MAX_MEMORY_USAGE_MB) {
        const violation = this.createViolation(
          'system',
          'memory_limit_exceeded',
          'warning',
          `Memory usage (${memoryUsage}MB) exceeds limit (${this.GLOBAL_LIMITS.MAX_MEMORY_USAGE_MB}MB)`,
          { memoryUsage, limit: this.GLOBAL_LIMITS.MAX_MEMORY_USAGE_MB }
        );

        await this.handleViolation(violation);
      }

      // Check concurrent executions
      await this.checkConcurrentLimits();

      // Calculate system health score
      this.calculateHealthScore();

    } catch (error: any) {
      this.logError('Safety check failed', error);
    }
  }

  /**
   * Handle safeguard violation
   */
  private async handleViolation(violation: SafeguardViolation): Promise<void> {
    this.violations.set(violation.id, violation);
    
    // Log violation
    automationLogger.log(
      violation.severity === 'critical' ? 'error' : 'warn',
      violation.automationId,
      'safeguard',
      `Safeguard violation: ${violation.type}`,
      violation
    );

    // Take action based on severity
    if (violation.severity === 'critical') {
      await this.takeCriticalAction(violation);
    }

    // Notify emergency contacts if configured
    await this.notifyEmergencyContacts(violation);

    // Update metrics
    this.metrics.totalViolations++;
    if (violation.severity === 'critical') {
      this.metrics.criticalViolations++;
    }
    this.metrics.lastViolationTime = violation.timestamp;
  }

  /**
   * Take critical action for severe violations
   */
  private async takeCriticalAction(violation: SafeguardViolation): Promise<void> {
    let actionTaken = '';

    const automationEngine = getAutomationEngineInstance();
    switch (violation.type) {
      case 'execution_timeout':
      case 'concurrent_limit_exceeded':
        // Emergency stop the automation
        if (violation.automationId !== 'system') {
          await automationEngine.emergencyStop(violation.automationId);
          actionTaken = 'Emergency stop activated';
        }
        break;

      case 'audience_size_exceeded':
        // Block execution
        actionTaken = 'Execution blocked due to audience size violation';
        break;

      case 'failure_rate_exceeded':
        // Pause automation for investigation
        if (violation.automationId !== 'system') {
          await automationEngine.cancelAutomation(violation.automationId, 'High failure rate detected');
          actionTaken = 'Automation cancelled due to high failure rate';
        }
        break;

      default:
        actionTaken = 'Violation logged for review';
    }

    violation.actionTaken = actionTaken;
    this.log(`Critical action taken: ${actionTaken} for violation ${violation.id}`);
  }

  /**
   * Notify emergency contacts
   */
  private async notifyEmergencyContacts(violation: SafeguardViolation): Promise<void> {
    // This would integrate with notification systems (email, Slack, SMS)
    // For now, we'll just log the notification
    if (violation.severity === 'critical') {
      this.log(`CRITICAL ALERT: Emergency contacts should be notified about violation ${violation.id}`);
    }
  }

  /**
   * Create violation record
   */
  private createViolation(
    automationId: string,
    type: SafeguardType,
    severity: 'warning' | 'critical',
    message: string,
    data: any
  ): SafeguardViolation {
    return {
      id: `violation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      automationId,
      type,
      severity,
      message,
      data,
      timestamp: new Date().toISOString(),
      resolved: false
    };
  }

  /**
   * Get automation helper
   */
  private async getAutomation(automationId: string): Promise<UniversalAutomation | null> {
    try {
      const { automationStorage } = await import('./automationStorage');
      return await automationStorage.loadAutomation(automationId);
    } catch (error) {
      return null;
    }
  }

  /**
   * Update monitoring metrics
   */
  private async updateMetrics(): Promise<void> {
    try {
      const automationEngine = getAutomationEngineInstance();
      const activeExecutions = automationEngine.getAllActiveExecutions();
      this.metrics.activeExecutions = Object.keys(activeExecutions).length;
      
      // This would query the storage system for total automations
      this.metrics.totalAutomations = 0; // Placeholder
    } catch (error: any) {
      this.logError('Failed to update metrics', error);
    }
  }

  /**
   * Calculate system health score
   */
  private calculateHealthScore(): void {
    let score = 100;

    // Deduct points for violations
    score -= this.metrics.criticalViolations * 20;
    score -= (this.metrics.totalViolations - this.metrics.criticalViolations) * 5;

    // Deduct points for high resource usage
    const memoryUsage = this.getMemoryUsage();
    if (memoryUsage > this.GLOBAL_LIMITS.MAX_MEMORY_USAGE_MB * 0.8) {
      score -= 10;
    }

    // Deduct points for high concurrent executions
    if (this.metrics.activeExecutions > this.GLOBAL_LIMITS.MAX_CONCURRENT_EXECUTIONS * 0.8) {
      score -= 10;
    }

    this.metrics.systemHealthScore = Math.max(0, score);
  }

  /**
   * Get memory usage in MB
   */
  private getMemoryUsage(): number {
    const memoryUsage = process.memoryUsage();
    return Math.round(memoryUsage.heapUsed / 1024 / 1024);
  }

  /**
   * Public API methods
   */
  getViolations(filters?: {
    automationId?: string;
    severity?: 'warning' | 'critical';
    resolved?: boolean;
  }): SafeguardViolation[] {
    let violations = Array.from(this.violations.values());

    if (filters?.automationId) {
      violations = violations.filter(v => v.automationId === filters.automationId);
    }

    if (filters?.severity) {
      violations = violations.filter(v => v.severity === filters.severity);
    }

    if (filters?.resolved !== undefined) {
      violations = violations.filter(v => v.resolved === filters.resolved);
    }

    return violations.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  resolveViolation(violationId: string, resolution: string): boolean {
    const violation = this.violations.get(violationId);
    if (violation) {
      violation.resolved = true;
      violation.actionTaken = violation.actionTaken ? 
        `${violation.actionTaken}; Resolved: ${resolution}` : 
        `Resolved: ${resolution}`;
      
      this.log(`Violation ${violationId} resolved: ${resolution}`);
      return true;
    }
    return false;
  }

  /**
   * Logging utilities
   */
  private log(message: string): void {
    console.log(`${this.logPrefix} ${new Date().toISOString()} - ${message}`);
  }

  private logError(message: string, error: any): void {
    console.error(`${this.logPrefix} ${new Date().toISOString()} - ERROR: ${message}`, error);
  }
}

// Export singleton instance
export const safeguardMonitor = new SafeguardMonitor();