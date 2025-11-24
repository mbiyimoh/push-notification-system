// Sequence Execution API
// Execute and manage multi-push automation sequences

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { sequenceExecutor } from '@/lib/sequenceExecutor';
import { automationStorage } from '@/lib/automationStorage';
import { sequenceSafety } from '@/lib/sequenceSafety';

// POST - Execute automation sequence
export async function POST(req: NextRequest) {
  try {
    
    const body = await req.json();
    const { automationId, isDryRun = false, useCache = true } = body;

    if (!automationId) {
      return NextResponse.json({
        success: false,
        message: 'Automation ID is required',
        errors: ['Missing automationId']
      }, { status: 400 });
    }

    const automation = await automationStorage.loadAutomation(automationId);
    if (!automation) {
        return NextResponse.json({ success: false, message: 'Automation not found' }, { status: 404 });
    }

    const executionId = uuidv4();
    const result = await sequenceExecutor.executeSequence(automation, executionId, isDryRun);

    return NextResponse.json({
      success: result.success,
      data: {
        executionId,
        automationId,
        automationName: automation.name,
        isDryRun,
        executionResult: result
      },
      message: 'Sequence execution started successfully'
    });

  } catch (error: any) {
    console.error('Error executing sequence:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to execute sequence',
      errors: [error.message]
    }, { status: 500 });
  }
}

// GET - Get sequence execution status and active sequences
export async function GET(req: NextRequest) {
  try {
    
    const { searchParams } = new URL(req.url);
    const executionId = searchParams.get('executionId');
    const includeStats = searchParams.get('includeStats') === 'true';

    if (executionId) {
      const monitoringState = sequenceSafety.getSequenceMonitoringState(executionId);
      const progress = sequenceExecutor.getSequenceProgress(executionId);
      const shouldStop = sequenceSafety.shouldStopSequence(executionId);

      if (!monitoringState && !progress.found) {
        return NextResponse.json({ success: false, message: 'Execution not found' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        data: {
          executionId,
          monitoringState,
          progress,
          shouldStop,
          isActive: monitoringState !== null
        },
        message: 'Execution status retrieved successfully'
      });
    }

    const activeSequences = sequenceExecutor.getActiveSequences();
    const stats = includeStats ? sequenceSafety.getSequenceSafetyStats() : null;

    return NextResponse.json({
      success: true,
      data: {
        activeExecutions: Object.values(activeSequences),
        totalActive: Object.keys(activeSequences).length,
        stats
      },
      message: `Found ${Object.keys(activeSequences).length} active sequences`
    });

  } catch (error: any) {
    console.error('Error getting sequence status:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to get sequence status',
      errors: [error.message]
    }, { status: 500 });
  }
}