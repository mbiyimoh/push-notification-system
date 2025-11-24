// Automation Control API
// Emergency stop, cancellation, and safety controls for automations

import { NextRequest, NextResponse } from 'next/server';
import { getAutomationEngineInstance } from '@/lib/automationEngine';
import { automationStorage } from '@/lib/automationStorage';
import { automationLogger } from '@/lib/automationLogger';

// POST - Control automation (cancel, emergency stop, pause, resume)
export async function POST(req: NextRequest) {
  try {
    const automationEngine = getAutomationEngineInstance();
    const body = await req.json();
    const { automationId, action, reason } = body;

    if (!automationId || !action) {
      return NextResponse.json({
        success: false,
        message: 'automationId and action are required',
        errors: ['Missing required fields']
      }, { status: 400 });
    }

    // Load automation to verify it exists
    const automation = await automationStorage.loadAutomation(automationId);
    if (!automation) {
      return NextResponse.json({
        success: false,
        message: 'Automation not found'
      }, { status: 404 });
    }

    let result;
    const timestamp = new Date().toISOString();

    switch (action) {
      case 'emergency_stop':
        result = await automationEngine.emergencyStop(automationId);
        automationLogger.log('warn', automationId, 'control', 'Emergency stop triggered', { 
          reason: reason || 'Manual emergency stop',
          timestamp 
        });
        break;

      case 'cancel':
        result = await automationEngine.cancelAutomation(automationId, reason || 'Manual cancellation');
        automationLogger.log('info', automationId, 'control', 'Automation cancelled', { 
          reason: reason || 'Manual cancellation',
          timestamp 
        });
        break;

      case 'pause':
        // Update automation status to paused
        automation.status = 'paused';
        await automationStorage.saveAutomation(automation);
        result = {
          success: true,
          executionId: automationId,
          status: 'paused',
          message: 'Automation paused successfully'
        };
        automationLogger.log('info', automationId, 'control', 'Automation paused', { 
          reason: reason || 'Manual pause',
          timestamp 
        });
        break;

      case 'resume':
        // Update automation status back to scheduled/running
        automation.status = automation.metadata.lastExecutedAt ? 'scheduled' : 'draft';
        await automationStorage.saveAutomation(automation);
        
        // Re-schedule if it was scheduled before
        if (automation.status === 'scheduled') {
          const scheduleResult = await automationEngine.scheduleAutomation(automation);
          result = {
            success: scheduleResult.success,
            executionId: automationId,
            status: 'scheduled',
            message: scheduleResult.message
          };
        } else {
          result = {
            success: true,
            executionId: automationId,
            status: 'draft',
            message: 'Automation resumed to draft status'
          };
        }
        automationLogger.log('info', automationId, 'control', 'Automation resumed', { 
          reason: reason || 'Manual resume',
          timestamp 
        });
        break;

      default:
        return NextResponse.json({
          success: false,
          message: `Unknown action: ${action}`,
          errors: ['Invalid action']
        }, { status: 400 });
    }

    // Log the control action
    await automationStorage.saveExecutionLog(automationId, {
      action: 'control',
      controlAction: action,
      reason: reason || 'No reason provided',
      timestamp,
      result
    });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Error controlling automation:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to control automation',
      errors: [error.message]
    }, { status: 500 });
  }
}

// GET - Get automation status and control options
export async function GET(req: NextRequest) {
  try {
    const automationEngine = getAutomationEngineInstance();
    const { searchParams } = new URL(req.url);
    const automationId = searchParams.get('id');

    if (!automationId) {
      return NextResponse.json({
        success: false,
        message: 'Automation ID is required',
        errors: ['Missing ID parameter']
      }, { status: 400 });
    }

    // Get automation details
    const automation = await automationStorage.loadAutomation(automationId);
    if (!automation) {
      return NextResponse.json({
        success: false,
        message: 'Automation not found'
      }, { status: 404 });
    }

    // Get execution status if running
    const executionStatus = automationEngine.getExecutionStatus(automationId);
    
    // Determine available control actions
    const availableActions = [];
    
    if (automation.status === 'running' && executionStatus) {
      availableActions.push('emergency_stop');
      if (executionStatus.canCancel) {
        availableActions.push('cancel');
      }
      availableActions.push('pause');
    } else if (automation.status === 'scheduled') {
      availableActions.push('cancel', 'pause');
    } else if (automation.status === 'paused') {
      availableActions.push('resume', 'cancel');
    }

    // Calculate time remaining for cancellation if applicable
    let cancellationInfo = null;
    if (executionStatus?.canCancel && executionStatus.cancellationDeadline) {
      const now = new Date();
      const deadline = new Date(executionStatus.cancellationDeadline);
      const timeRemaining = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (60 * 1000)));
      
      cancellationInfo = {
        canCancel: true,
        timeRemainingMinutes: timeRemaining,
        deadline: executionStatus.cancellationDeadline
      };
    }

    return NextResponse.json({
      success: true,
      data: {
        automation: {
          id: automation.id,
          name: automation.name,
          status: automation.status,
          type: automation.type
        },
        executionStatus,
        cancellationInfo,
        availableActions,
        emergencyStopAlwaysAvailable: automation.status === 'running'
      },
      message: 'Control status retrieved successfully'
    });

  } catch (error: any) {
    console.error('Error getting automation control status:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to get control status',
      errors: [error.message]
    }, { status: 500 });
  }
}