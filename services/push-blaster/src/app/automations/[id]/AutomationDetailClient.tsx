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
import { ExecutionProgressModal } from '@/app/components/automations/ExecutionProgressModal';
import { ExecutionProgressInline } from '@/app/components/automations/ExecutionProgressInline';
import { ExecutionStats } from './page';

interface AutomationDetailClientProps {
  automation: UniversalAutomation;
  initialExecutionHistory: ExecutionLog[];
  executionStats: ExecutionStats;
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

// Health indicator component
function HealthIndicator({ status }: { status: ExecutionStats['healthStatus'] }) {
  const config = {
    healthy: { color: 'bg-green-500', label: 'Healthy', textColor: 'text-green-700' },
    stale: { color: 'bg-yellow-500', label: 'Stale', textColor: 'text-yellow-700' },
    failed: { color: 'bg-red-500', label: 'Failed', textColor: 'text-red-700' },
    unknown: { color: 'bg-gray-400', label: 'No Data', textColor: 'text-gray-600' },
  };

  const { color, label, textColor } = config[status];

  return (
    <div className="flex items-center space-x-2">
      <span className={`inline-block w-2.5 h-2.5 rounded-full ${color}`} />
      <span className={textColor}>{label}</span>
    </div>
  );
}

export function AutomationDetailClient({
  automation,
  initialExecutionHistory,
  executionStats
}: AutomationDetailClientProps) {
  const router = useRouter();
  const [executionHistory, setExecutionHistory] = useState<ExecutionLog[]>(initialExecutionHistory);
  const [isRunning, setIsRunning] = useState(false);
  const [isPausing, setIsPausing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showRunDialog, setShowRunDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);
  const [showExecutionProgress, setShowExecutionProgress] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Inline execution viewport state
  const [showInlineProgress, setShowInlineProgress] = useState(false);

  // Push sequences collapse state - collapse by default if 3+ sequences
  const [pushSequencesExpanded, setPushSequencesExpanded] = useState(
    automation.pushSequence.length < 3
  );

  // Pagination state
  const [pageSize, setPageSize] = useState(10);
  const [displayedCount, setDisplayedCount] = useState(10);

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

    // Show inline progress viewport and trigger execution via API
    setShowInlineProgress(true);

    try {
      const response = await fetch('/api/automation/execute-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ automationId: automation.id }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to start execution');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to start execution: ${errorMsg}`);
      setIsRunning(false);
    }
  };

  const handleExecutionComplete = async (status: 'completed' | 'failed') => {
    setIsRunning(false);

    if (status === 'completed') {
      toast.success('Automation executed successfully');
    } else {
      toast.error('Execution failed', {
        description: 'Check execution details for more information',
      });
    }

    // Refresh execution history
    await refreshExecutionHistory();
    router.refresh();
  };

  const handleCloseProgressModal = () => {
    setShowExecutionProgress(false);
    if (isRunning) {
      toast.info('Execution running in background', {
        description: 'Check execution history for status',
      });
    }
    setIsRunning(false);
  };

  const handleCloseInlineProgress = () => {
    setShowInlineProgress(false);
    if (isRunning) {
      toast.info('Execution running in background', {
        description: 'Check execution history for status',
      });
    }
    setIsRunning(false);
  };

  const handleInlineExecutionComplete = async (status: 'completed' | 'failed') => {
    setIsRunning(false);

    if (status === 'completed') {
      toast.success('Automation executed successfully');
    } else {
      toast.error('Execution failed', {
        description: 'Check execution details for more information',
      });
    }

    // Refresh execution history
    await refreshExecutionHistory();
    router.refresh();
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
      const response = await fetch(`/api/automation/executions?automationId=${automation.id}&limit=50`);
      const data = await response.json();

      if (data.success) {
        setExecutionHistory(data.data.history || []);
      }
    } catch (err) {
      console.error('Failed to refresh execution history:', err);
    }
  };

  const handleLoadMore = useCallback(() => {
    setDisplayedCount(prev => prev + pageSize);
  }, [pageSize]);

  const handlePageSizeChange = useCallback((newSize: number) => {
    setPageSize(newSize);
    setDisplayedCount(newSize);
  }, []);

  const paginatedLogs = executionHistory.slice(0, displayedCount);
  const hasMore = executionHistory.length > displayedCount;

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
              <span className="text-gray-600">Health:</span>
              <HealthIndicator status={executionStats.healthStatus} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Audience:</span>
              <span className="text-gray-900">
                {executionStats.lastAudienceSize > 0
                  ? `${executionStats.lastAudienceSize.toLocaleString()} users`
                  : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Success Rate:</span>
              <span className="text-gray-900">
                {executionStats.totalExecutions > 0
                  ? `${executionStats.recentSuccessRate}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="text-gray-900">{getScriptOrTypeDisplay()}</span>
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

      {/* Push Sequences - Collapsible */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">
            PUSH SEQUENCES ({automation.pushSequence.length})
          </h2>
          {automation.pushSequence.length >= 3 && (
            <button
              onClick={() => setPushSequencesExpanded(!pushSequencesExpanded)}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1 transition-colors"
            >
              <span>{pushSequencesExpanded ? 'Collapse' : 'Expand'}</span>
              <svg
                className={`w-4 h-4 transition-transform ${pushSequencesExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          )}
        </div>

        {pushSequencesExpanded ? (
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
        ) : (
          <div
            onClick={() => setPushSequencesExpanded(true)}
            className="p-4 bg-gray-50 rounded-md text-center text-gray-500 cursor-pointer hover:bg-gray-100 transition-colors"
          >
            Click to view {automation.pushSequence.length} push configurations
          </div>
        )}
      </div>

      {/* Inline Execution Progress Viewport */}
      <ExecutionProgressInline
        automationId={automation.id}
        automationName={automation.name}
        isVisible={showInlineProgress}
        onComplete={handleInlineExecutionComplete}
        onClose={handleCloseInlineProgress}
      />

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
          totalCount={executionHistory.length}
          pageSize={pageSize}
          onPageSizeChange={handlePageSizeChange}
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

      {/* Execution Progress Modal */}
      <ExecutionProgressModal
        isOpen={showExecutionProgress}
        onClose={handleCloseProgressModal}
        automationId={automation.id}
        automationName={automation.name}
        startExecution={true}
        onComplete={handleExecutionComplete}
      />
    </main>
  );
}
