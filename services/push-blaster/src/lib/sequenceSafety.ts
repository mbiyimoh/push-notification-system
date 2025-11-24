// Sequence Safety Protocols
// Enhanced safety controls specific to multi-push sequence execution

import { UniversalAutomation, AutomationPush } from '@/types/automation';
import { safeguardMonitor } from './safeguardMonitor';
import { automationLogger } from './automationLogger';

export interface SequenceSafetyConfig {
  maxSequenceLength: number;
  maxTotalDelay: number; // minutes
  maxConcurrentSequences: number;
  emergencyStopOnFailureCount: number;
  progressiveDelayIncrease: boolean;
  audienceOverlapThreshold: number; // percentage
}

export interface SequenceSafetyCheck {
  safe: boolean;
  warnings: string[];
  criticalIssues: string[];
  recommendations: string[];
  estimatedRisk: 'low' | 'medium' | 'high' | 'critical';
}

export interface SequenceMonitoringState {
  executionId: string;
  automationId: string;
  currentPush: number;
  totalPushes: number;
  failureCount: number;
  consecutiveFailures: number;
  lastFailureTime?: string;
  cumulativeAudienceSize: number;
  estimatedCompletion: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export class SequenceSafety {
  private logPrefix = '[SequenceSafety]';
  private activeMonitoring: Map<string, SequenceMonitoringState> = new Map();
  
  // Default safety configuration
  private readonly DEFAULT_CONFIG: SequenceSafetyConfig = {
    maxSequenceLength: 15,
    maxTotalDelay: 7200, // 5 days in minutes
    maxConcurrentSequences: 5,
    emergencyStopOnFailureCount: 3,
    progressiveDelayIncrease: true,
    audienceOverlapThreshold: 80
  };

  /**
   * Comprehensive sequence safety validation
   */
  async validateSequenceSafety(
    automation: UniversalAutomation,
    config?: Partial<SequenceSafetyConfig>
  ): Promise<SequenceSafetyCheck> {
    const safetyConfig = { ...this.DEFAULT_CONFIG, ...config };
    const warnings: string[] = [];
    const criticalIssues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check sequence length
      if (automation.pushSequence.length > safetyConfig.maxSequenceLength) {
        criticalIssues.push(
          `Sequence length (${automation.pushSequence.length}) exceeds maximum (${safetyConfig.maxSequenceLength})`
        );
      } else if (automation.pushSequence.length > safetyConfig.maxSequenceLength * 0.8) {
        warnings.push(
          `Sequence length (${automation.pushSequence.length}) is approaching maximum limit`
        );
      }

      // Check total delay time
      const totalDelay = this.calculateTotalDelay(automation);
      if (totalDelay > safetyConfig.maxTotalDelay) {
        criticalIssues.push(
          `Total sequence delay (${Math.round(totalDelay / 60)} hours) exceeds maximum (${Math.round(safetyConfig.maxTotalDelay / 60)} hours)`
        );
      } else if (totalDelay > safetyConfig.maxTotalDelay * 0.8) {
        warnings.push(
          `Total sequence delay (${Math.round(totalDelay / 60)} hours) is approaching maximum`
        );
      }

      // Check concurrent sequences limit
      const activeSequences = this.activeMonitoring.size;
      if (activeSequences >= safetyConfig.maxConcurrentSequences) {
        criticalIssues.push(
          `Maximum concurrent sequences (${safetyConfig.maxConcurrentSequences}) already reached`
        );
      } else if (activeSequences >= safetyConfig.maxConcurrentSequences * 0.8) {
        warnings.push(
          `Approaching maximum concurrent sequences (${activeSequences}/${safetyConfig.maxConcurrentSequences})`
        );
      }

      // Validate individual push safety
      const pushValidation = await this.validatePushSequenceSafety(automation);
      warnings.push(...pushValidation.warnings);
      criticalIssues.push(...pushValidation.criticalIssues);

      // Check audience overlap risks
      const overlapCheck = await this.checkAudienceOverlap(automation);
      if (overlapCheck.overlapPercentage > safetyConfig.audienceOverlapThreshold) {
        warnings.push(
          `High audience overlap detected (${overlapCheck.overlapPercentage}%) - may cause user fatigue`
        );
        recommendations.push('Consider spacing pushes further apart or refining audience criteria');
      }

      // Check timing patterns
      const timingValidation = this.validateTimingPatterns(automation);
      warnings.push(...timingValidation.warnings);
      recommendations.push(...timingValidation.recommendations);

      // Generate recommendations
      if (automation.pushSequence.length > 10) {
        recommendations.push('Consider breaking long sequences into multiple campaigns');
      }
      
      if (totalDelay < 60) { // Less than 1 hour total delay
        recommendations.push('Very short delays may overwhelm users - consider longer spacing');
      }

      // Calculate risk level
      const estimatedRisk = this.calculateRiskLevel(criticalIssues, warnings, automation);

      return {
        safe: criticalIssues.length === 0,
        warnings,
        criticalIssues,
        recommendations,
        estimatedRisk
      };

    } catch (error: any) {
      this.logError('Sequence safety validation failed', error);
      
      return {
        safe: false,
        warnings: [],
        criticalIssues: [`Safety validation failed: ${error.message}`],
        recommendations: ['Manual review required before execution'],
        estimatedRisk: 'critical'
      };
    }
  }

