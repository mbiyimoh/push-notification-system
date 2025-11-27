// Environment-aware utility functions for Railway and local development
// These utilities handle differences between Railway deployment and local development

import fs from 'fs';
import path from 'path';

/**
 * Get the cadence service URL from environment or fallback to localhost.
 * Railway deployment uses CADENCE_SERVICE_URL env var.
 * Local development defaults to http://localhost:3002.
 */
export function getCadenceServiceUrl(): string {
  const envUrl = process.env.CADENCE_SERVICE_URL;

  // In production (Railway), CADENCE_SERVICE_URL should be set
  if (process.env.NODE_ENV === 'production' && !envUrl) {
    console.error('[CRITICAL] CADENCE_SERVICE_URL not set in production environment. Cadence filtering may fail.');
  }

  return envUrl || 'http://localhost:3002';
}

/**
 * Get the push-blaster API URL from environment or fallback to localhost.
 * Useful for internal service-to-service communication.
 */
export function getPushBlasterUrl(): string {
  const envUrl = process.env.PUSH_BLASTER_URL || process.env.NEXT_PUBLIC_APP_URL;

  return envUrl || 'http://localhost:3001';
}

/**
 * Get the generated CSVs directory path, handling both Railway and local dev.
 * Railway: /app/generated_csvs (where process.cwd() = /app)
 * Local: ../../generated_csvs (relative to push-blaster monorepo location)
 */
export function getGeneratedCsvsDir(): string {
  const projectRoot = process.cwd();

  // Railway deployment: CSVs are at /app/generated_csvs
  const railwayPath = path.join(projectRoot, 'generated_csvs');
  if (fs.existsSync(railwayPath)) {
    return railwayPath;
  }

  // Local development (monorepo): CSVs are at ../../generated_csvs
  const localPath = path.join(projectRoot, '..', '..', 'generated_csvs');
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // Fallback - return the Railway path and let caller handle missing dir
  return railwayPath;
}
