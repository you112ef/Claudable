const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')
const { Server } = require('socket.io')

const dev = process.env.NODE_ENV !== 'production'
const app = next({ dev })
const handle = app.getRequestHandler()

const PORT = process.env.PORT || 3000

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true)
    handle(req, res, parsedUrl)
  })

  // Initialize Socket.IO
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    path: '/ws'
  })

  // Store io instance globally
  global.io = io

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id)

    socket.on('join_project', (projectId) => {
      socket.join(projectId)
      console.log(`Socket ${socket.id} joined project ${projectId}`)
      
      socket.emit('project_status', {
        type: 'project_status',
        data: {
          status: 'connected',
          message: 'Connected to project'
        }
      })
    })

    socket.on('leave_project', (projectId) => {
      socket.leave(projectId)
      console.log(`Socket ${socket.id} left project ${projectId}`)
    })

    socket.on('chat_message', async (data) => {
      const { projectId, message } = data
      
      // Broadcast to all clients in the project room
      io.to(projectId).emit('new_message', {
        type: 'message',
        data: message
      })
    })

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id)
    })
  })

  server.listen(PORT, (err) => {
    if (err) throw err
    console.log(`> Ready on http://localhost:${PORT}`)
    console.log(`> WebSocket server ready on ws://localhost:${PORT}/ws`)
  })
})