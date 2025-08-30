#!/usr/bin/env node
// Ensure PRISMA_DATABASE_URL from DATABASE_URL if not provided
if (!process.env.PRISMA_DATABASE_URL) {
  const dbUrl = process.env.DATABASE_URL || ''
  if (dbUrl.startsWith('sqlite:///')) {
    process.env.PRISMA_DATABASE_URL = 'file:' + dbUrl.replace('sqlite:///', '')
  } else if (dbUrl.startsWith('file:')) {
    process.env.PRISMA_DATABASE_URL = dbUrl
  }
}
const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()
  const id = process.argv[2] || 'testproj'
  const name = process.argv[3] || 'Test Project'
  await prisma.project.upsert({
    where: { id },
    update: { name },
    create: { id, name },
  })
  console.log('Seeded project', id)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
