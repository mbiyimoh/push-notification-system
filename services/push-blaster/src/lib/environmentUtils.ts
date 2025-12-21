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
 * Returns array of existing directories in priority order (Python output first):
 * 1. Local generated_csvs: ./generated_csvs (Docker push-blaster directory - MOST COMMON)
 * 2. Local development (monorepo): ../../generated_csvs (Python waterfall scripts)
 * 3. Docker/GCP monorepo root: ../generated_csvs (alternative Docker path)
 * 4. V2 Generator output: .script-outputs (TypeScript generators - LEGACY)
 */
export function getAllGeneratedCsvsDirs(): string[] {
  const projectRoot = process.cwd();
  const dirs: string[] = [];

  // Docker/Local: Python scripts output to generated_csvs in current directory
  // This is the PRIMARY location for Python script output - check FIRST
  const localGeneratedPath = path.join(projectRoot, 'generated_csvs');
  if (fs.existsSync(localGeneratedPath)) {
    dirs.push(localGeneratedPath);
  }

  // Local development (monorepo): Python waterfall scripts may output here
  const monorepoPath = path.join(projectRoot, '..', '..', 'generated_csvs');
  if (fs.existsSync(monorepoPath)) {
    dirs.push(monorepoPath);
  }

  // Docker/GCP: Alternative path if scripts run from /usr/src parent
  const dockerMonorepoPath = path.join(projectRoot, '..', 'generated_csvs');
  if (fs.existsSync(dockerMonorepoPath)) {
    dirs.push(dockerMonorepoPath);
  }

  // V2 TypeScript Generator: Legacy path for TypeScript generators
  const v2GeneratorPath = path.join(projectRoot, '.script-outputs');
  if (fs.existsSync(v2GeneratorPath)) {
    dirs.push(v2GeneratorPath);
  }

  return dirs;
}

/**
 * Get the generated CSVs directory path, handling GCP/Docker, local dev, and V2 generator.
 *
 * NOTE: Different scripts output to different directories. For comprehensive search,
 * use getAllGeneratedCsvsDirs() instead and search all returned directories.
 *
 * Priority order (Python scripts output to generated_csvs, so prioritize that):
 * 1. Local generated_csvs: ./generated_csvs (Docker push-blaster directory - MOST COMMON)
 * 2. Local development (monorepo): ../../generated_csvs (Python waterfall scripts)
 * 3. Docker/GCP monorepo root: ../generated_csvs (alternative Docker path)
 * 4. V2 Generator output: .script-outputs (used by TypeScript generators - LEGACY)
 */
export function getGeneratedCsvsDir(): string {
  const projectRoot = process.cwd();

  // Docker/Local: Python scripts output to generated_csvs in current directory
  // e.g., /usr/src/push-blaster/generated_csvs (Docker) or services/push-blaster/generated_csvs (local)
  // This is the PRIMARY location for Python script output - check FIRST
  const localGeneratedPath = path.join(projectRoot, 'generated_csvs');
  if (fs.existsSync(localGeneratedPath)) {
    return localGeneratedPath;
  }

  // Local development (monorepo): Python waterfall scripts may output here
  // e.g., /Users/.../push-notification-system/services/push-blaster -> ../../generated_csvs
  const monorepoPath = path.join(projectRoot, '..', '..', 'generated_csvs');
  if (fs.existsSync(monorepoPath)) {
    return monorepoPath;
  }

  // Docker/GCP: Alternative path if scripts run from /usr/src parent
  // e.g., /usr/src/push-blaster -> ../generated_csvs = /usr/src/generated_csvs
  const dockerMonorepoPath = path.join(projectRoot, '..', 'generated_csvs');
  if (fs.existsSync(dockerMonorepoPath)) {
    return dockerMonorepoPath;
  }

  // V2 TypeScript Generator: Legacy path for TypeScript generators
  const v2GeneratorPath = path.join(projectRoot, '.script-outputs');
  if (fs.existsSync(v2GeneratorPath)) {
    return v2GeneratorPath;
  }

  // Fallback - return the most likely path for Docker environments
  // Check if we're in Docker by looking for /usr/src path
  if (projectRoot.startsWith('/usr/src')) {
    return localGeneratedPath; // /usr/src/push-blaster/generated_csvs
  }
  return monorepoPath;
}
