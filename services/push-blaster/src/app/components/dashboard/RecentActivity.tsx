'use client';

import Link from 'next/link';

interface ExecutionSummary {
  executionId: string;
  automationId: string;
  automationName: string;
  startTime: string;
  status: 'completed' | 'failed' | 'running';
  metrics: {
    totalSentCount: number;
    totalAudienceSize: number;
  };
  error?: string;
}

interface RecentActivityProps {
  executions: ExecutionSummary[];
}

const statusIcons = {
  completed: {
    icon: '✓',
    color: 'text-green-600',
    bg: 'bg-green-100',
  },
  failed: {
    icon: '✗',
    color: 'text-red-600',
    bg: 'bg-red-100',
  },
  running: {
    icon: '●',
    color: 'text-blue-600',
    bg: 'bg-blue-100',
  },
};

function formatTime(startTime: string): string {
  const date = new Date(startTime);
  const now = new Date();

  // Check if it's today
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    // Time only for today
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } else {
    // Date + time for other days
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }
}

export function RecentActivity({ executions }: RecentActivityProps) {
  if (executions.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
          <Link
            href="/automations"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            View Logs →
          </Link>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-500">No recent activity</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Recent Activity</h2>
        <Link
          href="/automations"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          View Logs →
        </Link>
      </div>

      <div className="space-y-3">
        {executions.map((execution) => {
          const statusStyle = statusIcons[execution.status];
          const excludedCount =
            execution.metrics.totalAudienceSize - execution.metrics.totalSentCount;

          return (
            <Link
              key={execution.executionId}
              href={`/automations/${execution.automationId}`}
              className="block rounded-lg border border-gray-200 p-4 transition-all hover:border-gray-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {/* Status Icon */}
                  <div
                    className={`flex items-center justify-center h-8 w-8 rounded-full ${statusStyle.bg} ${statusStyle.color} font-bold text-sm flex-shrink-0`}
                  >
                    {statusStyle.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">
                      {execution.automationName}
                    </h3>

                    {/* Metrics or Error */}
                    {execution.status === 'failed' && execution.error ? (
                      <p className="text-sm text-red-600 mt-1">
                        {execution.error}
                      </p>
                    ) : execution.status === 'completed' ? (
                      <p className="text-sm text-gray-600 mt-1">
                        Sent: {execution.metrics.totalSentCount.toLocaleString()} •
                        Excluded: {excludedCount.toLocaleString()}
                      </p>
                    ) : (
                      <p className="text-sm text-blue-600 mt-1">
                        Running...
                      </p>
                    )}
                  </div>
                </div>

                {/* Time */}
                <div className="flex-shrink-0 text-sm text-gray-500">
                  {formatTime(execution.startTime)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
