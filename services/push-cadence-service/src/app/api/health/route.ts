import { NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function GET() {
  let status: 'healthy' | 'degraded' = 'healthy';
  let database: 'connected' | 'not_configured' | 'error' = 'connected';
  let message: string | undefined;
  let errorDetail: string | undefined;

  try {
    // Check if pool is initialized
    if (!pool) {
      status = 'degraded';
      database = 'not_configured';
      message = 'Service is running but database pool is not initialized';
    } else {
      // Simple DB query to verify connection
      await pool.query('SELECT 1');
      database = 'connected';
    }
  } catch (error) {
    status = 'degraded';
    database = 'error';
    message = 'Service is running but database connection failed';
    errorDetail = error instanceof Error ? error.message : String(error);
  }

  // Return proper HTTP status codes for health monitoring
  const httpStatus = status === 'healthy' ? 200 : 503;

  return NextResponse.json({
    status,
    service: 'push-cadence',
    timestamp: new Date().toISOString(),
    database,
    ...(message && { message }),
    ...(errorDetail && { error: errorDetail }),
    ...(database !== 'connected' && {
      note: 'Check PUSH_CADENCE_DATABASE_URL environment variable and database availability'
    }),
    memoryUsage: process.memoryUsage()
  }, {
    status: httpStatus,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Health-Status': status
    }
  });
}
