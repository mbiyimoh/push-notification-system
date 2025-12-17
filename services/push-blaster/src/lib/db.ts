import { Pool } from 'pg';

declare global {
    var pool: Pool;
}

let pool: Pool;

// Debug: Log DATABASE_URL configuration (mask password)
const maskConnectionString = (url: string | undefined): string => {
  if (!url) return 'NOT_SET';
  try {
    const parsed = new URL(url);
    parsed.password = '***';
    return parsed.toString();
  } catch {
    return 'INVALID_URL';
  }
};
console.log(`[db.ts] DATABASE_URL: ${maskConnectionString(process.env.DATABASE_URL)}`);

// Pool configuration for production stability
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  // Connection pool limits to prevent resource exhaustion
  max: 10,                      // Maximum connections in pool
  idleTimeoutMillis: 30000,     // Close idle connections after 30s
  connectionTimeoutMillis: 10000, // Timeout after 10s if connection can't be established
};

if (process.env.NODE_ENV === 'production') {
  pool = new Pool(poolConfig);
} else {
  if (!global.pool) {
    global.pool = new Pool(poolConfig);
  }
  pool = global.pool;
}

export default pool; 