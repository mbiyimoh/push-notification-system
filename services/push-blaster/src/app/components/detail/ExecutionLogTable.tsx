'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useKeyboardShortcuts } from '@/app/hooks/useKeyboardShortcuts';

interface ExecutionLog {
  executionId: string;
  automationId: string;
  automationName: string;
  startTime: string;
  endTime?: string;
  status: 'completed' | 'failed' | 'running' | 'cancelled';
  metrics: {
    totalDuration: number;
    totalAudienceSize: number;
    totalSentCount: number;
    failedPushes: number;
  };
}

interface ExecutionLogTableProps {
  automationId: string;
  logs: ExecutionLog[];
  onLoadMore: () => void;
  hasMore: boolean;
  isLoading?: boolean;
}

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

const formatNumber = (num: number): string => {
  return num.toLocaleString();
};

const ExecutionLogTable: React.FC<ExecutionLogTableProps> = ({
  automationId,
  logs,
  onLoadMore,
  hasMore,
  isLoading = false,
}) => {
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const moveDown = useCallback(() => {
    setSelectedIndex(prev => {
      if (prev < logs.length - 1) {
        return prev + 1;
      }
      return prev;
    });
  }, [logs.length]);

  const moveUp = useCallback(() => {
    setSelectedIndex(prev => {
      if (prev > 0) {
        return prev - 1;
      }
      // If not yet selected, select the first item
      if (prev === -1 && logs.length > 0) {
        return 0;
      }
      return prev;
    });
  }, [logs.length]);

  const openSelected = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < logs.length) {
      const log = logs[selectedIndex];
      router.push(`/automations/${automationId}/executions/${log.executionId}`);
    }
  }, [selectedIndex, logs, automationId, router]);

  useKeyboardShortcuts([
    { key: 'j', action: moveDown, description: 'Move down' },
    { key: 'k', action: moveUp, description: 'Move up' },
    { key: 'Enter', action: openSelected, description: 'Open selected' },
  ]);

  const getStatusIcon = (status: ExecutionLog['status']) => {
    switch (status) {
      case 'completed':
        return <span className="text-green-600 text-xl">✓</span>;
      case 'failed':
        return <span className="text-red-600 text-xl">✗</span>;
      case 'running':
        return <span className="text-blue-600 text-xl">●</span>;
      case 'cancelled':
        return <span className="text-gray-500 text-xl">○</span>;
      default:
        return null;
    }
  };

  const formatDateTime = (isoString: string): string => {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateExcluded = (log: ExecutionLog): number => {
    const { totalAudienceSize, totalSentCount, failedPushes } = log.metrics;
    return totalAudienceSize - totalSentCount - failedPushes;
  };

  const handleRowClick = (index: number, log: ExecutionLog) => {
    if (selectedIndex === index) {
      // Double-click behavior: open the execution
      router.push(`/automations/${automationId}/executions/${log.executionId}`);
    } else {
      setSelectedIndex(index);
    }
  };

  if (logs.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        No executions yet
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date/Time
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Sent
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Excluded
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Failed
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Duration
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {logs.map((log, index) => (
              <tr
                key={log.executionId}
                onClick={() => handleRowClick(index, log)}
                className={`cursor-pointer transition-colors ${
                  index === selectedIndex
                    ? 'bg-blue-50 ring-2 ring-blue-200 ring-inset'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center justify-center w-8">
                    {getStatusIcon(log.status)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatDateTime(log.startTime)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatNumber(log.metrics.totalSentCount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatNumber(calculateExcluded(log))}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatNumber(log.metrics.failedPushes)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                  {formatDuration(log.metrics.totalDuration)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Keyboard navigation hint */}
      {logs.length > 0 && (
        <div className="mt-4 text-xs text-gray-400 text-center">
          Use <kbd className="px-1 bg-gray-100 rounded">J</kbd>/<kbd className="px-1 bg-gray-100 rounded">K</kbd> to navigate, <kbd className="px-1 bg-gray-100 rounded">Enter</kbd> to open
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
};

export default ExecutionLogTable;
