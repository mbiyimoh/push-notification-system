// Execution Event Emitter
// Allows real-time streaming of execution progress to connected clients
// Uses globalThis to ensure true singleton across Next.js module reloads

import { EventEmitter } from 'events';

export interface ExecutionLogEvent {
  executionId: string;
  automationId: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug' | 'success';
  phase: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ExecutionProgressEvent {
  executionId: string;
  automationId: string;
  status: 'starting' | 'running' | 'completed' | 'failed';
  phase: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  message?: string;
}

// Extend globalThis to include our singleton
declare global {
  // eslint-disable-next-line no-var
  var executionEventEmitterInstance: ExecutionEventEmitter | undefined;
}

class ExecutionEventEmitter extends EventEmitter {
  private constructor() {
    super();
    // Increase max listeners for multiple SSE connections
    this.setMaxListeners(50);
    console.log('[ExecutionEventEmitter] New instance created');
  }

  static getInstance(): ExecutionEventEmitter {
    // Use globalThis to ensure singleton across module reloads in Next.js dev mode
    if (!globalThis.executionEventEmitterInstance) {
      globalThis.executionEventEmitterInstance = new ExecutionEventEmitter();
      console.log('[ExecutionEventEmitter] Singleton instance created on globalThis');
    }
    return globalThis.executionEventEmitterInstance;
  }

  emitLog(event: ExecutionLogEvent): void {
    console.log(`[ExecutionEventEmitter] Emitting log: ${event.phase} - ${event.message.substring(0, 50)}...`);
    this.emit('log', event);
    this.emit(`log:${event.automationId}`, event);
  }

  emitProgress(event: ExecutionProgressEvent): void {
    console.log(`[ExecutionEventEmitter] Emitting progress: ${event.phase} - ${event.status}`);
    this.emit('progress', event);
    this.emit(`progress:${event.automationId}`, event);
  }

  // Subscribe to logs for a specific automation
  subscribeToAutomation(
    automationId: string,
    onLog: (event: ExecutionLogEvent) => void,
    onProgress: (event: ExecutionProgressEvent) => void
  ): () => void {
    const logKey = `log:${automationId}`;
    const progressKey = `progress:${automationId}`;

    this.on(logKey, onLog);
    this.on(progressKey, onProgress);

    // Return unsubscribe function
    return () => {
      this.off(logKey, onLog);
      this.off(progressKey, onProgress);
    };
  }

  // Subscribe to all logs
  subscribeToAll(
    onLog: (event: ExecutionLogEvent) => void,
    onProgress: (event: ExecutionProgressEvent) => void
  ): () => void {
    this.on('log', onLog);
    this.on('progress', onProgress);

    return () => {
      this.off('log', onLog);
      this.off('progress', onProgress);
    };
  }
}

export const executionEventEmitter = ExecutionEventEmitter.getInstance();

// Helper function to emit logs with less boilerplate
export function emitExecutionLog(
  automationId: string,
  executionId: string,
  phase: string,
  message: string,
  level: 'info' | 'warn' | 'error' | 'debug' | 'success' = 'info',
  data?: Record<string, unknown>
): void {
  executionEventEmitter.emitLog({
    executionId,
    automationId,
    timestamp: new Date().toISOString(),
    level,
    phase,
    message,
    data
  });
}

export function emitExecutionProgress(
  automationId: string,
  executionId: string,
  status: 'starting' | 'running' | 'completed' | 'failed',
  phase: string,
  message?: string,
  progress?: { current: number; total: number }
): void {
  executionEventEmitter.emitProgress({
    executionId,
    automationId,
    status,
    phase,
    message,
    progress: progress ? {
      ...progress,
      percentage: Math.round((progress.current / progress.total) * 100)
    } : undefined
  });
}
