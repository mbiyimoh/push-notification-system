#!/usr/bin/env node
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const DATABASE_URL = process.env.DATABASE_URL || process.env.PUSH_CADENCE_DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not configured');
    process.exit(1);
  }

  console.log('📦 Connecting to database...');
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connected');

    // Check if table already exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'automation_executions'
      );
    `);

    if (tableCheck.rows[0].exists) {
      console.log('ℹ️  Table automation_executions already exists - skipping migration');
      await pool.end();
      process.exit(0);
    }

    // Read migration file
    const migrationPath = path.join(__dirname, '../db/migrations/003_automation_executions.sql');
    console.log(`📄 Reading migration: ${migrationPath}`);

    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    console.log('🚀 Executing migration...');
    await pool.query(sql);

    console.log('✅ Migration completed successfully');

    // Verify table was created
    const verification = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'automation_executions'
    `);

    if (verification.rows[0].count === '1') {
      console.log('✅ Table automation_executions verified');
    } else {
      console.error('❌ Table verification failed');
      process.exit(1);
    }

    await pool.end();
    console.log('🎉 Migration successful!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
