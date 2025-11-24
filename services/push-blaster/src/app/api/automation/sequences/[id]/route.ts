import { NextRequest, NextResponse } from 'next/server';
import { sequenceExecutor } from '@/lib/sequenceExecutor';
import { sequenceSafety } from '@/lib/sequenceSafety';
import { audienceProcessor } from '@/lib/audienceProcessor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET - Get specific sequence execution details
export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: executionId } = await params;
    
    const monitoringState = sequenceSafety.getSequenceMonitoringState(executionId);
    const progress = sequenceExecutor.getSequenceProgress(executionId);
    const shouldStop = sequenceSafety.shouldStopSequence(executionId);
    
    const cachedAudience = await audienceProcessor.loadCachedAudience(executionId);
    const cacheValidation = cachedAudience 
      ? await audienceProcessor.validateCache(executionId) 
      : { valid: false, issues: ['No cache found'] };

    if (!monitoringState && !progress.found) {
      return NextResponse.json({
        success: false,
        message: 'Sequence execution not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        executionId,
        monitoringState,
        progress,
        safetyAssessment: shouldStop,
        audienceCache: {
          available: !!cachedAudience,
          valid: cacheValidation.valid,
          issues: cacheValidation.issues,
          manifest: cachedAudience
        },
        isActive: monitoringState !== null,
        controlOptions: {
          canPause: monitoringState !== null,
          canCancel: monitoringState !== null,
          canStop: monitoringState !== null,
          emergencyStopAvailable: true
        }
      },
      message: 'Sequence execution details retrieved successfully'
    });

  } catch (error: any) {
    console.error('Error getting sequence execution details:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to get sequence execution details',
      errors: [error.message]
    }, { status: 500 });
  }
}

// POST - Control sequence execution (pause, cancel, stop)
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: executionId } = await params;
    const body = await req.json();
    const { action, reason } = body;

    if (!action) {
      return NextResponse.json({
        success: false,
        message: 'Action is required',
        errors: ['Missing action parameter']
      }, { status: 400 });
    }

    const monitoringState = sequenceSafety.getSequenceMonitoringState(executionId);
    const progress = sequenceExecutor.getSequenceProgress(executionId);
    
    if (!monitoringState && !progress.found) {
      return NextResponse.json({
        success: false,
        message: 'Sequence execution not found'
      }, { status: 404 });
    }

    let result;
    const timestamp = new Date().toISOString();

    switch (action) {
      case 'pause':
        result = await sequenceExecutor.pauseSequence(executionId);
        return NextResponse.json({
          success: result,
          data: { executionId, action: 'pause', timestamp, reason: reason || 'Manual pause' },
          message: result ? 'Sequence paused successfully' : 'Failed to pause sequence'
        });

      case 'cancel':
        result = await sequenceExecutor.cancelSequence(executionId, reason || 'Manual cancellation');
        if (result) {
          sequenceSafety.completeSequenceMonitoring(executionId);
        }
        return NextResponse.json({
          success: result,
          data: { executionId, action: 'cancel', timestamp, reason: reason || 'Manual cancellation' },
          message: result ? 'Sequence cancelled successfully' : 'Failed to cancel sequence'
        });

      case 'emergency_stop':
        result = await sequenceExecutor.cancelSequence(executionId, `EMERGENCY STOP: ${reason || 'Manual emergency stop'}`);
        if (result) {
          sequenceSafety.completeSequenceMonitoring(executionId);
          console.warn(`Emergency stop executed for sequence ${executionId}: ${reason || 'Manual emergency stop'}`);
        }
        return NextResponse.json({
          success: result,
          data: { executionId, action: 'emergency_stop', timestamp, reason: reason || 'Manual emergency stop' },
          message: result ? 'Emergency stop executed successfully' : 'Failed to execute emergency stop'
        });

      default:
        return NextResponse.json({
          success: false,
          message: 'Unknown action',
          errors: ['Valid actions: pause, cancel, emergency_stop']
        }, { status: 400 });
    }

  } catch (error: any) {
    console.error('Error controlling sequence execution:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to control sequence execution',
      errors: [error.message]
    }, { status: 500 });
  }
}

// DELETE - Cleanup sequence execution
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id: executionId } = await params;
    
    const monitoringState = sequenceSafety.getSequenceMonitoringState(executionId);
    if (monitoringState) {
      return NextResponse.json({
        success: false,
        message: 'Cannot delete active sequence execution',
        errors: ['Stop or cancel the sequence before deletion']
      }, { status: 400 });
    }

    sequenceSafety.completeSequenceMonitoring(executionId);
    
    // Future: Add cache clearing logic here via audienceProcessor
    
    return NextResponse.json({
      success: true,
      message: 'Sequence execution cleaned up successfully'
    });

  } catch (error: any) {
    console.error('Error cleaning up sequence execution:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to cleanup sequence execution',
      errors: [error.message]
    }, { status: 500 });
  }
}