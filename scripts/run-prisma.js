#!/usr/bin/env node
/*
 Cross-platform Prisma runner that ensures PRISMA_DATABASE_URL is set
 and optionally backs up the SQLite DB before destructive operations.
*/
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
require('dotenv').config()

const args = process.argv.slice(2)
const cmd = args[0] || 'help'
const rest = args.slice(1)

// Determine DB URL for Prisma (expects file: URL)
function resolvePrismaDbUrl() {
  const fromEnv = process.env.PRISMA_DATABASE_URL
  if (fromEnv) return fromEnv
  const dbUrl = process.env.DATABASE_URL || ''
  if (dbUrl.startsWith('file:')) return dbUrl
  // Translate SQLAlchemy-style sqlite URL to Prisma file: URL
  if (dbUrl.startsWith('sqlite:///')) {
    const absPath = dbUrl.replace('sqlite://', '')
    return `file:${absPath}`
  }
  // Default relative path
  return 'file:./data/cc.db'
}

function runPrisma(prismaArgs, { backup = false } = {}) {
  const env = { ...process.env, PRISMA_DATABASE_URL: resolvePrismaDbUrl() }

  const doRun = () => spawn('prisma', prismaArgs, {
    stdio: 'inherit',
    shell: true,
    env,
  }).on('exit', (code) => process.exit(code || 0))

  if (!backup) return doRun()

  // Perform DB backup to data/backups with timestamp
  try {
    const root = path.join(__dirname, '..')
    const dbPath = path.resolve(root, 'data', 'cc.db')
    const backupsDir = path.resolve(root, 'data', 'backups')
    if (!fs.existsSync(dbPath)) {
      console.warn(`[run-prisma] DB file not found at ${dbPath}, skipping backup`)
      return doRun()
    }
    fs.mkdirSync(backupsDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backupPath = path.join(backupsDir, `cc-${ts}.db`)
    fs.copyFileSync(dbPath, backupPath)
    console.log(`[run-prisma] Backup created: ${backupPath}`)
  } catch (e) {
    console.warn('[run-prisma] Backup failed:', e.message)
  }

  return doRun()
}

switch (cmd) {
  case 'generate':
    runPrisma(['generate', '--schema', 'packages/db/prisma/schema.prisma'])
    break
  case 'migrate': {
    const isInteractive = process.stdout.isTTY && process.env.CI !== 'true'
    const args = isInteractive
      ? ['migrate', 'dev', '--schema', 'packages/db/prisma/schema.prisma']
      : ['db', 'push', '--schema', 'packages/db/prisma/schema.prisma']
    runPrisma(args, { backup: true })
    break
  }
  case 'push':
    runPrisma(['db', 'push', '--schema', 'packages/db/prisma/schema.prisma'], { backup: true })
    break
  case 'deploy':
    runPrisma(['migrate', 'deploy', '--schema', 'packages/db/prisma/schema.prisma'])
    break
  case 'seed':
    // Run a simple seed script using generated client if available
    spawn('node', ['scripts/db-seed.js'], { stdio: 'inherit', shell: true, env: { ...process.env, PRISMA_DATABASE_URL: resolvePrismaDbUrl() } })
      .on('exit', (code) => process.exit(code || 0))
    break
  default:
    console.log('Usage: node scripts/run-prisma.js <generate|migrate|seed> [-- extra args]')
    process.exit(0)
}
