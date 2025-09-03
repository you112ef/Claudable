import { useState, useCallback, useEffect, useRef } from 'react';

interface UseUserRequestsOptions {
  projectId: string;
}

interface ActiveRequestsResponse {
  hasActiveRequests: boolean;
  activeCount: number;
}

export function useUserRequests({ projectId }: UseUserRequestsOptions) {
  const [hasActiveRequests, setHasActiveRequests] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [isTabVisible, setIsTabVisible] = useState(true); // 기본값 true로 설정

  // --- Global singleton poller per project to avoid duplicated intervals ---
  type Listener = (data: { hasActiveRequests: boolean; activeCount: number }) => void
  type Poller = { subscribers: Set<Listener>; timer: NodeJS.Timeout | null; last: { hasActiveRequests: boolean; activeCount: number } }
  const POLLERS: Map<string, Poller> = (globalThis as any).__USER_REQUESTS_POLLERS__ || new Map();
  ;(globalThis as any).__USER_REQUESTS_POLLERS__ = POLLERS

  const previousActiveState = useRef(false);

  // 탭 활성화 상태 추적
  useEffect(() => {
    // 클라이언트 사이드에서만 실행
    if (typeof document !== 'undefined') {
      setIsTabVisible(!document.hidden);
      
      const handleVisibilityChange = () => {
        setIsTabVisible(!document.hidden);
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }
  }, []);

  // DB에서 활성 요청 상태 조회 (singleton poller가 사용)
  const checkActiveRequests = useCallback(async () => {
    try {
      const response = await fetch(`/api/chat/${projectId}/requests/active`);
      if (response.ok) {
        const data: ActiveRequestsResponse = await response.json();
        const poller = POLLERS.get(projectId);
        if (poller) {
          poller.last = { hasActiveRequests: data.hasActiveRequests, activeCount: data.activeCount };
          // 알림 브로드캐스트
          poller.subscribers.forEach((fn) => fn(poller.last));
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[UserRequests] Failed to check active requests:', error);
      }
    }
  }, [POLLERS, projectId]);

  // 적응형 폴링 설정 (singleton 방식)
  useEffect(() => {
    // 구독자 등록
    const listener: Listener = (d) => {
      setHasActiveRequests(d.hasActiveRequests);
      setActiveCount(d.activeCount);
      if (d.hasActiveRequests !== previousActiveState.current) {
        console.log(`🔄 [UserRequests] Active requests: ${d.hasActiveRequests} (count: ${d.activeCount})`);
        previousActiveState.current = d.hasActiveRequests;
      }
    };

    let poller = POLLERS.get(projectId);
    if (!poller) {
      poller = { subscribers: new Set<Listener>(), timer: null, last: { hasActiveRequests: false, activeCount: 0 } };
      POLLERS.set(projectId, poller);
    }
    poller.subscribers.add(listener);

    // 폴링 타이머가 없다면 생성
    const ensureTimer = () => {
      if (poller && !poller.timer) {
        // 즉시 1회
        checkActiveRequests();
        // 1초 기본 주기, 활성일 경우 내부에서 추가 호출되므로 과도하지 않게 유지
        poller.timer = setInterval(() => {
          // 탭 비활성화 시 네트워크 절약 (단, 기존 구독자들은 마지막 값 유지)
          if (isTabVisible) checkActiveRequests();
        }, 1000);
      }
    };
    ensureTimer();

    // 구독 해제 및 정리
    return () => {
      const p = POLLERS.get(projectId);
      if (!p) return;
      p.subscribers.delete(listener);
      if (p.subscribers.size === 0) {
        if (p.timer) { clearInterval(p.timer); p.timer = null; }
        POLLERS.delete(projectId);
      }
    };
  }, [POLLERS, checkActiveRequests, isTabVisible, projectId]);

  // 컴포넌트 언마운트 시 정리: singleton 정리는 위 effect의 cleanup에서 처리됨

  // WebSocket 이벤트용 플레이스홀더 함수들 (기존 인터페이스 유지)
  const createRequest = useCallback((
    requestId: string,
    messageId: string,
    instruction: string,
    type: 'act' | 'chat' = 'act'
  ) => {
    // 즉시 폴링으로 상태 확인
    checkActiveRequests();
    console.log(`🔄 [UserRequests] Created request: ${requestId}`);
  }, [checkActiveRequests]);

  const startRequest = useCallback((requestId: string) => {
    // 즉시 폴링으로 상태 확인
    checkActiveRequests();
    console.log(`▶️ [UserRequests] Started request: ${requestId}`);
  }, [checkActiveRequests]);

  const completeRequest = useCallback((
    requestId: string, 
    isSuccessful: boolean,
    errorMessage?: string
  ) => {
    // 즉시 폴링으로 상태 확인
    setTimeout(checkActiveRequests, 100); // 약간 지연 후 확인
    console.log(`✅ [UserRequests] Completed request: ${requestId} (${isSuccessful ? 'success' : 'failed'})`);
  }, [checkActiveRequests]);

  return {
    hasActiveRequests,
    activeCount,
    createRequest,
    startRequest,
    completeRequest,
    // 레거시 인터페이스 호환성
    requests: [],
    activeRequests: [],
    getRequest: () => undefined,
    clearCompletedRequests: () => {}
  };
}
