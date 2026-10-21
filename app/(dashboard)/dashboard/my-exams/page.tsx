'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, GraduationCap, Clock, Loader2, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { SafeDate } from '@/components/safe-format';

export default function MyExamsPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<any[]>([]);
  const [activeAttempts, setActiveAttempts] = useState<any[]>([]);
  const [interruptedAttempts, setInterruptedAttempts] = useState<any[]>([]);
  const [reactivationRequests, setReactivationRequests] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [duplicateSessionBlocked, setDuplicateSessionBlocked] = useState(false);
  const [duplicateAttemptId, setDuplicateAttemptId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/assessments').then(r => r.json()).then(d => setAssessments(d ?? [])).catch(() => {}).finally(() => setLoading(false));
    fetch('/api/attempts/active')
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load active exam sessions');
        return response.json();
      })
      .then((data) => {
        setActiveAttempts(data.activeAttempts ?? []);
        setInterruptedAttempts(data.interruptedAttempts ?? []);
      })
      .catch((loadError) => console.error('Failed to load active exam sessions:', loadError));
  }, []);

  const requestReactivation = async (attemptId: string) => {
    setReactivationRequests((current) => ({ ...current, [attemptId]: 'sending' }));
    try {
      const response = await fetch(`/api/attempts/${attemptId}/reactivation-request`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Unable to send reactivation request.');
      setReactivationRequests((current) => ({ ...current, [attemptId]: 'sent' }));
      setInterruptedAttempts((current) => current.map((attempt) => (
        attempt.attemptId === attemptId ? { ...attempt, reactivationRequested: true } : attempt
      )));
    } catch (requestError) {
      console.error('Exam reactivation request failed:', requestError);
      setReactivationRequests((current) => ({ ...current, [attemptId]: 'error' }));
    }
  };

  const startExam = async (assessmentId: string) => {
    setStarting(assessmentId);
    try {
      const res = await fetch('/api/attempts/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assessmentId }),
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/exam/${data.attemptId}`);
      } else if (res.status === 409 && data?.code === 'ACTIVE_EXAM_SESSION' && data?.attemptId) {
        if (data.assessmentId === assessmentId) {
          toast.info('Resuming active session...');
          router.push(`/exam/${data.attemptId}`);
        } else {
          const activeAttempt = activeAttempts.find((attempt) => attempt.attemptId === data.attemptId);
          toast.error(
            activeAttempt
              ? `You already have an active exam: ${activeAttempt.assessmentTitle}. Open it from Active exam sessions.`
              : 'You already have an active exam session. Open it from Active exam sessions.',
          );
        }
      } else if (data?.code === 'DUPLICATE_ACTIVE_SESSION') {
        setDuplicateAttemptId(typeof data.attemptId === 'string' ? data.attemptId : null);
        setDuplicateSessionBlocked(true);
      } else {
        toast.error(data?.error || 'Cannot start examination');
      }
    } catch { toast.error('Error starting examination'); }
    setStarting(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" /> My Examinations
        </h1>
        <p className="text-muted-foreground">View and take available examinations</p>
      </div>

      {activeAttempts.length > 0 && (
        <section className="space-y-3" aria-labelledby="active-exams-title">
          <div>
            <h2 id="active-exams-title" className="text-lg font-semibold flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-600" />
              Active exam sessions
            </h2>
            <p className="text-sm text-muted-foreground">
              These attempts are currently active on your account. Open the session you need to continue or recover.
            </p>
          </div>
          {activeAttempts.map((activeAttempt) => (
            <Card key={activeAttempt.attemptId} className="border-amber-300/70 bg-amber-50/40">
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-medium text-lg">{activeAttempt.assessmentTitle}</h3>
                  <p className="text-sm text-muted-foreground">
                    {activeAttempt.courseCode} - {activeAttempt.courseTitle}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Attempt ID: <span className="font-mono">{activeAttempt.attemptId}</span>
                  </p>
                </div>
                <Button onClick={() => router.push(`/exam/${activeAttempt.attemptId}`)}>
                  <Play className="h-4 w-4 mr-2" />
                  Open active exam
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>
      )}

      {interruptedAttempts.length > 0 && (
        <section className="space-y-3" aria-labelledby="interrupted-exams-title">
          <div>
            <h2 id="interrupted-exams-title" className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Interrupted exams
            </h2>
            <p className="text-sm text-muted-foreground">
              These exams can only be reopened by authorized personnel. Send a request; you cannot reactivate them yourself.
            </p>
          </div>
          {interruptedAttempts.map((attempt) => {
            const requestState = reactivationRequests[attempt.attemptId];
            const requested = attempt.reactivationRequested || requestState === 'sent';
            return (
              <Card key={attempt.attemptId} className="border-amber-300/70 bg-amber-50/40">
                <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="font-medium text-lg">{attempt.assessmentTitle}</h3>
                    <p className="text-sm text-muted-foreground">{attempt.courseCode} - {attempt.courseTitle}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">Attempt ID: {attempt.attemptId}</p>
                    {requestState === 'error' && <p className="mt-2 text-sm text-destructive" role="alert">The request could not be sent. Please try again.</p>}
                  </div>
                  <Button
                    onClick={() => requestReactivation(attempt.attemptId)}
                    disabled={requested || requestState === 'sending'}
                  >
                    {requestState === 'sending'
                      ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      : <AlertTriangle className="h-4 w-4 mr-2" />}
                    {requested ? 'Reactivation requested' : 'Request staff reactivation'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <div className="space-y-4">
          {(assessments ?? []).map((a: any) => (
            <Card key={a.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-lg">{a?.title ?? ''}</h3>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span>{a?.course?.code ?? ''} - {a?.course?.title ?? ''}</span>
                      <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {a?.durationMins ?? 0} minutes</span>
                      <span>{(a?.items ?? []).length} questions</span>
                    </div>
                    {(a?.items ?? []).some((item: any) => item?.question?.type === 'essay') && (
                      <p className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        Includes {(a.items as any[]).filter((item) => item?.question?.type === 'essay').length} essay question{(a.items as any[]).filter((item) => item?.question?.type === 'essay').length === 1 ? '' : 's'}
                      </p>
                    )}
                    {a?.startAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Available: <SafeDate date={a.startAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} />
                        {a?.endAt && <> — <SafeDate date={a.endAt} options={{ dateStyle: 'medium', timeStyle: 'short' }} /></>}
                      </p>
                    )}
                  </div>
                  <Button onClick={() => startExam(a.id)} disabled={starting === a.id}>
                    {starting === a.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                    Start Exam
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {(assessments ?? []).length === 0 && <p className="text-center text-muted-foreground py-12">No examinations available</p>}
        </div>
      )}
      {duplicateSessionBlocked && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-session-title">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <AlertTriangle className="mx-auto h-11 w-11 text-amber-500" />
            <h2 id="duplicate-session-title" className="mt-4 text-center text-xl font-bold text-foreground">
              A duplicate active session cannot be opened
            </h2>
            <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">
              An active exam is already linked to your account. If you cannot find its browser tab, you can open that attempt and securely recover access.
            </p>
            {duplicateAttemptId ? (
              <Button type="button" onClick={() => router.push(`/exam/${duplicateAttemptId}`)} className="mt-6 w-full">
                Open active exam
              </Button>
            ) : (
              <Button type="button" onClick={() => setDuplicateSessionBlocked(false)} className="mt-6 w-full">
                Close
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
