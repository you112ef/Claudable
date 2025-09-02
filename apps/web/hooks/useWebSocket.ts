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
  const lastPrimeAtRef = useRef<number>(0);
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
      // Use same-origin WebSocket endpoint for App Router server
      const wsBase = (typeof window !== 'undefined' ? `${defaultProto}://${window.location.host}` : 'ws://localhost:3000');
      const fullUrl = `${wsBase}/api/ws/chat/${projectId}`;

      // Best-effort: try to prime WS server, but never abort on failure
      try {
        // Throttle priming to avoid spamming on rapid retries
        const now = Date.now();
        if (now - lastPrimeAtRef.current > 1500) {
          lastPrimeAtRef.current = now;
          await fetch(`/api/ws/chat/${projectId}`);
        }
      } catch (error) {
        // Proceed regardless of priming failure
      }

      const ws = new WebSocket(fullUrl);

      // Guard: connection timeout to avoid hanging sockets on failed handshake
      let connectTimeout: NodeJS.Timeout | null = setTimeout(() => {
        try { ws.close(); } catch {}
      }, 3000);

      ws.onopen = () => {
        setIsConnected(true);
        connectionAttemptsRef.current = 0;
        onConnectRef.current?.();
        // Start heartbeat ping every 25s
        if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = setInterval(() => {
          try { ws.send('ping'); } catch {}
        }, 25000);
        if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
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
        if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
        
        // Only reconnect if we should and haven't exceeded attempts
        if (shouldReconnectRef.current) {
          const attempts = connectionAttemptsRef.current + 1;
          connectionAttemptsRef.current = attempts;

          // Exponential backoff with jitter, capped at 60s, fast ramp-up initially
          const base = attempts <= 1 ? 500 : Math.min(60000, 500 * Math.pow(2, attempts));
          const jitter = Math.floor(Math.random() * 250);
          const delay = Math.min(60000, base + jitter);

          // Best-effort prime just before reconnect (throttled above in connect)
          try { fetch(`/api/ws/chat/${projectId}`).catch(() => {}); } catch {}

          reconnectTimeoutRef.current = setTimeout(() => {
            connect().catch(() => {});
          }, delay);
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
