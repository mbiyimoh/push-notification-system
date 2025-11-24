import { Pool } from 'pg';

// This setup ensures that in development, the connection pool is persisted across hot-reloads.
declare global {
  var pool: Pool | undefined;
}

// Database URL configuration
const DATABASE_URL = process.env.PUSH_CADENCE_DATABASE_URL;

// Nullable pool pattern - only create pool if DATABASE_URL is configured
// This allows Railway deployment without pre-configured database
let pool: Pool | null = null;

if (!DATABASE_URL) {
  console.warn('⚠️  PUSH_CADENCE_DATABASE_URL not configured - running in degraded mode');
  console.warn('⚠️  Database features will be unavailable');
  console.warn('⚠️  Configure PUSH_CADENCE_DATABASE_URL in Railway dashboard to enable database features');
} else if (process.env.NODE_ENV === 'production') {
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    }
  });
  console.log('✅ Production database pool initialized');
} else {
  if (!global.pool) {
    global.pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    });
    console.log('✅ Development database pool initialized');
  }
  pool = global.pool;
}

export default pool;
