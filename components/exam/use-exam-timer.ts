'use client';

import { useState, useEffect, useRef } from 'react';

export function useExamTimer(endTime: string | null, onExpire: () => void, serverTime?: string) {
  const [remaining, setRemaining] = useState<number>(0);
  const [expired, setExpired] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const clockAnchorRef = useRef<{ epochMs: number; monotonicMs: number } | null>(null);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!endTime) return;
    const end = new Date(endTime).getTime();
    const serverEpochMs = serverTime ? Date.parse(serverTime) : Number.NaN;
    const monotonicMs = performance.now();
    clockAnchorRef.current = {
      epochMs: Number.isFinite(serverEpochMs) ? serverEpochMs : Date.now(),
      monotonicMs,
    };

    function tick() {
      const anchor = clockAnchorRef.current;
      if (!anchor) return;
      const now = anchor.epochMs + (performance.now() - anchor.monotonicMs);
      const diff = Math.max(0, Math.floor((end - now) / 1000));
      setRemaining(diff);
      if (diff <= 0 && !expired) {
        setExpired(true);
        onExpireRef.current?.();
      }
    }

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [endTime, expired, serverTime]);

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const formatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  const isUrgent = remaining <= 300; // 5 min
  const isCritical = remaining <= 60; // 1 min

  return { remaining, formatted, isUrgent, isCritical, expired };
}
