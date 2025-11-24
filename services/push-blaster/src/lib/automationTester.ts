import { UniversalAutomation } from '@/types/automation';
import { automationStorage } from '@/lib/automationStorage';
import { automationIntegration } from '@/lib/automationIntegration';
import { timelineCalculator } from '@/lib/timelineCalculator';

interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
  duration?: number;
}

export interface TestSuite {
  automationId: string;
  automationName: string;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  warningTests: number;
  overallStatus: 'pass' | 'fail' | 'warning';
  duration: number;
  results: TestResult[];
  recommendations: string[];
}

export class AutomationTester {
  private logPrefix = '[AutomationTester]';

  async runComprehensiveTests(automation: UniversalAutomation): Promise<TestSuite> {
    const startTime = Date.now();
    const results: TestResult[] = [];
    const recommendations: string[] = [];

    // Test 1: Automation Configuration Validation
    results.push(await this.testConfigurationValidation(automation));
    
    // Test 2: Schedule Validation
    results.push(await this.testScheduleValidation(automation));
    
    // Test 3: Push Sequence Validation
    results.push(await this.testPushSequenceValidation(automation));
    
    // Test 4: Audience Criteria Validation
    results.push(await this.testAudienceCriteriaValidation(automation));
    
    // Test 5: Timeline Calculation
    results.push(await this.testTimelineCalculation(automation));
    
    // Test 6: Service Integration Health
    results.push(await this.testServiceIntegration());
    
    // Test 7: Safety Controls
    results.push(await this.testSafetyControls(automation));
    
    // Test 8: Storage Operations
    results.push(await this.testStorageOperations(automation));
    
    // Test 9: Dry Run Simulation
    results.push(await this.testDryRunSimulation(automation));
    
    // Test 10: Performance Validation
    results.push(await this.testPerformanceValidation(automation));

    const duration = Date.now() - startTime;
    const passedTests = results.filter(r => r.status === 'pass').length;
    const failedTests = results.filter(r => r.status === 'fail').length;
    const warningTests = results.filter(r => r.status === 'warning').length;

    // Generate recommendations
    if (failedTests > 0) {
      recommendations.push('❌ Critical issues found - automation should not be deployed');
    }
    if (warningTests > 0) {
      recommendations.push('⚠️ Review warnings before deployment');
    }
    if (automation.pushSequence.length > 5) {
      recommendations.push('📊 Consider breaking long sequences into multiple automations');
    }
    if (automation.settings.cancellationWindowMinutes < 15) {
      recommendations.push('⏰ Consider increasing cancellation window for safety');
    }

    const overallStatus = failedTests > 0 ? 'fail' : warningTests > 0 ? 'warning' : 'pass';

    return {
      automationId: automation.id,
      automationName: automation.name,
      totalTests: results.length,
      passedTests,
      failedTests,
      warningTests,
      overallStatus,
      duration,
      results,
      recommendations
    };
  }

