import { NextResponse } from 'next/server';
import { getAutomationEngineInstance } from '@/lib/automationEngine';
import { automationStorage } from '@/lib/automationStorage';
import pool from '@/lib/db';

interface AutomationHealthMetrics {
  scheduledJobsCount: number;
  expectedJobsCount: number;
  divergence: number;
  lastRestorationAttempt: string | null;
  restorationSuccess: boolean;
  activeExecutionsCount: number;
  instanceId: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  service: string;
  timestamp: string;
  uptime: number;
  automationEngine?: AutomationHealthMetrics;
  dependencies: {
    database: 'connected' | 'degraded' | 'not_configured';
    cadence: 'healthy' | 'degraded' | 'unreachable' | 'not_configured';
  };
  memoryUsage: NodeJS.MemoryUsage;
  responseTimeMs?: string;
}

export async function GET() {
  const startTime = process.hrtime();

  let health: HealthStatus = {
    status: 'healthy',
    service: 'push-blaster',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    dependencies: {
      database: 'not_configured',
      cadence: 'not_configured'
    },
    memoryUsage: process.memoryUsage()
  };

  // Check automation engine
  try {
    const engine = getAutomationEngineInstance();
    const debugInfo = engine.getDebugInfo();

    // Calculate expected count
    const allAutomations = await automationStorage.listAutomations();
    const activeAutomations = allAutomations.filter(
      a => a.isActive === true && (a.status === 'active' || a.status === 'scheduled')
    );
    const expectedCount = activeAutomations.length;
    const divergence = expectedCount - debugInfo.scheduledJobsCount;

    // Get last restoration timestamp from engine metadata
    const lastRestorationAttempt = engine.getLastRestorationTimestamp();
    const restorationSuccess = divergence === 0;

    health.automationEngine = {
      scheduledJobsCount: debugInfo.scheduledJobsCount,
      expectedJobsCount: expectedCount,
      divergence,
      lastRestorationAttempt,
      restorationSuccess,
      activeExecutionsCount: debugInfo.activeExecutionsCount,
      instanceId: debugInfo.instanceId
    };

    // Set status based on divergence
    if (divergence > 0) {
      health.status = 'critical';  // Some automations not scheduled
    } else if (debugInfo.activeExecutionsCount > 5) {
      health.status = 'degraded';  // High load
    }
  } catch (error) {
    console.error('[HEALTH] Automation engine check failed:', error);
    health.status = 'degraded';
  }

  // Check database
  try {
    await pool.query('SELECT 1');
    health.dependencies.database = 'connected';
  } catch (error) {
    health.dependencies.database = 'degraded';
    if (health.status === 'healthy') health.status = 'degraded';
  }

  // Check cadence service
  if (process.env.CADENCE_SERVICE_URL) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const cadenceResponse = await fetch(
        `${process.env.CADENCE_SERVICE_URL}/api/health`,
        { signal: controller.signal }
      );

      clearTimeout(timeoutId);
      health.dependencies.cadence = cadenceResponse.ok ? 'healthy' : 'degraded';
    } catch (error) {
      health.dependencies.cadence = 'unreachable';
      if (health.status === 'healthy') health.status = 'degraded';
    }
  }

  const [seconds, nanoseconds] = process.hrtime(startTime);
  health.responseTimeMs = (seconds * 1000 + nanoseconds / 1000000).toFixed(2);

  // Return proper HTTP status codes for health monitoring
  const httpStatus = health.status === 'healthy' ? 200 : 503;

  return NextResponse.json(health, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Health-Status': health.status
    }
  });
}
