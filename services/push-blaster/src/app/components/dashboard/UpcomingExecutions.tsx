'use client';

import Link from 'next/link';
import { UniversalAutomation } from '@/types/automation';
import { getNextExecutionAt } from '@/lib/scheduleUtils';
import StatusBadge from '../automations/StatusBadge';

interface UpcomingExecutionsProps {
  automations: UniversalAutomation[];
}

function formatNextRunTime(nextExecutionAt: string): string {
  const now = new Date();
  const executionDate = new Date(nextExecutionAt);

  // Reset time to midnight for accurate day comparison
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const execDay = new Date(executionDate.getFullYear(), executionDate.getMonth(), executionDate.getDate());

  const daysDiff = Math.floor((execDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = executionDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  if (daysDiff === 0) {
    return `Today at ${timeStr}`;
  } else if (daysDiff === 1) {
    return `Tomorrow at ${timeStr}`;
  } else if (daysDiff < 7) {
    const weekday = executionDate.toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday} at ${timeStr}`;
  } else {
    const dateStr = executionDate.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
    return `${dateStr} at ${timeStr}`;
  }
}

function formatFrequency(frequency: string): string {
  const frequencyMap: Record<string, string> = {
    once: 'One-time',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
    custom: 'Custom',
  };

  return frequencyMap[frequency] || frequency;
}

interface AutomationWithNextExecution extends UniversalAutomation {
  calculatedNextExecutionAt: string;
}

export default function UpcomingExecutions({ automations }: UpcomingExecutionsProps) {
  // Calculate next execution for each automation and filter/sort
  const upcomingAutomations: AutomationWithNextExecution[] = automations
    .map(automation => {
      const nextExecution = getNextExecutionAt(automation);
      return nextExecution ? { ...automation, calculatedNextExecutionAt: nextExecution } : null;
    })
    .filter((a): a is AutomationWithNextExecution => a !== null)
    .sort((a, b) => {
      const dateA = new Date(a.calculatedNextExecutionAt).getTime();
      const dateB = new Date(b.calculatedNextExecutionAt).getTime();
      return dateA - dateB;
    })
    .slice(0, 5);

  if (upcomingAutomations.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Upcoming Executions
          </h2>
          <Link
            href="/automations"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            View All →
          </Link>
        </div>
        <p className="text-gray-500 text-center py-8">
          No upcoming executions
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Upcoming Executions
        </h2>
        <Link
          href="/automations"
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          View All →
        </Link>
      </div>

      <div className="space-y-3">
        {upcomingAutomations.map((automation) => (
          <Link
            key={automation.id}
            href={`/automations/${automation.id}`}
            className="block p-4 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-xl" aria-hidden="true">
                  🕐
                </span>

                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">
                    {automation.name}
                  </h3>

                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                    <span className="font-medium">
                      {formatNextRunTime(automation.calculatedNextExecutionAt)}
                    </span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-500">
                      {formatFrequency(automation.schedule.frequency)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="ml-4">
                <StatusBadge status={automation.status} size="sm" />
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
