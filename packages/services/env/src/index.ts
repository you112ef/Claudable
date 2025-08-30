import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { createLogger } from '@repo/logging'
import { resolveProjectRepoPath } from '@repo/config'
import { getPrisma } from '@repo/db'
import { encrypt, decrypt } from './crypto'

const log = createLogger('env-service')

export function getProjectEnvPath(projectId: string): string {
  return path.join(resolveProjectRepoPath(projectId), '.env')
}

export function parseEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {}
  if (!fs.existsSync(envPath)) return result
  try {
    const content = fs.readFileSync(envPath, 'utf8')
    const lines = content.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line || line.startsWith('#')) continue
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!m) continue
      let [, key, value] = m
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      result[key] = value
    }
  } catch (e: any) {
    log.warn(`Error parsing .env file ${envPath}: ${e?.message || e}`)
  }
  return result
}

export function writeEnvFile(envPath: string, envVars: Record<string, string>): void {
  fs.mkdirSync(path.dirname(envPath), { recursive: true })
  const header = `# Environment Variables\n# This file is automatically synchronized with Project Settings\n\n`
  const lines: string[] = [header]
  const keys = Object.keys(envVars).sort((a, b) => a.localeCompare(b))
  for (const key of keys) {
    let value = envVars[key] ?? ''
    if (value.includes(' ') || /[#$`"']/.test(value)) {
      value = `"${value}"`
    }
    lines.push(`${key}=${value}`)
  }
  fs.writeFileSync(envPath, lines.join('\n'), 'utf8')
  log.info(`Updated .env file: ${envPath}`)
}

export async function loadFromDb(projectId: string): Promise<Record<string, string>> {
  const prisma = await getPrisma()
  const rows = await (prisma as any).envVar.findMany({ where: { projectId } })
  const result: Record<string, string> = {}
  for (const row of rows) {
    try {
      result[row.key] = decrypt(row.valueEncrypted)
    } catch (e: any) {
      log.warn(`Failed to decrypt env var ${row.key}: ${e?.message || e}`)
    }
  }
  return result
}

export async function loadDecryptedRows(projectId: string): Promise<Array<{ id: string; key: string; value: string; scope: string; var_type: string; is_secret: boolean; description: string | null }>> {
  const prisma = await getPrisma()
  const rows = await (prisma as any).envVar.findMany({ where: { projectId } })
  const out: Array<{ id: string; key: string; value: string; scope: string; var_type: string; is_secret: boolean; description: string | null }> = []
  for (const row of rows) {
    try {
      out.push({
        id: row.id,
        key: row.key,
        value: decrypt(row.valueEncrypted),
        scope: row.scope,
        var_type: row.varType,
        is_secret: row.isSecret,
        description: row.description,
      })
    } catch (e: any) {
      log.warn(`Failed to decrypt env var ${row.key}: ${e?.message || e}`)
    }
  }
  return out
}

export async function syncFileToDb(projectId: string): Promise<number> {
  const filePath = getProjectEnvPath(projectId)
  const fileVars = parseEnvFile(filePath)
  const prisma = await getPrisma()
  const existing = await (prisma as any).envVar.findMany({ where: { projectId } })
  const byKey = new Map<string, any>(existing.map((e: any) => [e.key, e]))
  let synced = 0
  for (const [key, value] of Object.entries(fileVars)) {
    const enc = encrypt(value)
    const found = byKey.get(key)
    if (found) {
      await (prisma as any).envVar.update({ where: { id: found.id }, data: { valueEncrypted: enc } })
    } else {
      const id = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
      await (prisma as any).envVar.create({
        data: {
          id,
          projectId,
          key,
          valueEncrypted: enc,
          scope: 'runtime',
          varType: 'string',
          isSecret: true,
          description: null,
        },
      })
    }
    synced++
  }
  return synced
}

export async function syncDbToFile(projectId: string): Promise<number> {
  const vars = await loadFromDb(projectId)
  writeEnvFile(getProjectEnvPath(projectId), vars)
  return Object.keys(vars).length
}

export async function getConflicts(projectId: string): Promise<Array<{ key: string; file_value: string | undefined; db_value: string | undefined; conflict_type: string }>> {
  const fileVars = parseEnvFile(getProjectEnvPath(projectId))
  const dbVars = await loadFromDb(projectId)
  const keys = new Set([...Object.keys(fileVars), ...Object.keys(dbVars)])
  const conflicts: Array<{ key: string; file_value: string | undefined; db_value: string | undefined; conflict_type: string }> = []
  for (const key of keys) {
    const fv = fileVars[key]
    const dv = dbVars[key]
    if (fv !== dv) {
      const conflict_type = fv && !dv ? 'file_only' : dv && !fv ? 'db_only' : 'value_mismatch'
      conflicts.push({ key, file_value: fv, db_value: dv, conflict_type })
    }
  }
  return conflicts
}

export const EnvVarCreateSchema = z.object({
  key: z.string().min(1),
  value: z.string().default(''),
  scope: z.string().default('runtime'),
  var_type: z.string().default('string'),
  is_secret: z.boolean().default(true),
  description: z.string().optional().nullable(),
})

export const EnvVarUpdateSchema = z.object({ value: z.string() })

export async function createEnvVar(projectId: string, input: z.infer<typeof EnvVarCreateSchema>) {
  const prisma = await getPrisma()
  const id = (globalThis as any).crypto?.randomUUID?.() || require('node:crypto').randomUUID()
  const enc = encrypt(input.value)
  const row = await (prisma as any).envVar.create({
    data: {
      id,
      projectId,
      key: input.key,
      valueEncrypted: enc,
      scope: input.scope ?? 'runtime',
      varType: input.var_type ?? 'string',
      isSecret: input.is_secret ?? true,
      description: input.description ?? null,
    },
  })
  await syncDbToFile(projectId)
  return row
}

export async function updateEnvVar(projectId: string, key: string, value: string): Promise<boolean> {
  const prisma = await getPrisma()
  const existing = await (prisma as any).envVar.findFirst({ where: { projectId, key } })
  if (!existing) return false
  const enc = encrypt(value)
  await (prisma as any).envVar.update({ where: { id: existing.id }, data: { valueEncrypted: enc } })
  await syncDbToFile(projectId)
  return true
}

export async function deleteEnvVar(projectId: string, key: string): Promise<boolean> {
  const prisma = await getPrisma()
  const existing = await (prisma as any).envVar.findFirst({ where: { projectId, key } })
  if (!existing) return false
  await (prisma as any).envVar.delete({ where: { id: existing.id } })
  await syncDbToFile(projectId)
  return true
}

export async function projectExists(projectId: string): Promise<boolean> {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId }, select: { id: true } })
  return !!p
}

export async function envVarExists(projectId: string, key: string): Promise<boolean> {
  const prisma = await getPrisma()
  const r = await (prisma as any).envVar.findFirst({ where: { projectId, key }, select: { id: true } })
  return !!r
}
