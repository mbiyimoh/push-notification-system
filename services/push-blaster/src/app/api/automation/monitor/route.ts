// Automation Monitoring API
// Real-time monitoring and safeguard status

import { NextRequest, NextResponse } from 'next/server';
import { safeguardMonitor } from '@/lib/safeguardMonitor';
import { getAutomationEngineInstance } from '@/lib/automationEngine';
import { automationLogger } from '@/lib/automationLogger';

// GET - Get monitoring dashboard data
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dataType = searchParams.get('type') || 'overview';

    switch (dataType) {
      case 'overview':
        return await getOverviewData();
      
      case 'violations':
        return await getViolationsData(searchParams);
      
      case 'executions':
        return await getExecutionsData();
      
      case 'health':
        return await getHealthData();
      
      default:
        return NextResponse.json({
          success: false,
          message: 'Invalid data type requested',
          errors: ['type must be one of: overview, violations, executions, health']
        }, { status: 400 });
    }

  } catch (error: unknown) {
    console.error('Error fetching monitoring data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch monitoring data',
      errors: [errorMessage]
    }, { status: 500 });
  }
}

// POST - Control monitoring (resolve violations, etc.)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, violationId, resolution } = body;

    if (!action) {
      return NextResponse.json({
        success: false,
        message: 'Action is required',
        errors: ['Missing action']
      }, { status: 400 });
    }

    switch (action) {
      case 'resolve_violation':
        if (!violationId || !resolution) {
          return NextResponse.json({
            success: false,
            message: 'violationId and resolution are required',
            errors: ['Missing required fields']
          }, { status: 400 });
        }

        const resolved = safeguardMonitor.resolveViolation(violationId, resolution);
        
        return NextResponse.json({
          success: resolved,
          message: resolved ? 'Violation resolved successfully' : 'Violation not found',
          data: { violationId, resolution }
        });

      default:
        return NextResponse.json({
          success: false,
          message: 'Unknown action',
          errors: ['Invalid action']
        }, { status: 400 });
    }

  } catch (error: unknown) {
    console.error('Error controlling monitoring:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json({
      success: false,
      message: 'Failed to control monitoring',
      errors: [errorMessage]
    }, { status: 500 });
  }
}

// Helper functions for different data types
async function getOverviewData() {
  const automationEngine = getAutomationEngineInstance();
  const metrics = safeguardMonitor.getMetrics();
  const activeExecutions = automationEngine.getAllActiveExecutions();
  const recentViolations = safeguardMonitor.getViolations().slice(0, 5);

  const overviewData = {
    metrics,
    activeExecutions: {
      count: Object.keys(activeExecutions).length,
      executions: Object.entries(activeExecutions).map(([id, execution]) => ({
        executionId: id,
        automationId: execution.automationId,
        phase: execution.currentPhase,
        startTime: execution.startTime
      }))
    },
    recentViolations: recentViolations.map(v => ({
      id: v.id,
      type: v.type,
      severity: v.severity,
      message: v.message,
      timestamp: v.timestamp,
      resolved: v.resolved
    })),
    systemStatus: {
      healthy: metrics.systemHealthScore > 80,
      healthScore: metrics.systemHealthScore,
      criticalIssues: metrics.criticalViolations,
      warningIssues: metrics.totalViolations - metrics.criticalViolations
    }
  };

  return NextResponse.json({
    success: true,
    data: overviewData,
    message: 'Monitoring overview retrieved successfully'
  });
}

async function getViolationsData(searchParams: URLSearchParams) {
  const automationId = searchParams.get('automationId');
  const severity = searchParams.get('severity') as 'warning' | 'critical';
  const resolved = searchParams.get('resolved');

  const filters = {
    ...(automationId && { automationId }),
    ...(severity && { severity }),
    ...(resolved !== null && { resolved: resolved === 'true' })
  };

  const violations = safeguardMonitor.getViolations(Object.keys(filters).length > 0 ? filters : undefined);

  return NextResponse.json({
    success: true,
    data: {
      violations,
      summary: {
        total: violations.length,
        critical: violations.filter(v => v.severity === 'critical').length,
        warning: violations.filter(v => v.severity === 'warning').length,
        unresolved: violations.filter(v => !v.resolved).length
      }
    },
    message: `Found ${violations.length} violations`
  });
}

async function getExecutionsData() {
  const automationEngine = getAutomationEngineInstance();
  const activeExecutions = automationEngine.getAllActiveExecutions();
  
  // Get detailed execution logs
  const executionDetails = await Promise.all(
    Object.entries(activeExecutions).map(async ([executionId, execution]) => {
      const fullLog = automationLogger.getExecutionLog(executionId);
      return {
        executionId,
        ...execution,
        fullLog
      };
    })
  );

  return NextResponse.json({
    success: true,
    data: {
      activeCount: executionDetails.length,
      executions: executionDetails
    },
    message: `Found ${executionDetails.length} active executions`
  });
}

async function getHealthData() {
  const metrics = safeguardMonitor.getMetrics();
  const violations = safeguardMonitor.getViolations({ resolved: false });
  
  // System health analysis
  const healthData = {
    overall: {
      score: metrics.systemHealthScore,
      status: metrics.systemHealthScore > 80 ? 'healthy' : 
              metrics.systemHealthScore > 60 ? 'warning' : 'critical'
    },
    components: {
      automation_engine: {
        status: 'healthy', // This would check actual engine health
        activeExecutions: metrics.activeExecutions,
        maxConcurrent: 10
      },
      safeguard_monitor: {
        status: violations.filter(v => v.severity === 'critical').length === 0 ? 'healthy' : 'critical',
        activeViolations: violations.length,
        criticalViolations: violations.filter(v => v.severity === 'critical').length
      },
      storage_system: {
        status: 'healthy', // This would check storage health
        lastCheck: new Date().toISOString()
      }
    },
    recommendations: [
      ...(violations.length > 5 ? ['Review and resolve pending violations'] : []),
      ...(metrics.activeExecutions > 8 ? ['High concurrent execution load'] : []),
      ...(metrics.systemHealthScore < 80 ? ['System health needs attention'] : [])
    ],
    metrics
  };

  return NextResponse.json({
    success: true,
    data: healthData,
    message: 'System health data retrieved successfully'
  });
}