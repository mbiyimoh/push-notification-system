'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  phase: string;
  message: string;
  data?: Record<string, unknown>;
}

interface ProgressState {
  status: 'connecting' | 'starting' | 'running' | 'completed' | 'failed';
  phase: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  message?: string;
}

interface ExecutionProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  automationId: string;
  automationName: string;
  startExecution?: boolean;
  onComplete?: (status: 'completed' | 'failed') => void;
}

const PHASE_LABELS: Record<string, string> = {
  init: 'Initializing',
  audience_generation: 'Generating Audience',
  test_sending: 'Sending Test Push',
  cancellation_window: 'Cancellation Window',
  live_execution: 'Sending Live Pushes',
  cleanup: 'Cleanup',
  complete: 'Complete',
  error: 'Error'
};

const LEVEL_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  info: { bg: 'bg-blue-100', text: 'text-blue-800', icon: 'INFO' },
  warn: { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: 'WARN' },
  error: { bg: 'bg-red-100', text: 'text-red-800', icon: 'ERR!' },
  debug: { bg: 'bg-gray-100', text: 'text-gray-600', icon: 'DBG' },
  success: { bg: 'bg-green-100', text: 'text-green-800', icon: 'OK' }
};

export function ExecutionProgressModal({
  isOpen,
  onClose,
  automationId,
  automationName,
  startExecution = true,
  onComplete
}: ExecutionProgressModalProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [progress, setProgress] = useState<ProgressState>({
    status: 'connecting',
    phase: 'init'
  });
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logIdCounter = useRef(0);

  // Store onComplete in a ref to prevent useEffect re-runs when parent re-renders
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const scrollToBottom = useCallback(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [logs, scrollToBottom]);

  useEffect(() => {
    if (!isOpen) return;

    // Reset state
    setLogs([]);
    setProgress({ status: 'connecting', phase: 'init' });
    setError(null);
    setIsConnected(false);

    // Connect to SSE endpoint
    const url = `/api/automation/execute-stream?automationId=${automationId}&startExecution=${startExecution}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', (e) => {
      setIsConnected(true);
      setProgress(prev => ({ ...prev, status: 'starting' }));
      const data = JSON.parse(e.data);
      addLog('info', 'init', `Connected to execution stream for "${data.automationName}"`);
    });

    eventSource.addEventListener('log', (e) => {
      const data = JSON.parse(e.data);
      addLog(data.level, data.phase, data.message, data.data);
    });

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setProgress({
        status: data.status,
        phase: data.phase,
        progress: data.progress,
        message: data.message
      });
    });

    eventSource.addEventListener('done', (e) => {
      const data = JSON.parse(e.data);
      setProgress(prev => ({
        ...prev,
        status: data.status,
        message: data.message
      }));
      eventSource.close();
      // Use ref to call onComplete to avoid dependency array issues
      onCompleteRef.current?.(data.status);
    });

    eventSource.addEventListener('heartbeat', () => {
      // Keep-alive, no action needed
    });

    eventSource.onerror = () => {
      if (eventSource.readyState === EventSource.CLOSED) {
        // Normal close
        return;
      }
      setError('Connection lost. Execution may still be running in the background.');
      eventSource.close();
    };

    function addLog(
      level: LogEntry['level'],
      phase: string,
      message: string,
      data?: Record<string, unknown>
    ) {
      const entry: LogEntry = {
        id: `log-${++logIdCounter.current}`,
        timestamp: new Date().toISOString(),
        level,
        phase,
        message,
        data
      };
      setLogs(prev => [...prev, entry]);
    }

    return () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
    // Note: onComplete is accessed via ref to prevent unnecessary re-runs
  }, [isOpen, automationId, startExecution]);

  const handleClose = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    onClose();
  };

  const formatTimestamp = (iso: string): string => {
    const date = new Date(iso);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  if (!isOpen) return null;

  const isComplete = progress.status === 'completed' || progress.status === 'failed';
  const statusColor = progress.status === 'completed'
    ? 'bg-green-500'
    : progress.status === 'failed'
      ? 'bg-red-500'
      : 'bg-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gray-900 rounded-lg shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${statusColor} ${!isComplete ? 'animate-pulse' : ''}`} />
            <div>
              <h3 className="text-white font-semibold">Execution Progress</h3>
              <p className="text-gray-400 text-sm">{automationName}</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-4 py-3 border-b border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">
              {PHASE_LABELS[progress.phase] || progress.phase}
            </span>
            <span className="text-sm text-gray-400">
              {progress.progress
                ? `${progress.progress.current}/${progress.progress.total} (${progress.progress.percentage}%)`
                : progress.status}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${statusColor}`}
              style={{
                width: progress.progress
                  ? `${progress.progress.percentage}%`
                  : isComplete ? '100%' : '10%'
              }}
            />
          </div>
        </div>

        {/* Log Output */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-sm bg-gray-950 min-h-[300px]">
          {error && (
            <div className="mb-3 p-2 bg-red-900/50 border border-red-700 rounded text-red-300">
              {error}
            </div>
          )}

          {logs.length === 0 && !error && (
            <div className="text-gray-500 text-center py-8">
              {isConnected ? 'Waiting for execution output...' : 'Connecting...'}
            </div>
          )}

          {logs.map((log) => {
            const style = LEVEL_STYLES[log.level];
            return (
              <div key={log.id} className="flex items-start mb-1 hover:bg-gray-800/50">
                <span className="text-gray-500 mr-3 flex-shrink-0">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold mr-2 flex-shrink-0 ${style.bg} ${style.text}`}>
                  {style.icon}
                </span>
                <span className="text-blue-400 mr-2 flex-shrink-0">
                  [{PHASE_LABELS[log.phase] || log.phase}]
                </span>
                <span className="text-gray-200 break-all">
                  {log.message}
                </span>
              </div>
            );
          })}
          <div ref={logsEndRef} />
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-400">
            {logs.length} log entries
          </div>
          <div className="flex space-x-3">
            {!isComplete && (
              <span className="text-yellow-400 text-sm flex items-center">
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Executing...
              </span>
            )}
            <button
              onClick={handleClose}
              className={`px-4 py-2 rounded-md transition-colors ${
                isComplete
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-gray-600 text-gray-200 hover:bg-gray-500'
              }`}
            >
              {isComplete ? 'Close' : 'Run in Background'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
