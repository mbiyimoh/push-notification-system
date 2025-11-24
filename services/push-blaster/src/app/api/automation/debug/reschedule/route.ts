import { NextRequest, NextResponse } from 'next/server';
import { getAutomationEngineInstance } from '@/lib/automationEngine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST - Manually reschedule an automation for debugging
export async function POST(req: NextRequest) {
  try {
    const automationEngine = getAutomationEngineInstance();
    const { automationId } = await req.json();
    
    if (!automationId) {
      return NextResponse.json({
        success: false,
        message: 'Automation ID is required'
      }, { status: 400 });
    }
    
    const result = await automationEngine.rescheduleAutomation(automationId);
    
    return NextResponse.json(result, { 
      status: result.success ? 200 : 500 
    });
    
  } catch (error: any) {
    console.error('Error rescheduling automation:', error);
    return NextResponse.json({
      success: false,
      message: `Failed to reschedule automation: ${error.message}`
    }, { status: 500 });
  }
}