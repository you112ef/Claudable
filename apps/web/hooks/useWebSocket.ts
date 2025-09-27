/**
 * WebSocket Hook (socket.io)
 * Manages real-time updates via Socket.IO server at `/ws`
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Message } from '@/types/chat';

interface WebSocketOptions {
  projectId: string;
  onMessage?: (message: Message) => void;
  onStatus?: (status: string, data?: any, requestId?: string) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
}

export function useWebSocket({
  projectId,
  onMessage,
  onStatus,
  onConnect,
  onDisconnect,
  onError
}: WebSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectionAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    // Already connected
    if (socketRef.current && socketRef.current.connected) return;

    if (!shouldReconnectRef.current) return; // Intentional disconnect

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      // Convert origin to WS base for logs only
      const url = origin.replace('http', 'ws');

      const socket = io(origin, {
        path: '/ws',
        transports: ['websocket'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 5
      });

      // On connect, join project room
      socket.on('connect', () => {
        setIsConnected(true);
        connectionAttemptsRef.current = 0;
        try { socket.emit('join_project', projectId); } catch {}
        onConnect?.();
      });

      // Map server events to existing app callbacks
      // Project status
      socket.on('project_status', (payload: any) => {
        const data = payload?.data || payload;
        onStatus?.('project_status', data);
      });

      // Message created elsewhere (optional)
      socket.on('new_message', (payload: any) => {
        const msg = payload?.data || payload;
        onMessage?.(msg);
      });

      // Chat processing lifecycle (map to chat_* for UI expectations)
      socket.on('processing_started', (payload: any) => {
        const data = payload?.data || payload;
        onStatus?.('chat_start', data, data?.request_id);
      });

      socket.on('message_chunk', (payload: any) => {
        const data = payload?.data || payload;
        // Stream partial content as message updates
        onMessage?.({
          id: data.message_id,
          role: 'assistant',
          content: data.content ?? data.chunk ?? '',
          message_type: 'chat',
          session_id: data.session_id,
          created_at: new Date().toISOString()
        } as any);
      });

      socket.on('message_complete', (payload: any) => {
        const data = payload?.data || payload;
        // Final content
        onMessage?.({
          id: data.message_id,
          role: 'assistant',
          content: data.content ?? '',
          message_type: 'chat',
          session_id: data.session_id,
          created_at: new Date().toISOString()
        } as any);
        onStatus?.('chat_complete', data, data?.request_id);
      });

      socket.on('processing_complete', (payload: any) => {
        const data = payload?.data || payload;
        onStatus?.('chat_complete', data, data?.request_id);
      });

      socket.on('processing_error', (payload: any) => {
        const data = payload?.data || payload;
        onStatus?.('chat_complete', { ...data, status: 'failed' }, data?.request_id);
      });

      // Action lifecycle (map to act_*)
      socket.on('action_started', (payload: any) => {
        const data = payload?.data || payload;
        onStatus?.('act_start', data, data?.request_id);
      });
      socket.on('action_complete', (payload: any) => {
        const data = payload?.data || payload;
        onStatus?.('act_complete', data, data?.request_id);
      });
      socket.on('action_error', (payload: any) => {
        const data = payload?.data || payload;
        onStatus?.('act_complete', { ...data, status: 'failed' }, data?.request_id);
      });

      // Generic errors
      socket.on('connect_error', (err: any) => {
        onError?.(new Error(`WebSocket connection error to ${url}/ws: ${err?.message || err}`));
      });
      socket.on('error', (err: any) => {
        onError?.(new Error(typeof err === 'string' ? err : err?.message || 'Socket error'));
      });

      socket.on('disconnect', () => {
        setIsConnected(false);
        onDisconnect?.();
        
        // Only reconnect if we should and haven't exceeded attempts
        if (shouldReconnectRef.current) {
          const attempts = connectionAttemptsRef.current + 1;
          connectionAttemptsRef.current = attempts;
          
          if (attempts < 5) {
            const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          }
        }
      });

      socketRef.current = socket;
    } catch (error) {
      console.error('Failed to create Socket.IO connection:', error);
      onError?.(error as Error);
    }
  }, [projectId, onMessage, onStatus, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (socketRef.current) {
      try { socketRef.current.emit('leave_project', projectId); } catch {}
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setIsConnected(false);
  }, [projectId]);

  const sendMessage = useCallback((data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('chat_message', data);
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connectionAttemptsRef.current = 0;
    connect();
    
    return () => {
      disconnect();
    };
  }, [projectId]);

  return {
    isConnected,
    connect,
    disconnect,
    sendMessage
  };
}
