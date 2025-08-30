// Minimal Electron main process that loads Next.js and exposes IPC
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')
const net = require('node:net')
const { spawn } = require('node:child_process')

async function findFreePort(start = 3000, end = 3999) {
  function check(p) {
    return new Promise((resolve) => {
      const srv = net.createServer()
      srv.unref()
      srv.on('error', () => resolve(false))
      srv.listen({ port: p, host: '127.0.0.1' }, () => srv.close(() => resolve(true)))
    })
  }
  for (let p = start; p <= end; p++) if (await check(p)) return p
  throw new Error('No free port')
}

function resolveWebDir() {
  const candidates = [
    path.join(process.resourcesPath || __dirname, 'apps', 'web'),
    path.join(__dirname, '..', 'apps', 'web'),
    path.join(process.cwd(), 'apps', 'web'),
  ]
  for (const c of candidates) {
    try { require('fs').accessSync(c); return c } catch {}
  }
  return path.join(process.cwd(), 'apps', 'web')
}

async function ensureServer() {
  if (!app.isPackaged) return process.env.ELECTRON_START_URL || 'http://localhost:3000'
  const webDir = resolveWebDir()
  const port = await findFreePort()
  const env = { ...process.env, PORT: String(port), BROWSER: 'none', WS_STANDALONE: '0' }
  // Try to start Next production server
  const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'start', '-p', String(port)], { cwd: webDir, stdio: 'inherit', env, shell: true })
  child.on('error', (e) => console.error('[desktop] failed to start Next:', e.message))
  // Wait a moment for server ready
  await new Promise((r) => setTimeout(r, 2000))
  return `http://localhost:${port}`
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: require('path').join(__dirname, 'preload.js'),
    },
  })
  const startUrl = await ensureServer()
  await win.loadURL(startUrl)
}

app.whenReady().then(async () => {
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// IPC handlers: proxy a subset of services
ipcMain.handle('projects:list', async () => {
  const mod = await import('@repo/services-projects')
  const rows = await mod.listProjects()
  // Serialize Date fields safely
  return rows.map((r) => ({
    ...r,
    created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
    last_active_at: r.last_active_at ? new Date(r.last_active_at).toISOString() : null,
    last_message_at: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
  }))
})
