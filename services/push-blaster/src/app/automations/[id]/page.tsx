import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { HeaderNav } from '@/app/components/nav/HeaderNav';
import { AutomationDetailClient } from './AutomationDetailClient';
import { UniversalAutomation } from '@/types/automation';
import { ExecutionLog } from '@/lib/automationLogger';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

async function fetchAutomation(id: string): Promise<UniversalAutomation | null> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
    const response = await fetch(`${baseUrl}/api/automation/recipes/${id}`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch automation: ${response.statusText}`);
    }

    const data = await response.json();
    return data.success ? data.data : null;
  } catch (error) {
    console.error('Error fetching automation:', error);
    throw error;
  }
}

interface ExecutionResponse {
  executionId?: string;
  id?: string;
  automationId: string;
  name?: string;
  startTime: string;
  endTime?: string;
  status?: 'running' | 'completed' | 'failed' | 'cancelled';
  fullLog?: ExecutionLog;
}

async function fetchExecutionHistory(automationId: string): Promise<ExecutionLog[]> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001';
    const response = await fetch(`${baseUrl}/api/automation/monitor?type=executions`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch execution history: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch execution history');
    }

    // Filter executions for this automation
    const allExecutions: ExecutionResponse[] = data.data.executions || [];
    return allExecutions
      .filter((exec: ExecutionResponse) => exec.automationId === automationId)
      .map((exec: ExecutionResponse): ExecutionLog => {
        if (exec.fullLog) {
          return exec.fullLog;
        }
        // If no fullLog, construct from basic data
        return {
          executionId: exec.executionId || exec.id || '',
          automationId: exec.automationId,
          automationName: exec.name || 'Unknown',
          startTime: exec.startTime,
          endTime: exec.endTime,
          status: exec.status || 'running',
          phases: [],
          pushLogs: [],
          errors: [],
          metrics: {
            totalDuration: 0,
            audienceGenerationTime: 0,
            testSendingTime: 0,
            liveExecutionTime: 0,
            totalPushes: 0,
            successfulPushes: 0,
            failedPushes: 0,
            totalAudienceSize: 0,
            totalSentCount: 0,
            averagePushTime: 0
          }
        };
      });
  } catch (error) {
    console.error('Error fetching execution history:', error);
    return [];
  }
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Automations', href: '/automations' },
          { label: 'Loading...' }
        ]}
        showCreateButton={false}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          {/* Header skeleton */}
          <div className="flex justify-between items-center mb-8">
            <div className="h-8 bg-gray-300 rounded w-64"></div>
            <div className="flex space-x-3">
              <div className="h-10 bg-gray-300 rounded w-24"></div>
              <div className="h-10 bg-gray-300 rounded w-24"></div>
              <div className="h-10 bg-gray-300 rounded w-24"></div>
            </div>
          </div>

          {/* Panels skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6 h-48"></div>
            <div className="bg-white rounded-lg shadow p-6 h-48"></div>
          </div>

          {/* Push sequences skeleton */}
          <div className="bg-white rounded-lg shadow p-6 mb-8 h-32"></div>

          {/* Execution history skeleton */}
          <div className="bg-white rounded-lg shadow p-6 h-96"></div>
        </div>
      </main>
    </div>
  );
}

export default async function AutomationDetailPage({ params }: PageProps) {
  const { id } = await params;

  const automation = await fetchAutomation(id);

  if (!automation) {
    notFound();
  }

  const executionHistory = await fetchExecutionHistory(id);

  const breadcrumbs = [
    { label: 'Dashboard', href: '/' },
    { label: 'Automations', href: '/automations' },
    { label: automation.name }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav breadcrumbs={breadcrumbs} showCreateButton={false} />

      <Suspense fallback={<LoadingSkeleton />}>
        <AutomationDetailClient
          automation={automation}
          initialExecutionHistory={executionHistory}
        />
      </Suspense>
    </div>
  );
}
