#!/usr/bin/env node

/**
 * Database Migration Runner
 *
 * Handles applying and rolling back database migrations for the marketplace application.
 * Supports both local development and production environments.
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const MIGRATIONS_DIR = join(__dirname, '../src/db/migrations');
const LOCAL_DB_PATH = join(__dirname, '../.wrangler/state/v3/d1/miniflare-D1DatabaseObject');

class MigrationRunner {
  constructor(environment = 'local') {
    this.environment = environment;
    this.db = null;
  }

  async initializeDatabase() {
    if (this.environment === 'local') {
      // For local development, use file-based SQLite
      const Database = await import('better-sqlite3').then(m => m.default);
      this.db = new Database(LOCAL_DB_PATH);
    } else {
      // For production, use Wrangler CLI
      console.log('Production migrations should be run via wrangler d1 migrations apply');
      process.exit(1);
    }
  }

  async createMigrationsTable() {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS __drizzle_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `;

    if (this.environment === 'local') {
      this.db.exec(createTableSQL);
    }
  }

  async getAppliedMigrations() {
    if (this.environment === 'local') {
      try {
        const stmt = this.db.prepare('SELECT hash FROM __drizzle_migrations ORDER BY id');
        return stmt.all().map(row => row.hash);
      } catch (error) {
        console.log('No migrations table found, creating...');
        await this.createMigrationsTable();
        return [];
      }
    }
    return [];
  }

  async getPendingMigrations() {
    const appliedMigrations = await this.getAppliedMigrations();
    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql') && !file.startsWith('rollback-'))
      .sort();

    return migrationFiles.filter(file => {
      const content = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const hash = this.createHash(content);
      return !appliedMigrations.includes(hash);
    });
  }

  async applyMigration(filename) {
    const migrationPath = join(MIGRATIONS_DIR, filename);
    const content = readFileSync(migrationPath, 'utf8');
    const hash = this.createHash(content);

    console.log(`Applying migration: ${filename}`);

    try {
      if (this.environment === 'local') {
        // Split by statement breakpoint and execute each statement
        const statements = content.split('-->').map(s => s.trim()).filter(s => s.length > 0);

        for (const statement of statements) {
          if (statement.includes('statement-breakpoint')) continue;
          if (statement.trim().length === 0) continue;

          try {
            this.db.exec(statement);
          } catch (error) {
            console.error(`Error executing statement: ${statement.substring(0, 100)}...`);
            throw error;
          }
        }

        // Record migration as applied
        const insertStmt = this.db.prepare(
          'INSERT INTO __drizzle_migrations (hash) VALUES (?)'
        );
        insertStmt.run(hash);
      }

      console.log(`✅ Successfully applied: ${filename}`);
    } catch (error) {
      console.error(`❌ Failed to apply migration ${filename}:`, error.message);
      throw error;
    }
  }

  async rollbackMigration(filename) {
    const rollbackFilename = `rollback-${filename}`;
    const rollbackPath = join(MIGRATIONS_DIR, rollbackFilename);

    try {
      const content = readFileSync(rollbackPath, 'utf8');
      console.log(`Rolling back migration: ${filename}`);

      if (this.environment === 'local') {
        // Split and execute statements
        const statements = content.split(';').map(s => s.trim()).filter(s => s.length > 0);

        for (const statement of statements) {
          if (statement.startsWith('--')) continue;

          try {
            this.db.exec(statement + ';');
          } catch (error) {
            console.warn(`Warning during rollback: ${error.message}`);
          }
        }

        // Remove migration record
        const originalContent = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
        const hash = this.createHash(originalContent);
        const deleteStmt = this.db.prepare('DELETE FROM __drizzle_migrations WHERE hash = ?');
        deleteStmt.run(hash);
      }

      console.log(`✅ Successfully rolled back: ${filename}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(`❌ Rollback file not found: ${rollbackFilename}`);
      } else {
        console.error(`❌ Failed to rollback migration ${filename}:`, error.message);
      }
      throw error;
    }
  }

  async showStatus() {
    const appliedMigrations = await this.getAppliedMigrations();
    const pendingMigrations = await this.getPendingMigrations();

    console.log('\n📊 Migration Status:');
    console.log(`Environment: ${this.environment}`);
    console.log(`Applied migrations: ${appliedMigrations.length}`);
    console.log(`Pending migrations: ${pendingMigrations.length}`);

    if (pendingMigrations.length > 0) {
      console.log('\n📋 Pending migrations:');
      pendingMigrations.forEach(file => {
        console.log(`  - ${file}`);
      });
    } else {
      console.log('\n✅ Database is up to date');
    }

    return {
      applied: appliedMigrations.length,
      pending: pendingMigrations.length,
      pendingFiles: pendingMigrations
    };
  }

  async migrateUp() {
    await this.initializeDatabase();
    await this.createMigrationsTable();

    const pendingMigrations = await this.getPendingMigrations();

    if (pendingMigrations.length === 0) {
      console.log('✅ No pending migrations');
      return;
    }

    console.log(`🚀 Applying ${pendingMigrations.length} migration(s)...`);

    for (const filename of pendingMigrations) {
      await this.applyMigration(filename);
    }

    console.log('\n🎉 All migrations applied successfully!');
  }

  async migrateDown(steps = 1) {
    await this.initializeDatabase();

    const appliedMigrations = await this.getAppliedMigrations();

    if (appliedMigrations.length === 0) {
      console.log('❌ No migrations to rollback');
      return;
    }

    const migrationFiles = readdirSync(MIGRATIONS_DIR)
      .filter(file => file.endsWith('.sql') && !file.startsWith('rollback-'))
      .sort()
      .reverse(); // Rollback in reverse order

    const toRollback = migrationFiles.slice(0, steps);

    console.log(`⬇️  Rolling back ${toRollback.length} migration(s)...`);

    for (const filename of toRollback) {
      await this.rollbackMigration(filename);
    }

    console.log('\n🎉 Rollback completed successfully!');
  }

  createHash(content) {
    // Simple hash function for migration tracking
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  close() {
    if (this.db && this.environment === 'local') {
      this.db.close();
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const environment = process.env.NODE_ENV || 'local';

  const runner = new MigrationRunner(environment);

  try {
    switch (command) {
      case 'up':
        await runner.migrateUp();
        break;

      case 'down':
        const steps = parseInt(args[1]) || 1;
        await runner.migrateDown(steps);
        break;

      case 'status':
        await runner.initializeDatabase();
        await runner.createMigrationsTable();
        await runner.showStatus();
        break;

      case 'reset':
        console.log('⚠️  This will destroy all data! Are you sure? (This feature is not implemented for safety)');
        break;

      default:
        console.log(`
Database Migration Runner

Usage:
  node scripts/migrate.js <command>

Commands:
  up              Apply all pending migrations
  down [steps]    Rollback migrations (default: 1 step)
  status          Show migration status
  reset           Reset database (not implemented)

Environment:
  Set NODE_ENV=production for production migrations (will use wrangler)
  Default: local (uses local SQLite file)

Examples:
  node scripts/migrate.js up
  node scripts/migrate.js down 2
  node scripts/migrate.js status
        `);
        break;
    }
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    runner.close();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MigrationRunner };