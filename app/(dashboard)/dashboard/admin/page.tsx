'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Settings, RotateCcw, Clock, Play, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';

export default function AdminPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<'reset' | 'reopen' | 'time'>('reset');

  const [resetAttemptId, setResetAttemptId] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ type: string; text: string } | null>(null);

  const [reopenAttemptId, setReopenAttemptId] = useState('');
  const [extraMinutes, setExtraMinutes] = useState(30);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);
  const [reopenMsg, setReopenMsg] = useState<{ type: string; text: string } | null>(null);
  const [reactivationRequests, setReactivationRequests] = useState<any[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);

  const [timeAdjs, setTimeAdjs] = useState<any[]>([]);
  const [adjLoading, setAdjLoading] = useState(false);
  const [newAdjAttemptId, setNewAdjAttemptId] = useState('');
  const [adjMinutes, setAdjMinutes] = useState(15);
  const [adjMsg, setAdjMsg] = useState<{ type: string; text: string } | null>(null);

  useEffect(() => {
    if (tab === 'reopen') {
      fetch('/api/admin/reactivation-requests')
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error ?? 'Unable to load reactivation requests.');
          setReactivationRequests(data.requests ?? []);
        })
        .catch((loadError) => {
          console.error('Unable to load exam reactivation requests:', loadError);
          setReopenMsg({ type: 'error', text: 'Unable to load student reactivation requests.' });
        })
        .finally(() => setRequestsLoading(false));
    }
    if (tab === 'time') {
      fetch('/api/admin/time-adjustment')
        .then(r => r.json())
        .then(d => setTimeAdjs(d?.adjustments ?? []))
        .catch(() => {})
        .finally(() => setAdjLoading(false));
    }
  }, [tab]);

  async function handleReset() {
    if (!resetAttemptId || !resetReason) return;
    setResetLoading(true); setResetMsg(null);
    try {
      const res = await fetch('/api/admin/reset-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: resetAttemptId, reason: resetReason }),
      });
      const data = await res.json();
      if (res.ok) setResetMsg({ type: 'success', text: 'Attempt reset successfully' });
      else setResetMsg({ type: 'error', text: data?.error ?? 'Reset failed' });
    } catch (e: any) {
      setResetMsg({ type: 'error', text: e?.message ?? 'Error' });
    } finally {
      setResetLoading(false);
    }
  }

  async function handleReopen() {
    if (!reopenAttemptId || !reopenReason) return;
    setReopenLoading(true); setReopenMsg(null);
    try {
      const res = await fetch('/api/admin/reopen-attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: reopenAttemptId, extraMinutes, reason: reopenReason }),
      });
      const data = await res.json();
      if (res.ok) {
        setReopenMsg({ type: 'success', text: 'Attempt reactivated successfully' });
        setReactivationRequests((requests) => requests.filter((request) => request.attemptId !== reopenAttemptId));
      }
      else setReopenMsg({ type: 'error', text: data?.error ?? 'Reopen failed' });
    } catch (e: any) {
      setReopenMsg({ type: 'error', text: e?.message ?? 'Error' });
    } finally {
      setReopenLoading(false);
    }
  }

  async function handleAddTimeAdj() {
    if (!newAdjAttemptId || adjMinutes <= 0) return;
    setAdjMsg(null);
    try {
      const res = await fetch('/api/admin/time-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attemptId: newAdjAttemptId, extraMinutes: adjMinutes }),
      });
      const data = await res.json();
      if (res.ok) {
        setAdjMsg({ type: 'success', text: 'Time adjustment added' });
        const adjustment = data?.adjustment;
        if (adjustment) setTimeAdjs(prev => [adjustment, ...(prev ?? [])]);
      } else {
        setAdjMsg({ type: 'error', text: data?.error ?? 'Failed' });
      }
    } catch (e: any) {
      setAdjMsg({ type: 'error', text: e?.message ?? 'Error' });
    }
  }

  const role = (session?.user as any)?.role;
  if (role !== 'admin' && role !== 'exam_officer') {
    return <div className="text-center py-20 text-muted-foreground">Access denied. Admin or Exam Officer role required.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" /> Admin Controls
        </h1>
        <p className="text-muted-foreground mt-1">Manage exam attempts, resets, reopenings and time adjustments</p>
      </div>

      <div className="flex gap-2">
        {[
          { key: 'reset', label: 'Reset Attempt', icon: RotateCcw },
          { key: 'reopen', label: 'Reopen Attempt', icon: Play },
          { key: 'time', label: 'Time Adjustments', icon: Clock },
        ].map(t => (
          <button key={t.key} onClick={() => {
            if (t.key === 'reopen') setRequestsLoading(true);
            if (t.key === 'time') setAdjLoading(true);
            setTab(t.key as any);
          }}
            className={`px-4 py-2 rounded-md font-medium text-sm flex items-center gap-2 transition-colors ${
              tab === t.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}>
            <t.icon className="h-4 w-4" />{t.label}
          </button>
        ))}
      </div>

      {tab === 'reset' && (
        <div className="bg-card rounded-lg p-6 shadow-md max-w-lg space-y-4">
          <h3 className="font-semibold text-foreground">Reset an Attempt</h3>
          <div>
            <label className="block text-sm font-medium mb-1">Attempt ID *</label>
            <input value={resetAttemptId} onChange={e => setResetAttemptId(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="Enter attempt ID" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Reason *</label>
            <textarea value={resetReason} onChange={e => setResetReason(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="Reason for reset" />
          </div>
          {resetMsg && <div className={`flex items-center gap-2 text-sm ${resetMsg.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>{resetMsg.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{resetMsg.text}</div>}
          <button onClick={handleReset} disabled={resetLoading || !resetAttemptId || !resetReason} className="w-full py-2 bg-destructive text-destructive-foreground rounded-md font-medium hover:bg-destructive/90 disabled:opacity-50 flex items-center justify-center gap-2">
            {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reset Attempt
          </button>
        </div>
      )}

      {tab === 'reopen' && (
        <div className="space-y-6">
          <div className="bg-card rounded-lg p-6 shadow-md max-w-lg space-y-4">
            <h3 className="font-semibold text-foreground">Reactivate an Interrupted Attempt</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Attempt ID *</label>
              <input value={reopenAttemptId} onChange={e => setReopenAttemptId(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="Enter attempt ID" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Extra Minutes</label>
              <input type="number" value={extraMinutes} onChange={e => setExtraMinutes(Number(e.target.value))} min={5} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Reason *</label>
              <textarea value={reopenReason} onChange={e => setReopenReason(e.target.value)} rows={2} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="Reason for reactivation" />
            </div>
            {reopenMsg && <div className={`flex items-center gap-2 text-sm ${reopenMsg.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>{reopenMsg.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{reopenMsg.text}</div>}
            <button onClick={handleReopen} disabled={reopenLoading || !reopenAttemptId || !reopenReason} className="w-full py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
              {reopenLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Reactivate Attempt
            </button>
          </div>
          <div className="bg-card rounded-lg p-6 shadow-md space-y-4">
            <h3 className="font-semibold text-foreground">Student Reactivation Requests</h3>
            {requestsLoading ? (
              <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : reactivationRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <div className="space-y-3">
                {reactivationRequests.map((request) => (
                  <div key={request.attemptId} className="flex flex-col gap-3 rounded-md border border-border p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{request.candidateName} ({request.candidateEmail})</p>
                      <p className="text-sm text-muted-foreground">{request.assessmentTitle}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{request.attemptId}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setReopenAttemptId(request.attemptId);
                        setReopenReason(`Approved reactivation request for ${request.candidateName}.`);
                        setReopenMsg(null);
                      }}
                      className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                    >
                      Review request
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'time' && (
        <div className="space-y-6">
          <div className="bg-card rounded-lg p-6 shadow-md max-w-lg space-y-4">
            <h3 className="font-semibold text-foreground">Add Time Adjustment</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Attempt ID *</label>
              <input value={newAdjAttemptId} onChange={e => setNewAdjAttemptId(e.target.value)} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" placeholder="Enter attempt ID" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Minutes to Add</label>
              <input type="number" value={adjMinutes} onChange={e => setAdjMinutes(Number(e.target.value))} min={1} className="w-full px-3 py-2 border rounded-md bg-background text-foreground" />
            </div>
            {adjMsg && <div className={`flex items-center gap-2 text-sm ${adjMsg.type === 'success' ? 'text-green-600' : 'text-destructive'}`}>{adjMsg.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}{adjMsg.text}</div>}
            <button onClick={handleAddTimeAdj} disabled={!newAdjAttemptId || adjMinutes <= 0} className="w-full py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">
              <Clock className="h-4 w-4" /> Add Time
            </button>
          </div>

          <div className="bg-card rounded-lg shadow-md overflow-hidden">
            <h3 className="font-semibold text-foreground p-5 pb-3">Recent Time Adjustments</h3>
            {adjLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : (timeAdjs ?? []).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No time adjustments found</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Attempt</th>
                      <th className="px-4 py-3 text-left font-medium">Candidate</th>
                      <th className="px-4 py-3 text-left font-medium">Assessment</th>
                      <th className="px-4 py-3 text-left font-medium">Minutes</th>
                      <th className="px-4 py-3 text-left font-medium">Approved By</th>
                      <th className="px-4 py-3 text-left font-medium">Approved At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(timeAdjs ?? []).map((adj: any) => (
                      <tr key={adj?.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{adj?.attemptId ? `${adj.attemptId.slice(0, 8)}...` : '-'}</td>
                        <td className="px-4 py-3">{adj?.candidate?.name ?? '-'}</td>
                        <td className="px-4 py-3">{adj?.assessment?.title ?? '-'}</td>
                        <td className="px-4 py-3 font-medium text-primary">+{adj?.extraMinutes ?? 0} min</td>
                        <td className="px-4 py-3">{adj?.approver?.name ?? '-'}</td>
                        <td className="px-4 py-3"><SafeDate date={adj?.approvedAt} options={{ dateStyle: 'short', timeStyle: 'short' }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
