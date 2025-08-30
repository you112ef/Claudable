import { getPrisma } from '@repo/db'

const ALLOWED = new Set(['github', 'supabase', 'vercel'])

export function isValidProvider(provider: string): boolean {
  return ALLOWED.has(provider)
}

export type TokenMetadata = {
  id: string
  provider: string
  name: string
  created_at: Date
  last_used: Date | null
}

export async function saveServiceToken(provider: string, token: string, name?: string): Promise<TokenMetadata> {
  if (!isValidProvider(provider)) throw new Error('Invalid provider')
  const t = token?.trim()
  if (!t) throw new Error('Token cannot be empty')
  const label = (name || '').trim() || `${provider.charAt(0).toUpperCase()}${provider.slice(1)} Token`
  const prisma = await getPrisma()
  // Enforce single token per provider: delete existing
  await (prisma as any).serviceToken.deleteMany({ where: { provider } })
  const id = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
  const created = await (prisma as any).serviceToken.create({
    data: { id, provider, name: label, token: t },
  })
  return {
    id: created.id,
    provider: created.provider,
    name: created.name,
    created_at: created.createdAt,
    last_used: created.lastUsed ?? null,
  }
}

export async function getServiceTokenMetadata(provider: string): Promise<TokenMetadata | null> {
  if (!isValidProvider(provider)) throw new Error('Invalid provider')
  const prisma = await getPrisma()
  const row = await (prisma as any).serviceToken.findFirst({ where: { provider } })
  if (!row) return null
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    created_at: row.createdAt,
    last_used: row.lastUsed ?? null,
  }
}

export async function getPlainToken(provider: string): Promise<string | null> {
  if (!isValidProvider(provider)) throw new Error('Invalid provider')
  const prisma = await getPrisma()
  const row = await (prisma as any).serviceToken.findFirst({ where: { provider }, select: { token: true } })
  return row?.token ?? null
}

export async function deleteServiceToken(tokenId: string): Promise<boolean> {
  const prisma = await getPrisma()
  const res = await (prisma as any).serviceToken.deleteMany({ where: { id: tokenId } })
  return (res?.count ?? 0) > 0
}

export async function updateLastUsed(provider: string): Promise<void> {
  if (!isValidProvider(provider)) throw new Error('Invalid provider')
  const prisma = await getPrisma()
  await (prisma as any).serviceToken.updateMany({ where: { provider }, data: { lastUsed: new Date() } })
}

