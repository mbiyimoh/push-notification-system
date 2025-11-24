// Validate critical environment variables on startup
// Import this in app/layout.tsx to ensure validation runs on startup

const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'CADENCE_SERVICE_URL'
] as const;

// Track if validation has already run to avoid duplicate logs
let validationComplete = false;

export function validateStartupEnvironment(): void {
  if (validationComplete) {
    return; // Only run once
  }
  validationComplete = true;

  if (process.env.NODE_ENV !== 'production') {
    return; // Only enforce in production
  }

  // Skip validation during Next.js build phase (NEXT_PHASE is set during build)
  // This prevents build failures when runtime env vars aren't available
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    console.log('[push-blaster] Startup validation skipped: Build phase');
    return;
  }

  const missing = REQUIRED_ENV_VARS.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    console.error('='.repeat(80));
    console.error(`[push-blaster] CRITICAL WARNING: Missing environment variables: ${missing.join(', ')}`);
    console.error('Service will start in DEGRADED MODE - Push notifications will NOT work!');
    console.error('Configure these variables in Railway dashboard immediately.');
    console.error('='.repeat(80));
    // Don't exit - let service start in degraded mode to avoid crash loops
    // Features requiring these vars will fail with clear errors when used
    return;
  }

  console.log('[push-blaster] Startup validation passed: All required environment variables present');
}

// Auto-run on import in production
validateStartupEnvironment();
