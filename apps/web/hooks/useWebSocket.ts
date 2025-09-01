/**
 * WebSocket Hook
 * Manages WebSocket connection for real-time updates
 */
import { useEffect, useRef, useCallback, useState } from 'react';
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
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const connectionAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const [isConnected, setIsConnected] = useState(false);

  // Keep latest callbacks in refs to avoid reconnecting or using stale closures
  const onMessageRef = useRef(onMessage);
  const onStatusRef = useRef(onStatus);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);
  useEffect(() => { onConnectRef.current = onConnect; }, [onConnect]);
  useEffect(() => { onDisconnectRef.current = onDisconnect; }, [onDisconnect]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    // Don't reconnect if we're intentionally disconnecting
    if (!shouldReconnectRef.current) {
      return;
    }

    try {
      const isHttps = typeof window !== 'undefined' ? window.location.protocol === 'https:' : false;
      const defaultProto = isHttps ? 'wss' : 'ws';
      const wsBase = process.env.NEXT_PUBLIC_WS_BASE || (typeof window !== 'undefined' ? `${defaultProto}://${window.location.host}` : 'ws://localhost:3000');
      const fullUrl = `${wsBase}/api/chat/${projectId}`;

      // Ensure the Next.js server has attached the WebSocketServer by
      // triggering the HTTP handler and waiting for it to complete.
      try {
        await fetch(`/api/chat/${projectId}`);
        // Reduced wait time for faster initial prompt display
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        return;
      }

      const ws = new WebSocket(fullUrl);

      ws.onopen = () => {
        setIsConnected(true);
        connectionAttemptsRef.current = 0;
        onConnectRef.current?.();
        // Start heartbeat ping every 25s
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          try { ws.send('ping'); } catch {}
        }, 25000);
      };

      ws.onmessage = (event) => {
        try {
          if (event.data === 'pong') {
            return;
          }
          
          const data = JSON.parse(event.data);
          
          // Debug: Log all incoming WebSocket messages
          if (data.type === 'message') {
            console.log('🔌 [WebSocket] Received message:', data.data?.message_type, data.data?.content?.length + ' chars');
          }
          
          const _onMsg = onMessageRef.current;
          const _onSt = onStatusRef.current;
          if (data.type === 'message' && _onMsg && data.data) {
            _onMsg(data.data);
          } else if (data.type === 'preview_error' && _onSt) {
            _onSt('preview_error', data);
          } else if (data.type === 'preview_success' && _onSt) {
            _onSt('preview_success', data);
          } else if ((data.type === 'project_status' || data.type === 'status') && _onSt) {
            _onSt('project_status', data.data || { status: data.status, message: data.message });
          } else if (data.type === 'act_start' && _onSt) {
            _onSt('act_start', data.data, data.data?.request_id);
          } else if (data.type === 'chat_start' && _onSt) {
            _onSt('chat_start', data.data, data.data?.request_id);
          } else if (data.type === 'act_complete' && _onSt) {
            _onSt('act_complete', data.data, data.data?.request_id);
          } else if (data.type === 'chat_complete' && _onSt) {
            _onSt('chat_complete', data.data, data.data?.request_id);
          } else {
          }
        } catch (error) {
          // Silent failure - invalid message format
        }
      };

      ws.onerror = (error) => {
        onErrorRef.current?.(new Error(`WebSocket connection error`));
      };

      ws.onclose = () => {
        setIsConnected(false);
        onDisconnectRef.current?.();
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Only reconnect if we should and haven't exceeded attempts
        if (shouldReconnectRef.current) {
          const attempts = connectionAttemptsRef.current + 1;
          connectionAttemptsRef.current = attempts;
          
          if (attempts < 5) {
            const delay = Math.min(1000 * Math.pow(2, attempts), 10000);
            reconnectTimeoutRef.current = setTimeout(() => {
              connect().catch(() => {});
            }, delay);
          }
        }
      };

      wsRef.current = ws;
    } catch (error) {
      onError?.(error as Error);
    }
  }, [projectId]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    setIsConnected(false);
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connectionAttemptsRef.current = 0;
    connect().catch(() => {});
    
    return () => {
      disconnect();
    };
  }, [projectId, connect]);

  return {
    isConnected,
    connect,
    disconnect,
    sendMessage
  };
}