  /**
   * Start monitoring sequence execution
   */
  startSequenceMonitoring(
    executionId: string,
    automation: UniversalAutomation
  ): SequenceMonitoringState {
    const state: SequenceMonitoringState = {
      executionId,
      automationId: automation.id,
      currentPush: 0,
      totalPushes: automation.pushSequence.length,
      failureCount: 0,
      consecutiveFailures: 0,
      cumulativeAudienceSize: 0,
      estimatedCompletion: this.calculateEstimatedCompletion(automation),
      riskLevel: 'low'
    };

    this.activeMonitoring.set(executionId, state);
    
    this.log(`Started sequence monitoring: ${executionId} (${state.totalPushes} pushes)`);
    
    return state;
  }

  /**
   * Update monitoring state after push execution
   */
  updateSequenceProgress(
    executionId: string,
    pushResult: {
      success: boolean;
      audienceSize: number;
      error?: string;
    }
  ): SequenceMonitoringState | null {
    const state = this.activeMonitoring.get(executionId);
    if (!state) {
      return null;
    }

    // Update progress
    state.currentPush++;
    state.cumulativeAudienceSize += pushResult.audienceSize;

    // Update failure tracking
    if (!pushResult.success) {
      state.failureCount++;
      state.consecutiveFailures++;
      state.lastFailureTime = new Date().toISOString();
    } else {
      state.consecutiveFailures = 0; // Reset consecutive failures on success
    }

    // Update risk level
    state.riskLevel = this.calculateCurrentRiskLevel(state);

    // Check for emergency stop conditions
    if (state.consecutiveFailures >= this.DEFAULT_CONFIG.emergencyStopOnFailureCount) {
      this.log(`Emergency stop condition met for ${executionId}: ${state.consecutiveFailures} consecutive failures`);
      
      // Trigger emergency stop
      this.triggerSequenceEmergencyStop(executionId, 'Consecutive failure threshold exceeded');
    }

    this.log(`Sequence progress updated: ${executionId} - ${state.currentPush}/${state.totalPushes} pushes`);

    return state;
  }

  /**
   * Check if sequence should be stopped due to safety concerns
   */
  shouldStopSequence(executionId: string): {
    shouldStop: boolean;
    reason?: string;
    severity: 'warning' | 'critical';
  } {
    const state = this.activeMonitoring.get(executionId);
    if (!state) {
      return { shouldStop: false, severity: 'warning' };
    }

    // Check consecutive failures
    if (state.consecutiveFailures >= this.DEFAULT_CONFIG.emergencyStopOnFailureCount) {
      return {
        shouldStop: true,
        reason: `${state.consecutiveFailures} consecutive failures`,
        severity: 'critical'
      };
    }

    // Check failure rate
    const failureRate = state.failureCount / Math.max(state.currentPush, 1);
    if (failureRate > 0.5 && state.currentPush >= 3) {
      return {
        shouldStop: true,
        reason: `High failure rate: ${Math.round(failureRate * 100)}%`,
        severity: 'critical'
      };
    }

    // Check if execution is taking too long
    const executionStart = new Date(state.estimatedCompletion);
    const now = new Date();
    const expectedDuration = 60 * 60 * 1000; // 1 hour max expected
    
    if (now.getTime() - executionStart.getTime() > expectedDuration) {
      return {
        shouldStop: true,
        reason: 'Execution timeout - taking longer than expected',
        severity: 'warning'
      };
    }

    return { shouldStop: false, severity: 'warning' };
  }

