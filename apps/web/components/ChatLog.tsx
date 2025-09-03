"use client";
import React, { useEffect, useState, useRef, ReactElement, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { useWebSocket } from '../hooks/useWebSocket';
import { Brain } from 'lucide-react';
import ToolResultItem from './ToolResultItem';
import ThinkingSection from './chat/ThinkingSection';

// Tool Message Component - Enhanced with new design
const ToolMessage = ({ content, metadata }: { content: unknown; metadata?: { tool_name?: string; summary?: string; description?: string; file_path?: string; [key: string]: unknown } }) => {
  // Process tool content to extract action and file path
  const processToolContent = (rawContent: unknown) => {
    let processedContent = '' as string;
    let action: 'Edited' | 'Created' | 'Read' | 'Deleted' | 'Generated' | 'Searched' | 'Executed' = 'Executed';
    let filePath = '';
    let cleanContent: string | undefined = undefined;
    
    // Normalize tool names similar to FastAPI BaseCLI mapping
    const normalize = (name: string) => {
      const k = (name || '').toLowerCase();
      const map: Record<string, string> = {
        // File operations
        'read': 'Read', 'read_file': 'Read', 'readfile': 'Read', 'readmanyfiles': 'Read',
        'write': 'Write', 'write_file': 'Write', 'writefile': 'Write',
        'edit': 'Edit', 'edit_file': 'Edit', 'replace': 'Edit', 'multiedit': 'MultiEdit',
        'delete': 'Delete',
        'ls': 'LS', 'list_directory': 'LS', 'list_dir': 'LS', 'readfolder': 'LS',
        'grep': 'Grep', 'search_file_content': 'Grep', 'codebase_search': 'Grep', 'search': 'Grep',
        'glob': 'Glob', 'find_files': 'Glob',
        // Terminal
        'exec_command': 'Bash', 'bash': 'Bash', 'exec': 'Bash', 'run_terminal_command': 'Bash', 'shell': 'Bash',
        // Web
        'web_search': 'WebSearch', 'websearch': 'WebSearch', 'google_web_search': 'WebSearch',
        'web_fetch': 'WebFetch', 'webfetch': 'WebFetch', 'fetch': 'WebFetch',
        // Planning/Memory
        'todowrite': 'TodoWrite', 'todo_write': 'TodoWrite', 'save_memory': 'SaveMemory', 'savememory': 'SaveMemory',
        // MCP
        'mcp_tool_call': 'MCPTool'
      };
      return map[k] || name;
    };
    
    // Normalize content to string
    if (typeof rawContent === 'string') {
      processedContent = rawContent;
    } else if (rawContent && typeof rawContent === 'object') {
      const obj = rawContent as any;
      processedContent = obj.summary || obj.description || JSON.stringify(rawContent);
    } else {
      processedContent = String(rawContent ?? '');
    }
    
    // Clean up common artifacts
    processedContent = processedContent
      .replace(/\[object Object\]/g, '')
      .replace(/[🔧⚡🔍📖✏️📁🌐🔎🤖📝🎯✅📓⚙️🧠]/g, '')
      .trim();
    
    // Check for CLI adapter "Using tool:" pattern first
    const cliToolMatch = processedContent.match(/^Using tool:\s*(\w+)\s*(.*)$/);
    if (cliToolMatch) {
      const toolName = cliToolMatch[1];
      const toolArg = cliToolMatch[2].trim();
      
      switch (toolName) {
        case 'exec_command':
          action = 'Executed';
          filePath = toolArg;
          cleanContent = `${toolArg}`;
          break;
        case 'read':
        case 'read_file':
          action = 'Read';
          filePath = toolArg;
          cleanContent = undefined;
          break;
        case 'write':
        case 'write_file':
          action = 'Created';
          filePath = toolArg;
          cleanContent = undefined;
          break;
        case 'edit':
          action = 'Edited';
          filePath = toolArg;
          cleanContent = undefined;
          break;
        default:
          action = 'Executed';
          filePath = toolArg;
          cleanContent = `${toolName} ${toolArg}`;
      }
    } 
    // Check for **Tool** pattern with path/command
    else {
      const toolMatch = processedContent.match(/\*\*(Read|LS|Glob|Grep|Edit|Write|Bash|MultiEdit|TodoWrite|MCP)\*\*\s*`?([^`\n]+)`?/);
    if (toolMatch) {
      const toolName = toolMatch[1];
      const toolArg = toolMatch[2].trim();
      
      switch (toolName) {
        case 'Read': 
          action = 'Read';
          filePath = toolArg;
          // Don't show content for Read
          cleanContent = undefined;
          break;
        case 'Edit':
        case 'MultiEdit':
          action = 'Edited';
          filePath = toolArg;
          // Don't show content for Edit
          cleanContent = undefined;
          break;
        case 'Write': 
          action = 'Created';
          filePath = toolArg;
          cleanContent = undefined;
          break;
        case 'LS': 
          action = 'Searched';
          filePath = toolArg;
          cleanContent = undefined;
          break;
        case 'Glob':
        case 'Grep':
          action = 'Searched';
          filePath = toolArg;
          cleanContent = undefined;
          break;
        case 'Bash': 
          action = 'Executed';
          // For Bash, the argument is the command itself
          filePath = toolArg.split('\n')[0]; // Just the first line
          cleanContent = undefined;
          break;
        case 'MCP':
          action = 'Executed';
          filePath = toolArg;
          cleanContent = undefined;
          break;
        case 'TodoWrite':
          action = 'Generated';
          filePath = 'Todo List';
          cleanContent = undefined;
          break;
      }
      
      return { action, filePath, cleanContent, toolName };
    }
    } // Close the else block
    
    // If no pattern matches but metadata has tool info, use that (canonicalize + pull args)
    if (metadata?.tool_name) {
      const toolName = normalize(String(metadata.tool_name));
      action = toolName === 'Bash' ? 'Executed' :
               toolName === 'Read' ? 'Read' :
               toolName === 'Write' ? 'Created' :
               (toolName === 'Edit' || toolName === 'MultiEdit') ? 'Edited' :
               toolName === 'Delete' ? 'Deleted' :
               (toolName === 'LS' || toolName === 'Glob' || toolName === 'Grep' || toolName === 'WebSearch' || toolName === 'WebFetch') ? 'Searched' :
               'Executed';

      const input: any = (metadata as any).tool_input || {};
      const getPath = () => input.file_path || input.path || input.file || input.directory || '';
      const getCmd = () => Array.isArray(input.command) ? input.command.join(' ') : (input.command || '');
      const getPattern = () => input.pattern || input.globPattern || input.name || '';
      const getQuery = () => input.query || input.q || '';
      const getUrl = () => input.url || '';

      if (toolName === 'Bash') { filePath = getCmd(); }
      else if (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit' || toolName === 'Delete' || toolName === 'LS') { filePath = getPath(); }
      else if (toolName === 'Glob' || toolName === 'Grep') { filePath = getPattern(); }
      else if (toolName === 'WebSearch') { filePath = getQuery(); }
      else if (toolName === 'WebFetch') { filePath = getUrl(); }

      // Fallback to parsing summary string if still empty
      if (!filePath) {
        const m = processedContent.match(/\*\*[^*]+\*\*\s*`?([^`\n]+)`?/);
        if (m && m[1]) filePath = m[1].trim();
      }
      if (!filePath) filePath = `${toolName} operation`;

      cleanContent = undefined;
      return { action, filePath, cleanContent, toolName };
    }
    
    // If no pattern matches, don't treat as tool message
    // Return with no file path to indicate this isn't a tool message
    return { action: 'Executed', filePath: '', cleanContent: processedContent, toolName: 'Unknown' };
  };
  
  const { action, filePath, cleanContent } = processToolContent(content);
  // Do not reassign a const; derive a display value instead
  const filePathDisplay = filePath || 'operation';
  
  // Use new ToolResultItem for clean display
  return <ToolResultItem action={action as "Edited" | "Created" | "Read" | "Deleted" | "Generated" | "Searched" | "Executed"} filePath={filePathDisplay} content={cleanContent} />;
};

