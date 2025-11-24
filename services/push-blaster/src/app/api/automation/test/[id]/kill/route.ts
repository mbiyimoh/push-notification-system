// Kill Test API - Terminates running automation tests

// Force Node.js runtime for reliable process management
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { 
  getRunningTest, 
  deleteRunningTest, 
  getAllRunningTests 
} from '@/lib/testProcessManager';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST - Kill a running test
export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { mode } = body;

    console.log(`[KILL_TEST] Request to kill test for automation ${id}, mode: ${mode}`);

    const runningTest = getRunningTest(id, mode);

    if (!runningTest) {
      console.log(`[KILL_TEST] No running test found for ${id}-${mode}`);
      return NextResponse.json({
        success: false,
        message: 'No running test found to kill'
      });
    }

    try {
      // If we have a process reference, try to kill it
      if (runningTest.process && runningTest.process.pid) {
        console.log(`[KILL_TEST] Attempting to kill process ${runningTest.process.pid}`);
        
        try {
          process.kill(runningTest.process.pid, 'SIGTERM');
          console.log(`[KILL_TEST] Sent SIGTERM to process ${runningTest.process.pid}`);
          
          // Give it a moment, then try SIGKILL if still running
          setTimeout(() => {
            try {
              process.kill(runningTest.process.pid, 'SIGKILL');
              console.log(`[KILL_TEST] Sent SIGKILL to process ${runningTest.process.pid}`);
            } catch (e) {
              // Process likely already terminated
              console.log(`[KILL_TEST] Process ${runningTest.process.pid} already terminated`);
            }
          }, 2000);
          
        } catch (error: any) {
          console.log(`[KILL_TEST] Process ${runningTest.process.pid} not found or already terminated`);
        }
      }

      // Remove the test from our tracking map
      deleteRunningTest(id, mode);

      const duration = Date.now() - runningTest.startTime;
      console.log(`[KILL_TEST] Test ${id}-${mode} killed after ${duration}ms`);

      return NextResponse.json({
        success: true,
        message: `Test killed successfully after ${Math.round(duration / 1000)}s`
      });

    } catch (error: any) {
      console.error(`[KILL_TEST] Error killing test ${id}-${mode}:`, error);
      
      // Still remove from tracking even if kill failed
      deleteRunningTest(id, mode);
      
      return NextResponse.json({
        success: false,
        message: `Failed to kill test: ${error.message}`
      });
    }

  } catch (error: any) {
    console.error('[KILL_TEST] Error processing kill request:', error);
    return NextResponse.json({
      success: false,
      message: `Error processing kill request: ${error.message}`
    }, { status: 500 });
  }
}

// GET - List running tests (for debugging)
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  
  const runningTestsList = getAllRunningTests();

  return NextResponse.json({
    success: true,
    automationId: id,
    runningTests: runningTestsList
  });
}