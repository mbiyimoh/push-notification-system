// Automation Testing API
// Comprehensive testing suite for automation validation

import { NextRequest, NextResponse } from 'next/server';
import { automationStorage } from '@/lib/automationStorage';
import { automationLogger } from '@/lib/automationLogger';
import { AutomationTester } from '@/lib/automationTester';

// POST - Run comprehensive test suite
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { automationId, testType = 'comprehensive' } = body;

    if (!automationId) {
      return NextResponse.json({
        success: false,
        message: 'Automation ID is required',
        errors: ['Missing automationId']
      }, { status: 400 });
    }

    // Load automation
    const automation = await automationStorage.loadAutomation(automationId);
    if (!automation) {
      return NextResponse.json({
        success: false,
        message: 'Automation not found'
      }, { status: 404 });
    }

    // Run test suite
    const tester = new AutomationTester();
    const testSuite = await tester.runComprehensiveTests(automation);

    // Log test results
    automationLogger.log('info', automationId, 'testing', 'Test suite completed', {
      overallStatus: testSuite.overallStatus,
      passedTests: testSuite.passedTests,
      failedTests: testSuite.failedTests,
      duration: testSuite.duration
    });

    return NextResponse.json({
      success: true,
      data: testSuite,
      message: `Test suite completed: ${testSuite.overallStatus}`
    });

  } catch (error: any) {
    console.error('Error running automation tests:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to run automation tests',
      errors: [error.message]
    }, { status: 500 });
  }
}