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
  const [isConnected, setIsConnected] = useState(false);
  
  const cleanup = useCallback(() => {
    // Clear timers
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.onclose = null; // Prevent reconnect on manual cleanup
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    // Don't connect if already connected or connecting
    if (wsRef.current?.readyState === WebSocket.OPEN || 
        wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/ws/chat/${projectId}`;
    
    // Initialize the WebSocket endpoint first
    fetch(`/api/ws/chat/${projectId}`).catch(() => {});

    const ws = new WebSocket(url);
    
    ws.onopen = () => {
      setIsConnected(true);
      onConnect?.();
      
      // Start ping interval
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000); // Ping every 30 seconds
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;
      
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch {
        // Ignore invalid messages
      }
    };

    ws.onclose = () => {
      cleanup();
      onDisconnect?.();
      
      // Reconnect after 2 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (event) => {
      onError?.(new Error('WebSocket connection error'));
    };

    wsRef.current = ws;
  }, [projectId, cleanup, onConnect, onDisconnect, onError]);

  const handleMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'message':
        if (data.data && onMessage) {
          onMessage(data.data);
        }
        break;
        
      case 'message_delta':
      case 'message_commit':
        if (onStatus) {
          onStatus(data.type, data.data);
        }
        break;
        
      case 'preview_success':
      case 'preview_error':
      case 'project_status':
      case 'act_start':
      case 'chat_start':
      case 'act_complete':
      case 'chat_complete':
        if (onStatus) {
          onStatus(data.type, data.data, data.data?.request_id);
        }
        break;
    }
  }, [onMessage, onStatus]);

  const sendMessage = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const disconnect = useCallback(() => {
    cleanup();
  }, [cleanup]);

  useEffect(() => {
    connect();
    
    return () => {
      cleanup();
    };
  }, [projectId, connect, cleanup]);

  return {
    isConnected,
    connect,
    disconnect,
    sendMessage
  };
}