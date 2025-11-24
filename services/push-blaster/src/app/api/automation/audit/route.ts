// Emergency Audit API - Comprehensive check for zombie cron jobs
// Checks multiple instances and potential race conditions

import { NextRequest, NextResponse } from 'next/server';
import { getAutomationEngineInstance } from '@/lib/automationEngine';

export async function GET(req: NextRequest) {
  try {
    const automationEngine = getAutomationEngineInstance();
    const auditResults = [];
    
    // Test multiple rapid calls to see if we get different instances
    for (let i = 0; i < 5; i++) {
      const debugInfo = automationEngine.getDebugInfo();
      auditResults.push({
        callNumber: i + 1,
        instanceId: debugInfo.instanceId,
        scheduledJobsCount: debugInfo.scheduledJobsCount,
        scheduledJobs: debugInfo.scheduledJobs,
        timestamp: new Date().toISOString()
      });
      
      // Small delay to allow for any async operations
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Analysis
    const uniqueInstances = new Set(auditResults.map(r => r.instanceId));
    const totalJobs = auditResults.reduce((sum, r) => sum + r.scheduledJobsCount, 0);
    const maxJobs = Math.max(...auditResults.map(r => r.scheduledJobsCount));
    
    return NextResponse.json({
      success: true,
      data: {
        auditResults,
        analysis: {
          uniqueInstancesFound: uniqueInstances.size,
          instanceIds: Array.from(uniqueInstances),
          totalJobsAcrossInstances: totalJobs,
          maxJobsInSingleInstance: maxJobs,
          potentialZombieRisk: uniqueInstances.size > 1 || maxJobs > 1,
          recommendation: uniqueInstances.size > 1 
            ? "🚨 MULTIPLE INSTANCES DETECTED - Singleton pattern failing!"
            : maxJobs > 1 
            ? "⚠️ Multiple jobs in single instance - potential duplicates"
            : "✅ Clean state - single instance with single job"
        }
      },
      timestamp: new Date().toISOString(),
      message: 'Emergency audit completed'
    });

  } catch (error: any) {
    console.error('Error during emergency audit:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to complete audit',
      error: error.message
    }, { status: 500 });
  }
}
