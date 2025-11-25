'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ExecutionLog } from '@/lib/automationLogger';
import { UniversalAutomation } from '@/types/automation';
import { PhaseBreakdown } from './PhaseBreakdown';
import { CadenceBreakdown, ExclusionBreakdown } from './CadenceBreakdown';

interface ExecutionDrilldownProps {
  execution: ExecutionLog;
  automation: UniversalAutomation;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function ExecutionDrilldown({ execution, automation }: ExecutionDrilldownProps) {
  const excluded = execution.metrics.totalAudienceSize -
                   execution.metrics.totalSentCount -
                   (execution.metrics.failedPushes || 0);

  // Extract exclusion breakdown from cadence filtering phase data
  const cadencePhase = execution.phases?.find(
    p => p.phase === 'audience_filtering' || p.phase === 'cadence_filtering'
  );
  const exclusionBreakdown: ExclusionBreakdown | null = cadencePhase?.data?.exclusionBreakdown || null;

  const statusIcon = execution.status === 'completed' ? '✓' :
                     execution.status === 'failed' ? '✗' :
                     execution.status === 'cancelled' ? '○' : '●';
  const statusColor = execution.status === 'completed' ? 'text-green-600' :
                      execution.status === 'failed' ? 'text-red-600' :
                      execution.status === 'cancelled' ? 'text-gray-500' : 'text-yellow-600';

  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const url = `/api/automation/${automation.id}/executions/${execution.executionId}/export`;
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${automation.name.replace(/[^a-zA-Z0-9]/g, '_')}_${execution.executionId.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error('Export failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header with back link */}
      <div className="mb-6">
        <Link
          href={`/automations/${automation.id}`}
          className="text-blue-600 hover:text-blue-800 flex items-center gap-2"
        >
          ← Back to {automation.name}
        </Link>
      </div>

      {/* Execution title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <h1 className="text-2xl font-bold text-gray-900">
          EXECUTION: {formatDateTime(execution.startTime)}
        </h1>
        <div className="flex items-center gap-4">
          <span className={`${statusColor} font-medium`}>
            {statusIcon} {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
            {execution.metrics.totalDuration > 0 && ` (${formatDuration(execution.metrics.totalDuration)})`}
          </span>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">SUMMARY</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {execution.metrics.totalSentCount.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Sent</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {Math.max(0, excluded).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Excluded</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {(execution.metrics.failedPushes || 0).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Failed</div>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <div className="text-2xl font-bold text-gray-900">
              {formatDuration(execution.metrics.totalDuration)}
            </div>
            <div className="text-sm text-gray-600">Duration</div>
          </div>
        </div>
      </div>

      {/* Errors section if any */}
      {execution.errors && execution.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-red-800 mb-4">
            ERRORS ({execution.errors.length})
          </h2>
          <div className="space-y-2">
            {execution.errors.map((error, index) => (
              <div key={index} className="text-sm">
                <span className="text-red-600 font-medium">[{error.phase}]</span>{' '}
                <span className="text-red-800">{error.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution Phases */}
      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">EXECUTION PHASES</h2>
        <PhaseBreakdown phases={execution.phases || []} />
      </div>

      {/* Cadence Exclusions */}
      {exclusionBreakdown && excluded > 0 && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">CADENCE EXCLUSIONS</h2>
          <CadenceBreakdown
            breakdown={exclusionBreakdown}
            totalExcluded={Math.max(0, excluded)}
          />
        </div>
      )}

      {/* Push Results */}
      {execution.pushLogs && execution.pushLogs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            PUSH RESULTS ({execution.pushLogs.length} {execution.pushLogs.length === 1 ? 'sequence' : 'sequences'})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seq #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Audience</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sent</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Failed</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {execution.pushLogs.map((push, index) => {
                  const pushStatusIcon = push.status === 'sent' ? '✓' :
                                        push.status === 'failed' ? '✗' : '●';
                  const pushStatusColor = push.status === 'sent' ? 'text-green-600' :
                                         push.status === 'failed' ? 'text-red-600' : 'text-yellow-600';

                  return (
                    <tr key={index}>
                      <td className="px-4 py-3 text-sm text-gray-900">{push.sequenceOrder}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate" title={push.pushTitle}>
                        {push.pushTitle}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {(push.audienceSize || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {(push.sentCount || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right">
                        {(push.failureCount || 0).toLocaleString()}
                      </td>
                      <td className={`px-4 py-3 text-sm text-center ${pushStatusColor}`}>
                        {pushStatusIcon} {push.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
