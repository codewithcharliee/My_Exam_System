'use client';

import { useState, useEffect } from 'react';
import { Shield, ChevronLeft, ChevronRight, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';

export default function AuditPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionType, setActionType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [verify, setVerify] = useState<any>(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const limit = 25;

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (actionType) params.set('actionType', actionType);
    if (entityType) params.set('entityType', entityType);

    fetch(`/api/audit?${params}`)
      .then(r => r.json())
      .then(d => {
        setEvents(d?.events ?? []);
        setTotal(d?.total ?? 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, actionType, entityType]);

  useEffect(() => {
    setVerifyLoading(true);
    fetch('/api/audit/verify')
      .then(r => r.json())
      .then(d => setVerify(d))
      .catch(() => setVerify(null))
      .finally(() => setVerifyLoading(false));
  }, []);

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Shield className="h-6 w-6 text-primary" /> Audit Trail
        </h1>
        <p className="text-muted-foreground mt-1">Hash-linked log of system actions with chain verification</p>
      </div>

      <div className="bg-card border rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">Audit Chain Verification</p>
          {verifyLoading ? (
            <p className="text-xs text-muted-foreground">Running verification...</p>
          ) : verify ? (
            <p className="text-xs text-muted-foreground">
              Total events: {verify.totalEvents ?? 0} | Broken index: {verify.brokenIndex ?? 'none'}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Unable to verify chain</p>
          )}
        </div>
        {verifyLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : verify?.verified ? (
          <span className="inline-flex items-center gap-1 text-green-700 text-sm"><CheckCircle className="h-4 w-4" /> Verified</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-yellow-700 text-sm"><AlertTriangle className="h-4 w-4" /> Review Required</span>
        )}
      </div>

      <div className="flex gap-4 flex-wrap">
        <select value={actionType} onChange={e => { setActionType(e.target.value); setPage(1); }} className="px-3 py-2 rounded-md border bg-card text-foreground">
          <option value="">All Actions</option>
          {['attempt_started','attempt_submitted','attempt_auto_submitted_violation','grade_entered','result_released','assessment_created','assessment_updated','question_created','audit_viewed','reports_viewed','monitoring_event_logged','snapshot_captured','snapshot_deleted'].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select value={entityType} onChange={e => { setEntityType(e.target.value); setPage(1); }} className="px-3 py-2 rounded-md border bg-card text-foreground">
          <option value="">All Entities</option>
          {['attempt','assessment','question','grade_decision','result','audit','monitoring_event','snapshot','time_adjustment','readiness_check'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <span className="text-sm text-muted-foreground self-center">Total: {total} events</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No audit events found</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">Actor</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">Entity</th>
                  <th className="px-4 py-3 text-left font-medium">Reason</th>
                  <th className="px-4 py-3 text-left font-medium">Detail</th>
                  <th className="px-4 py-3 text-left font-medium">Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((ev: any) => {
                  let detailText = '-';
                  try {
                    const parsed = ev?.metadataJson ? JSON.parse(ev.metadataJson) : null;
                    detailText = parsed ? JSON.stringify(parsed) : '-';
                  } catch {}

                  return (
                    <tr key={ev?.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap"><SafeDate date={ev?.occurredAt} options={{ dateStyle: 'short', timeStyle: 'short' }} /></td>
                      <td className="px-4 py-3">
                        <span className="font-medium">{ev?.actor?.name ?? 'System'}</span>
                        <br /><span className="text-xs text-muted-foreground">{ev?.actor?.email ?? ''}</span>
                      </td>
                      <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{ev?.actionType ?? 'unknown'}</span></td>
                      <td className="px-4 py-3">
                        <span className="text-xs bg-muted px-2 py-1 rounded">{ev?.entityType ?? ''}</span>
                        <br /><span className="text-xs text-muted-foreground">{ev?.entityId ?? ''}</span>
                      </td>
                      <td className="px-4 py-3 max-w-[280px] text-muted-foreground">{ev?.reason ?? '-'}</td>
                      <td className="px-4 py-3 max-w-[280px] truncate text-muted-foreground" title={detailText}>{detailText}</td>
                      <td className="px-4 py-3">{ev?.hash ? <CheckCircle className="h-4 w-4 text-green-500" /> : <AlertTriangle className="h-4 w-4 text-yellow-500" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-2 rounded-md border hover:bg-muted disabled:opacity-50">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 rounded-md border hover:bg-muted disabled:opacity-50">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