  /**
   * Complete sequence monitoring
   */
  completeSequenceMonitoring(executionId: string): void {
    const state = this.activeMonitoring.get(executionId);
    if (state) {
      this.log(`Completed sequence monitoring: ${executionId} - ${state.currentPush}/${state.totalPushes} pushes, ${state.failureCount} failures`);
      
      // Log final stats
      automationLogger.log('info', state.automationId, 'sequence_safety', 'Sequence monitoring completed', {
        executionId,
        totalPushes: state.totalPushes,
        failureCount: state.failureCount,
        cumulativeAudienceSize: state.cumulativeAudienceSize,
        finalRiskLevel: state.riskLevel
      });
    }

    this.activeMonitoring.delete(executionId);
  }

  /**
   * Trigger emergency stop for sequence
   */
  private async triggerSequenceEmergencyStop(executionId: string, reason: string): Promise<void> {
    const state = this.activeMonitoring.get(executionId);
    if (!state) {
      return;
    }

    this.log(`Triggering emergency stop for sequence ${executionId}: ${reason}`);

    // Log emergency stop
    automationLogger.log('error', state.automationId, 'sequence_safety', 'Emergency stop triggered', {
      executionId,
      reason,
      currentPush: state.currentPush,
      failureCount: state.failureCount,
      consecutiveFailures: state.consecutiveFailures
    });

    // Create safety violation
    const violation = {
      id: `seq_emergency_${Date.now()}`,
      automationId: state.automationId,
      type: 'sequence_emergency_stop' as const,
      severity: 'critical' as const,
      message: `Sequence emergency stop: ${reason}`,
      data: { executionId, state },
      timestamp: new Date().toISOString(),
      resolved: false
    };

    // This would normally trigger the actual emergency stop
    // For now, we'll just log it
    this.log(`Emergency stop logged for ${executionId}`);
  }

  /**
   * Private validation methods
   */
  private async validatePushSequenceSafety(automation: UniversalAutomation): Promise<{
    warnings: string[];
    criticalIssues: string[];
  }> {
    const warnings: string[] = [];
    const criticalIssues: string[] = [];

    for (const [index, push] of automation.pushSequence.entries()) {
      // Check push content
      if (!push.title || push.title.length < 5) {
        criticalIssues.push(`Push ${index + 1}: Title too short or missing`);
      }
      
      if (!push.body || push.body.length < 10) {
        criticalIssues.push(`Push ${index + 1}: Body too short or missing`);
      }

      // Check layer appropriateness for sequences
      if (push.layerId === 1 && automation.pushSequence.length > 1) {
        warnings.push(`Push ${index + 1}: Layer 1 (platform-wide) in sequence may overwhelm users`);
      }

      // Check timing configuration
      if (index > 0 && push.timing.delayAfterPrevious < 30) {
        warnings.push(`Push ${index + 1}: Very short delay (${push.timing.delayAfterPrevious}min) may overwhelm users`);
      }

      if (push.timing.delayAfterPrevious > 10080) { // 7 days
        warnings.push(`Push ${index + 1}: Very long delay (${Math.round(push.timing.delayAfterPrevious / 1440)} days)`);
      }
    }

    return { warnings, criticalIssues };
  }

  private calculateTotalDelay(automation: UniversalAutomation): number {
    return automation.pushSequence.reduce((total, push) => total + push.timing.delayAfterPrevious, 0);
  }

