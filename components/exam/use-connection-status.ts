'use client';
import { useEffect, useRef, useState } from 'react';

export type ConnectionState = 'online' | 'degraded' | 'disconnected';
export type SyncState = 'pending' | 'synchronizing' | 'server-confirmed' | 'failed';

export function useConnectionStatus(active: boolean, syncState: SyncState) {
  const [connectionState, setConnectionState] = useState<ConnectionState>('online');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastSuccessfulSync, setLastSuccessfulSync] = useState<number | null>(null);
  const failuresRef = useRef(0);
  useEffect(() => {
    if (!active) return;
    const check = async () => {
      if (!navigator.onLine) {
        setConnectionState('disconnected');
        return;
      }
      const started = performance.now();
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        if (!response.ok) throw new Error('Health check failed');
        const measured = Math.round(performance.now() - started);
        setLatencyMs(measured);
        failuresRef.current = 0;
        setConnectionState(measured > 1500 ? 'degraded' : 'online');
      } catch {
        failuresRef.current += 1;
        setConnectionState(failuresRef.current >= 2 ? 'degraded' : 'disconnected');
      }
    };
    const handleOnline = () => void check();
    const handleOffline = () => setConnectionState('disconnected');
    void check();
    const interval = window.setInterval(check, 15000);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [active]);
  return { connectionState, syncState, latencyMs, lastSuccessfulSync, setLastSuccessfulSync };
}