// Removed unused WS_BASE; useWebSocket hook handles same-origin WS.

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  message_type?: 'chat' | 'tool_result' | 'tool_use' | 'system' | 'error' | 'info';
  content: string;
  metadata_json?: any;
  parent_message_id?: string;
  session_id?: string;
  conversation_id?: string;
  created_at: string;
}

interface LogEntry {
  id: string;
  type: string;
  data: any;
  timestamp: string;
}

interface ActiveSession {
  status: string;
  session_id?: string;
  instruction?: string;
  started_at?: string;
  duration_seconds?: number;
}

interface ChatLogProps {
  projectId: string;
  onSessionStatusChange?: (isRunning: boolean) => void;
  onProjectStatusUpdate?: (status: string, message?: string) => void;
  startRequest?: (requestId: string) => void;
  completeRequest?: (requestId: string, isSuccessful: boolean, errorMessage?: string) => void;
  onWebSocketConnect?: () => void;
  onWebSocketDisconnect?: () => void;
}

export default function ChatLog({ projectId, onSessionStatusChange, onProjectStatusUpdate, startRequest, completeRequest, onWebSocketConnect, onWebSocketDisconnect }: ChatLogProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const [isWaitingForResponse, setIsWaitingForResponse] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeCheckRef = useRef<NodeJS.Timeout | null>(null);
  // Track whether current WS connection has actually delivered at least one message
  const wsHasDeliveredRef = useRef<boolean>(false);
  const fallbackStartTimerRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadDoneRef = useRef<boolean>(false);
  const historyLoadedOnceRef = useRef<boolean>(false);
  // Track in-flight assistant stream bubbles by stream_id
  const streamMapRef = useRef<Map<string, { tempId: string; seq: number }>>(new Map());

  // Use the centralized WebSocket hook
  const { isConnected } = useWebSocket({
    projectId,
    onMessage: (message) => {
      // Mark that WS stream is actively delivering
      wsHasDeliveredRef.current = true;
      // Handle chat messages from WebSocket
      // Normalize assistant streaming chunks to avoid per-char newlines
      let normalizedContent = message.content || ''
      if ((message.role === 'assistant') && ((message.message_type as any) === 'chat' || !message.message_type)) {
        // Cursor agent often sends trailing newlines per chunk; strip a single trailing newline
        normalizedContent = normalizedContent.replace(/\r?\n$/, '')
      }

      const chatMessage: ChatMessage = {
        id: message.id || `${Date.now()}-${Math.random()}`,
        role: message.role as ChatMessage['role'],
        message_type: message.message_type as ChatMessage['message_type'],
        content: normalizedContent,
        metadata_json: message.metadata_json,
        parent_message_id: message.parent_message_id,
        session_id: message.session_id,
        conversation_id: message.conversation_id,
        created_at: message.created_at || new Date().toISOString()
      };

      // Mirror tool use events into the log panel for visibility
      try {
        if (chatMessage.message_type === 'tool_use') {
          const logEntry: LogEntry = {
            id: `tool_${chatMessage.id || `${Date.now()}-${Math.random()}`}`,
            type: 'tool_start',
            data: {
              summary: chatMessage.content,
              tool_name: chatMessage.metadata_json?.tool_name,
              tool_input: chatMessage.metadata_json?.tool_input,
              message_id: chatMessage.id,
            },
            timestamp: chatMessage.created_at || new Date().toISOString(),
          };
          setLogs((prev) => [...prev, logEntry]);
        }
      } catch {}

      // Clear waiting state when we receive an assistant message
      if (chatMessage.role === 'assistant') {
        setIsWaitingForResponse(false);
      }
      
      // Receiving WS messages means fallback polling is unnecessary
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (activeCheckRef.current) {
        clearInterval(activeCheckRef.current);
        activeCheckRef.current = null;
      }
      setMessages(prev => {
        const isAssistantChat = (m: ChatMessage | undefined) => !!m && m.role === 'assistant' && (!m.message_type || m.message_type === 'chat');

        // 1) 병합 우선: assistant 스트리밍 청크는 마지막 메시지와 먼저 병합 시도
        if (isAssistantChat(chatMessage)) {
          const last = prev[prev.length - 1];
          if (isAssistantChat(last)) {
            const merged: ChatMessage = {
              ...last!,
              content: (last!.content || '') + (chatMessage.content || ''),
              created_at: chatMessage.created_at,
            } as ChatMessage;
            return [...prev.slice(0, -1), merged];
          }
        }

        // 2) 그 외의 경우엔 기존처럼 중복 ID 차단
        if (prev.some(msg => msg.id === chatMessage.id)) return prev;

        return [...prev, chatMessage];
      });
    },
    onStatus: async (status, data) => {
      // Handle streaming deltas/commits from unified protocol
      if (status === 'message_delta' && data) {
        try {
          const streamId = data.stream_id as string
          const delta = data.content_delta as string
          if (!streamId || typeof delta !== 'string') return
          let entry = streamMapRef.current.get(streamId)
          if (!entry) {
            const tempId = `stream_${streamId}_${Date.now()}`
            entry = { tempId, seq: 0 }
            streamMapRef.current.set(streamId, entry)
            const chatMessage: ChatMessage = {
              id: tempId,
              role: 'assistant',
              message_type: 'chat',
              content: delta,
              created_at: new Date().toISOString(),
              metadata_json: null,
              parent_message_id: null,
              session_id: undefined,
              conversation_id: undefined,
            }
            setMessages(prev => [...prev, chatMessage])
          } else {
            setMessages(prev => {
              const idx = prev.findIndex(m => m.id === entry!.tempId)
              if (idx >= 0) {
                const updated = { ...prev[idx], content: (prev[idx].content || '') + delta }
                return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)]
              }
              return prev
            })
          }
          // receiving data: stop polling
          if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null }
          if (activeCheckRef.current) { clearInterval(activeCheckRef.current); activeCheckRef.current = null }
          wsHasDeliveredRef.current = true
        } catch {}
        return
      }
      if (status === 'message_commit' && data) {
        try {
          const streamId = data.stream_id as string
          const messageId = data.message_id as string
          const createdAt = data.created_at as string
          const contentFull = data.content_full as string
          const entry = streamMapRef.current.get(streamId)
          if (entry) {
            const tempId = entry.tempId
            setMessages(prev => {
              const idx = prev.findIndex(m => m.id === tempId)
              if (idx >= 0) {
                const updated: ChatMessage = { ...prev[idx], id: messageId, created_at: createdAt, content: contentFull }
                return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)]
              }
              // If not found, append as new committed message
              const committed: ChatMessage = { id: messageId, role: 'assistant', message_type: 'chat', content: contentFull, created_at: createdAt, metadata_json: null, parent_message_id: null, session_id: undefined, conversation_id: undefined }
              return [...prev, committed]
            })
            // Close this stream segment; next deltas will create a new bubble
            streamMapRef.current.delete(streamId)
          }
        } catch {}
        return
      }
      
      // Handle project status updates
      if (status === 'project_status' && data) {
        onProjectStatusUpdate?.(data.status, data.message);
      }

      // Forward preview events to parent for URL updates
      if (status === 'preview_success') {
        const url = data?.url || data?.data?.url
        onProjectStatusUpdate?.('preview_success', url);
      }
      if (status === 'preview_error') {
        const msg = data?.message || data?.data?.message
        onProjectStatusUpdate?.('preview_error', msg);
      }
      
      // Handle session completion
      if (status === 'act_complete' || status === 'chat_complete') {
        setActiveSession(null);
        onSessionStatusChange?.(false);
        setIsWaitingForResponse(false); // Clear waiting state
        
        // ★ NEW: Request 완료 처리
        if (data?.request_id && completeRequest) {
          const isSuccessful = data?.status === 'completed' || data?.status === 'ok';
          completeRequest(data.request_id, isSuccessful, data?.error);
        }
        
        if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
        if (fallbackStartTimerRef.current) { clearTimeout(fallbackStartTimerRef.current); fallbackStartTimerRef.current = null; }

        // Final refresh to ensure latest streamed messages are present (silent to avoid flicker)
        try { await loadChatHistory(false, true); } catch {}
      }
      
      // Handle session start
      if (status === 'act_start' || status === 'chat_start') {
        setIsWaitingForResponse(true); // Set waiting state when session starts
        
        // ★ NEW: Request 시작 처리  
        if (data?.request_id && startRequest) {
          startRequest(data.request_id);
        }
        // Fallback polling: 시작을 지연하고, WS가 아직 메시지를 한 번도 전달하지 않았을 때만 동작
        if (!isConnected && wsHasDeliveredRef.current === false) {
          if (fallbackStartTimerRef.current) { clearTimeout(fallbackStartTimerRef.current); }
          fallbackStartTimerRef.current = setTimeout(() => {
            // 타이머 시점에 다시 조건 확인
            if (!isConnected && wsHasDeliveredRef.current === false) {
              if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
              pollIntervalRef.current = setInterval(async () => {
                try { await loadChatHistory(false, true); } catch {}
              }, 1500);
            }
          }, 1200);
        }
      }
    },
    onConnect: () => {
      // Keep polling until we actually receive at least one WS message
      wsHasDeliveredRef.current = false;
      onWebSocketConnect?.();
    },
    onDisconnect: () => {
      onWebSocketDisconnect?.();
    },
    onError: (error) => {
      // Silent error handling
    }
  });

  // Function to detect tool usage messages based on patterns
  const isToolUsageMessage = (content: string, metadata?: any) => {
    if (!content) return false;
    
    // Check for [object Object] which indicates serialization issues with tool messages
    if (content.includes('[object Object]')) return true;
    
    // Check if metadata indicates this is a tool message
    if (metadata?.tool_name) return true;
    
    // Check for CLI adapter tool patterns
    if (metadata?.event_type === 'tool_call') return true;
    
    // Check for common tool usage patterns from CLI adapters
    const toolUsagePatterns = [
      /^Using tool:/,                    // "Using tool: exec_command ls -la"
      /^Applying code changes/,          // "Applying code changes"  
      /^Reading.*file/,                  // Various read patterns
      /^Writing.*file/,                  // Various write patterns
    ];
    
    // Also match actual tool command patterns with ** markers
    const toolPatterns = [
      /\*\*(Read|LS|Glob|Grep|Edit|Write|Bash|Task|WebFetch|WebSearch|MultiEdit|TodoWrite|MCP)\*\*/,
    ];
    
    return toolUsagePatterns.some(pattern => pattern.test(content)) || 
           toolPatterns.some(pattern => pattern.test(content));
  };

  // react-scroll-to-bottom handles following behavior; no manual scroll effect needed

  // Check for active session on component mount
  const checkActiveSession = async () => {
    try {
      const response = await fetch(`/api/chat/${projectId}/active-session`);
      if (response.ok) {
        const sessionData: ActiveSession = await response.json();
        if (sessionData && sessionData.status === 'active' && sessionData.session_id) {
          setActiveSession(sessionData);
          onSessionStatusChange?.(true);
          startSessionPolling(sessionData.session_id);
          return;
        }
      }
    } catch (error) {
      console.error('Failed to check active session:', error);
    }
    setActiveSession(null);
    onSessionStatusChange?.(false);
  };

  // Poll session status periodically
  const startSessionPolling = (sessionId: string) => {
    // Do not start session polling while WebSocket is actively delivering messages
    if (isConnected && wsHasDeliveredRef.current) return;
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/chat/${projectId}/sessions/${sessionId}/status`);
        if (response.ok) {
          const sessionStatus = await response.json();
          
          // Skip redundant chat history refresh during active WebSocket streaming
          if (!isConnected || !wsHasDeliveredRef.current) {
            // Silent로만 보강 동기화하여 오버레이 깜빡임 방지
            try { await loadChatHistory(false, true); } catch {}
          }

          if (sessionStatus.status !== 'active') {
            setActiveSession(null);
            onSessionStatusChange?.(false);
            
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            
            // Reload messages to get final results (silent)
            loadChatHistory(false, true);
          }
        }
      } catch (error) {
        console.error('Error polling session status:', error);
      }
    }, 3000); // Poll every 3 seconds
  };

  // Load chat history
  const loadChatHistory = async (force = false, silent = false) => {
    try {
      // Silent 모드이거나, WS가 이미 메시지를 전달 중이면 로딩 표시를 건너뜀(깜빡임 방지)
      if (!silent) {
        if (!force && isConnected && wsHasDeliveredRef.current) {
          // Silent refresh
        } else {
          setIsLoading(true);
        }
      }
      const response = await fetch(`/api/chat/${projectId}/messages`);
      if (response.ok) {
        const raw: ChatMessage[] = await response.json();
        // Normalize assistant chunk newlines and coalesce consecutive assistant chat chunks for better readability
        const normalized: ChatMessage[] = [];
        for (const m of raw) {
          const mm: ChatMessage = { ...m };
          if (mm.role === 'assistant' && (!mm.message_type || mm.message_type === 'chat')) {
            mm.content = (mm.content || '').replace(/\r?\n$/, '');
            const prev = normalized[normalized.length - 1];
            if (prev && prev.role === 'assistant' && (!prev.message_type || prev.message_type === 'chat')) {
              prev.content = (prev.content || '') + (mm.content || '');
              prev.created_at = mm.created_at || prev.created_at;
              continue; // skip pushing mm as a new entry
            }
          }
          normalized.push(mm);
        }
        // Preserve in-flight streaming bubbles (ids starting with 'stream_') to avoid losing deltas during silent refresh
        setMessages((prev) => {
          const inflight = prev.filter((m) => typeof m.id === 'string' && m.id.startsWith('stream_'))
          if (inflight.length === 0) return normalized
          return [...normalized, ...inflight]
        });
        // 최초 성공 로드 마킹(이후엔 상단 오버레이를 다시 표시하지 않음)
        historyLoadedOnceRef.current = true;
      }
    } catch (error) {
      console.error('Failed to load chat history:', error);
    } finally {
      // Silent 모드가 아니면서, 실제로 로딩을 켰던 경우에만 끔
      if (!silent) {
        if (force || !isConnected || !wsHasDeliveredRef.current) {
          setIsLoading(false);
        }
      }
    }
  };

  // Catch-up: when WS connects, silently refresh history once to fill any gaps
  useEffect(() => {
    if (isConnected) {
      // 첫 연결 직후엔 Silent로만 보강 동기화(오버레이 깜빡임 방지)
      loadChatHistory(false, true).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  // Initial load (guard against StrictMode double-invoke)
  useEffect(() => {
    if (!projectId) return;
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    let mounted = true;
    const loadData = async () => {
      if (!mounted) return;
      await loadChatHistory(true);
      await checkActiveSession();
    };
    loadData();

    return () => {
      mounted = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (activeCheckRef.current) {
        clearInterval(activeCheckRef.current);
        activeCheckRef.current = null;
      }
    };
  }, [projectId]);

  // Opportunistic active session detector (covers missing WS start event)
  useEffect(() => {
    if (!projectId) return;
    // If WS is connected AND actively delivering, stop detector
    if (isConnected && wsHasDeliveredRef.current) {
      if (activeCheckRef.current) {
        clearInterval(activeCheckRef.current);
        activeCheckRef.current = null;
      }
      return;
    }
    // Already running
    if (activeCheckRef.current) return;
    activeCheckRef.current = setInterval(async () => {
      try {
        // Double-check: if WS is now actively delivering, stop this interval
        if (isConnected && wsHasDeliveredRef.current) {
          if (activeCheckRef.current) {
            clearInterval(activeCheckRef.current);
            activeCheckRef.current = null;
          }
          return;
        }
        // If already polling a known session, skip
        if (pollIntervalRef.current) return;
        const res = await fetch(`/api/chat/${projectId}/active-session`);
        if (res.ok) {
          const data: ActiveSession = await res.json();
          if (data && data.status === 'active' && data.session_id) {
            setActiveSession(data);
            onSessionStatusChange?.(true);
            startSessionPolling(data.session_id);
          }
        }
      } catch {}
    }, 2000);
    return () => {
      if (activeCheckRef.current) {
        clearInterval(activeCheckRef.current);
        activeCheckRef.current = null;
      }
    };
  }, [projectId, isConnected]);

  // Handle log entries from other WebSocket data
  const handleWebSocketData = (data: any) => {
    // Filter out system-internal messages that shouldn't be shown to users
    const internalMessageTypes = [
      'cli_output',        // CLI execution logs
      'session_status',    // Session state updates  
      'status',            // Generic status updates
      'message',           // Already handled by onMessage
      'project_status',    // Already handled by onStatus
      'act_complete'       // Already handled by onStatus
    ];
    
    // Only add to logs if it's not an internal message type
    if (!internalMessageTypes.includes(data.type)) {
      const logEntry: LogEntry = {
        id: `${Date.now()}-${Math.random()}`,
        type: data.type,
        data: data.data || data,
        timestamp: data.timestamp || new Date().toISOString()
      };
      
      setLogs(prev => [...prev, logEntry]);
    }
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Function to shorten file paths
  const shortenPath = (text: string) => {
    if (!text) return text;
    
    // Pattern to match file paths (starts with / and contains multiple directories)
    const pathPattern = /\/[^\/\s]+(?:\/[^\/\s]+){3,}\/([^\/\s]+\.[^\/\s]+)/g;
    
    return text.replace(pathPattern, (match, filename) => {
      return `.../${filename}`;
    });
  };

  // Function to clean user messages by removing think hard instruction and chat mode instructions
  const cleanUserMessage = (content: string) => {
    if (!content) return content;
    
    let cleanedContent = content;
    
    // Remove think hard instruction
    cleanedContent = cleanedContent.replace(/\.\s*think\s+hard\.\s*$/, '');
    
    // Remove chat mode instruction
    cleanedContent = cleanedContent.replace(/\n\nDo not modify code, only answer to the user's request\.$/, '');
    
    return cleanedContent.trim();
  };

  // Function to render content with thinking tags
  const renderContentWithThinking = (content: string): ReactElement => {
    const parts: ReactElement[] = [];
    let lastIndex = 0;
    const regex = /<thinking>([\s\S]*?)<\/thinking>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      // Add text before the thinking tag (with markdown)
      if (match.index > lastIndex) {
        const beforeText = content.slice(lastIndex, match.index).trim();
        if (beforeText) {
          parts.push(
            <ReactMarkdown 
              key={`text-${lastIndex}`}
              components={{
                p: ({children}) => <p className="mb-2 last:mb-0 break-words">{children}</p>,
                strong: ({children}) => <strong className="font-medium">{children}</strong>,
                em: ({children}) => <em className="italic">{children}</em>,
                code: ({children}) => <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">{children}</code>,
                pre: ({children}) => <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg my-2 overflow-x-auto text-xs break-words">{children}</pre>,
                ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                li: ({children}) => <li className="mb-1 break-words">{children}</li>
              }}
            >
              {beforeText}
            </ReactMarkdown>
          );
        }
      }

      // Add the thinking section using the new component
      const thinkingText = match[1].trim();
      if (thinkingText) {
        parts.push(
          <ThinkingSection 
            key={`thinking-${match.index}`}
            content={thinkingText}
          />
        );
      }

      lastIndex = regex.lastIndex;
    }

    // Add remaining text after the last thinking tag (with markdown)
    if (lastIndex < content.length) {
      const remainingText = content.slice(lastIndex).trim();
      if (remainingText) {
        parts.push(
          <ReactMarkdown 
            key={`text-${lastIndex}`}
            components={{
              p: ({children}) => {
                // Check for Planning tool message pattern
                const childrenArray = React.Children.toArray(children);
                const hasPlanning = childrenArray.some(child => {
                  if (typeof child === 'string' && child.includes('Planning for next moves...')) {
                    return true;
                  }
                  return false;
                });
                if (hasPlanning) {
                  return <p className="mb-2 last:mb-0 break-words">
                    <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">
                      Planning for next moves...
                    </code>
                  </p>;
                }
                return <p className="mb-2 last:mb-0 break-words">{children}</p>;
              },
              strong: ({children}) => <strong className="font-medium">{children}</strong>,
              em: ({children}) => <em className="italic">{children}</em>,
              code: ({children}) => <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">{children}</code>,
              pre: ({children}) => <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg my-2 overflow-x-auto text-xs break-words">{children}</pre>,
              ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
              ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
              li: ({children}) => <li className="mb-1 break-words">{children}</li>
            }}
          >
            {remainingText}
          </ReactMarkdown>
        );
      }
    }

    // If no thinking tags found, return original content with markdown
    if (parts.length === 0) {
      return (
        <ReactMarkdown 
          components={{
            p: ({children}) => {
              // Check if this paragraph contains Planning tool message
              // The message now comes as plain text "Planning for next moves..."
              // ReactMarkdown passes the whole paragraph with child elements
              const childrenArray = React.Children.toArray(children);
              const hasPlanning = childrenArray.some(child => {
                if (typeof child === 'string' && child.includes('Planning for next moves...')) {
                  return true;
                }
                return false;
              });
              if (hasPlanning) {
                return <p className="mb-2 last:mb-0 break-words">
                  <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">
                    Planning for next moves...
                  </code>
                </p>;
              }
              return <p className="mb-2 last:mb-0 break-words">{children}</p>;
            },
            strong: ({children}) => <strong className="font-medium">{children}</strong>,
            em: ({children}) => <em className="italic">{children}</em>,
            code: ({children}) => <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono">{children}</code>,
            pre: ({children}) => <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg my-2 overflow-x-auto text-xs break-words">{children}</pre>,
            ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
            ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
            li: ({children}) => <li className="mb-1 break-words">{children}</li>
          }}
        >
          {content}
        </ReactMarkdown>
      );
    }

    return <>{parts}</>;
  };

  // Function to get message type label and styling
  const getMessageTypeInfo = (message: ChatMessage) => {
    const { role, message_type } = message;
    
    // Handle different message types
    switch (message_type) {
      case 'tool_result':
      case 'tool_use':
        return {
          bgClass: 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800',
          textColor: 'text-blue-900 dark:text-blue-100',
          labelColor: 'text-blue-600 dark:text-blue-400'
        };
      case 'system':
        return {
          bgClass: 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800',
          textColor: 'text-green-900 dark:text-green-100',
          labelColor: 'text-green-600 dark:text-green-400'
        };
      case 'error':
        return {
          bgClass: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
          textColor: 'text-red-900 dark:text-red-100',
          labelColor: 'text-red-600 dark:text-red-400'
        };
      case 'info':
        return {
          bgClass: 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800',
          textColor: 'text-yellow-900 dark:text-yellow-100',
          labelColor: 'text-yellow-600 dark:text-yellow-400'
        };
      default:
        // Handle by role
        switch (role) {
          case 'user':
            return {
              bgClass: 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
              textColor: 'text-gray-900 dark:text-white',
              labelColor: 'text-gray-600 dark:text-gray-400'
            };
          case 'system':
            return {
              bgClass: 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800',
              textColor: 'text-green-900 dark:text-green-100',
              labelColor: 'text-green-600 dark:text-green-400'
            };
          case 'tool':
            return {
              bgClass: 'bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800',
              textColor: 'text-purple-900 dark:text-purple-100',
              labelColor: 'text-purple-600 dark:text-purple-400'
            };
          case 'assistant':
          default:
            return {
              bgClass: 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700',
              textColor: 'text-gray-900 dark:text-white',
              labelColor: 'text-gray-600 dark:text-gray-400'
            };
        }
    }
  };

  // Message filtering function - hide internal tool results and system messages
  const shouldDisplayMessage = (message: ChatMessage) => {
    // Hide messages with empty or whitespace-only content
    if (!message.content || message.content.trim() === '') {
      return false;
    }
    
    // Show tool_result messages (they contain important tool execution info)
    // Removed the hiding of tool_result messages to show tool calls
    
    // Hide system initialization messages
    if (message.role === 'system' && message.message_type === 'system') {
      // Check if it's an initialization message
      if (message.content.includes('initialized') || message.content.includes('Agent')) {
        return false;
      }
    }
    
    // Hide messages explicitly marked as hidden
    if (message.metadata_json && message.metadata_json.hidden_from_ui) {
      return false;
    }
    
    // Show all other messages (user messages, assistant text responses, tool use summaries)
    return true;
  };

  // ✅ Optimize message filtering to prevent unnecessary re-renders
  const displayableMessages = useMemo(() => {
    return messages.filter(shouldDisplayMessage);
  }, [messages]);

  // ✅ Track the last message ID to only animate new messages
  const [lastMessageId, setLastMessageId] = useState<string>('');
  
  useEffect(() => {
    if (displayableMessages.length > 0) {
      const latestMessage = displayableMessages[displayableMessages.length - 1];
      if (latestMessage.id !== lastMessageId) {
        setLastMessageId(latestMessage.id);
      }
    }
  }, [displayableMessages, lastMessageId]);

  const renderLogEntry = (log: LogEntry) => {
    switch (log.type) {
      case 'system':
        return (
          <div>
            System connected (Model: {log.data.model || 'Unknown'})
          </div>
        );

      case 'act_start':
        return (
          <div>
            Starting task: {shortenPath(log.data.instruction)}
          </div>
        );

      case 'text':
        return (
          <div>
            <ReactMarkdown 
              components={{
                p: ({children}) => <p className="mb-2 last:mb-0 break-words">{children}</p>,
                strong: ({children}) => <strong className="font-medium">{children}</strong>,
                em: ({children}) => <em className="italic">{children}</em>,
                code: ({children}) => <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-xs font-mono break-all">{children}</code>,
                pre: ({children}) => <pre className="bg-gray-100 dark:bg-gray-700 p-3 rounded-lg my-2 overflow-x-auto text-xs break-words">{children}</pre>,
                ul: ({children}) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                ol: ({children}) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                li: ({children}) => <li className="mb-1 break-words">{children}</li>
              }}
            >
              {shortenPath(log.data.content)}
            </ReactMarkdown>
          </div>
        );

      case 'thinking':
        return (
          <div className="italic">
            Thinking: {shortenPath(log.data.content)}
          </div>
        );

      case 'tool_start':
        return (
          <div>
            Using tool: {shortenPath(log.data.summary || log.data.tool_name)}
          </div>
        );

      case 'tool_result':
        const isError = log.data.is_error;
        return (
          <div>
            {shortenPath(log.data.summary)} {isError ? 'failed' : 'completed'}
          </div>
        );

      case 'result':
        return (
          <div>
            Task completed ({log.data.duration_ms}ms, {log.data.turns} turns
            {log.data.total_cost_usd && `, $${log.data.total_cost_usd.toFixed(4)}`})
          </div>
        );

      case 'act_complete':
        return (
          <div className="font-medium">
            Task completed: {shortenPath(log.data.commit_message || log.data.changes_summary)}
          </div>
        );

      case 'error':
        return (
          <div>
            Error occurred: {shortenPath(log.data.message)}
          </div>
        );

      default:
        return (
          <div>
            {log.type}: {typeof log.data === 'object' ? JSON.stringify(log.data).substring(0, 100) : String(log.data).substring(0, 100)}...
          </div>
        );
    }
  };

  const openDetailModal = (log: LogEntry) => {
    setSelectedLog(log);
  };

  const closeDetailModal = () => {
    setSelectedLog(null);
  };

  const renderDetailModal = () => {
    if (!selectedLog) return null;

    const { type, data } = selectedLog;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 dark:bg-black dark:bg-opacity-70 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-auto border border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">로그 상세 정보</h3>
            <button
              onClick={closeDetailModal}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <div className="text-gray-900 dark:text-gray-100">
              <strong className="text-gray-700 dark:text-gray-300">타입:</strong> {type}
            </div>
            <div className="text-gray-900 dark:text-gray-100">
              <strong className="text-gray-700 dark:text-gray-300">시간:</strong> {formatTime(selectedLog.timestamp)}
            </div>

            {type === 'tool_result' && data.diff_info && (
              <div>
                <strong className="text-gray-700 dark:text-gray-300">변경 사항:</strong>
                <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto text-xs font-mono">
                  {data.diff_info}
                </pre>
              </div>
            )}

            <div>
              <strong className="text-gray-700 dark:text-gray-300">상세 데이터:</strong>
              <pre className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto text-xs font-mono">
                {JSON.stringify(data, null, 2)}
              </pre>
            </div>
          </div>
          </div>
        </motion.div>
      </div>
    );
  };

  const listItems = useMemo(() => {
    const items: React.ReactElement[] = [];
    if (isLoading && !historyLoadedOnceRef.current) {
      items.push(
        <div key="loading" className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-600 text-sm">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white mb-2 mx-auto"></div>
            <p>Loading chat history...</p>
          </div>
        </div>
      );
      return items;
    }
    if (!isLoading && displayableMessages.length === 0 && logs.length === 0) {
      items.push(
        <div key="empty" className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-600 text-sm">
          <div className="text-center">
            <div className="text-2xl mb-2">💬</div>
            <p>Start a conversation with your agent</p>
          </div>
        </div>
      );
    }

    items.push(
      ...displayableMessages.map((message, index) => {
            const isNewMessage = message.id === lastMessageId;
            
            const messageContent = (
              <>
                {message.role === 'user' ? (
                  // User message - boxed on the right
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3">
                      <div className="text-sm text-gray-900 dark:text-white break-words">
                        {(() => {
                          const cleanedMessage = cleanUserMessage(message.content);
                          
                          // Check if message contains image paths
                          const imagePattern = /Image #\d+ path: ([^\n]+)/g;
                          const imagePaths: string[] = [];
                          let match;
                          
                          while ((match = imagePattern.exec(cleanedMessage)) !== null) {
                            imagePaths.push(match[1]);
                          }
                          
                          // Remove image paths from message
                          const messageWithoutPaths = cleanedMessage.replace(/\n*Image #\d+ path: [^\n]+/g, '').trim();
                          
                          return (
                            <>
                              {messageWithoutPaths && (
                                <div>{shortenPath(messageWithoutPaths)}</div>
                              )}
                              {(() => {
                                // Use attachments from metadata if available, otherwise fallback to parsed paths
                                const attachments = message.metadata_json?.attachments || [];
                                // Avoid noisy console logs in production which can cause jank
                                if (attachments.length > 0) {
                                  return (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {attachments.map((attachment: any, idx: number) => {
                                        const imageUrl = `${attachment.url}`;
                                        return (
                                        <div key={idx} className="relative group">
                                          <div className="w-40 h-40 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                                            <img 
                                              src={imageUrl}
                                              alt={`Image ${idx + 1}`}
                                              className="w-full h-full object-cover"
                                              onError={(e) => {
                                                // Fallback to icon if image fails to load
                                                const target = e.target as HTMLImageElement;
                                                console.error('❌ Image failed to load:', target.src, 'Error:', e);
                                                target.style.display = 'none';
                                                const parent = target.parentElement;
                                                if (parent) {
                                                  parent.innerHTML = `
                                                    <div class="w-full h-full flex items-center justify-center">
                                                      <svg class="w-16 h-16 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                      </svg>
                                                    </div>
                                                  `;
                                                }
                                              }}
                                            />
                                          </div>
                                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-opacity flex items-center justify-center">
                                            <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-60 px-2 py-1 rounded">
                                              #{idx + 1}
                                            </span>
                                          </div>
                                          {/* Tooltip with filename */}
                                          <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                            {attachment.name}
                                          </div>
                                        </div>
                                        );
                                      })}
                                    </div>
                                  );
                                } else if (imagePaths.length > 0) {
                                  // Fallback to old method for backward compatibility
                                  return (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {imagePaths.map((path, idx) => {
                                        const filename = path.split('/').pop() || 'image';
                                        return (
                                          <div key={idx} className="relative group">
                                            <div className="w-40 h-40 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 flex items-center justify-center">
                                              <svg className="w-16 h-16 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                              </svg>
                                            </div>
                                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-opacity flex items-center justify-center">
                                              <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-60 px-2 py-1 rounded">
                                                #{idx + 1}
                                              </span>
                                            </div>
                                            {/* Tooltip with filename */}
                                            <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                                              {filename}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  // Agent message - full width, no box
                  <div className="w-full">
                    {isToolUsageMessage(message.content, message.metadata_json) ? (
                      // Tool usage - clean display with expand functionality
                      <ToolMessage content={message.content} metadata={message.metadata_json} />
                    ) : (
                      // Regular agent message - plain text
                      <div className="text-sm text-gray-900 dark:text-white leading-relaxed">
                        {renderContentWithThinking(shortenPath(message.content))}
                      </div>
                    )}
                  </div>
                )}
              </>
            );

            return (
              <div className="mb-4" key={`message-${message.id}`}>
                {isNewMessage ? (
                  // ✅ Only animate new messages to prevent flickering
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    {messageContent}
                  </motion.div>
                ) : (
                  // ✅ Static render for existing messages
                  <div>
                    {messageContent}
                  </div>
                )}
              </div>
            );
          })
    );

    items.push(
      ...logs.filter(log => {
            // Hide internal system logs but show tool results for transparency
            const hideTypes = ['system'];
            return !hideTypes.includes(log.type);
          }).map((log) => (
            <div key={`log-${log.id}`} className="mb-4 w-full cursor-pointer" onClick={() => openDetailModal(log)}>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <div className="text-sm text-gray-900 dark:text-white leading-relaxed">
                  {renderLogEntry(log)}
                </div>
              </motion.div>
            </div>
          ))
    );

    if (isWaitingForResponse) {
      items.push(
        <div key="waiting" className="mb-4 w-full">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="text-xl text-gray-900 dark:text-white leading-relaxed font-bold">
              <span className="animate-pulse">...</span>
            </div>
          </motion.div>
        </div>
      );
    }

    return items;
  }, [isLoading, displayableMessages, logs, isWaitingForResponse, lastMessageId]);

  // Stable virtual items to avoid re-mount flicker
  type VirtualItem =
    | { kind: 'loading'; key: 'loading' }
    | { kind: 'empty'; key: 'empty' }
    | { kind: 'waiting'; key: 'waiting' }
    | { kind: 'message'; key: string; message: ChatMessage }
    | { kind: 'log'; key: string; log: LogEntry };

  const virtualItems: VirtualItem[] = useMemo(() => {
    const items: VirtualItem[] = [];
    if (isLoading && !historyLoadedOnceRef.current) {
      items.push({ kind: 'loading', key: 'loading' });
      return items;
    }
    if (!isLoading && displayableMessages.length === 0 && logs.length === 0) {
      items.push({ kind: 'empty', key: 'empty' });
    }
    for (const m of displayableMessages) items.push({ kind: 'message', key: `m:${m.id}`, message: m });
    for (const l of logs.filter(l => !['system'].includes(l.type))) items.push({ kind: 'log', key: `l:${l.id}`, log: l });
    if (isWaitingForResponse) items.push({ kind: 'waiting', key: 'waiting' });
    return items;
  }, [isLoading, displayableMessages, logs, isWaitingForResponse]);

  // Auto-scroll state and controls
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [pendingNew, setPendingNew] = useState(0);

  const scrollToBottomSmooth = useCallback(() => {
    const count = virtualItems.length;
    if (count > 0) {
      virtuosoRef.current?.scrollToIndex({ index: count - 1, behavior: 'smooth' });
      setPendingNew(0);
    }
  }, [virtualItems.length]);

  // When list grows: if at bottom, follow; if scrolled up, increase pending count
  const prevLengthRef = useRef(virtualItems.length);
  useEffect(() => {
    const prev = prevLengthRef.current;
    const curr = virtualItems.length;
    if (curr > prev) {
      // New items appended
      if (isAtBottom) {
        // Smooth scroll to bottom
        scrollToBottomSmooth();
      } else {
        setPendingNew((n) => n + (curr - prev));
      }
    }
    prevLengthRef.current = curr;
  }, [virtualItems.length, isAtBottom, scrollToBottomSmooth]);

  // If the last message is a user message, force scroll to bottom
  useEffect(() => {
    if (displayableMessages.length === 0) return;
    const last = displayableMessages[displayableMessages.length - 1];
    if (last.role === 'user') {
      scrollToBottomSmooth();
    }
  }, [displayableMessages, scrollToBottomSmooth]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-black">
      {/* 메시지와 로그를 함께 표시 */}
      <div className="flex-1 min-h-0 relative">
        <Virtuoso
          ref={virtuosoRef}
          className="h-full custom-scrollbar dark:chat-scrollbar"
          data={virtualItems}
          itemContent={(index, item) => {
            if (item.kind === 'loading') {
              return (
                <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-600 text-sm">
                  <div className="flex flex-col items-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900 dark:border-white mb-2 mx-auto"></div>
                    <p>Loading chat history...</p>
                  </div>
                </div>
              );
            }
            if (item.kind === 'empty') {
              return (
                <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-600 text-sm">
                  <div className="text-center">
                    <div className="text-2xl mb-2">💬</div>
                    <p>Start a conversation with your agent</p>
                  </div>
                </div>
              );
            }
            if (item.kind === 'waiting') {
              return (
                <div className="mb-4 w-full">
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="text-xl text-gray-900 dark:text-white leading-relaxed font-bold">
                      <span className="animate-pulse">...</span>
                    </div>
                  </motion.div>
                </div>
              );
            }
            if (item.kind === 'log') {
              const log = item.log;
              return (
                <div className="mb-4 w-full cursor-pointer" onClick={() => openDetailModal(log)}>
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                    <div className="text-sm text-gray-900 dark:text-white leading-relaxed">
                      {renderLogEntry(log)}
                    </div>
                  </motion.div>
                </div>
              );
            }
            // message
            const message = item.message;
            const isNewMessage = message.id === lastMessageId;
            const messageContent = (
              <>
                {message.role === 'user' ? (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] bg-gray-100 dark:bg-gray-800 rounded-lg px-4 py-3">
                      <div className="text-sm text-gray-900 dark:text-white break-words">
                        {(() => {
                          const cleanedMessage = cleanUserMessage(message.content);
                          const imagePattern = /Image #\d+ path: ([^\n]+)/g;
                          const imagePaths: string[] = [];
                          let match;
                          while ((match = imagePattern.exec(cleanedMessage)) !== null) { imagePaths.push(match[1]); }
                          const messageWithoutPaths = cleanedMessage.replace(/\n*Image #\d+ path: [^\n]+/g, '').trim();
                          return (
                            <>
                              {messageWithoutPaths && (<div>{shortenPath(messageWithoutPaths)}</div>)}
                              {(() => {
                                const attachments = message.metadata_json?.attachments || [];
                                if (attachments.length > 0) {
                                  return (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {attachments.map((attachment: any, idx: number) => {
                                        const imageUrl = `${attachment.url}`;
                                        return (
                                          <div key={idx} className="relative group">
                                            <div className="w-40 h-40 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600">
                                              <img src={imageUrl} alt={`Image ${idx + 1}`} className="w-full h-full object-cover" />
                                            </div>
                                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-opacity flex items-center justify-center">
                                              <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-60 px-2 py-1 rounded">#{idx + 1}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                } else if (imagePaths.length > 0) {
                                  return (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {imagePaths.map((path, idx) => (
                                        <div key={idx} className="relative group">
                                          <div className="w-40 h-40 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-300 dark:border-gray-600 flex items-center justify-center">
                                            <svg className="w-16 h-16 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                          </div>
                                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 rounded-lg transition-opacity flex items-center justify-center">
                                            <span className="text-white text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-60 px-2 py-1 rounded">#{idx + 1}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    {isToolUsageMessage(message.content, message.metadata_json) ? (
                      <ToolMessage content={message.content} metadata={message.metadata_json} />
                    ) : (
                      <div className="text-sm text-gray-900 dark:text-white leading-relaxed">
                        {renderContentWithThinking(shortenPath(message.content))}
                      </div>
                    )}
                  </div>
                )}
              </>
            );
            return (
              <div className="mb-4">
                <div>{messageContent}</div>
              </div>
            );
          }}
          followOutput="auto"
          atBottomStateChange={(bottom) => {
            setIsAtBottom(bottom);
            if (bottom) setPendingNew(0);
          }}
          computeItemKey={(index, item) => (item as any).key}
          components={{
            List: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
              (props, ref) => (
                <div ref={ref} {...props} className={`px-8 py-3 space-y-2 ${props.className || ''}`} />
              )
            )
          }}
        />

        {/* New messages indicator when scrolled up */}
        {pendingNew > 0 && !isAtBottom && (
          <button
            onClick={scrollToBottomSmooth}
            className="absolute bottom-4 right-4 z-10 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-2 shadow-md"
            title="Scroll to newest"
          >
            {pendingNew} new message{pendingNew > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {/* 상세 모달 */}
      <AnimatePresence>
        {selectedLog && renderDetailModal()}
      </AnimatePresence>
    </div>
  );
}