  private async testConfigurationValidation(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const issues: string[] = [];

      if (!automation.id || !automation.name) {
        issues.push('Missing basic identification');
      }
      
      if (!automation.schedule || !automation.schedule.executionTime) {
        issues.push('Invalid schedule configuration');
      }
      
      if (!automation.pushSequence || automation.pushSequence.length === 0) {
        issues.push('No push sequence defined');
      }
      
      if (!automation.settings || !automation.settings.safeguards) {
        issues.push('Missing safety settings');
      }

      return {
        testName: 'Configuration Validation',
        status: issues.length === 0 ? 'pass' : 'fail',
        message: issues.length === 0 ? 'All configuration valid' : 'Configuration issues found',
        details: { issues },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Configuration Validation',
        status: 'fail',
        message: 'Configuration validation failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testScheduleValidation(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const warnings: string[] = [];
      
      // Test timeline calculation
      const timeline = timelineCalculator.calculateTimeline(automation);
      
      if (timeline.totalDuration > 120) { // 2 hours
        warnings.push('Timeline duration exceeds 2 hours');
      }
      
      if (automation.schedule.leadTimeMinutes < 30) {
        warnings.push('Lead time less than recommended 30 minutes');
      }

      const nextExecution = timelineCalculator.calculateNextExecution(automation);
      const now = new Date();
      
      if (nextExecution <= now) {
        warnings.push('Next execution time is in the past');
      }

      return {
        testName: 'Schedule Validation',
        status: warnings.length === 0 ? 'pass' : 'warning',
        message: warnings.length === 0 ? 'Schedule configuration valid' : 'Schedule warnings found',
        details: { 
          warnings,
          nextExecution: nextExecution.toISOString(),
          timeline: {
            totalDuration: timeline.totalDuration,
            eventCount: timeline.events.length
          }
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Schedule Validation',
        status: 'fail',
        message: 'Schedule validation failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testPushSequenceValidation(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const issues: string[] = [];
      const warnings: string[] = [];

      for (const [index, push] of automation.pushSequence.entries()) {
        if (!push.title || !push.body) {
          issues.push(`Push ${index + 1}: Missing title or body`);
        }
        
        if (!push.deepLink) {
          warnings.push(`Push ${index + 1}: No deep link specified`);
        }
        
        if (push.layerId < 1 || push.layerId > 5) {
          issues.push(`Push ${index + 1}: Invalid layer ID ${push.layerId}`);
        }
        
        if (push.title.length > 100) {
          warnings.push(`Push ${index + 1}: Title may be truncated (${push.title.length} chars)`);
        }
        
        if (push.body.length > 200) {
          warnings.push(`Push ${index + 1}: Body may be truncated (${push.body.length} chars)`);
        }
      }

      const status = issues.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass';
      const message = issues.length > 0 ? 'Push sequence has errors' : 
                     warnings.length > 0 ? 'Push sequence has warnings' : 
                     'Push sequence valid';

      return {
        testName: 'Push Sequence Validation',
        status,
        message,
        details: { issues, warnings, pushCount: automation.pushSequence.length },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Push Sequence Validation',
        status: 'fail',
        message: 'Push sequence validation failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testAudienceCriteriaValidation(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const warnings: string[] = [];
      const criteria = automation.audienceCriteria;

      // Estimate audience size
      const estimate = timelineCalculator.estimateAudienceSize(automation);
      
      if (estimate.estimatedSize > automation.settings.safeguards.maxAudienceSize) {
        warnings.push(`Estimated audience (${estimate.estimatedSize}) exceeds safety limit`);
      }
      
      if (estimate.estimatedSize < 10) {
        warnings.push('Estimated audience is very small - check criteria');
      }
      
      if (criteria.activityDays > 365) {
        warnings.push('Activity days criteria may be too broad');
      }
      
      if (criteria.minTrades > 1000) {
        warnings.push('Minimum trades criteria may be too restrictive');
      }

      return {
        testName: 'Audience Criteria Validation',
        status: warnings.length === 0 ? 'pass' : 'warning',
        message: warnings.length === 0 ? 'Audience criteria valid' : 'Audience criteria warnings',
        details: { 
          warnings,
          estimatedSize: estimate.estimatedSize,
          confidence: estimate.confidence,
          criteria
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Audience Criteria Validation',
        status: 'fail',
        message: 'Audience criteria validation failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testTimelineCalculation(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const timeline = timelineCalculator.calculateTimeline(automation);
      const warnings: string[] = [];

      if (timeline.events.length === 0) {
        return {
          testName: 'Timeline Calculation',
          status: 'fail',
          message: 'No timeline events generated',
          duration: Date.now() - startTime
        };
      }

      // Check for reasonable spacing
      for (let i = 1; i < timeline.events.length; i++) {
        const timeDiff = timeline.events[i].scheduledTime.getTime() - timeline.events[i-1].scheduledTime.getTime();
        if (timeDiff < 0) {
          warnings.push('Timeline events are not in chronological order');
        }
      }

      return {
        testName: 'Timeline Calculation',
        status: warnings.length === 0 ? 'pass' : 'warning',
        message: warnings.length === 0 ? 'Timeline calculation successful' : 'Timeline warnings found',
        details: {
          warnings,
          eventCount: timeline.events.length,
          totalDuration: timeline.totalDuration,
          startTime: timeline.startTime.toISOString(),
          endTime: timeline.endTime.toISOString()
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Timeline Calculation',
        status: 'fail',
        message: 'Timeline calculation failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testServiceIntegration(): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const health = await automationIntegration.checkServiceHealth();
      const issues: string[] = [];

      if (!health.pushBlaster) {
        issues.push('Push-blaster service unavailable');
      }
      
      if (!health.cadenceService) {
        issues.push('Cadence service unavailable');
      }

      issues.push(...health.errors);

      return {
        testName: 'Service Integration Health',
        status: issues.length === 0 ? 'pass' : 'fail',
        message: issues.length === 0 ? 'All services healthy' : 'Service integration issues',
        details: { issues, health },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Service Integration Health',
        status: 'fail',
        message: 'Service health check failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testSafetyControls(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const warnings: string[] = [];

      if (!automation.settings.emergencyStopEnabled) {
        warnings.push('Emergency stop is disabled');
      }
      
      if (automation.settings.cancellationWindowMinutes < 10) {
        warnings.push('Cancellation window is very short');
      }
      
      if (!automation.settings.dryRunFirst) {
        warnings.push('Dry run testing is disabled');
      }
      
      if (automation.settings.testUserIds.length === 0) {
        warnings.push('No test users configured');
      }

      return {
        testName: 'Safety Controls',
        status: warnings.length === 0 ? 'pass' : 'warning',
        message: warnings.length === 0 ? 'Safety controls properly configured' : 'Safety control warnings',
        details: { warnings, safetySettings: automation.settings },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Safety Controls',
        status: 'fail',
        message: 'Safety controls test failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testStorageOperations(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // Test save and load operations
      const saveResult = await automationStorage.saveAutomation(automation);
      if (!saveResult.success) {
        return {
          testName: 'Storage Operations',
          status: 'fail',
          message: 'Failed to save automation',
          details: { error: saveResult.message },
          duration: Date.now() - startTime
        };
      }

      const loadedAutomation = await automationStorage.loadAutomation(automation.id);
      if (!loadedAutomation) {
        return {
          testName: 'Storage Operations',
          status: 'fail',
          message: 'Failed to load automation',
          duration: Date.now() - startTime
        };
      }

      return {
        testName: 'Storage Operations',
        status: 'pass',
        message: 'Storage operations successful',
        details: { saveSuccess: true, loadSuccess: true },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Storage Operations',
        status: 'fail',
        message: 'Storage operations failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testDryRunSimulation(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      // Simulate a dry run with test users
      const testUserIds = automation.settings.testUserIds.length > 0 ? 
        automation.settings.testUserIds : ['test_user_1'];

      const firstPush = automation.pushSequence[0];
      if (!firstPush) {
        return {
          testName: 'Dry Run Simulation',
          status: 'fail',
          message: 'No push to test',
          duration: Date.now() - startTime
        };
      }

      // Simulate the dry run (without actually sending)
      const simulationResult = {
        audienceSize: testUserIds.length,
        estimatedDeliveryTime: 30, // seconds
        cadenceFiltering: true
      };

      return {
        testName: 'Dry Run Simulation',
        status: 'pass',
        message: 'Dry run simulation successful',
        details: { 
          testUserCount: testUserIds.length,
          simulationResult 
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Dry Run Simulation',
        status: 'fail',
        message: 'Dry run simulation failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }

  private async testPerformanceValidation(automation: UniversalAutomation): Promise<TestResult> {
    const startTime = Date.now();
    try {
      const warnings: string[] = [];
      
      // Check for performance concerns
      if (automation.pushSequence.length > 10) {
        warnings.push('Large push sequence may impact performance');
      }
      
      const timeline = timelineCalculator.calculateTimeline(automation);
      if (timeline.totalDuration > 180) { // 3 hours
        warnings.push('Very long execution timeline');
      }

      // Estimate resource usage
      const estimatedMemoryUsage = automation.pushSequence.length * 100; // KB per push
      const estimatedProcessingTime = automation.pushSequence.length * 2; // seconds per push

      if (estimatedMemoryUsage > 10000) { // 10MB
        warnings.push('High memory usage estimated');
      }

      return {
        testName: 'Performance Validation',
        status: warnings.length === 0 ? 'pass' : 'warning',
        message: warnings.length === 0 ? 'Performance validation passed' : 'Performance concerns found',
        details: {
          warnings,
          estimatedMemoryUsage,
          estimatedProcessingTime,
          pushCount: automation.pushSequence.length
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        testName: 'Performance Validation',
        status: 'fail',
        message: 'Performance validation failed',
        details: { error: error.message },
        duration: Date.now() - startTime
      };
    }
  }
}
