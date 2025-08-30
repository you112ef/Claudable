export type CliKey = 'claude' | 'cursor' | 'codex' | 'qwen' | 'gemini'

// Unified name -> CLI-specific model mapping (mirrors Python MODEL_MAPPING)
const MODEL_MAPPING: Record<CliKey, Record<string, string>> = {
  claude: {
    'opus-4.1': 'claude-opus-4-1-20250805',
    'sonnet-4': 'claude-sonnet-4-20250514',
    'opus-4': 'claude-opus-4-20250514',
    'haiku-3.5': 'claude-3-5-haiku-20241022',
    // Handle claude-prefixed model names
    'claude-sonnet-4': 'claude-sonnet-4-20250514',
    'claude-opus-4.1': 'claude-opus-4-1-20250805',
    'claude-opus-4': 'claude-opus-4-20250514',
    'claude-haiku-3.5': 'claude-3-5-haiku-20241022',
    // Allow passing through full model names directly
    'claude-opus-4-1-20250805': 'claude-opus-4-1-20250805',
    'claude-sonnet-4-20250514': 'claude-sonnet-4-20250514',
    'claude-opus-4-20250514': 'claude-opus-4-20250514',
    'claude-3-5-haiku-20241022': 'claude-3-5-haiku-20241022',
  },
  cursor: {
    'gpt-5': 'gpt-5',
    'sonnet-4': 'sonnet-4',
    'opus-4.1': 'opus-4.1',
    'sonnet-4-thinking': 'sonnet-4-thinking',
    // Map unified Claude names to Cursor equivalents
    'claude-sonnet-4': 'sonnet-4',
    'claude-opus-4.1': 'opus-4.1',
    'claude-sonnet-4-20250514': 'sonnet-4',
    'claude-opus-4-1-20250805': 'opus-4.1',
  },
  codex: {
    'gpt-5': 'gpt-5',
    'gpt-4o': 'gpt-4o',
    'gpt-4o-mini': 'gpt-4o-mini',
    'o1-preview': 'o1-preview',
    'o1-mini': 'o1-mini',
    'claude-3.5-sonnet': 'claude-3.5-sonnet',
    'claude-3-haiku': 'claude-3-haiku',
    // Unified aliases
    'sonnet-4': 'claude-4-sonnet',
    'claude-sonnet-4': 'claude-4-sonnet',
    'haiku-3.5': 'claude-3-haiku',
    'claude-haiku-3.5': 'claude-3-haiku',
  },
  qwen: {
    'qwen3-coder-plus': 'qwen-coder',
    'Qwen3 Coder Plus': 'qwen-coder',
    // Allow direct
    'qwen-coder': 'qwen-coder',
  },
  gemini: {
    'gemini-2.5-pro': 'gemini-2.5-pro',
    'gemini-2.5-flash': 'gemini-2.5-flash',
  },
}

const DEFAULT_BY_CLI: Record<CliKey, string> = {
  claude: 'claude-sonnet-4-20250514',
  cursor: 'gpt-5',
  codex: 'gpt-5',
  qwen: 'qwen-coder',
  gemini: 'gemini-2.5-pro',
}

export function mapUnifiedModel(cliType: string, unifiedModel?: string | null): string | undefined {
  if (!unifiedModel) return undefined
  const key = (cliType || '').toLowerCase() as CliKey
  const table = (MODEL_MAPPING as any)[key] as Record<string, string> | undefined
  if (!table) return unifiedModel
  // Try exact match; otherwise pass through the provided name
  return table[unifiedModel] || unifiedModel
}

export function defaultModel(cliType: string): string | undefined {
  const key = (cliType || '').toLowerCase() as CliKey
  return (DEFAULT_BY_CLI as any)[key]
}

export function supportedUnifiedModels(cliType: string): string[] {
  const key = (cliType || '').toLowerCase() as CliKey
  const table = (MODEL_MAPPING as any)[key] as Record<string, string> | undefined
  return table ? Object.keys(table) : []
}

export { MODEL_MAPPING }
