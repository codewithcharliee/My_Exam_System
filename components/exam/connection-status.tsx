'use client';
import { CheckCircle, Cloud, CloudOff, Loader2, TriangleAlert } from 'lucide-react';
import type { ConnectionState, SyncState } from './use-connection-status';

export function ConnectionStatus({ connectionState, syncState, latencyMs }: { connectionState: ConnectionState; syncState: SyncState; latencyMs: number | null }) {
  const connectionLabel = connectionState === 'online' ? 'Online' : connectionState === 'degraded' ? 'Connection degraded' : 'Disconnected';
  const syncLabel = syncState === 'pending' ? 'Changes pending' : syncState === 'synchronizing' ? 'Synchronizing' : syncState === 'server-confirmed' ? 'Server confirmed' : 'Sync failed';
  const ConnectionIcon = connectionState === 'online' ? Cloud : connectionState === 'degraded' ? TriangleAlert : CloudOff;
  const SyncIcon = syncState === 'synchronizing' ? Loader2 : syncState === 'server-confirmed' ? CheckCircle : TriangleAlert;
  return (
    <div className="flex items-center gap-2 text-xs" aria-live="polite" aria-label={`${connectionLabel}, ${syncLabel}`}>
      <span className="inline-flex items-center gap-1"><ConnectionIcon className="h-3.5 w-3.5" aria-hidden="true" />{connectionLabel}{latencyMs !== null ? `, ${latencyMs} ms` : ''}</span>
      <span className="inline-flex items-center gap-1"><SyncIcon className={`h-3.5 w-3.5 ${syncState === 'synchronizing' ? 'animate-spin' : ''}`} aria-hidden="true" />{syncLabel}</span>
    </div>
  );
}
