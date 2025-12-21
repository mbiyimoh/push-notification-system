#!/usr/bin/env node
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const DATABASE_URL = process.env.DATABASE_URL || process.env.PUSH_CADENCE_DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL or PUSH_CADENCE_DATABASE_URL not configured');
    console.error('   Run with: npx dotenv -e ../../.env -- npm run migrate');
    console.error('   Or export PUSH_CADENCE_DATABASE_URL first');
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

    // Get all migration files sorted by name
    const migrationsDir = path.join(__dirname, '../db/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`📄 Found ${migrationFiles.length} migration files`);

    for (const file of migrationFiles) {
      const migrationPath = path.join(migrationsDir, file);
      console.log(`\n🔄 Processing: ${file}`);

      // Extract table name from migration file for idempotency check
      // Migrations 003 and 004 create specific tables
      let tableToCheck = null;
      if (file.includes('003_automation_executions')) {
        tableToCheck = 'automation_executions';
      } else if (file.includes('004_execution_progress')) {
        tableToCheck = 'execution_progress';
      }

      // Check if main table already exists (for idempotency)
      if (tableToCheck) {
        const tableCheck = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = $1
          );
        `, [tableToCheck]);

        if (tableCheck.rows[0].exists) {
          console.log(`   ℹ️  Table ${tableToCheck} already exists - skipping`);
          continue;
        }
      }

      // Read and execute migration
      const sql = fs.readFileSync(migrationPath, 'utf8');
      console.log(`   🚀 Executing migration...`);

      try {
        await pool.query(sql);
        console.log(`   ✅ Migration ${file} completed`);
      } catch (err) {
        // Handle "already exists" errors gracefully
        if (err.message.includes('already exists')) {
          console.log(`   ℹ️  Objects already exist - continuing`);
        } else {
          throw err;
        }
      }
    }

    // Verify tables were created
    console.log('\n📋 Verifying tables...');
    const tables = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('automation_executions', 'execution_progress', 'execution_logs')
      ORDER BY table_name
    `);

    console.log('   Tables found:');
    for (const row of tables.rows) {
      console.log(`   ✅ ${row.table_name}`);
    }

    await pool.end();
    console.log('\n🎉 All migrations completed successfully!');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
