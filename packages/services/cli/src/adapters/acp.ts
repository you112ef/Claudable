import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process'

type Pending = { resolve: (v: any) => void; reject: (e: any) => void }

export type RpcHandler = (params: any) => Promise<any>
type NotifHandler = (params: any) => void

export class ACPClient {
  private cmd: string[]
  private env: NodeJS.ProcessEnv
  private cwd: string
  private proc: ChildProcessWithoutNullStreams | null = null
  private nextId = 1
  private pending = new Map<number, Pending>()
  private notif = new Map<string, NotifHandler[]>()
  private reqHandlers = new Map<string, RpcHandler>()

  constructor(cmd: string[], env?: NodeJS.ProcessEnv, cwd?: string) {
    this.cmd = cmd
    this.env = env || process.env
    this.cwd = cwd || process.cwd()
  }

  async start() {
    if (this.proc) return
    this.proc = spawn(this.cmd[0]!, this.cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: this.env, cwd: this.cwd })
    const decoder = new TextDecoder()
    let buffer = ''
    this.proc.stdout.on('data', (chunk) => {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk as any)
      let idx
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        try {
          const msg = JSON.parse(line)
          this._dispatch(msg)
        } catch {}
      }
    })
  }

  stop() {
    try { this.proc?.kill('SIGTERM') } catch {}
    this.proc = null
  }

  onNotification(method: string, handler: NotifHandler) {
    const list = this.notif.get(method) || []
    list.push(handler)
    this.notif.set(method, list)
  }

  onRequest(method: string, handler: RpcHandler) {
    this.reqHandlers.set(method, handler)
  }

  request(method: string, params?: any): Promise<any> {
    const id = this.nextId++
    const msg = { jsonrpc: '2.0', id, method, params: params || {} }
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
    try {
      this.proc?.stdin?.write(JSON.stringify(msg) + '\n')
    } catch (e) {
      this.pending.delete(id)
      throw e
    }
    return p
  }

  private async _dispatch(msg: any) {
    // Response
    if (msg && typeof msg === 'object' && 'id' in msg && !('method' in msg)) {
      const id = Number(msg.id)
      const slot = this.pending.get(id)
      if (!slot) return
      this.pending.delete(id)
      if ('error' in msg) slot.reject(new Error(typeof msg.error === 'string' ? msg.error : JSON.stringify(msg.error)))
      else slot.resolve(msg.result)
      return
    }
    // Request
    if (msg && typeof msg === 'object' && 'id' in msg && 'method' in msg) {
      const id = Number(msg.id)
      const handler = this.reqHandlers.get(msg.method)
      if (!handler) {
        // Respond with error
        this.proc?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } }) + '\n')
        return
      }
      try {
        const result = await handler(msg.params)
        this.proc?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
      } catch (e: any) {
        this.proc?.stdin?.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32000, message: e?.message || 'Internal error' } }) + '\n')
      }
      return
    }
    // Notification
    if (msg && typeof msg === 'object' && 'method' in msg && !('id' in msg)) {
      const list = this.notif.get(msg.method)
      if (list) {
        for (const h of list) {
          try { h(msg.params) } catch {}
        }
      }
    }
  }
}

