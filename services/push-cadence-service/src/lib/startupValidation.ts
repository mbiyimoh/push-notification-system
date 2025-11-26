const REQUIRED_ENV_VARS = [
  'PUSH_CADENCE_DATABASE_URL'
] as const;

let validationComplete = false;

export function validateStartupEnvironment(): void {
  if (validationComplete) {
    return;
  }
  validationComplete = true;

  if (process.env.NODE_ENV !== 'production') {
    return;
  }

  // Skip validation during Next.js build phase
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    console.log('[push-cadence-service] Startup validation skipped: Build phase');
    return;
  }

  const missing = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    console.error('='.repeat(80));
    console.error(`[push-cadence-service] CRITICAL WARNING: Missing environment variables: ${missing.join(', ')}`);
    console.error('Service will start in DEGRADED MODE - Cadence filtering will NOT work!');
    console.error('Configure these variables in Railway dashboard immediately.');
    console.error('='.repeat(80));
    return;
  }

  console.log('[push-cadence-service] Startup validation passed: All required environment variables present');
}

validateStartupEnvironment();
