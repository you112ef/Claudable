import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { successResponse, errorResponse } from '@/lib/api-response'
import { handleCors } from '@/lib/cors'
import { checkCLI, runCLIStreaming } from '@/lib/cli-runner'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface RouteParams {
  params: { projectId: string }
}

export async function OPTIONS(request: NextRequest) {
  return handleCors(request) || new NextResponse(null, { status: 200 })
}

// POST /api/chat/[projectId]/act - Execute an action and stream assistant output
export async function POST(request: NextRequest, { params }: RouteParams) {
  const corsResponse = handleCors(request)
  if (corsResponse) return corsResponse

  try {
    let body: any = {}
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid JSON body', 400)
    }

    const { action, command, instruction, parameters = {} } = body
    let finalAction = action
    let finalCommand = command
    if (instruction && !action && !command) {
      finalAction = 'execute'
      finalCommand = instruction
    }
    if (!finalAction || !finalCommand) {
      return errorResponse('Action and command are required (or instruction)', 400)
    }

    // Track request
    const userRequest = await prisma.userRequest.create({
      data: {
        projectId: params.projectId,
        requestType: 'action',
        inputData: JSON.stringify({ action: finalAction, command: finalCommand, parameters }),
        status: 'processing'
      }
    })

    if (global.io) {
      global.io.to(params.projectId).emit('action_started', {
        type: 'action_started',
        data: { request_id: userRequest.id, action: finalAction, command: finalCommand, status: 'processing' }
      })
    }

    // Ensure session
    let session = await prisma.session.findFirst({ where: { projectId: params.projectId }, orderBy: { createdAt: 'desc' } })
    if (!session) {
      session = await prisma.session.create({ data: { projectId: params.projectId, sessionExternalId: `session-${Date.now()}`, model: 'claude-sonnet-4' } })
    }

    // Broadcast user message
    const userMessage = await prisma.message.create({
      data: { requestId: userRequest.id, sessionId: session.id, projectId: params.projectId, role: 'user', content: finalCommand, type: 'text' }
    })
    if (global.io) {
      global.io.to(params.projectId).emit('new_message', { type: 'message', data: {
        id: userMessage.id, session_id: userMessage.sessionId, project_id: userMessage.projectId, role: userMessage.role, content: userMessage.content, message_type: userMessage.type, created_at: userMessage.createdAt
      } })
    }

    // Placeholder assistant message
    const aiMessage = await prisma.message.create({
      data: { requestId: userRequest.id, sessionId: session.id, projectId: params.projectId, role: 'assistant', content: '', type: 'text', status: 'streaming', parentMessageId: userMessage.id }
    })
    if (global.io) {
      global.io.to(params.projectId).emit('new_message', { type: 'message', data: {
        id: aiMessage.id, session_id: aiMessage.sessionId, project_id: aiMessage.projectId, role: aiMessage.role, content: aiMessage.content, message_type: aiMessage.type, created_at: aiMessage.createdAt, parent_message_id: userMessage.id
      } })
    }

    // Stream via local CLI (Claude Code / Cursor Agent)
    const startTime = Date.now()
    let full = ''
    const projectPref = await prisma.project.findUnique({ where: { id: params.projectId }, select: { cliType: true, cliModel: true } })
    const cli: 'claude' | 'cursor' = (projectPref?.cliType as any) === 'cursor' ? 'cursor' : 'claude'

    const { spawn } = require('child_process')
    const path = require('path')
    const fs = require('fs')
    const candidates = [
      path.join(process.cwd(), 'py_runner', 'cli_stream.py'),
      path.join(process.cwd(), 'apps', 'web', 'py_runner', 'cli_stream.py')
    ]
    const runnerPath = candidates.find((p: string) => fs.existsSync(p)) || candidates[0]
    const args = [runnerPath, '--cli', cli, '--instruction', finalCommand!]
    if (projectPref?.cliModel) args.push('--model', projectPref.cliModel)
    setImmediate(async () => {
      try {
        console.log('[CLI][act] Spawning python runner', { runnerPath, cli, model: projectPref?.cliModel, cwd: process.cwd(), PATH: process.env.PATH?.split(':').slice(0,3) })
        const py = spawn('python3', args, { shell: false, env: process.env })
        let buffer = ''
        py.stdout.on('data', async (d: Buffer) => {
          buffer += d.toString()
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop() || ''
          for (const line of lines) {
            const s = line.trim()
            if (!s) continue
            try {
              const obj = JSON.parse(s)
              if (obj.type === 'chunk' && obj.data) {
                const txt = obj.data.text || ''
                full += txt
                if (global.io) global.io.to(params.projectId).emit('message_chunk', { type: 'message_chunk', data: { message_id: aiMessage.id, chunk: txt, content: full } })
              } else if (obj.type === 'complete') {
                full = obj.data?.text || full
              } else if (obj.type === 'error') {
                const errMsg = obj.message || 'CLI error'
                await prisma.message.update({ where: { id: aiMessage.id }, data: { content: errMsg, status: 'error', errorMessage: errMsg } })
                await prisma.userRequest.update({ where: { id: userRequest.id }, data: { status: 'failed', errorMessage: errMsg, completedAt: new Date() } })
                if (global.io) {
                  global.io.to(params.projectId).emit('processing_error', { type: 'processing_error', data: { request_id: userRequest.id, message_id: aiMessage.id, error: errMsg } })
                  global.io.to(params.projectId).emit('action_error', { type: 'action_error', data: { request_id: userRequest.id, error: errMsg } })
                  global.io.to(params.projectId).emit('message_complete', { type: 'message_complete', data: { message_id: aiMessage.id, request_id: userRequest.id, content: errMsg, status: 'error' } })
                }
              }
            } catch {
              full += s + '\n'
              if (global.io) global.io.to(params.projectId).emit('message_chunk', { type: 'message_chunk', data: { message_id: aiMessage.id, chunk: s + '\n', content: full } })
            }
          }
        })
        py.stderr.on('data', (d: Buffer) => {
          const s = d.toString()
          if (s && s.trim()) console.log('[CLI][act][stderr]', s.slice(0, 400))
        })
        py.on('error', (err: Error) => {
          console.error('[CLI][act] python spawn error:', err)
        })
        py.on('close', async (code: number) => {
          console.log('[CLI][act] runner closed with code', code)
          const dur = Date.now() - startTime
          await prisma.message.update({ where: { id: aiMessage.id }, data: { content: full, status: 'completed' } })
          await prisma.userRequest.update({ where: { id: userRequest.id }, data: { status: 'completed', outputData: full, completedAt: new Date(), durationMs: dur } })
          if (global.io) {
            global.io.to(params.projectId).emit('message_complete', { type: 'message_complete', data: { message_id: aiMessage.id, request_id: userRequest.id, content: full, status: 'completed' } })
            global.io.to(params.projectId).emit('action_complete', { type: 'action_complete', data: { request_id: userRequest.id, action: finalAction, command: finalCommand, status: 'completed' } })
          }
        })
      } catch (e) { console.error('ACT streaming error:', e) }
    })

    return successResponse({ request_id: userRequest.id, action: finalAction, command: finalCommand, status: 'processing', message: 'Action started' })
  } catch (error: any) {
    console.error('Error executing action:', error)
    return errorResponse('Failed to execute action', 500)
  }
}
