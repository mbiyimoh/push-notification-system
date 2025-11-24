// Scripts API Route
// Handles script discovery and execution for automation

import { NextRequest, NextResponse } from 'next/server';
import { scriptExecutor } from '@/lib/scriptExecutor';

// GET - List available scripts
export async function GET(req: NextRequest) {
  try {
    const scripts = await scriptExecutor.discoverAvailableScripts();
    
    return NextResponse.json({
      success: true,
      data: scripts,
      message: `Found ${scripts.length} available scripts`
    });

  } catch (error: any) {
    console.error('Script discovery failed:', error);
    
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to discover scripts'
    }, { status: 500 });
  }
}

// POST - Execute a script
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { scriptId, parameters = {}, executionId } = body;

    if (!scriptId) {
      return NextResponse.json({
        success: false,
        message: 'scriptId is required'
      }, { status: 400 });
    }

    if (!executionId) {
      return NextResponse.json({
        success: false,
        message: 'executionId is required'
      }, { status: 400 });
    }

    const result = await scriptExecutor.executeScript(scriptId, parameters, executionId);
    
    if (result.success) {
      return NextResponse.json({
        success: true,
        data: {
          csvPath: result.csvPath,
          audienceSize: result.audienceSize,
          executionTime: result.executionTime
        },
        message: `Script executed successfully. Generated ${result.audienceSize} audience records.`
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.error || 'Script execution failed',
        data: {
          executionTime: result.executionTime,
          stdout: result.stdout,
          stderr: result.stderr
        }
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Script execution failed:', error);
    
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to execute script'
    }, { status: 500 });
  }
}