import { NextRequest, NextResponse } from 'next/server';
import { automationLogger, ExecutionLog } from '@/lib/automationLogger';

type ExecutionStatus = 'running' | 'completed' | 'failed' | 'cancelled';

interface ExecutionSummary {
  executionId: string;
  startTime: string;
  endTime?: string;
  status: ExecutionStatus;
  duration: number;
  metrics: {
    totalSentCount: number;
    totalAudienceSize: number;
    failedPushes: number;
    successfulPushes: number;
  };
}

function toSummary(log: ExecutionLog): ExecutionSummary {
  return {
    executionId: log.executionId,
    startTime: log.startTime,
    endTime: log.endTime,
    status: log.status,
    duration: log.metrics.totalDuration,
    metrics: {
      totalSentCount: log.metrics.totalSentCount,
      totalAudienceSize: log.metrics.totalAudienceSize,
      failedPushes: log.metrics.failedPushes,
      successfulPushes: log.metrics.successfulPushes,
    },
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);

    // Parse pagination params with defaults and bounds
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(Math.max(1, parseInt(searchParams.get('limit') || '20')), 100);

    // Parse filter params
    const status = searchParams.get('status') as ExecutionStatus | null;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Parse sort params
    const sortBy = searchParams.get('sortBy') || 'date';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Load all execution logs for this automation (using a high limit to get full history)
    const allLogs = await automationLogger.loadExecutionHistory(id, 1000);

    // Apply filters
    let filtered = allLogs;

    if (status) {
      filtered = filtered.filter(log => log.status === status);
    }

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        filtered = filtered.filter(log => new Date(log.startTime) >= start);
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        filtered = filtered.filter(log => new Date(log.startTime) <= end);
      }
    }

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'duration':
          comparison = a.metrics.totalDuration - b.metrics.totalDuration;
          break;
        case 'sent':
          comparison = a.metrics.totalSentCount - b.metrics.totalSentCount;
          break;
        case 'date':
        default:
          comparison = new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Calculate pagination
    const total = filtered.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const executions = filtered.slice(offset, offset + limit).map(toSummary);

    return NextResponse.json({
      success: true,
      data: {
        executions,
        pagination: {
          page,
          limit,
          total,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      message: 'Execution history retrieved successfully',
    });
  } catch (error: unknown) {
    console.error('History API error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to load execution history' },
      { status: 500 }
    );
  }
}
