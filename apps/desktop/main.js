// Minimal Electron main process that loads Next.js and exposes IPC
const { app, BrowserWindow, ipcMain } = require('electron')

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: require('path').join(__dirname, 'preload.js'),
    },
  })

  const startUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000'
  win.loadURL(startUrl)
}

app.whenReady().then(() => {
  createWindow()
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

