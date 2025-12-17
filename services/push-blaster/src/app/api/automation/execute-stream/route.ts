// SSE Endpoint for streaming automation execution progress
// Returns real-time logs when an automation is executed

import { NextRequest } from 'next/server';
import { executionEventEmitter, ExecutionLogEvent, ExecutionProgressEvent } from '@/lib/executionEventEmitter';
import { getAutomationEngineInstance } from '@/lib/automationEngine';
import { automationStorage } from '@/lib/automationStorage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const automationId = searchParams.get('automationId');
  const startExecution = searchParams.get('startExecution') === 'true';

  if (!automationId) {
    return new Response(JSON.stringify({ error: 'automationId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Check if automation exists
  const automation = await automationStorage.loadAutomation(automationId);
  if (!automation) {
    return new Response(JSON.stringify({ error: 'Automation not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Create SSE stream
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeatInterval: NodeJS.Timeout | null = null;
  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection message
      const sendEvent = (type: string, data: unknown) => {
        if (isClosed) return;
        try {
          const message = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(message));
        } catch {
          // Stream closed
        }
      };

      sendEvent('connected', {
        automationId,
        automationName: automation.name,
        timestamp: new Date().toISOString()
      });

      // Subscribe to events for this automation
      const onLog = (event: ExecutionLogEvent) => {
        sendEvent('log', event);
      };

      const onProgress = (event: ExecutionProgressEvent) => {
        sendEvent('progress', event);

        // Close stream when execution completes or fails
        if (event.status === 'completed' || event.status === 'failed') {
          sendEvent('done', {
            status: event.status,
            message: event.message,
            timestamp: new Date().toISOString()
          });

          setTimeout(() => {
            if (!isClosed) {
              isClosed = true;
              if (unsubscribe) unsubscribe();
              if (heartbeatInterval) clearInterval(heartbeatInterval);
              controller.close();
            }
          }, 500);
        }
      };

      unsubscribe = executionEventEmitter.subscribeToAutomation(
        automationId,
        onLog,
        onProgress
      );

      // Heartbeat to keep connection alive
      heartbeatInterval = setInterval(() => {
        if (!isClosed) {
          sendEvent('heartbeat', { timestamp: new Date().toISOString() });
        }
      }, 15000);

      // Start execution if requested
      if (startExecution) {
        sendEvent('log', {
          executionId: 'pending',
          automationId,
          timestamp: new Date().toISOString(),
          level: 'info',
          phase: 'init',
          message: 'Starting automation execution...'
        });

        // Execute in background
        const automationEngine = getAutomationEngineInstance();
        automationEngine.executeAutomationNow(automation).catch((error: Error) => {
          sendEvent('log', {
            executionId: 'error',
            automationId,
            timestamp: new Date().toISOString(),
            level: 'error',
            phase: 'error',
            message: `Execution failed: ${error.message}`
          });
          sendEvent('done', { status: 'failed', message: error.message });
        });
      }
    },
    cancel() {
      isClosed = true;
      if (unsubscribe) unsubscribe();
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    }
  });
}