  private async checkAudienceOverlap(automation: UniversalAutomation): Promise<{
    overlapPercentage: number;
    estimatedUniqueUsers: number;
  }> {
    // This would calculate actual audience overlap
    // For now, we'll estimate based on criteria similarity
    const uniqueCriteria = new Set();
    
    for (const push of automation.pushSequence) {
      const criteriaKey = push.audienceQuery || JSON.stringify(automation.audienceCriteria);
      uniqueCriteria.add(criteriaKey);
    }

    const overlapPercentage = Math.max(0, 100 - (uniqueCriteria.size / automation.pushSequence.length) * 100);
    const estimatedUniqueUsers = Math.round(1000 * (uniqueCriteria.size / automation.pushSequence.length));

    return { overlapPercentage, estimatedUniqueUsers };
  }

  private validateTimingPatterns(automation: UniversalAutomation): {
    warnings: string[];
    recommendations: string[];
  } {
    const warnings: string[] = [];
    const recommendations: string[] = [];

    const delays = automation.pushSequence.map(p => p.timing.delayAfterPrevious);
    const avgDelay = delays.reduce((sum, delay) => sum + delay, 0) / delays.length;

    // Check for inconsistent timing
    const hasInconsistentTiming = delays.some(delay => 
      Math.abs(delay - avgDelay) > avgDelay * 0.5
    );

    if (hasInconsistentTiming) {
      warnings.push('Inconsistent timing patterns detected - may confuse users');
      recommendations.push('Consider using consistent delays between pushes');
    }

    // Check for bunched pushes
    const shortDelays = delays.filter(delay => delay < 60).length; // Less than 1 hour
    if (shortDelays > automation.pushSequence.length * 0.5) {
      warnings.push('Many pushes have short delays - risk of user fatigue');
      recommendations.push('Spread pushes over longer time periods');
    }

    return { warnings, recommendations };
  }

  private calculateRiskLevel(
    criticalIssues: string[],
    warnings: string[],
    automation: UniversalAutomation
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (criticalIssues.length > 0) {
      return 'critical';
    }

    if (warnings.length > 3) {
      return 'high';
    }

    if (warnings.length > 1 || automation.pushSequence.length > 10) {
      return 'medium';
    }

    return 'low';
  }

  private calculateCurrentRiskLevel(state: SequenceMonitoringState): 'low' | 'medium' | 'high' | 'critical' {
    const failureRate = state.failureCount / Math.max(state.currentPush, 1);
    
    if (state.consecutiveFailures >= 3 || failureRate > 0.5) {
      return 'critical';
    }
    
    if (state.consecutiveFailures >= 2 || failureRate > 0.3) {
      return 'high';
    }
    
    if (state.failureCount > 0 || state.cumulativeAudienceSize > 50000) {
      return 'medium';
    }
    
    return 'low';
  }

  private calculateEstimatedCompletion(automation: UniversalAutomation): string {
    const totalDelay = this.calculateTotalDelay(automation);
    const estimatedDuration = totalDelay + (automation.pushSequence.length * 2); // 2 min per push execution
    
    return new Date(Date.now() + estimatedDuration * 60 * 1000).toISOString();
  }

  /**
   * Public monitoring methods
   */
  getSequenceMonitoringState(executionId: string): SequenceMonitoringState | null {
    return this.activeMonitoring.get(executionId) || null;
  }

  getAllActiveSequences(): SequenceMonitoringState[] {
    return Array.from(this.activeMonitoring.values());
  }

  getSequenceSafetyStats(): {
    activeSequences: number;
    totalFailures: number;
    highRiskSequences: number;
    averageSequenceLength: number;
  } {
    const sequences = Array.from(this.activeMonitoring.values());
    
    return {
      activeSequences: sequences.length,
      totalFailures: sequences.reduce((sum, seq) => sum + seq.failureCount, 0),
      highRiskSequences: sequences.filter(seq => seq.riskLevel === 'high' || seq.riskLevel === 'critical').length,
      averageSequenceLength: sequences.length > 0 
        ? sequences.reduce((sum, seq) => sum + seq.totalPushes, 0) / sequences.length 
        : 0
    };
  }

  private log(message: string): void {
    console.log(`${this.logPrefix} ${new Date().toISOString()} - ${message}`);
  }

  private logError(message: string, error: any): void {
    console.error(`${this.logPrefix} ${new Date().toISOString()} - ERROR: ${message}`, error);
  }
}

// Export singleton instance
export const sequenceSafety = new SequenceSafety();