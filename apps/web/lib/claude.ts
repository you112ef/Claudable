import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/db'

const DEFAULT_SYSTEM_PROMPT = `You are Claude Code, Anthropic's official CLI for Claude.
You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: Assist with defensive security tasks only. Refuse to create, modify, or improve code that may be used maliciously. Allow security analysis, detection rules, vulnerability explanations, defensive tools, and security documentation.

# Tone and style
You should be concise, direct, and to the point.
You MUST answer concisely with fewer than 4 lines (not including tool use or code generation), unless user asks for detail.
IMPORTANT: You should minimize output tokens as much as possible while maintaining helpfulness, quality, and accuracy.

# Following conventions
When making changes to files, first understand the file's code conventions. Mimic code style, use existing libraries and utilities, and follow existing patterns.

# Code style
- IMPORTANT: DO NOT ADD ***ANY*** COMMENTS unless asked`

interface ClaudeResponse {
  content: string
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

export class ClaudeService {
  private client: Anthropic | null = null
  private apiKey: string | null = null

  constructor() {
    this.apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY || null
    
    if (this.apiKey) {
      this.client = new Anthropic({
        apiKey: this.apiKey
      })
    }
  }

  private async ensureClient(): Promise<void> {
    if (!this.client) {
      // Try to get API key from database if not in environment
      const dbApiKey = await ClaudeService.getApiKeyFromDatabase()
      if (dbApiKey) {
        this.apiKey = dbApiKey
        this.client = new Anthropic({
          apiKey: this.apiKey
        })
      } else {
        throw new Error('Claude API key not configured. Please set CLAUDE_API_KEY or ANTHROPIC_API_KEY environment variable, or configure it in the settings.')
      }
    }
  }

  async getProjectSystemPrompt(projectId: string): Promise<string> {
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { systemPrompt: true }
      })
      
      return project?.systemPrompt || DEFAULT_SYSTEM_PROMPT
    } catch (error) {
      console.error('Error fetching project system prompt:', error)
      return DEFAULT_SYSTEM_PROMPT
    }
  }

  async getConversationHistory(sessionId: string, limit: number = 20): Promise<Anthropic.MessageParam[]> {
    try {
      const messages = await prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
        take: limit,
        select: {
          role: true,
          content: true
        }
      })

      return messages.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))
    } catch (error) {
      console.error('Error fetching conversation history:', error)
      return []
    }
  }

  async generateResponse(
    projectId: string,
    sessionId: string,
    userMessage: string
  ): Promise<ClaudeResponse> {
    try {
      await this.ensureClient()
      
      const systemPrompt = await this.getProjectSystemPrompt(projectId)
      const conversationHistory = await this.getConversationHistory(sessionId)

      // Add the current user message to the conversation
      const messages: Anthropic.MessageParam[] = [
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ]

      const response = await this.client!.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: systemPrompt,
        messages
      })

      const content = response.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')

      return {
        content,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens
        }
      }
    } catch (error) {
      console.error('Error generating Claude response:', error)
      throw new Error(`Claude API error: ${error.message}`)
    }
  }

  async generateStreamingResponse(
    projectId: string,
    sessionId: string,
    userMessage: string,
    onChunk: (chunk: string) => void,
    onComplete: (fullResponse: string, usage?: any) => void,
    onError: (error: Error) => void
  ): Promise<void> {
    try {
      await this.ensureClient()
      
      const systemPrompt = await this.getProjectSystemPrompt(projectId)
      const conversationHistory = await this.getConversationHistory(sessionId)

      const messages: Anthropic.MessageParam[] = [
        ...conversationHistory,
        { role: 'user', content: userMessage }
      ]

      const stream = await this.client!.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        system: systemPrompt,
        messages,
        stream: true
      })

      let fullResponse = ''
      let usage: any = null

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text') {
          const text = chunk.delta.text
          fullResponse += text
          onChunk(text)
        } else if (chunk.type === 'message_delta' && chunk.usage) {
          usage = chunk.usage
        }
      }

      onComplete(fullResponse, usage)
    } catch (error: any) {
      console.error('Error generating streaming Claude response:', error)
      const msg = error?.message || ''
      // Dev fallback: if API key not configured, stream a helpful message so UI completes gracefully
      if (/API key not configured/i.test(msg) || /Missing required.*api key/i.test(msg)) {
        const fallback = 'Claude API key is not configured. Open Settings → Tokens and add your ANTHROPIC_API_KEY to enable real streaming.'
        // stream small chunks
        const chunks = fallback.match(/.{1,40}/g) || [fallback]
        for (const c of chunks) {
          onChunk(c)
        }
        onComplete(fallback, { input_tokens: 0, output_tokens: fallback.length / 4 })
        return
      }
      onError(new Error(`Claude API streaming error: ${msg}`))
    }
  }

  static async getApiKeyFromDatabase(): Promise<string | null> {
    try {
      const token = await prisma.token.findUnique({
        where: { serviceName: 'claude' }
      })
      return token?.accessToken || null
    } catch (error) {
      console.error('Error fetching Claude API key from database:', error)
      return null
    }
  }
}

export const claudeService = new ClaudeService()
