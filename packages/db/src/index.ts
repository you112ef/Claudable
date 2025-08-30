// Prisma client singleton wrapper
// Avoid importing @prisma/client at module top-level to prevent build-time failures
// when the client hasn't been generated yet.

let _client: any | null = null

export async function getPrisma() {
  if (_client) return _client
  try {
    const mod = await import('@prisma/client')
    const PrismaClient = (mod as any).PrismaClient
    _client = new PrismaClient()
    return _client
  } catch (err: any) {
    throw new Error(
      'Prisma client not available. Run `npm run prisma:generate` to generate the client. ' +
      (err?.message ? `Details: ${err.message}` : '')
    )
  }
}

export type PrismaClientType = unknown

