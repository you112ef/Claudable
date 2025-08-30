#!/usr/bin/env node
// Minimal seed to validate Prisma connectivity. Safe to run multiple times.
async function main() {
  let PrismaClient
  try {
    ;({ PrismaClient } = require('@prisma/client'))
  } catch (e) {
    console.error('Prisma client not found. Run `npm run prisma:generate` first.')
    process.exit(1)
  }
  const prisma = new PrismaClient()
  try {
    // No-op seed: just ensure DB is reachable
    await prisma.$queryRaw`SELECT 1` 
    console.log('DB reachable. Seed completed (no-op).')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

