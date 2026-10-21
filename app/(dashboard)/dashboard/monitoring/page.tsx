'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Monitor, RefreshCw, Eye, Camera, AlertTriangle, Loader2, Flag } from 'lucide-react';
import { SafeDate } from '@/components/safe-format';

export default function MonitoringPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAttempt, setSelectedAttempt] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [issues, setIssues] = useState<any[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [s, e, i] = await Promise.all([
        fetch('/api/monitoring/active-sessions').then(r => r.json()),
        fetch('/api/monitoring/events').then(r => r.json()),
        fetch('/api/issue-reports').then(r => r.json()),
      ]);
      setSessions(s ?? []);
      setEvents(e ?? []);
      setIssues(i ?? []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadData = async () => {
      try {
        const [s, e, i] = await Promise.all([
          fetch('/api/monitoring/active-sessions').then(r => r.json()),
          fetch('/api/monitoring/events').then(r => r.json()),
          fetch('/api/issue-reports').then(r => r.json()),
        ]);
        if (!isMounted) return;
        setSessions(s ?? []);
        setEvents(e ?? []);
        setIssues(i ?? []);
      } catch (error) {
        console.error(error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadData();
    const interval = setInterval(() => { void loadData(); }, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const viewSnapshots = async (attemptId: string) => {
    setSelectedAttempt(attemptId);
    try {
      const res = await fetch(`/api/monitoring/snapshots?attemptId=${attemptId}`);
      setSnapshots(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const markReviewed = async (eventId: string, flagged: boolean) => {
    try {
      await fetch('/api/monitoring/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, reviewed: true, flagged }),
      });
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  const acknowledgeIssue = async (issueId: string) => {
    await fetch('/api/issue-reports', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ issueId }) });
    fetchData();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
            <Monitor className="h-6 w-6 text-primary" /> Live Monitoring
          </h1>
          <p className="text-muted-foreground">Supervise active examination sessions (auto-refreshes every 10s)</p>
        </div>
        <Button variant="outline" onClick={fetchData}><RefreshCw className="h-4 w-4 mr-2" /> Refresh</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>Active Sessions ({(sessions ?? []).length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (sessions ?? []).length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No active sessions</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Candidate</TableHead>
                  <TableHead>Examination</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Events</TableHead>
                  <TableHead>Snapshots</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(sessions ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s?.candidate?.name ?? ''}</TableCell>
                    <TableCell>{s?.assessment?.title ?? ''}</TableCell>
                    <TableCell><SafeDate date={s?.startAt} options={{ timeStyle: 'short' }} /></TableCell>
                    <TableCell><Badge variant={s?._count?.monitoringEvents > 5 ? 'destructive' : 'secondary'}>{s?._count?.monitoringEvents ?? 0}</Badge></TableCell>
                    <TableCell>{s?._count?.snapshots ?? 0}</TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => viewSnapshots(s.id)}><Eye className="h-3.5 w-3.5 mr-1" /> View</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedAttempt && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Camera className="h-5 w-5" /> Snapshots</CardTitle></CardHeader>
          <CardContent>
            {(snapshots ?? []).length === 0 ? (
              <p className="text-muted-foreground">No snapshots for this attempt</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(snapshots ?? []).map((snap: any) => (
                  <div key={snap.id} className="border rounded-lg overflow-hidden">
                    {snap?.imageData && <Image src={snap.imageData} alt="Candidate monitoring snapshot" width={320} height={240} unoptimized loading="lazy" decoding="async" className="aspect-video w-full object-cover" />}
                    <div className="p-2 text-xs text-muted-foreground">
                      <SafeDate date={snap?.takenAt} options={{ timeStyle: 'medium' }} />
                      {snap?.monitoringEvent?.eventType && (
                        <p className="mt-1">Trigger: {snap.monitoringEvent.eventType}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Candidate issue reports</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Candidate</TableHead><TableHead>Assessment</TableHead><TableHead>Category</TableHead><TableHead>Reported</TableHead><TableHead>Status</TableHead><TableHead>Action</TableHead></TableRow></TableHeader>
            <TableBody>{issues.slice(0, 50).map((issue: any) => <TableRow key={issue.id}>
              <TableCell>{issue.candidate?.name ?? ''}</TableCell><TableCell>{issue.attempt?.assessment?.title ?? ''}</TableCell><TableCell>{issue.category}</TableCell><TableCell><SafeDate date={issue.createdAt} options={{ timeStyle: 'medium' }} /></TableCell><TableCell>{issue.acknowledgedAt ? <Badge>Handled</Badge> : <Badge variant="secondary">Pending</Badge>}</TableCell><TableCell>{!issue.acknowledgedAt && <Button variant="ghost" size="sm" onClick={() => acknowledgeIssue(issue.id)}>Acknowledge</Button>}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {issues.length === 0 && <p className="text-center text-muted-foreground py-6">No candidate issue reports</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Recent Events</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Snapshot</TableHead>
                <TableHead>Reviewed</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(events ?? []).slice(0, 20).map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell>{e?.attempt?.candidate?.name ?? ''}</TableCell>
                  <TableCell><Badge variant="outline">{e?.eventType ?? ''}</Badge></TableCell>
                  <TableCell><SafeDate date={e?.occurredAt} options={{ timeStyle: 'medium' }} /></TableCell>
                  <TableCell>{e?.snapshot?.id ? <Badge>Linked</Badge> : <Badge variant="secondary">None</Badge>}</TableCell>
                  <TableCell>{e?.reviewed ? <Badge>Reviewed</Badge> : <Badge variant="secondary">Pending</Badge>}</TableCell>
                  <TableCell className="space-x-2">
                    <Button variant="ghost" size="sm" onClick={() => markReviewed(e.id, false)}>Mark Reviewed</Button>
                    <Button variant="ghost" size="sm" onClick={() => markReviewed(e.id, true)}><Flag className="h-3.5 w-3.5 mr-1" /> Flag</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
