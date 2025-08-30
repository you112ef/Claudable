type Level = 'debug' | 'info' | 'warn' | 'error'

function ts() {
  return new Date().toISOString()
}

function baseLog(level: Level, component: string | undefined, msg: string, meta?: unknown) {
  const prefix = component ? `[${component}]` : ''
  const line = `${ts()} ${level.toUpperCase()} ${prefix} ${msg}`.trim()
  if (level === 'error') console.error(line, meta ?? '')
  else if (level === 'warn') console.warn(line, meta ?? '')
  else if (level === 'debug') {
    if ((process.env.DEBUG || '').toLowerCase() === 'true') console.debug(line, meta ?? '')
  } else console.log(line, meta ?? '')
}

export function createLogger(component?: string) {
  return {
    debug: (msg: string, meta?: unknown) => baseLog('debug', component, msg, meta),
    info: (msg: string, meta?: unknown) => baseLog('info', component, msg, meta),
    warn: (msg: string, meta?: unknown) => baseLog('warn', component, msg, meta),
    error: (msg: string, meta?: unknown) => baseLog('error', component, msg, meta),
  }
}

export const logger = createLogger('root')

