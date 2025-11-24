// Debug API for AutomationEngine inspection
// Emergency endpoint to detect zombie cron jobs

import { NextRequest, NextResponse } from 'next/server';
import { getAutomationEngineInstance } from '@/lib/automationEngine';

export async function GET(req: NextRequest) {
  try {
    const automationEngine = getAutomationEngineInstance();
    const debugInfo = automationEngine.getDebugInfo();
    
    return NextResponse.json({
      success: true,
      data: debugInfo,
      timestamp: new Date().toISOString(),
      message: 'AutomationEngine debug info retrieved'
    });

  } catch (error: any) {
    console.error('Error getting debug info:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to get debug info',
      error: error.message
    }, { status: 500 });
  }
}
