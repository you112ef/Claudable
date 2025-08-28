#!/usr/bin/env node

// Non-destructive migration for legacy SQLite (from Python backend) → Prisma schema
// Adds missing required columns with safe defaults and backfills NULLs.

const fs = require('fs');
const path = require('path');
let sqlite3;
try {
  sqlite3 = require('sqlite3');
} catch (e) {
  // Fallback to resolve from apps/web workspace if not hoisted
  try {
    const alt = require.resolve('sqlite3', { paths: [path.join(__dirname, '..', 'apps', 'web', 'node_modules')] });
    sqlite3 = require(alt);
  } catch (e2) {
    console.error('sqlite3 module not found. Skipping legacy migration.');
    process.exit(0);
  }
}
sqlite3 = sqlite3.verbose();

function getDbPath() {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const m = content.match(/DATABASE_URL\s*=\s*sqlite:\/\/\/([^\n\r]+)/);
      if (m && m[1]) return m[1].trim();
    }
  } catch {}
  return path.join(__dirname, '..', 'data', 'cc.db');
}

function hasColumn(db, table, column) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${table});`, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.some(r => r.name === column));
    });
  });
}

function run(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function migrate() {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    console.log(`No database at ${dbPath}, nothing to migrate`);
    return;
  }
  console.log(`🔧 Migrating legacy SQLite at ${dbPath} (non-destructive)`);
  const db = new sqlite3.Database(dbPath);

  try {
    // messages.type
    if (!(await hasColumn(db, 'messages', 'type'))) {
      await run(db, "ALTER TABLE messages ADD COLUMN type TEXT DEFAULT 'text' NOT NULL;");
      console.log('  Added messages.type');
    }

    // messages.updated_at (SQLite ALTER TABLE requires constant default)
    if (!(await hasColumn(db, 'messages', 'updated_at'))) {
      await run(db, "ALTER TABLE messages ADD COLUMN updated_at DATETIME NOT NULL DEFAULT '1970-01-01 00:00:00';");
      console.log('  Added messages.updated_at');
      await run(db, "UPDATE messages SET updated_at = datetime('now') WHERE updated_at IS NULL OR updated_at = '1970-01-01 00:00:00';");
    }

    // messages.request_id
    if (!(await hasColumn(db, 'messages', 'request_id'))) {
      await run(db, "ALTER TABLE messages ADD COLUMN request_id TEXT;");
      console.log('  Added messages.request_id');
    }
    // messages.status
    if (!(await hasColumn(db, 'messages', 'status'))) {
      await run(db, "ALTER TABLE messages ADD COLUMN status TEXT;");
      console.log('  Added messages.status');
    }
    // messages.error_message
    if (!(await hasColumn(db, 'messages', 'error_message'))) {
      await run(db, "ALTER TABLE messages ADD COLUMN error_message TEXT;");
      console.log('  Added messages.error_message');
    }
    // messages.parent_message_id
    if (!(await hasColumn(db, 'messages', 'parent_message_id'))) {
      await run(db, "ALTER TABLE messages ADD COLUMN parent_message_id TEXT;");
      console.log('  Added messages.parent_message_id');
    }
    // messages.metadata
    if (!(await hasColumn(db, 'messages', 'metadata'))) {
      await run(db, "ALTER TABLE messages ADD COLUMN metadata TEXT;");
      console.log('  Added messages.metadata');
    }

    // projects.path
    if (!(await hasColumn(db, 'projects', 'path'))) {
      await run(db, "ALTER TABLE projects ADD COLUMN path TEXT DEFAULT '' NOT NULL;");
      console.log('  Added projects.path');
    }

    // sessions.session_external_id
    if (!(await hasColumn(db, 'sessions', 'session_external_id'))) {
      await run(db, "ALTER TABLE sessions ADD COLUMN session_external_id TEXT DEFAULT '' NOT NULL;");
      console.log('  Added sessions.session_external_id');
    }

    // sessions.model
    if (!(await hasColumn(db, 'sessions', 'model'))) {
      await run(db, "ALTER TABLE sessions ADD COLUMN model TEXT DEFAULT 'claude-sonnet-4' NOT NULL;");
      console.log('  Added sessions.model');
    }

    // Backfill NULLs for model/session_external_id if they exist already
    await run(db, "UPDATE sessions SET session_external_id = COALESCE(NULLIF(session_external_id, ''), 'session-' || CAST(strftime('%s','now') AS TEXT)) WHERE session_external_id IS NULL OR session_external_id = '';");
    await run(db, "UPDATE sessions SET model = COALESCE(model, 'claude-sonnet-4') WHERE model IS NULL OR TRIM(model) = '';");

    // user_requests compatibility columns
    if (!(await hasColumn(db, 'user_requests', 'status'))) {
      await run(db, "ALTER TABLE user_requests ADD COLUMN status TEXT DEFAULT 'pending' NOT NULL;");
      console.log('  Added user_requests.status');
    }
    if (!(await hasColumn(db, 'user_requests', 'request_type'))) {
      await run(db, "ALTER TABLE user_requests ADD COLUMN request_type TEXT DEFAULT 'chat' NOT NULL;");
      console.log('  Added user_requests.request_type');
    }
    if (!(await hasColumn(db, 'user_requests', 'input_data'))) {
      await run(db, "ALTER TABLE user_requests ADD COLUMN input_data TEXT;");
      console.log('  Added user_requests.input_data');
    }
    if (!(await hasColumn(db, 'user_requests', 'output_data'))) {
      await run(db, "ALTER TABLE user_requests ADD COLUMN output_data TEXT;");
      console.log('  Added user_requests.output_data');
    }
    if (!(await hasColumn(db, 'user_requests', 'error_message'))) {
      await run(db, "ALTER TABLE user_requests ADD COLUMN error_message TEXT;");
      console.log('  Added user_requests.error_message');
    }
    if (!(await hasColumn(db, 'user_requests', 'duration_ms'))) {
      await run(db, "ALTER TABLE user_requests ADD COLUMN duration_ms INTEGER;");
      console.log('  Added user_requests.duration_ms');
    }

    console.log('✅ Legacy migration complete');
  } catch (e) {
    console.error('❌ Migration failed:', e.message);
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

migrate();
