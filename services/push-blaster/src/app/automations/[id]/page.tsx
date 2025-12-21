import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { HeaderNav } from '@/app/components/nav/HeaderNav';
import { AutomationDetailClient } from './AutomationDetailClient';
import { UniversalAutomation } from '@/types/automation';
import { ExecutionLog } from '@/lib/automationLogger';
import { getBaseUrl } from '@/lib/getBaseUrl';

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

// Stats interface for the overview panel
export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  recentSuccessRate: number;
  lastRunWithin24h: boolean;
  lastAudienceSize: number;
  healthStatus: 'healthy' | 'stale' | 'failed' | 'unknown';
}

async function fetchAutomation(id: string): Promise<UniversalAutomation | null> {
  try {
    const baseUrl = getBaseUrl();
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

interface ExecutionHistoryResult {
  history: ExecutionLog[];
  stats: ExecutionStats;
}

async function fetchExecutionHistory(automationId: string): Promise<ExecutionHistoryResult> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/automation/executions?automationId=${automationId}&limit=50`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch execution history: ${response.statusText}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch execution history');
    }

    const dbStats = data.data.stats;

    // Determine health status
    let healthStatus: ExecutionStats['healthStatus'] = 'unknown';
    if (dbStats) {
      if (dbStats.lastExecution?.status === 'failed') {
        healthStatus = 'failed';
      } else if (dbStats.lastRunWithin24h) {
        healthStatus = 'healthy';
      } else if (dbStats.totalExecutions > 0) {
        healthStatus = 'stale';
      }
    }

    const stats: ExecutionStats = {
      totalExecutions: dbStats?.totalExecutions || 0,
      successfulExecutions: dbStats?.successfulExecutions || 0,
      failedExecutions: dbStats?.failedExecutions || 0,
      recentSuccessRate: dbStats?.recentSuccessRate || 0,
      lastRunWithin24h: dbStats?.lastRunWithin24h || false,
      lastAudienceSize: dbStats?.lastExecution?.audienceSize || 0,
      healthStatus,
    };

    return {
      history: data.data.history || [],
      stats,
    };
  } catch (error) {
    console.error('Error fetching execution history:', error);
    return {
      history: [],
      stats: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        recentSuccessRate: 0,
        lastRunWithin24h: false,
        lastAudienceSize: 0,
        healthStatus: 'unknown',
      },
    };
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

  const { history: executionHistory, stats: executionStats } = await fetchExecutionHistory(id);

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
          executionStats={executionStats}
        />
      </Suspense>
    </div>
  );
}
