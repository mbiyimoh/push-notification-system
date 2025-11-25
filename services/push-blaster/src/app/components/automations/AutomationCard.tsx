'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UniversalAutomation, AutomationType } from '@/types/automation';
import { getNextExecutionAt } from '@/lib/scheduleUtils';
import StatusBadge from './StatusBadge';

interface AutomationCardProps {
  automation: UniversalAutomation;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onDelete: (id: string) => void;
}

const typeLabels: Record<AutomationType, string> = {
  single_push: 'Single Push',
  sequence: 'Sequence',
  recurring: 'Recurring',
  triggered: 'Triggered',
};

const frequencyLabels: Record<string, string> = {
  once: 'Once',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  custom: 'Custom',
};

function formatDate(dateString: string | undefined | null): string {
  if (!dateString) return 'Not scheduled';

  const date = new Date(dateString);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  // Reset time for comparison
  const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());

  if (dateOnly.getTime() === todayOnly.getTime()) {
    return `Today at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (dateOnly.getTime() === tomorrowOnly.getTime()) {
    return `Tomorrow at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    }) + ` at ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  }
}

function calculateSuccessRate(successful: number, total: number): string {
  if (total === 0) return '0';
  return ((successful / total) * 100).toFixed(1);
}

export default function AutomationCard({
  automation,
  onPause,
  onResume,
  onDelete
}: AutomationCardProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const successRate = calculateSuccessRate(
    automation.metadata.successfulExecutions,
    automation.metadata.totalExecutions
  );

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

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            {automation.name}
          </h3>
          {automation.description && (
            <p className="text-sm text-gray-600 mb-2">{automation.description}</p>
          )}
          <div className="flex items-center gap-2">
            <StatusBadge status={automation.status} size="sm" />
          </div>
        </div>
      </div>

      {/* Automation Details Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4 border-t border-gray-100 pt-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Type</p>
          <p className="text-sm font-medium text-gray-900">
            {typeLabels[automation.type] || automation.type}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Frequency</p>
          <p className="text-sm font-medium text-gray-900">
            {frequencyLabels[automation.schedule.frequency] || automation.schedule.frequency}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Execution Time</p>
          <p className="text-sm font-medium text-gray-900">
            {automation.schedule.executionTime}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Timezone</p>
          <p className="text-sm font-medium text-gray-900">
            {automation.schedule.timezone}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Push Sequence</p>
          <p className="text-sm font-medium text-gray-900">
            {automation.pushSequence.length} push{automation.pushSequence.length !== 1 ? 'es' : ''}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Executions</p>
          <p className="text-sm font-medium text-gray-900">
            {automation.metadata.totalExecutions} ({successRate}% success)
          </p>
        </div>
      </div>

      {/* Run Dates */}
      <div className="grid grid-cols-2 gap-4 mb-4 border-t border-gray-100 pt-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Last Run</p>
          <p className="text-sm text-gray-700">
            {formatDate(automation.metadata.lastExecutedAt)}
          </p>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Next Run</p>
          <p className="text-sm text-gray-700 font-medium">
            {formatDate(getNextExecutionAt(automation))}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 border-t border-gray-100 pt-4">
        <Link
          href={`/automations/${automation.id}`}
          className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
        >
          View
        </Link>

        <Link
          href={`/edit-automation/${automation.id}`}
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
            className="px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100 transition-colors"
          >
            Delete
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Confirm delete?</span>
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
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
