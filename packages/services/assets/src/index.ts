import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { resolveProjectAssetsPath } from '@repo/config'
import { getPrisma } from '@repo/db'

export function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true })
}

export async function writeBytes(filePath: string, data: Buffer | Uint8Array) {
  ensureDir(path.dirname(filePath))
  await fsp.writeFile(filePath, data)
}

export function safeJoin(root: string, filename: string): string {
  // Prevent path traversal by resolving and verifying prefix
  const target = path.resolve(root, filename)
  const rootResolved = path.resolve(root)
  if (!target.startsWith(rootResolved + path.sep) && target !== rootResolved) {
    throw new Error('Invalid path')
  }
  return target
}

export function assetsDir(projectId: string): string {
  return resolveProjectAssetsPath(projectId)
}

export function assetFilePath(projectId: string, filename: string): string {
  return safeJoin(assetsDir(projectId), filename)
}

export function contentTypeFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  switch (ext) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.gif': return 'image/gif'
    case '.webp': return 'image/webp'
    case '.svg': return 'image/svg+xml'
    case '.bmp': return 'image/bmp'
    case '.ico': return 'image/x-icon'
    default: return 'application/octet-stream'
  }
}

export async function projectExists(projectId: string): Promise<boolean> {
  const prisma = await getPrisma()
  const p = await (prisma as any).project.findUnique({ where: { id: projectId }, select: { id: true } })
  return !!p
}

