import { Server as HTTPServer } from 'http'
import { Server as SocketIOServer, Socket } from 'socket.io'
import { prisma } from './db'

let io: SocketIOServer | null = null

export function initWebSocketServer(server: HTTPServer) {
  if (io) return io

  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    path: '/ws'
  })

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id)

    socket.on('join_project', async (projectId: string) => {
      socket.join(projectId)
      console.log(`Socket ${socket.id} joined project ${projectId}`)
      
      // Send initial status
      socket.emit('project_status', {
        type: 'project_status',
        data: {
          status: 'connected',
          message: 'Connected to project'
        }
      })
    })

    socket.on('leave_project', (projectId: string) => {
      socket.leave(projectId)
      console.log(`Socket ${socket.id} left project ${projectId}`)
    })

    socket.on('chat_message', async (data: any) => {
      const { projectId, message, sessionId } = data
      
      try {
        // Save message to database
        const newMessage = await prisma.message.create({
          data: {
            projectId,
            sessionId,
            role: message.role || 'user',
            content: message.content,
            messageType: message.message_type,
            metadata: message.metadata ? JSON.stringify(message.metadata) : null
          }
        })

        // Broadcast to all clients in the project room
        io?.to(projectId).emit('new_message', {
          type: 'message',
          data: {
            id: newMessage.id,
            session_id: newMessage.sessionId,
            project_id: newMessage.projectId,
            role: newMessage.role,
            content: newMessage.content,
            message_type: newMessage.messageType,
            metadata: message.metadata,
            created_at: newMessage.createdAt
          }
        })

        // If user message, create user request
        if (message.role === 'user') {
          await prisma.userRequest.create({
            data: {
              projectId,
              messageId: newMessage.id,
              requestText: message.content,
              status: 'pending'
            }
          })

          // TODO: Process with AI here
          // For now, send a mock assistant response
          setTimeout(async () => {
            const assistantMessage = await prisma.message.create({
              data: {
                projectId,
                sessionId,
                role: 'assistant',
                content: 'I received your message. The full AI integration will be implemented soon.',
                messageType: 'text'
              }
            })

            io?.to(projectId).emit('new_message', {
              type: 'message',
              data: {
                id: assistantMessage.id,
                session_id: assistantMessage.sessionId,
                project_id: assistantMessage.projectId,
                role: assistantMessage.role,
                content: assistantMessage.content,
                message_type: assistantMessage.messageType,
                created_at: assistantMessage.createdAt
              }
            })
          }, 1000)
        }
      } catch (error) {
        console.error('Error handling chat message:', error)
        socket.emit('error', {
          type: 'error',
          message: 'Failed to process message'
        })
      }
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  return io
}

export function getWebSocketServer(): SocketIOServer | null {
  return io
}

export function broadcastToProject(projectId: string, event: string, data: any) {
  if (io) {
    io.to(projectId).emit(event, data)
  }
}