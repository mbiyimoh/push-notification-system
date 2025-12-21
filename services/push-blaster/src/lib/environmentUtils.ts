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
 * Get all possible CSV directories that may contain generated audience files.
 * Different scripts output to different locations, so callers should search all.
 *
 * Returns array of existing directories in priority order:
 * 1. Local development (monorepo): ../../generated_csvs (Python waterfall scripts)
 * 2. V2 Generator output: .script-outputs (TypeScript generators, Layer 3)
 * 3. Railway deployment: /app/generated_csvs
 */
export function getAllGeneratedCsvsDirs(): string[] {
  const projectRoot = process.cwd();
  const dirs: string[] = [];

  // Local development (monorepo): Python waterfall scripts output here
  const localPath = path.join(projectRoot, '..', '..', 'generated_csvs');
  if (fs.existsSync(localPath)) {
    dirs.push(localPath);
  }

  // V2 TypeScript Generator: Layer 3 scripts output here
  const v2GeneratorPath = path.join(projectRoot, '.script-outputs');
  if (fs.existsSync(v2GeneratorPath)) {
    dirs.push(v2GeneratorPath);
  }

  // Railway deployment: CSVs are at /app/generated_csvs
  const railwayPath = path.join(projectRoot, 'generated_csvs');
  if (fs.existsSync(railwayPath)) {
    dirs.push(railwayPath);
  }

  return dirs;
}

/**
 * Get the generated CSVs directory path, handling Railway, local dev, and V2 generator.
 *
 * NOTE: Different scripts output to different directories. For comprehensive search,
 * use getAllGeneratedCsvsDirs() instead and search all returned directories.
 *
 * Priority order:
 * 1. Local development (monorepo): ../../generated_csvs (Python waterfall scripts)
 * 2. V2 Generator output: .script-outputs (used by TypeScript generators)
 * 3. Railway deployment: /app/generated_csvs
 */
export function getGeneratedCsvsDir(): string {
  const projectRoot = process.cwd();

  // Local development (monorepo): Python waterfall scripts output here
  // Check this FIRST since waterfall scripts are more common now
  const localPath = path.join(projectRoot, '..', '..', 'generated_csvs');
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // V2 TypeScript Generator: CSVs are at .script-outputs
  const v2GeneratorPath = path.join(projectRoot, '.script-outputs');
  if (fs.existsSync(v2GeneratorPath)) {
    return v2GeneratorPath;
  }

  // Railway deployment: CSVs are at /app/generated_csvs
  const railwayPath = path.join(projectRoot, 'generated_csvs');
  if (fs.existsSync(railwayPath)) {
    return railwayPath;
  }

  // Fallback - return the local path and let caller handle missing dir
  return localPath;
}
