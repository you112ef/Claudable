const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const nextFactory = require('next');

async function startWebServer({ webDir, webPort = 8080 }) {
  const dev = false;
  const next = nextFactory({ dev, dir: webDir });
  const handle = next.getRequestHandler();
  await next.prepare();

  const app = express();
  
  // Initialize Socket.IO
  const { Server } = require('socket.io');

  // Everything handled by Next.js (including API routes)
  app.all('*', (req, res) => handle(req, res));

  // Create HTTP server
  const http = require('http');
  const server = http.createServer(app);
  
  // Initialize WebSocket server
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    },
    path: '/ws'
  });

  // Store io instance globally
  global.io = io;

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('join_project', (projectId) => {
      socket.join(projectId);
      console.log(`Socket ${socket.id} joined project ${projectId}`);
      
      socket.emit('project_status', {
        type: 'project_status',
        data: {
          status: 'connected',
          message: 'Connected to project'
        }
      });
    });

    socket.on('leave_project', (projectId) => {
      socket.leave(projectId);
      console.log(`Socket ${socket.id} left project ${projectId}`);
    });

    socket.on('chat_message', async (data) => {
      const { projectId, message } = data;
      
      // Broadcast to all clients in the project room
      io.to(projectId).emit('new_message', {
        type: 'message',
        data: message
      });
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return new Promise((resolve, reject) => {
    server.listen(webPort, '127.0.0.1', () => {
      console.log(`> Ready on http://localhost:${webPort}`);
      console.log(`> WebSocket server ready on ws://localhost:${webPort}/ws`);
      resolve({ server, url: `http://localhost:${webPort}` });
    });
    server.on('error', reject);
  });
}

module.exports = { startWebServer };
