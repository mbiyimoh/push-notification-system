'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UniversalAutomation } from '@/types/automation';
import { getNextExecutionAt } from '@/lib/scheduleUtils';
import StatusBadge from './StatusBadge';

interface AutomationCardProps {
  automation: UniversalAutomation;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

const frequencyLabels: Record<string, string> = {
  once: 'Once',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Custom',
};

// Health indicator based on last run status
function HealthIndicator({ automation }: { automation: UniversalAutomation }) {
  const lastRunWithin24h = (automation.metadata as { lastRunWithin24h?: boolean })?.lastRunWithin24h;
  const totalExecutions = automation.metadata.totalExecutions || 0;

  let status: 'healthy' | 'stale' | 'unknown' = 'unknown';
  if (totalExecutions === 0) {
    status = 'unknown';
  } else if (lastRunWithin24h) {
    status = 'healthy';
  } else {
    status = 'stale';
  }

  const config = {
    healthy: { color: 'bg-green-500', label: 'Healthy' },
    stale: { color: 'bg-yellow-500', label: 'Stale' },
    unknown: { color: 'bg-gray-400', label: 'No runs' },
  };

  const { color, label } = config[status];

  return (
    <div className="flex items-center space-x-1.5" title={label}>
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs text-gray-500">{label}</span>
    </div>
  );
}

function formatRelativeTime(dateString: string | undefined | null): string {
  if (!dateString) return 'Never';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatNextRun(dateString: string | undefined | null): string {
  if (!dateString) return 'Not scheduled';

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 0) return 'Overdue';
  if (diffMins < 60) return `In ${diffMins}m`;
  if (diffHours < 24) return `In ${diffHours}h`;
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays}d`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function AutomationCard({
  automation,
  onPause,
  onResume,
  onDelete
}: AutomationCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    onDelete(automation.id);
    setShowDeleteConfirm(false);
  };

  const handleCancelDelete = () => {
    setShowDeleteConfirm(false);
  };

  const lastAudienceSize = (automation.metadata as { lastAudienceSize?: number })?.lastAudienceSize || 0;
  const nextRunDateString = getNextExecutionAt(automation);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* Header Row: Name, Status, Health */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <Link
            href={`/automations/${automation.id}`}
            className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate block"
          >
            {automation.name}
          </Link>
        </div>
        <div className="flex items-center space-x-3 ml-4 flex-shrink-0">
          <HealthIndicator automation={automation} />
          <StatusBadge status={automation.status} size="sm" />
        </div>
      </div>

      {/* Key Metrics Row */}
      <div className="flex items-center space-x-6 text-sm mb-4">
        <div className="flex items-center space-x-1.5">
          <span className="text-gray-500">Schedule:</span>
          <span className="font-medium text-gray-900">
            {frequencyLabels[automation.schedule.frequency]} @ {automation.schedule.executionTime}
          </span>
        </div>
        <div className="flex items-center space-x-1.5">
          <span className="text-gray-500">Pushes:</span>
          <span className="font-medium text-gray-900">{automation.pushSequence.length}</span>
        </div>
        {lastAudienceSize > 0 && (
          <div className="flex items-center space-x-1.5">
            <span className="text-gray-500">Audience:</span>
            <span className="font-medium text-gray-900">{lastAudienceSize.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Timing Row */}
      <div className="flex items-center space-x-6 text-sm text-gray-600 mb-4 pb-4 border-b border-gray-100">
        <div>
          <span className="text-gray-500">Last run: </span>
          <span className="font-medium">{formatRelativeTime(automation.metadata.lastExecutedAt)}</span>
        </div>
        <div>
          <span className="text-gray-500">Next: </span>
          <span className="font-medium text-blue-600">{formatNextRun(nextRunDateString)}</span>
        </div>
        {automation.metadata.totalExecutions > 0 && (
          <div>
            <span className="text-gray-500">Runs: </span>
            <span className="font-medium">{automation.metadata.totalExecutions}</span>
          </div>
        )}
      </div>

      {/* Actions Row */}
      <div className="flex items-center gap-2">
        <Link
          href={`/automations/${automation.id}`}
          className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
        >
          View
        </Link>

        <Link
          href={`/automations/${automation.id}/edit`}
          className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
        >
          Edit
        </Link>

        {automation.status === 'active' ? (
          <button
            onClick={() => onPause(automation.id)}
            className="px-3 py-1.5 text-sm font-medium text-yellow-700 bg-yellow-50 rounded-md hover:bg-yellow-100 transition-colors"
          >
            Pause
          </button>
        ) : automation.status === 'paused' ? (
          <button
            onClick={() => onResume(automation.id)}
            className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-md hover:bg-green-100 transition-colors"
          >
            Resume
          </button>
        ) : null}

        <div className="flex-1" />

        {!showDeleteConfirm ? (
          <button
            onClick={handleDeleteClick}
            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors"
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Delete?</span>
            <button
              onClick={handleConfirmDelete}
              className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 transition-colors"
            >
              Yes
            </button>
            <button
              onClick={handleCancelDelete}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
