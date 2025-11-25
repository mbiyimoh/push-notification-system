import { HeaderNav } from '@/app/components/nav/HeaderNav';
import { StatsCard } from '@/app/components/dashboard/StatsCard';
import UpcomingExecutions from '@/app/components/dashboard/UpcomingExecutions';
import { RecentActivity } from '@/app/components/dashboard/RecentActivity';
import { UniversalAutomation } from '@/types/automation';

interface ExecutionSummary {
  executionId: string;
  automationId: string;
  automationName: string;
  startTime: string;
  status: 'completed' | 'failed' | 'running';
  metrics: {
    totalSentCount: number;
    totalAudienceSize: number;
  };
  error?: string;
}

async function fetchAutomations(): Promise<UniversalAutomation[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/automation/recipes`, {
      cache: 'no-store',
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch automations: ${res.statusText}`);
    }

    const data = await res.json();
    return data.data || [];
  } catch (error) {
    console.error('Error fetching automations:', error);
    return [];
  }
}

async function fetchRecentActivity(): Promise<ExecutionSummary[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/api/automation/monitor?type=executions&limit=5`,
      {
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch recent activity: ${res.statusText}`);
    }

    const data = await res.json();
    return data.data?.executions || [];
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return [];
  }
}

export default async function DashboardPage() {
  const automations = await fetchAutomations();
  const recentActivity = await fetchRecentActivity();

  // Compute stats
  const stats = {
    live: automations.filter((a) => a.status === 'running').length,
    scheduled: automations.filter((a) => a.status === 'active' && a.isActive).length,
    paused: automations.filter((a) => a.status === 'paused').length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderNav breadcrumbs={[{ label: 'Dashboard' }]} showCreateButton={true} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatsCard
            label="LIVE"
            count={stats.live}
            status="live"
            subtitle="Currently executing"
          />
          <StatsCard
            label="SCHEDULED"
            count={stats.scheduled}
            status="scheduled"
            subtitle="Ready to run"
          />
          <StatsCard
            label="PAUSED"
            count={stats.paused}
            status="paused"
            subtitle="Temporarily disabled"
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Upcoming Executions */}
          <div>
            <UpcomingExecutions automations={automations} />
          </div>

          {/* Recent Activity */}
          <div>
            <RecentActivity executions={recentActivity} />
          </div>
        </div>

        {/* Empty State */}
        {automations.length === 0 && (
          <div className="mt-8 bg-white rounded-lg border border-gray-200 shadow-sm p-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="text-6xl mb-4">🤖</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                No automations yet
              </h2>
              <p className="text-gray-600 mb-6">
                Get started by creating your first automation to schedule and manage push notifications.
              </p>
              <a
                href="/create-automation"
                className="inline-flex items-center space-x-2 bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>Create Your First Automation</span>
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
