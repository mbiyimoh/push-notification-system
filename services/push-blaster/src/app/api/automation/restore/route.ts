// Manual restoration trigger for AutomationEngine
// Emergency endpoint to fix missing scheduled automations

import { NextRequest, NextResponse } from 'next/server';
import { getAutomationEngineInstance } from '@/lib/automationEngine';
import { automationStorage } from '@/lib/automationStorage';

export async function POST(req: NextRequest) {
  try {
    const engine = getAutomationEngineInstance();

    // Get expected count from .automations/ directory
    const allAutomations = await automationStorage.listAutomations();
    const activeAutomations = allAutomations.filter(
      a => a.isActive === true && (a.status === 'active' || a.status === 'scheduled')
    );
    const expectedCount = activeAutomations.length;

    console.log(`[RESTORE] Found ${expectedCount} active automations in storage`);
    activeAutomations.forEach(a => {
      console.log(`[RESTORE]   - ${a.name} (${a.id.substring(0, 8)}...)`);
    });

    // Get state before restoration
    const beforeRestore = engine.getDebugInfo();
    console.log(`[RESTORE] Before: ${beforeRestore.scheduledJobsCount} jobs scheduled`);

    // Trigger restoration
    await engine.manualRestore();

    // Get state after restoration
    const afterRestore = engine.getDebugInfo();
    console.log(`[RESTORE] After: ${afterRestore.scheduledJobsCount} jobs scheduled`);

    // Validate restoration
    const restorationSuccess = afterRestore.scheduledJobsCount === expectedCount;
    const divergence = expectedCount - afterRestore.scheduledJobsCount;

    if (restorationSuccess) {
      console.log(`[RESTORE] ✅ SUCCESS: All ${expectedCount} automations scheduled`);
    } else {
      console.error(`[RESTORE] ⚠️  WARNING: ${divergence} automation(s) failed to schedule`);
    }

    return NextResponse.json({
      success: true,
      data: {
        expectedCount,
        beforeRestore: {
          scheduledJobsCount: beforeRestore.scheduledJobsCount,
          instanceId: beforeRestore.instanceId
        },
        afterRestore: {
          scheduledJobsCount: afterRestore.scheduledJobsCount,
          instanceId: afterRestore.instanceId,
          scheduledJobs: afterRestore.scheduledJobs
        },
        validation: {
          restorationSuccess,
          divergence,
          message: restorationSuccess
            ? 'All active automations successfully scheduled'
            : `${divergence} automation(s) failed to schedule - check logs for details`
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: unknown) {
    console.error('[RESTORE] Manual restoration failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json({
      success: false,
      error: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
    }, { status: 500 });
  }
}
