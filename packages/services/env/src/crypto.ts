import crypto from 'node:crypto'
import { createLogger } from '@repo/logging'

const log = createLogger('env-crypto')

function ensureKey(): string {
  const k = process.env.ENCRYPTION_KEY
  if (k && k.trim().length > 0) return k.trim()
  // Generate ephemeral base64url 32-byte key (compatible with Fernet)
  const buf = crypto.randomBytes(32)
  const b64 = buf.toString('base64')
  const b64url = b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
  log.warn('ENCRYPTION_KEY not set; using ephemeral key for this process only')
  return b64url
}

// Lazy load fernet to avoid cost when unused
let _fernet: any | null = null
export function getFernet() {
  if (_fernet) return _fernet
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fernet = require('fernet')
  const key = ensureKey()
  const Secret = fernet.Secret
  const Token = fernet.Token
  _fernet = { Secret, Token, key }
  return _fernet
}

export function encrypt(plaintext: string): string {
  const { Secret, Token, key } = getFernet()
  const secret = new Secret(key)
  const token = new Token({ secret })
  return token.encode(plaintext)
}

export function decrypt(ciphertext: string): string {
  const { Secret, Token, key } = getFernet()
  const secret = new Secret(key)
  const token = new Token({ secret, token: ciphertext })
  return token.decode()
}

