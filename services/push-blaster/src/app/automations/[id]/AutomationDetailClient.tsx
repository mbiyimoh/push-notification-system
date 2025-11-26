'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import StatusBadge from '@/app/components/automations/StatusBadge';
import ExecutionLogTable from '@/app/components/detail/ExecutionLogTable';
import { UniversalAutomation } from '@/types/automation';
import { ExecutionLog } from '@/lib/automationLogger';
import { getNextExecutionDate } from '@/lib/scheduleUtils';
import { toast } from 'sonner';
import { useKeyboardShortcuts } from '@/app/hooks/useKeyboardShortcuts';
import { ShortcutsHelpModal } from '@/app/components/ui/ShortcutsHelpModal';

interface AutomationDetailClientProps {
  automation: UniversalAutomation;
  initialExecutionHistory: ExecutionLog[];
}

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  confirmButtonClass?: string;
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirm',
  confirmButtonClass = 'bg-blue-600 hover:bg-blue-700'
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{title}</h3>
        <p className="text-gray-600 mb-6">{message}</p>
        <div className="flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-md transition-colors ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutomationDetailClient({
  automation,
  initialExecutionHistory
}: AutomationDetailClientProps) {
  const router = useRouter();
  const [executionHistory, setExecutionHistory] = useState<ExecutionLog[]>(initialExecutionHistory);
  const [isRunning, setIsRunning] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const logsPerPage = 10;

  const isActive = automation.status === 'active' || automation.isActive;
  const isPaused = automation.status === 'paused';
  const isCurrentlyRunning = automation.status === 'running';

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatTime = (timeString: string): string => {
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getFrequencyDisplay = (frequency: string): string => {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  };

  const getNextRunDisplay = (): string => {
    const nextRun = getNextExecutionDate(automation);

    if (!nextRun) {
      return 'Not scheduled';
    }

    const now = new Date();
    const diffMs = nextRun.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 1) {
      return `In ${diffDays} days`;
    } else if (diffDays === 1) {
      return 'Tomorrow';
    } else if (diffHours > 1) {
      return `In ${diffHours} hours`;
    } else if (diffMins > 1) {
      return `In ${diffMins} minutes`;
    } else {
      return 'Soon';
    }
  };

  const getScriptOrTypeDisplay = (): string => {
    if (automation.audienceCriteria.customScript) {
      return automation.audienceCriteria.customScript.scriptName;
    }
    return automation.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const handleRunNow = async () => {
    setShowRunDialog(false);
    setIsRunning(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch('/api/automation/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          automationId: automation.id,
          action: 'execute_now',
          reason: 'Manual execution from detail page'
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Failed to execute automation');
      }

      // Start polling for completion
      toast.info('Automation executing...', {
        description: 'Checking for completion...',
        duration: 60000,
        id: 'execution-polling',
      });

      let pollCount = 0;
      const maxPolls = 12;
      const initialExecutionCount = executionHistory.length;

      const pollInterval = setInterval(async () => {
        pollCount++;

        try {
          // Fetch fresh execution history
          const historyResponse = await fetch(`/api/automation/monitor?type=executions`);
          const historyData = await historyResponse.json();

          if (historyData.success) {
            const filtered = (historyData.data.executions || [])
              .filter((exec: { automationId: string }) => exec.automationId === automation.id)
              .map((exec: { fullLog?: ExecutionLog }) => exec.fullLog)
              .filter((log: ExecutionLog | undefined): log is ExecutionLog => log !== undefined);

            // Check if new execution appeared
            if (filtered.length > initialExecutionCount) {
              clearInterval(pollInterval);
              toast.dismiss('execution-polling');

              const latestExecution = filtered[0];
              if (latestExecution?.status === 'completed') {
                toast.success('Automation executed successfully', {
                  description: `Sent ${latestExecution.metrics.totalSentCount.toLocaleString()} pushes`,
                });
              } else if (latestExecution?.status === 'failed') {
                toast.error('Execution failed', {
                  description: 'Check execution details for more information',
                });
              } else {
                toast.success('Execution started', {
                  description: 'Check execution history for status',
                });
              }

              setExecutionHistory(filtered);
              router.refresh();
              setIsRunning(false);
              return;
            }
          }

          if (pollCount >= maxPolls) {
            clearInterval(pollInterval);
            toast.dismiss('execution-polling');
            toast.info('Execution may still be running', {
              description: 'Refresh the page to check status',
            });
            setIsRunning(false);
          }
        } catch (pollErr) {
          console.error('Poll error:', pollErr);
        }
      }, 5000);

    } catch (err) {
      toast.error('Execution failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
      setIsRunning(false);
    }
  };

  const handlePauseResume = async () => {
    setShowPauseDialog(false);
    setIsPausing(true);
    setError(null);
    setSuccessMessage(null);

    const action = isPaused ? 'resume' : 'pause';

    try {
      const response = await fetch('/api/automation/control', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          automationId: automation.id,
          action,
          reason: `Manual ${action} from detail page`
        })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.message || `Failed to ${action} automation`);
      }

      setSuccessMessage(`Automation ${action}d successfully`);
      router.refresh();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsPausing(false);
    }
  };

  const refreshExecutionHistory = async () => {
    try {
      const response = await fetch(`/api/automation/monitor?type=executions`);
      const data = await response.json();

      if (data.success) {
        const filtered = (data.data.executions || [])
          .filter((exec: { automationId: string }) => exec.automationId === automation.id)
          .map((exec: { fullLog?: ExecutionLog }) => exec.fullLog)
          .filter((log: ExecutionLog | undefined): log is ExecutionLog => log !== undefined);

        setExecutionHistory(filtered);
      }
    } catch (err) {
      console.error('Failed to refresh execution history:', err);
    }
  };

  const handleLoadMore = useCallback(() => {
    setCurrentPage(prev => prev + 1);
  }, []);

  const paginatedLogs = executionHistory.slice(0, currentPage * logsPerPage);
  const hasMore = executionHistory.length > paginatedLogs.length;

  const handleEdit = () => {
    router.push(`/automations/${automation.id}/edit`);
  };

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'Enter',
      meta: true,
      action: () => !isRunning && !isCurrentlyRunning && setShowRunDialog(true),
      description: 'Run now'
    },
    {
      key: 'p',
      meta: true,
      action: () => !isPausing && setShowPauseDialog(true),
      description: 'Pause/Resume'
    },
    {
      key: 'e',
      meta: true,
      action: handleEdit,
      description: 'Edit'
    },
    {
      key: '/',
      meta: true,
      action: () => setShowShortcutsHelp(true),
      description: 'Show help'
    },
    {
      key: 'Escape',
      action: () => {
        setShowRunDialog(false);
        setShowPauseDialog(false);
        setShowShortcutsHelp(false);
      },
      description: 'Close dialogs'
    },
  ]);

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-8 space-y-4 sm:space-y-0">
        <h1 className="text-3xl font-bold text-gray-900">{automation.name}</h1>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowRunDialog(true)}
            disabled={isRunning || isCurrentlyRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center space-x-2"
          >
            {isRunning ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Running...</span>
              </>
            ) : (
              <span>Run Now</span>
            )}
          </button>
          <button
            onClick={handleEdit}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => setShowPauseDialog(true)}
            disabled={isPausing}
            className={`px-4 py-2 rounded-md transition-colors ${
              isPaused
                ? 'bg-green-600 text-white hover:bg-green-700'
                : 'bg-yellow-600 text-white hover:bg-yellow-700'
            } disabled:bg-gray-400 disabled:cursor-not-allowed`}
          >
            {isPausing ? 'Processing...' : isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">{error}</p>
        </div>
      )}
      {successMessage && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800">{successMessage}</p>
        </div>
      )}

      {/* Overview and Schedule Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Overview Panel */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">OVERVIEW</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Status:</span>
              <StatusBadge status={automation.status} size="sm" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Created:</span>
              <span className="text-gray-900">{formatDate(automation.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="text-gray-900">{getScriptOrTypeDisplay()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total Executions:</span>
              <span className="text-gray-900">{automation.metadata.totalExecutions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Success Rate:</span>
              <span className="text-gray-900">
                {automation.metadata.totalExecutions > 0
                  ? `${Math.round((automation.metadata.successfulExecutions / automation.metadata.totalExecutions) * 100)}%`
                  : 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Schedule Panel */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">SCHEDULE</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Frequency:</span>
              <span className="text-gray-900">{getFrequencyDisplay(automation.schedule.frequency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Time:</span>
              <span className="text-gray-900">
                {formatTime(automation.schedule.executionTime)} {automation.schedule.timezone}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Next Run:</span>
              <span className="text-gray-900">{getNextRunDisplay()}</span>
            </div>
            {automation.schedule.startDate && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Start Date:</span>
                <span className="text-gray-900">{formatDate(automation.schedule.startDate)}</span>
              </div>
            )}
            {automation.schedule.endDate && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">End Date:</span>
                <span className="text-gray-900">{formatDate(automation.schedule.endDate)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Push Sequences */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          PUSH SEQUENCES ({automation.pushSequence.length})
        </h2>
        <div className="space-y-3">
          {automation.pushSequence.map((push, index) => (
            <div
              key={push.id || `push-${index}-${push.sequenceOrder}`}
              className="flex items-start justify-between p-4 bg-gray-50 rounded-md"
            >
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-1">
                  <span className="font-semibold text-gray-900">#{push.sequenceOrder}</span>
                  <span className="font-medium text-gray-900">{push.title}</span>
                </div>
                <p className="text-sm text-gray-600 mb-2">{push.body}</p>
                {push.deepLink && (
                  <p className="text-xs text-blue-600 truncate">{push.deepLink}</p>
                )}
              </div>
              <div className="ml-4 flex-shrink-0">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  Layer {push.layerId}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Execution History */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">EXECUTION HISTORY</h2>
          <button
            onClick={refreshExecutionHistory}
            className="text-sm text-blue-600 hover:text-blue-700 transition-colors"
          >
            Refresh
          </button>
        </div>
        <ExecutionLogTable
          automationId={automation.id}
          logs={paginatedLogs}
          onLoadMore={handleLoadMore}
          hasMore={hasMore}
          isLoading={false}
        />
      </div>

      {/* Confirmation Dialogs */}
      <ConfirmDialog
        isOpen={showRunDialog}
        title="Run Automation Now?"
        message={`Run "${automation.name}" now? This will execute immediately instead of waiting for the scheduled time.`}
        onConfirm={handleRunNow}
        onCancel={() => setShowRunDialog(false)}
        confirmText="Run Now"
      />

      <ConfirmDialog
        isOpen={showPauseDialog}
        title={isPaused ? 'Resume Automation?' : 'Pause Automation?'}
        message={
          isPaused
            ? `Resume "${automation.name}"? It will continue running on its regular schedule.`
            : `Pause "${automation.name}"? It will not run until you resume it.`
        }
        onConfirm={handlePauseResume}
        onCancel={() => setShowPauseDialog(false)}
        confirmText={isPaused ? 'Resume' : 'Pause'}
        confirmButtonClass={isPaused ? 'bg-green-600 hover:bg-green-700' : 'bg-yellow-600 hover:bg-yellow-700'}
      />

      {/* Keyboard Shortcuts Help */}
      <ShortcutsHelpModal
        isOpen={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />
    </main>
  );
}
