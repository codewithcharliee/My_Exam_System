'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock, ChevronLeft, ChevronRight, Send, Save, AlertTriangle,
  CheckCircle, Loader2, Eye, Flag, Monitor
} from 'lucide-react';
import { useExamTimer } from '@/components/exam/use-exam-timer';
import { useBrowserMonitor } from '@/components/exam/use-browser-monitor';
import type { MonitoringEventType } from '@/lib/monitoring-events';
import { useWebcam } from '@/components/exam/use-webcam';
import { useConnectionStatus, type SyncState } from '@/components/exam/use-connection-status';
import { ConnectionStatus } from '@/components/exam/connection-status';
import { SubmissionReceipt, type SubmissionReceiptDetails } from '@/components/exam/submission-receipt';
import { encryptAndStore, decryptAndLoad, clearStored } from '@/components/exam/crypto-utils';
import { maskCandidateIdentifier } from '@/lib/exam-receipt';

interface ExamClientProps {
  attemptId: string;
}

const DUPLICATE_ACTIVE_SESSION_CODE = 'DUPLICATE_ACTIVE_SESSION';
const DUPLICATE_ACTIVE_SESSION_MESSAGE = 'A duplicate active session cannot be opened';
const INTERRUPTED_SESSION_REQUIRES_STAFF_CODE = 'INTERRUPTED_SESSION_REQUIRES_STAFF';

function timestampNow() {
  return Date.now();
}

type SyncAnswerPayload = {
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount: number;
  timeSpentSecs: number;
  visitCount: number;
  answerChanges: number;
};

type LocalExamProgress = {
  responses: Record<string, any>;
  flagged: string[];
  currentIndex: number;
  responseTimestamps: Record<string, number>;
  timeSpentSecs: Record<string, number>;
  visitCount: Record<string, number>;
  answerChanges: Record<string, number>;
  timestamp: number;
};

const localProgressKey = (attemptId: string) => `exam-progress:${attemptId}`;
const violationCountKey = (attemptId: string) => `exam-violations:${attemptId}`;

function readLocalProgress(attemptId: string): LocalExamProgress | null {
  try {
    const stored = localStorage.getItem(localProgressKey(attemptId));
    if (!stored) return null;
    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed as Record<string, unknown>;
    if (
      !value.responses || typeof value.responses !== 'object'
      || !Array.isArray(value.flagged)
      || typeof value.currentIndex !== 'number'
      || typeof value.timestamp !== 'number'
    ) return null;
    return {
      responses: value.responses as Record<string, any>,
      flagged: value.flagged.filter((id): id is string => typeof id === 'string'),
      currentIndex: Math.max(0, Math.floor(value.currentIndex)),
      responseTimestamps: value.responseTimestamps && typeof value.responseTimestamps === 'object'
        ? value.responseTimestamps as Record<string, number>
        : {},
      timeSpentSecs: value.timeSpentSecs && typeof value.timeSpentSecs === 'object'
        ? value.timeSpentSecs as Record<string, number>
        : {},
      visitCount: value.visitCount && typeof value.visitCount === 'object'
        ? value.visitCount as Record<string, number>
        : {},
      answerChanges: value.answerChanges && typeof value.answerChanges === 'object'
        ? value.answerChanges as Record<string, number>
        : {},
      timestamp: value.timestamp,
    };
  } catch (error) {
    console.error('Unable to read local exam progress:', error);
    return null;
  }
}

function saveEncryptedProgress(
  attemptId: string,
  credential: string,
  candidateId: string,
  progress: LocalExamProgress,
) {
  void encryptAndStore(attemptId, credential, candidateId, progress);
}

function hasMatchingSyncResponse(
  payload: SyncAnswerPayload[],
  data: unknown,
): data is { responses: SyncAnswerPayload[]; syncedAt: string } {
  if (!data || typeof data !== 'object') return false;
  const result = data as Record<string, unknown>;
  if (
    !Array.isArray(result.responses)
    || typeof result.syncedAt !== 'string'
    || !Number.isFinite(Date.parse(result.syncedAt))
    || result.responses.length !== payload.length
  ) return false;

  const savedResponses = result.responses as Array<Record<string, unknown>>;
  return payload.every((expected) => {
    const saved = savedResponses.find((response) => response.questionId === expected.questionId);
    return !!saved
      && saved.currentText === expected.currentText
      && saved.selectedOptionId === expected.selectedOptionId
      && saved.wordCount === expected.wordCount
      && saved.timeSpentSecs === expected.timeSpentSecs
      && saved.visitCount === expected.visitCount
      && saved.answerChanges === expected.answerChanges;
  });
}

export default function ExamClient({ attemptId }: ExamClientProps) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [duplicateSessionBlocked, setDuplicateSessionBlocked] = useState(false);
  const [sessionRequiresStaff, setSessionRequiresStaff] = useState(false);
  const [reactivationRequestState, setReactivationRequestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, any>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [receipt, setReceipt] = useState<SubmissionReceiptDetails | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showCameraNotice, setShowCameraNotice] = useState(true);
  const [securityWarningCount, setSecurityWarningCount] = useState<number | null>(null);
  const [fullscreenCountdown, setFullscreenCountdown] = useState<number | null>(null);
  const [peripheralCountdown, setPeripheralCountdown] = useState<number | null>(null);
  const [securityWarningEvent, setSecurityWarningEvent] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [securitySubmitFailed, setSecuritySubmitFailed] = useState(false);
  const [showIssueReport, setShowIssueReport] = useState(false);
  const [issueCategory, setIssueCategory] = useState('other');
  const [issueDescription, setIssueDescription] = useState('');
  const [issueSending, setIssueSending] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('pending');
  const responsesRef = useRef(responses);
  const currentIndexRef = useRef(currentIndex);
  const flaggedRef = useRef(flagged);
  const submittingRef = useRef(false);
  const credentialRef = useRef<string | null>(null);
  const autoSaveRef = useRef<NodeJS.Timeout | null>(null);
  const syncResponsesRef = useRef<() => Promise<boolean>>(async () => false);
  const syncRequestSequenceRef = useRef(0);
  const eventQueueRef = useRef<Array<{ eventType: MonitoringEventType; detail: string }>>([]);
  const eventFlushRef = useRef<NodeJS.Timeout | null>(null);
  const autoSubmitStartedRef = useRef(false);
  const intentionalExitStartedRef = useRef(false);
  const submitForViolationRef = useRef<(reason?: 'AUTO_SUBMITTED_VIOLATION') => Promise<boolean>>(async () => false);
  const triggerAutoSubmitRef = useRef<(reason?: 'AUTO_SUBMITTED_VIOLATION') => void>(() => {});
  const securityStrikeCountRef = useRef(0);
  const securityWarningEventRef = useRef<string | null>(null);
  const peripheralIssuesRef = useRef(new Set<'camera' | 'microphone'>());
  const fullscreenDeadlineRef = useRef<number | null>(null);
  const peripheralDeadlineRef = useRef<number | null>(null);
  const responseTimestampsRef = useRef<Record<string, number>>({});

  const questionEnterAtRef = useRef<Record<string, number>>({});
  const timeSpentRef = useRef<Record<string, number>>({});
  const visitCountRef = useRef<Record<string, number>>({});
  const answerChangesRef = useRef<Record<string, number>>({});
  const fullscreenRequestedRef = useRef(false);
  const releaseExamTabLockRef = useRef<(() => void) | null>(null);
  const captureSnapshotRef = useRef<((trigger: string) => Promise<void>) | null>(null);

  useEffect(() => {
    responsesRef.current = responses;
    currentIndexRef.current = currentIndex;
    flaggedRef.current = flagged;
  }, [currentIndex, flagged, responses]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (navigator.locks) {
          let acquired = false;
          let releaseLock: (() => void) | undefined;
          for (let retry = 0; retry < 20 && !acquired && !cancelled; retry++) {
            let resolveLockAcquired!: (hasLock: boolean) => void;
            const lockAcquired = new Promise<boolean>((resolve) => {
              resolveLockAcquired = resolve;
            });
            let releaseCurrentLock!: () => void;
            const lockHeld = new Promise<void>((resolve) => {
              releaseCurrentLock = resolve;
            });
            const lockRequest = navigator.locks.request(
              `exam-attempt:${attemptId}`,
              { mode: 'exclusive', ifAvailable: true },
              async (lock) => {
                if (!lock || cancelled) {
                  resolveLockAcquired(false);
                  return;
                }
                releaseLock = releaseCurrentLock;
                resolveLockAcquired(true);
                await lockHeld;
              },
            );
            void lockRequest.catch(() => resolveLockAcquired(false));
            acquired = await lockAcquired;
            if (!acquired && !cancelled && retry < 19) {
              await new Promise((resolve) => setTimeout(resolve, 100));
            }
          }

          if (cancelled) {
            releaseLock?.();
            return;
          }
          if (!acquired) {
            setDuplicateSessionBlocked(true);
            setError(DUPLICATE_ACTIVE_SESSION_MESSAGE);
            return;
          }
          releaseExamTabLockRef.current = releaseLock ?? null;
        }

        const res = await fetch(`/api/attempts/${attemptId}`);
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (res.status === 404) await clearStored(attemptId);
          if (data?.code === DUPLICATE_ACTIVE_SESSION_CODE) {
            setDuplicateSessionBlocked(true);
            setError(DUPLICATE_ACTIVE_SESSION_MESSAGE);
          } else if (data?.code === INTERRUPTED_SESSION_REQUIRES_STAFF_CODE) {
            setDuplicateSessionBlocked(true);
            setSessionRequiresStaff(true);
            setError(data?.error ?? 'Authorized personnel must reactivate this interrupted attempt.');
          } else {
            setError(data?.error ?? 'Failed to load exam');
          }
          return;
        }
        const data = await res.json();
        const rawAttempt = data?.attempt ?? data;
        const statusNormalized = (rawAttempt?.status ?? '').toLowerCase();
        if (statusNormalized === 'abandoned') {
          setSessionRequiresStaff(true);
          setError('This exam was left and requires authorized personnel to reactivate it before you can continue.');
          return;
        }
        if (
          statusNormalized === 'submitted'
          || statusNormalized === 'auto_submitted_violation'
          || statusNormalized === 'timed_out'
        ) {
          setSubmitted(true);
          setTimedOut(statusNormalized === 'timed_out');
          const savedReceipt = rawAttempt?.submissionReceipt ?? rawAttempt?.receipt;
          setReceipt(typeof savedReceipt === 'string' ? {
            receiptId: savedReceipt,
            attemptId: rawAttempt.id,
            candidateIdentifier: maskCandidateIdentifier(rawAttempt.candidateId),
            status: statusNormalized,
            submittedAt: rawAttempt.submittedAt ? new Date(rawAttempt.submittedAt).toISOString() : 'Unavailable',
          } : null);
          setLoading(false);
          return;
        }
        const storedViolations = Number.parseInt(
          localStorage.getItem(violationCountKey(attemptId)) ?? '0',
          10,
        );
        securityStrikeCountRef.current = Number.isSafeInteger(storedViolations) && storedViolations > 0
          ? storedViolations
          : 0;
        let credential = '';
        if (rawAttempt?.status === 'in_progress') {
          credential = window.prompt('Re-enter your account password to unlock this examination and its local response cache') ?? '';
          if (!credential) { setError('A password is required to start or resume this examination.'); return; }
          const unlock = await fetch(`/api/attempts/${attemptId}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: credential }) });
          if (!unlock.ok) {
            const unlockData = await unlock.json().catch(() => null);
            if (unlockData?.code === DUPLICATE_ACTIVE_SESSION_CODE) {
              setDuplicateSessionBlocked(true);
              setError(DUPLICATE_ACTIVE_SESSION_MESSAGE);
            } else if (unlockData?.code === INTERRUPTED_SESSION_REQUIRES_STAFF_CODE) {
              setDuplicateSessionBlocked(true);
              setSessionRequiresStaff(true);
              setError(unlockData?.error ?? 'Authorized personnel must reactivate this interrupted attempt.');
            } else {
              setError(unlockData?.error ?? 'The password could not be verified. Refresh and try again.');
            }
            return;
          }
          credentialRef.current = credential;
        }
        setAttempt(rawAttempt);

        const existing: Record<string, any> = {};
        (rawAttempt?.responses ?? []).forEach((r: any) => {
          existing[r?.questionId] = {
            selectedOptionId: r?.selectedOptionId ?? null,
            essayText: r?.currentText ?? r?.essayText ?? '',
          };
          timeSpentRef.current[r?.questionId] = r?.timeSpentSecs ?? 0;
          visitCountRef.current[r?.questionId] = r?.visitCount ?? 0;
          answerChangesRef.current[r?.questionId] = r?.answerChanges ?? 0;
        });

        const cached = credentialRef.current && typeof rawAttempt?.candidateId === 'string'
          ? await decryptAndLoad(attemptId, credentialRef.current, rawAttempt.candidateId)
          : null;
        const localProgress = readLocalProgress(attemptId);
        const serverUpdatedAt = rawAttempt?.updatedAt ? new Date(rawAttempt.updatedAt).getTime() : 0;
        const serverResponses = rawAttempt?.responses ?? [];
        const latestServerSavedAt = serverResponses.reduce((latest: number, response: any) => {
          const savedAt = response?.lastSyncedAt ? new Date(response.lastSyncedAt).getTime() : 0;
          return Math.max(latest, Number.isFinite(savedAt) ? savedAt : 0);
        }, serverUpdatedAt);
        const restoredResponses = { ...existing };
        let restoredFlagged = new Set<string>();
        let restoredIndex = 0;
        let localTimestamp = latestServerSavedAt;
        const allowedQuestionIds = new Set<string>(
          (rawAttempt?.assessment?.items ?? []).map((item: any) => item.questionId),
        );

        if (cached) {
          for (const [questionId, response] of Object.entries(cached.responses)) {
            if (!allowedQuestionIds.has(questionId)) continue;
            const serverResponse = serverResponses.find((item: any) => item.questionId === questionId);
            const serverSavedAt = serverResponse?.lastSyncedAt
              ? new Date(serverResponse.lastSyncedAt).getTime()
              : serverUpdatedAt;
            const localSavedAt = cached.responseTimestamps?.[questionId] ?? cached.timestamp;
            if (localSavedAt >= serverSavedAt) {
              restoredResponses[questionId] = response;
              responseTimestampsRef.current[questionId] = localSavedAt;
            }
          }
          if (cached.timestamp > localTimestamp) {
            restoredFlagged = new Set(cached.flagged);
            restoredIndex = cached.currentIndex ?? restoredIndex;
            localTimestamp = cached.timestamp;
            Object.assign(timeSpentRef.current, cached.timeSpentSecs ?? {});
            Object.assign(visitCountRef.current, cached.visitCount ?? {});
            Object.assign(answerChangesRef.current, cached.answerChanges ?? {});
          }
          Object.assign(responseTimestampsRef.current, cached.responseTimestamps ?? {});
        }
        if (localProgress) {
          for (const [questionId, response] of Object.entries(localProgress.responses)) {
            if (!allowedQuestionIds.has(questionId)) continue;
            const serverResponse = serverResponses.find((item: any) => item.questionId === questionId);
            const serverSavedAt = serverResponse?.lastSyncedAt
              ? new Date(serverResponse.lastSyncedAt).getTime()
              : serverUpdatedAt;
            const localSavedAt = localProgress.responseTimestamps[questionId] ?? localProgress.timestamp;
            if (localSavedAt >= serverSavedAt) {
              restoredResponses[questionId] = response;
              responseTimestampsRef.current[questionId] = localSavedAt;
            }
          }
          if (localProgress.timestamp > latestServerSavedAt && localProgress.timestamp >= localTimestamp) {
            restoredFlagged = new Set(localProgress.flagged);
            restoredIndex = localProgress.currentIndex;
            localTimestamp = localProgress.timestamp;
            Object.assign(timeSpentRef.current, localProgress.timeSpentSecs);
            Object.assign(visitCountRef.current, localProgress.visitCount);
            Object.assign(answerChangesRef.current, localProgress.answerChanges);
          }
        }
        const questionCount = rawAttempt?.presentationMappings?.length
          || rawAttempt?.assessment?.items?.length
          || 1;
        const safeIndex = Math.min(restoredIndex, Math.max(0, questionCount - 1));
        responsesRef.current = restoredResponses;
        flaggedRef.current = restoredFlagged;
        currentIndexRef.current = safeIndex;
        setResponses(restoredResponses);
        setFlagged(restoredFlagged);
        setCurrentIndex(safeIndex);
        setSessionRestored(Boolean(cached || localProgress || serverResponses.length > 0));
      } catch (e: any) {
        setError(e?.message ?? 'Error loading exam');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      releaseExamTabLockRef.current?.();
      releaseExamTabLockRef.current = null;
    };
  }, [attemptId]);

  const assessmentItems = attempt?.assessment?.items ?? [];
  const presentationList = attempt?.presentationMappings ?? [];

  const sortedMappings = useMemo(() => {
    const result = presentationList.length > 0
      ? [...presentationList]
          .sort((a: any, b: any) => (a?.displayPosition ?? a?.displayOrder ?? 0) - (b?.displayPosition ?? b?.displayOrder ?? 0))
          .map((pm: any) => {
            const item = assessmentItems.find((entry: any) => entry.questionId === pm.questionId);
            return {
              ...pm,
              marks: item?.maxMark ?? pm?.marks ?? 0,
              question: pm.question ?? item?.question,
            };
          })
      : [...assessmentItems]
          .sort((a: any, b: any) => (a?.displayOrder ?? 0) - (b?.displayOrder ?? 0))
          .map((entry: any) => ({
            questionId: entry.questionId,
            displayPosition: entry.displayOrder,
            marks: entry.maxMark,
            question: entry.question,
          }));

    return result.map((mapping: any) => {
      const order = mapping?.optionOrderJson ? JSON.parse(mapping.optionOrderJson) : null;
      if (!Array.isArray(order) || !mapping?.question?.options?.length) return mapping;

      const optionMap = new Map((mapping.question.options ?? []).map((o: any) => [o.id, o]));
      const orderedOptions = order.map((id: string) => optionMap.get(id)).filter(Boolean);
      const leftovers = (mapping.question.options ?? []).filter((o: any) => !order.includes(o.id));

      return {
        ...mapping,
        question: {
          ...mapping.question,
          options: [...orderedOptions, ...leftovers],
        },
      };
    });
  }, [assessmentItems, presentationList]);

  const currentMapping = sortedMappings[currentIndex];
  const currentQuestion = currentMapping?.question;
  const totalQuestions = sortedMappings.length;

  const persistLocalProgress = useCallback((
    nextResponses = responsesRef.current,
    nextIndex = currentIndexRef.current,
    nextFlagged = flaggedRef.current,
  ) => {
    const snapshot: LocalExamProgress = {
      responses: nextResponses,
      flagged: Array.from(nextFlagged),
      currentIndex: nextIndex,
      responseTimestamps: responseTimestampsRef.current,
      timeSpentSecs: timeSpentRef.current,
      visitCount: visitCountRef.current,
      answerChanges: answerChangesRef.current,
      timestamp: Date.now(),
    };
    try {
      localStorage.setItem(localProgressKey(attemptId), JSON.stringify(snapshot));
    } catch (storageError) {
      console.error('Unable to persist local exam progress:', storageError);
    }
  }, [attemptId]);

  useEffect(() => {
    const qId = currentMapping?.questionId;
    if (loading || !qId) return;

    visitCountRef.current[qId] = (visitCountRef.current[qId] ?? 0) + 1;
    questionEnterAtRef.current[qId] = Date.now();

    return () => {
      const startedAt = questionEnterAtRef.current[qId];
      if (!startedAt) return;
      const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
      timeSpentRef.current[qId] = (timeSpentRef.current[qId] ?? 0) + elapsed;
      delete questionEnterAtRef.current[qId];
      persistLocalProgress();
    };
  }, [currentMapping?.questionId, loading, persistLocalProgress]);

  const endTime = attempt?.expiresAt ?? attempt?.endTime ?? null;
  const handleExpire = useCallback(() => {
    if (!submitted) void submitForViolationRef.current();
  }, [submitted]);
  const { formatted, isUrgent, isCritical } = useExamTimer(endTime, handleExpire, attempt?.serverTime);

  const buildResponsePayload = useCallback(() => {
    return Object.entries(responses ?? {}).map(([questionId, response]: [string, any]) => {
      const currentText = response?.essayText ?? response?.currentText ?? null;
      return {
        questionId,
        selectedOptionId: response?.selectedOptionId ?? null,
        currentText,
        wordCount: currentText ? currentText.trim().split(/\s+/).filter(Boolean).length : 0,
        timeSpentSecs: timeSpentRef.current[questionId] ?? 0,
        visitCount: visitCountRef.current[questionId] ?? 0,
        answerChanges: answerChangesRef.current[questionId] ?? 0,
      };
    });
  }, [responses]);

  useEffect(() => {
    if (!attempt || submitted || loading) return;
    persistLocalProgress();
  }, [attempt, currentIndex, flagged, loading, persistLocalProgress, responses, submitted]);

  useEffect(() => {
    if (!sessionRestored) return;
    const timer = window.setTimeout(() => setSessionRestored(false), 5000);
    return () => window.clearTimeout(timer);
  }, [sessionRestored]);

  useEffect(() => {
    if (!attempt || submitted || loading) return;
    const interval = window.setInterval(() => {
      const questionId = currentMapping?.questionId;
      const startedAt = questionId ? questionEnterAtRef.current[questionId] : undefined;
      if (questionId && startedAt) {
        timeSpentRef.current[questionId] = (timeSpentRef.current[questionId] ?? 0)
          + Math.max(0, Math.round((Date.now() - startedAt) / 1000));
        questionEnterAtRef.current[questionId] = Date.now();
      }
      persistLocalProgress();
      if (credentialRef.current && typeof attempt.candidateId === 'string') {
        saveEncryptedProgress(attemptId, credentialRef.current, attempt.candidateId, {
          responses: responsesRef.current,
          flagged: Array.from(flaggedRef.current),
          currentIndex: currentIndexRef.current,
          responseTimestamps: responseTimestampsRef.current,
          timeSpentSecs: timeSpentRef.current,
          visitCount: visitCountRef.current,
          answerChanges: answerChangesRef.current,
          timestamp: timestampNow(),
        });
      }
    }, 5000);
    return () => window.clearInterval(interval);
  }, [attempt, attemptId, currentMapping?.questionId, loading, persistLocalProgress, submitted]);

  const clearLocalProgress = useCallback(() => {
    try {
      localStorage.removeItem(localProgressKey(attemptId));
      localStorage.removeItem(violationCountKey(attemptId));
    } catch (storageError) {
      console.error('Unable to clear local exam progress:', storageError);
    }
  }, [attemptId]);

  const leaveAfterSubmission = useCallback(async (destination: string) => {
    if (intentionalExitStartedRef.current || submitted) return;
    intentionalExitStartedRef.current = true;
    try {
      const response = await fetch(`/api/attempts/${attemptId}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: buildResponsePayload() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Unable to save and end this exam.');
      setSubmitted(true);
      await clearStored(attemptId);
      clearLocalProgress();
    } catch (exitError) {
      intentionalExitStartedRef.current = false;
      setSyncError(exitError instanceof Error ? exitError.message : 'Unable to save and end this exam.');
      return;
    }

    if (destination.startsWith('http://') || destination.startsWith('https://')) {
      const url = new URL(destination, window.location.href);
      if (url.origin === window.location.origin) {
        router.push(`${url.pathname}${url.search}${url.hash}`);
      } else {
        window.location.assign(url.href);
      }
    } else {
      router.replace('/dashboard/my-exams');
    }
  }, [attemptId, buildResponsePayload, clearLocalProgress, router, submitted]);

  const handleBrowserEvent = useCallback((eventType: MonitoringEventType, detail: string) => {
    if (eventType === 'CAMERA_FEED_RESTORED' || eventType === 'MICROPHONE_FEED_RESTORED') {
      peripheralIssuesRef.current.delete(eventType === 'CAMERA_FEED_RESTORED' ? 'camera' : 'microphone');
      if (peripheralIssuesRef.current.size === 0) {
        peripheralDeadlineRef.current = null;
        setPeripheralCountdown(null);
      }
      eventQueueRef.current.push({ eventType, detail });
      return;
    }
    const isPeripheralViolation = [
      'CAMERA_FEED_LOSS',
      'CAMERA_PERMISSION_DENIED',
      'MICROPHONE_FEED_LOSS',
      'MICROPHONE_PERMISSION_DENIED',
    ].includes(eventType);
    const criticalViolation = eventType === 'MULTI_DISPLAY_DETECTED'
      || eventType === 'DEVTOOLS_TAMPERING'
      || (eventType === 'KEYBOARD_SHORTCUT' && /developer tools/i.test(detail));
    const peripheralType = eventType === 'CAMERA_FEED_LOSS' || eventType === 'CAMERA_PERMISSION_DENIED'
      ? 'camera'
      : eventType === 'MICROPHONE_FEED_LOSS' || eventType === 'MICROPHONE_PERMISSION_DENIED'
        ? 'microphone'
        : null;
    const isNewPeripheralIssue = peripheralType !== null && !peripheralIssuesRef.current.has(peripheralType);
    const isViolation = !submittingRef.current && !submitted && ![
      'TAB_RETURN',
      'WINDOW_FOCUS',
      'INTENTIONAL_NAVIGATION',
      'BACK_NAVIGATION',
      'MICROPHONE_FEED_RESTORED',
    ].includes(eventType) && (!isPeripheralViolation || isNewPeripheralIssue);
    let eventDetail = detail;
    if (isViolation) {
      const strike = Math.min(3, securityStrikeCountRef.current + 1);
      securityStrikeCountRef.current = strike;
      setSecurityWarningCount(strike);
      const eventName = eventType === 'KEYBOARD_SHORTCUT' && /developer tools/i.test(detail)
        ? 'developer tools attempt'
        : eventType.split('_').join(' ').toLowerCase();
      securityWarningEventRef.current = eventName;
      setSecurityWarningEvent(eventName);
      eventDetail = `${detail} (violation ${strike} of 3${criticalViolation ? '; critical' : ''})`;
      try {
        localStorage.setItem(violationCountKey(attemptId), String(strike));
      } catch (storageError) {
        console.error('Unable to persist exam violation count:', storageError);
      }
      if (eventType === 'FULLSCREEN_EXIT') {
        fullscreenDeadlineRef.current = Date.now() + 10_000;
        setFullscreenCountdown(10);
      }
      if (isPeripheralViolation && peripheralType) {
        peripheralIssuesRef.current.add(peripheralType);
        if (peripheralIssuesRef.current.size === 1) {
          peripheralDeadlineRef.current = Date.now() + 60_000;
          setPeripheralCountdown(60);
        }
      }
      if (criticalViolation || strike >= 3) triggerAutoSubmitRef.current('AUTO_SUBMITTED_VIOLATION');
    }
    eventQueueRef.current.push({ eventType, detail: eventDetail });
    if (['TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT', 'BACK_NAVIGATION'].includes(eventType)) {
      captureSnapshotRef.current?.(eventType);
    }

    if (eventType === 'INTENTIONAL_NAVIGATION') {
      void leaveAfterSubmission(detail);
      return;
    }
    if (eventType === 'BACK_NAVIGATION') {
      void leaveAfterSubmission('/dashboard/my-exams');
      return;
    }
    const isFocusLoss = ['TAB_SWITCH', 'WINDOW_BLUR', 'FULLSCREEN_EXIT'].includes(eventType);
    if (isFocusLoss || eventType === 'TAB_RETURN' || eventType === 'WINDOW_FOCUS') return;

  }, [attemptId, leaveAfterSubmission, submitted]);

  const { videoRef, hasPermission, captureSnapshot } = useWebcam({
    active: !submitted && !!attempt,
    attemptId,
    onEvent: handleBrowserEvent,
  });

  useEffect(() => {
    captureSnapshotRef.current = captureSnapshot;
  }, [captureSnapshot]);

  useBrowserMonitor(!submitted && !!attempt && !loading, handleBrowserEvent);
  const connection = useConnectionStatus(!submitted && !!attempt, syncState);

  useEffect(() => {
    if (submitted || !attempt || loading) return;
    const handleFullscreenChange = () => {
      if (document.fullscreenElement) {
        fullscreenDeadlineRef.current = null;
        setFullscreenCountdown(null);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [attempt, submitted]);

  useEffect(() => {
    if (fullscreenCountdown === null || submitted) return;
    const deadline = fullscreenDeadlineRef.current;
    if (deadline === null) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setFullscreenCountdown(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        fullscreenDeadlineRef.current = null;
        setFullscreenCountdown(null);
        triggerAutoSubmitRef.current('AUTO_SUBMITTED_VIOLATION');
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [fullscreenCountdown, submitted]);

  useEffect(() => {
    if (peripheralCountdown === null || submitted) return;
    const deadline = peripheralDeadlineRef.current;
    if (deadline === null) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setPeripheralCountdown(remaining);
      if (remaining === 0) {
        window.clearInterval(timer);
        peripheralDeadlineRef.current = null;
        setPeripheralCountdown(null);
        triggerAutoSubmitRef.current('AUTO_SUBMITTED_VIOLATION');
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [peripheralCountdown, submitted]);

  useEffect(() => {
    if (submitted || loading || attempt?.status !== 'in_progress') return;

    const submitOnPageExit = () => {
      if (intentionalExitStartedRef.current) return;
      const activeQuestionId = currentMapping?.questionId;
      const startedAt = activeQuestionId ? questionEnterAtRef.current[activeQuestionId] : undefined;
      if (activeQuestionId && startedAt) {
        timeSpentRef.current[activeQuestionId] = (timeSpentRef.current[activeQuestionId] ?? 0)
          + Math.max(0, Math.round((Date.now() - startedAt) / 1000));
        questionEnterAtRef.current[activeQuestionId] = Date.now();
      }
      persistLocalProgress();
      if (credentialRef.current && typeof attempt?.candidateId === 'string') {
        saveEncryptedProgress(attemptId, credentialRef.current, attempt.candidateId, {
          responses: responsesRef.current,
          flagged: Array.from(flaggedRef.current),
          currentIndex: currentIndexRef.current,
          responseTimestamps: responseTimestampsRef.current,
          timeSpentSecs: timeSpentRef.current,
          visitCount: visitCountRef.current,
          answerChanges: answerChangesRef.current,
          timestamp: timestampNow(),
        });
      }
      const payload = new Blob([JSON.stringify({ responses: buildResponsePayload() })], { type: 'application/json' });

      const endpoint = `/api/attempts/${attemptId}/sync`;
      if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(endpoint, payload)) return;

      void fetch(endpoint, {
        method: 'POST',
        body: payload,
        keepalive: true,
      }).catch((saveError) => console.error('Unable to queue exam save while leaving:', saveError));
    };

    window.addEventListener('pagehide', submitOnPageExit);
    return () => window.removeEventListener('pagehide', submitOnPageExit);
  }, [attempt?.candidateId, attempt?.status, attemptId, buildResponsePayload, currentMapping?.questionId, loading, persistLocalProgress, submitted]);

  useEffect(() => {
    if (submitted || !attempt || loading) return;
    const record = (eventType: string) => {
      void fetch(`/api/attempts/${attemptId}/time-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType, reason: 'Exam interaction state changed' }),
      });
    };
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    let pageHiding = false;
    let hasBeenHidden = false;
    let hasLostWindowFocus = false;
    const handleVisibility = () => {
      if (document.hidden) {
        if (focusTimer) clearTimeout(focusTimer);
        focusTimer = setTimeout(() => {
          focusTimer = undefined;
          if (!pageHiding && document.hidden) {
            hasBeenHidden = true;
            record('paused_tab_hidden');
          }
        }, 250);
      } else {
        if (focusTimer) clearTimeout(focusTimer);
        focusTimer = undefined;
        if (hasBeenHidden) {
          hasBeenHidden = false;
          record('resumed_tab_visible');
        }
      }
    };
    const handleBlur = () => {
      if (document.hidden) return;
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = setTimeout(() => {
        focusTimer = undefined;
        if (!pageHiding && !document.hidden) {
          hasLostWindowFocus = true;
          record('paused_window_blur');
        }
      }, 250);
    };
    const handleFocus = () => {
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = undefined;
      if (hasLostWindowFocus) {
        hasLostWindowFocus = false;
        record('resumed_window_focus');
      }
    };
    const handlePageHide = () => {
      pageHiding = true;
      if (focusTimer) clearTimeout(focusTimer);
      focusTimer = undefined;
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      if (focusTimer) clearTimeout(focusTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [attemptId, attempt, loading, submitted]);

  useEffect(() => {
    if (submitted || loading || attempt?.status !== 'in_progress') return;
    const timer = setTimeout(async () => {
      try {
        const payload = buildResponsePayload();
        const response = await fetch(`/api/attempts/${attemptId}/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ responses: payload }),
        });
        if (!response.ok) {
          const data = await response.json();
          setSyncError(data?.error ?? 'Unable to save your latest answer.');
          setSyncState('failed');
          return;
        }
        const data = await response.json();
        if (!hasMatchingSyncResponse(payload, data)) {
          setSyncError('The server did not confirm the exact answers saved.');
          setSyncState('failed');
          return;
        }
        setLastSaved(Date.parse(data.syncedAt));
        setSyncError(null);
        setSyncState('server-confirmed');
      } catch (saveError) {
        console.error('Debounced exam response save failed:', saveError);
        setSyncError('Unable to save your latest answer. Check your connection.');
        setSyncState('failed');
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [attempt?.status, attemptId, buildResponsePayload, loading, submitted]);

  useEffect(() => {
    if (submitted || loading) return;
    eventFlushRef.current = setInterval(async () => {
      const events = eventQueueRef.current.splice(0);
      if (events.length === 0) return;
      for (const ev of events) {
        try {
          const response = await fetch('/api/monitoring/events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ attemptId, eventType: ev.eventType, detail: ev.detail }),
          });
          if (!response.ok) throw new Error(`Monitoring event request failed with ${response.status}`);
        } catch (eventError) {
          console.error('Unable to persist exam monitoring event:', eventError);
          eventQueueRef.current.unshift(ev);
        }
      }
    }, 5000);

    return () => {
      if (eventFlushRef.current) clearInterval(eventFlushRef.current);
    };
  }, [attemptId, loading, submitted]);

  useEffect(() => {
    if (submitted || loading || attempt?.status !== 'in_progress') return;
    autoSaveRef.current = setInterval(() => {
      void syncResponsesRef.current();
    }, 7000);

    return () => {
      if (autoSaveRef.current) clearInterval(autoSaveRef.current);
    };
  }, [attempt?.status, loading, submitted]);

  useEffect(() => {
    if (!attemptId || submitted || loading) return;
    const timer = setTimeout(() => {
      if (!credentialRef.current || typeof attempt?.candidateId !== 'string') return;
      saveEncryptedProgress(attemptId, credentialRef.current, attempt.candidateId, {
        responses,
        flagged: Array.from(flagged),
        currentIndex,
        responseTimestamps: responseTimestampsRef.current,
        timeSpentSecs: timeSpentRef.current,
        visitCount: visitCountRef.current,
        answerChanges: answerChangesRef.current,
        timestamp: timestampNow(),
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [responses, flagged, currentIndex, attemptId, attempt?.candidateId, loading, submitted]);

  async function syncResponses(): Promise<boolean> {
    if (submitted) return false;
    const requestSequence = ++syncRequestSequenceRef.current;

    const activeQuestionId = currentMapping?.questionId;
    if (activeQuestionId && questionEnterAtRef.current[activeQuestionId]) {
      const elapsed = Math.max(0, Math.round((Date.now() - questionEnterAtRef.current[activeQuestionId]) / 1000));
      timeSpentRef.current[activeQuestionId] = (timeSpentRef.current[activeQuestionId] ?? 0) + elapsed;
      questionEnterAtRef.current[activeQuestionId] = Date.now();
    }

    setSaving(true);
    setSyncState('synchronizing');
    setSyncError(null);
    try {
      const payload = buildResponsePayload();

      const res = await fetch(`/api/attempts/${attemptId}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ responses: payload }),
      });
      if (res.ok) {
        const data = await res.json();
        if (requestSequence !== syncRequestSequenceRef.current) return true;
        if (!hasMatchingSyncResponse(payload, data)) {
          setSyncError('The server did not confirm the exact answers saved.');
          setSyncState('failed');
          return false;
        }
        setLastSaved(Date.parse(data.syncedAt));
        setSyncError(null);
        setSyncState('server-confirmed');
        return true;
      } else {
        const data = await res.json();
        if (requestSequence !== syncRequestSequenceRef.current) return true;
        if (data?.code === DUPLICATE_ACTIVE_SESSION_CODE) {
          setDuplicateSessionBlocked(true);
        }
        setSyncError(data?.error ?? 'Sync failed');
        setSyncState('failed');
        return false;
      }
    } catch (saveError) {
      if (requestSequence !== syncRequestSequenceRef.current) return true;
      console.error('Unable to sync exam responses:', saveError);
      setSyncError('Network error - responses saved locally');
      setSyncState('failed');
      return false;
    } finally {
      if (requestSequence === syncRequestSequenceRef.current) setSaving(false);
    }
  }

  useEffect(() => {
    syncResponsesRef.current = syncResponses;
  }, [syncResponses]);

  useEffect(() => {
    if (submitted || loading || attempt?.status !== 'in_progress') return;
    const handleOnline = () => {
      void syncResponsesRef.current();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [attempt?.status, submitted]);

  async function handleSubmit(reason?: 'AUTO_SUBMITTED_VIOLATION') {
    if (submittingRef.current || submitting || submitted) return false;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const activeQuestionId = currentMapping?.questionId;
      if (activeQuestionId && questionEnterAtRef.current[activeQuestionId]) {
        const elapsed = Math.max(0, Math.round((Date.now() - questionEnterAtRef.current[activeQuestionId]) / 1000));
        timeSpentRef.current[activeQuestionId] = (timeSpentRef.current[activeQuestionId] ?? 0) + elapsed;
        questionEnterAtRef.current[activeQuestionId] = Date.now();
      }
      const res = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: buildResponsePayload(),
          ...(reason ? {
            reason,
            violationCount: securityStrikeCountRef.current,
            violationType: securityWarningEventRef.current,
          } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data?.status === 'timed_out') {
          setSubmitted(true);
          setTimedOut(true);
          setReceipt(null);
          await clearStored(attemptId);
          clearLocalProgress();
          return true;
        }
        if (
          typeof data?.receiptId !== 'string'
          || typeof data?.attemptId !== 'string'
          || typeof data?.candidateIdentifier !== 'string'
          || typeof data?.status !== 'string'
          || typeof data?.submittedAt !== 'string'
          || !Number.isFinite(Date.parse(data.submittedAt))
        ) {
          throw new Error('The server returned an incomplete submission receipt.');
        }
        setSubmitted(true);
        setReceipt({
          receiptId: data.receiptId,
          attemptId: data.attemptId,
          candidateIdentifier: data.candidateIdentifier,
          status: data.status,
          submittedAt: new Date(data.submittedAt).toISOString(),
        });
        await clearStored(attemptId);
        clearLocalProgress();
        return true;
      } else {
        if (data?.code === DUPLICATE_ACTIVE_SESSION_CODE) {
          setDuplicateSessionBlocked(true);
        }
        setSyncError(data?.error ?? 'Submission failed');
        return false;
      }
    } catch (e: any) {
      setSyncError(e?.message ?? 'Submission error');
      return false;
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  useEffect(() => {
    submitForViolationRef.current = handleSubmit;
    triggerAutoSubmitRef.current = (reason) => {
      if (autoSubmitStartedRef.current || submitted) return;
      autoSubmitStartedRef.current = true;
      setSecuritySubmitFailed(false);
      void submitForViolationRef.current(reason).then((didSubmit) => {
        if (!didSubmit && !submitted) {
          autoSubmitStartedRef.current = false;
          setSecuritySubmitFailed(true);
        }
      });
    };
  }, [handleSubmit, submitted]);

  useEffect(() => {
    if (!submitted && attempt?.status === 'in_progress' && securityStrikeCountRef.current >= 3) {
      triggerAutoSubmitRef.current('AUTO_SUBMITTED_VIOLATION');
    }
  }, [attempt?.status, submitted]);

  function retrySecuritySubmission() {
    setSecuritySubmitFailed(false);
    triggerAutoSubmitRef.current('AUTO_SUBMITTED_VIOLATION');
  }

  function returnToExam() {
    setSecurityWarningCount(null);
    if (fullscreenCountdown !== null && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      void document.documentElement.requestFullscreen().catch((fullscreenError) => {
        console.error('Unable to restore exam fullscreen mode:', fullscreenError);
      });
    }
  }

  async function requestStaffReactivation() {
    if (reactivationRequestState === 'sending' || reactivationRequestState === 'sent') return;
    setReactivationRequestState('sending');
    try {
      const response = await fetch(`/api/attempts/${attemptId}/reactivation-request`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Unable to send the reactivation request.');
      setReactivationRequestState('sent');
    } catch (requestError) {
      console.error('Exam reactivation request failed:', requestError);
      setReactivationRequestState('error');
    }
  }

  async function resumeAfterStaffReactivation() {
    try {
      const response = await fetch(`/api/attempts/${attemptId}/recover-session`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? 'Authorized personnel have not reactivated this attempt yet.');
      window.location.reload();
    } catch (recoveryError) {
      setError(recoveryError instanceof Error ? recoveryError.message : 'Unable to resume the reactivated attempt.');
    }
  }

  useEffect(() => {
    async function requestFullscreen() {
      if (!attempt || submitted || fullscreenRequestedRef.current || showCameraNotice) return;
      if (!document.documentElement?.requestFullscreen) return;

      try {
        await document.documentElement.requestFullscreen();
        fullscreenRequestedRef.current = true;
      } catch (fullscreenError) {
        console.error('Unable to enter exam fullscreen mode:', fullscreenError);
      }
    }

    void requestFullscreen();
  }, [attempt, submitted, showCameraNotice]);

  function updateResponse(questionId: string, update: any) {
    const previous = responsesRef.current?.[questionId] ?? {};
    const merged = { ...previous, ...update };

    const selectedChanged = merged.selectedOptionId !== previous.selectedOptionId;
    const textChanged = (merged.essayText ?? '') !== (previous.essayText ?? '');
    if (selectedChanged || textChanged) {
      answerChangesRef.current[questionId] = (answerChangesRef.current[questionId] ?? 0) + 1;
    }

    const nextResponses = {
      ...(responsesRef.current ?? {}),
      [questionId]: merged,
    };
    responseTimestampsRef.current[questionId] = timestampNow();
    responsesRef.current = nextResponses;
    persistLocalProgress(nextResponses);
    setResponses(nextResponses);
    setSyncState('pending');
  }

  function navigateToQuestion(index: number) {
    const nextIndex = Math.max(0, Math.min(totalQuestions - 1, index));
    currentIndexRef.current = nextIndex;
    persistLocalProgress(responsesRef.current, nextIndex, flaggedRef.current);
    setCurrentIndex(nextIndex);
  }

  async function submitIssueReport() {
    if (issueSending) return;
    setIssueSending(true);
    try {
      const response = await fetch('/api/issue-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          category: issueCategory,
          description: issueDescription,
          telemetry: {
            online: navigator.onLine,
            lastSuccessfulSynchronization: lastSaved,
            unconfirmedResponseCount: Object.keys(responses ?? {}).length,
            latestSyncError: syncError,
            latencyMs: connection.latencyMs,
            capturedAt: new Date().toISOString(),
          },
        }),
      });
      if (!response.ok) throw new Error('Issue report could not be sent');
      setIssueDescription('');
      setShowIssueReport(false);
    } catch (reportError) {
      setSyncError(reportError instanceof Error ? reportError.message : 'Issue report could not be sent');
    } finally {
      setIssueSending(false);
    }
  }

  function toggleFlag(questionId: string) {
    const next = new Set(flaggedRef.current);
    if (next.has(questionId)) next.delete(questionId);
    else next.add(questionId);
    flaggedRef.current = next;
    persistLocalProgress(responsesRef.current, currentIndexRef.current, next);
    setFlagged(next);
  }

  function isAnswered(questionId: string) {
    const r = responses?.[questionId];
    return !!(r?.selectedOptionId || r?.essayText?.trim?.());
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Loading exam...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md rounded-xl bg-card p-8 shadow-lg" role={duplicateSessionBlocked ? 'alert' : undefined}>
          <AlertTriangle className={`h-12 w-12 mx-auto ${duplicateSessionBlocked ? 'text-amber-500' : 'text-destructive'}`} />
          <h1 className="mt-4 text-xl font-bold text-foreground">
            {duplicateSessionBlocked ? DUPLICATE_ACTIVE_SESSION_MESSAGE : 'Unable to open examination'}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {duplicateSessionBlocked
              ? sessionRequiresStaff
                ? 'This attempt appears to have been interrupted. It is locked and can only be resumed after authorized personnel reactivate it.'
                : 'Another active exam copy was detected. Close the other copy and try again. This attempt has not been terminated.'
              : error}
          </p>
          {sessionRequiresStaff && (
            <>
              <button
                type="button"
                onClick={requestStaffReactivation}
                disabled={reactivationRequestState === 'sending' || reactivationRequestState === 'sent'}
                className="mt-5 w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
              >
                {reactivationRequestState === 'sending'
                  ? 'Sending request...'
                  : reactivationRequestState === 'sent'
                    ? 'Reactivation request sent'
                    : 'Request staff reactivation'}
              </button>
              {reactivationRequestState === 'sent' && (
                <p className="mt-3 text-sm text-muted-foreground" role="status">
                  Authorized personnel must reactivate your attempt. After approval, choose “Check approval and resume.”
                </p>
              )}
              {reactivationRequestState === 'error' && (
                <p className="mt-3 text-sm text-destructive" role="alert">
                  Your request could not be sent. Check your connection and try again.
                </p>
              )}
              {reactivationRequestState === 'sent' && (
                <button
                  type="button"
                  onClick={resumeAfterStaffReactivation}
                  className="mt-3 w-full rounded-md border border-border px-4 py-2 font-medium text-foreground"
                >
                  Check approval and resume
                </button>
              )}
            </>
          )}
          <button onClick={() => router.push('/dashboard/my-exams')} className="mt-5 px-4 py-2 bg-primary text-primary-foreground rounded-md">
            Back to My Exams
          </button>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md bg-card rounded-lg shadow-lg p-8">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h1 className="text-2xl font-bold mt-4 text-foreground">
            {timedOut ? 'Time expired — exam locked' : receipt?.status === 'AUTO_SUBMITTED_VIOLATION'
              || receipt?.status === 'auto_submitted_violation'
              ? 'Exam automatically submitted'
              : 'Exam Submitted'}
          </h1>
          <p className="text-muted-foreground mt-2">
            {timedOut
              ? 'The examination deadline passed. Only answers saved before expiry were retained.'
              : receipt?.status === 'AUTO_SUBMITTED_VIOLATION' || receipt?.status === 'auto_submitted_violation'
                ? 'Your attempt was automatically submitted after repeated examination security violations.'
              : 'Your answers have been submitted successfully.'}
          </p>
          {receipt && (
            <SubmissionReceipt receipt={receipt} />
          )}
          <button onClick={() => router.push('/dashboard/my-exams')} className="mt-6 px-6 py-2 bg-primary text-primary-foreground rounded-md font-medium hover:bg-primary/90">
            Back to My Exams
          </button>
        </div>
      </div>
    );
  }

  const answeredCount = sortedMappings.filter((m: any) => isAnswered(m?.questionId)).length;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <a href="#exam-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:bg-background focus:p-3">Skip to exam content</a>
      {sessionRestored && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-2 text-center text-sm text-green-900" role="status">
          Session restored successfully. Your answers and remaining time have been recovered.
        </div>
      )}
      {showCameraNotice && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 text-sm text-amber-900">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p>
              Answers are saved automatically. You may switch tabs or leave this page and return to your examination while time remains.
            </p>
            <button
              onClick={() => setShowCameraNotice(false)}
              className="self-end rounded-md bg-amber-600 px-3 py-1 text-white sm:self-auto"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-50 flex flex-wrap items-center gap-x-4 gap-y-2 bg-primary px-3 py-2 text-primary-foreground shadow-md sm:px-4 sm:py-3" aria-label="Examination header">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Monitor className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold">{attempt?.assessment?.title ?? 'Exam'}</h1>
            <p className="truncate text-xs opacity-80">{attempt?.assessment?.course?.code ?? ''}</p>
          </div>
        </div>

        <div data-testid="exam-countdown" className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1 font-mono text-base font-bold sm:px-4 sm:py-1.5 sm:text-lg ${
          isCritical ? 'bg-red-600 animate-pulse' : isUrgent ? 'bg-yellow-600' : 'bg-white/20'
        }`}>
          <Clock className="h-5 w-5" />
          {formatted}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 lg:ml-auto lg:w-auto lg:justify-end">
          <div className="text-xs">
            <span className="opacity-80">Answered:</span>{' '}
            <span className="font-bold">{answeredCount}/{totalQuestions}</span>
          </div>
          <ConnectionStatus connectionState={connection.connectionState} syncState={syncState} latencyMs={connection.latencyMs} />
          <button type="button" onClick={() => setShowIssueReport(true)} className="px-2 py-1 rounded border border-white/30 hover:bg-white/10" aria-label="Report a technical issue">Report issue</button>
          {syncError && <span className="max-w-full break-words text-xs text-yellow-300">⚠ {syncError}</span>}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="hidden w-64 shrink-0 overflow-y-auto border-r border-border bg-card p-4 md:block">
          <h3 className="text-sm font-semibold text-foreground mb-3">Questions</h3>
          <div className="grid grid-cols-5 gap-2">
            {sortedMappings.map((m: any, i: number) => {
              const qId = m?.questionId;
              const isEssay = ['essay', 'legal_problem', 'case_analysis'].includes(m?.question?.type);
              const answered = isAnswered(qId);
              const isFlagged = flagged.has(qId);
              const isCurrent = i === currentIndex;
              return (
                <button key={qId} onClick={() => navigateToQuestion(i)}
                  aria-label={`Question ${i + 1}${isEssay ? ', essay question' : ''}${answered ? ', answered' : ''}${isFlagged ? ', flagged' : ''}`}
                  title={isEssay ? `Question ${i + 1}: Essay` : `Question ${i + 1}`}
                  className={`relative w-10 h-10 rounded-md text-sm font-medium flex items-center justify-center transition-all ${
                    isCurrent ? 'ring-2 ring-primary bg-primary text-primary-foreground' :
                    answered ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}>
                  {i + 1}
                  {isEssay && <span className="absolute -top-1 -right-1 rounded-full bg-amber-500 px-1 text-[9px] font-bold leading-3 text-white">E</span>}
                  {isFlagged && <Flag className="absolute -bottom-1 -right-1 h-3 w-3 text-yellow-500 fill-yellow-500" />}
                </button>
              );
            })}
          </div>
          {sortedMappings.some((mapping: any) => ['essay', 'legal_problem', 'case_analysis'].includes(mapping?.question?.type)) && (
            <p className="mt-2 text-xs text-muted-foreground">E marks an essay or written problem question.</p>
          )}

          <div className="mt-6 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-green-100 border border-green-300" />
              <span className="text-muted-foreground">Answered ({answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded bg-muted border border-border" />
              <span className="text-muted-foreground">Not Answered ({totalQuestions - answeredCount})</span>
            </div>
            <div className="flex items-center gap-2">
              <Flag className="h-4 w-4 text-yellow-500 fill-yellow-500" />
              <span className="text-muted-foreground">Flagged ({flagged.size})</span>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
              <Eye className="h-3 w-3" /> Webcam Monitor
            </p>
            <div className="bg-black rounded-md overflow-hidden aspect-[4/3]">
              <video ref={videoRef} muted playsInline className="w-full h-full object-cover" />
            </div>
            {hasPermission === false && <p className="text-xs text-yellow-600 mt-1">Webcam access denied</p>}
          </div>

          <button onClick={() => setShowConfirm(true)} className="mt-6 w-full py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 flex items-center justify-center gap-2">
            <Send className="h-4 w-4" /> Submit Exam
          </button>
        </div>

        <main id="exam-content" className="min-w-0 flex-1 overflow-y-auto p-3 pb-24 sm:p-6 md:pb-6" tabIndex={-1}>
          {currentQuestion ? (
            <div className="mx-auto max-w-3xl">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                  <span className="bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-bold">Q{currentIndex + 1}</span>
                  <span className="text-sm text-muted-foreground">
                    {(currentQuestion?.type === 'MCQ' || currentQuestion?.type === 'multiple_choice') ? 'Multiple Choice' :
                      (currentQuestion?.type === 'ESSAY' || currentQuestion?.type === 'essay' || currentQuestion?.type === 'legal_problem' || currentQuestion?.type === 'case_analysis') ? 'Essay' : 'Short Answer'}
                  </span>
                  <span className="text-sm font-medium text-primary">
                    {currentMapping?.marks ?? currentQuestion?.marks ?? 0} mark{(currentMapping?.marks ?? currentQuestion?.marks ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
                <button onClick={() => toggleFlag(currentQuestion.id)} className={`flex items-center gap-1 px-3 py-1 rounded-md text-sm ${
                  flagged.has(currentQuestion.id) ? 'bg-yellow-100 text-yellow-700' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}>
                  <Flag className={`h-4 w-4 ${flagged.has(currentQuestion.id) ? 'fill-yellow-500' : ''}`} />
                  {flagged.has(currentQuestion.id) ? 'Flagged' : 'Flag'}
                </button>
              </div>

              <div className="bg-card rounded-lg p-6 shadow-md mb-6">
                <p className="text-foreground text-lg leading-relaxed whitespace-pre-wrap">{currentQuestion?.text ?? ''}</p>
              </div>

              {(currentQuestion?.type === 'MCQ' || currentQuestion?.type === 'multiple_choice') ? (
                <div className="space-y-3">
                  {(currentQuestion?.options ?? []).map((opt: any) => {
                    const selected = responses?.[currentQuestion.id]?.selectedOptionId === opt?.id;
                    return (
                      <button
                        key={opt?.id}
                        onClick={() => updateResponse(currentQuestion.id, { selectedOptionId: opt.id })}
                        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
                          selected ? 'border-primary bg-primary/10 shadow-md' : 'border-border bg-card hover:border-primary/50 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            selected ? 'border-primary bg-primary' : 'border-muted-foreground'
                          }`}>
                            {selected && <div className="w-2.5 h-2.5 rounded-full bg-white" />}
                          </div>
                          <span className={`text-sm ${selected ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                            {opt?.label ?? opt?.text ?? ''}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <textarea
                    value={responses?.[currentQuestion?.id]?.essayText ?? ''}
                    onChange={e => updateResponse(currentQuestion.id, { essayText: e.target.value })}
                    aria-label={`Response for question ${currentIndex + 1}`}
                    rows={(currentQuestion?.type === 'ESSAY' || currentQuestion?.type === 'essay' || currentQuestion?.type === 'legal_problem' || currentQuestion?.type === 'case_analysis') ? 15 : 6}
                    className="w-full px-4 py-3 border-2 border-border rounded-lg bg-card text-foreground focus:border-primary focus:outline-none resize-y text-sm leading-relaxed"
                    placeholder={(currentQuestion?.type === 'ESSAY' || currentQuestion?.type === 'essay' || currentQuestion?.type === 'legal_problem' || currentQuestion?.type === 'case_analysis') ? 'Write your essay response here...' : 'Type your answer here...'}
                  />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span aria-live="polite">Word count: {(responses?.[currentQuestion?.id]?.essayText ?? '').trim().split(/\s+/).filter(Boolean).length}</span>
                    {(currentQuestion?.wordTarget || currentQuestion?.wordLimit) && <span>Target {currentQuestion.wordTarget ?? '-'}{currentQuestion.wordLimit ? `, limit ${currentQuestion.wordLimit}` : ''}</span>}
                    <button onClick={() => syncResponses()} className="text-primary hover:underline flex items-center gap-1">
                      <Save className="h-3 w-3" /> Save now
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-8">
                <button onClick={() => navigateToQuestion(currentIndex - 1)} disabled={currentIndex === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-muted text-foreground rounded-md hover:bg-muted/80 disabled:opacity-50">
                  <ChevronLeft className="h-4 w-4" /> Previous
                </button>
                <span className="text-sm text-muted-foreground">{currentIndex + 1} of {totalQuestions}</span>
                {currentIndex < totalQuestions - 1 ? (
                  <button onClick={() => navigateToQuestion(currentIndex + 1)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90">
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button onClick={() => setShowConfirm(true)} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">
                    <Send className="h-4 w-4" /> Submit
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-muted-foreground">
              <AlertTriangle className="h-10 w-10 mx-auto mb-3" />
              <p>No questions loaded for this exam.</p>
            </div>
          )}
        </main>

        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border p-3 flex items-center justify-between">
          <button onClick={() => navigateToQuestion(currentIndex - 1)} disabled={currentIndex === 0} aria-label="Previous question" className="rounded-md bg-muted p-2 disabled:opacity-50">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-medium">{currentIndex + 1}/{totalQuestions}</span>
          <button onClick={() => setShowConfirm(true)} className="px-3 py-2 bg-green-600 text-white rounded-md text-sm font-medium">Submit</button>
          <button onClick={() => navigateToQuestion(currentIndex + 1)} disabled={currentIndex >= totalQuestions - 1} aria-label="Next question" className="rounded-md bg-muted p-2 disabled:opacity-50">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-lg shadow-xl max-w-md w-full p-6">
            <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto" />
            <h2 className="text-xl font-bold text-center mt-3 text-foreground">Submit Exam?</h2>
            <p className="text-center text-muted-foreground mt-2">
              You have answered <strong>{answeredCount}</strong> of <strong>{totalQuestions}</strong> questions.
              {totalQuestions - answeredCount > 0 && <span className="text-yellow-600 block mt-1">{totalQuestions - answeredCount} question(s) unanswered!</span>}
            </p>
            <p className="text-center text-sm text-muted-foreground mt-2">This action cannot be undone. Your exam will be submitted for grading.</p>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowConfirm(false)} className="flex-1 py-2 bg-muted text-foreground rounded-md font-medium hover:bg-muted/80">Cancel</button>
              <button onClick={() => handleSubmit()} disabled={submitting} className="flex-1 py-2 bg-green-600 text-white rounded-md font-medium hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? 'Submitting...' : 'Confirm Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
      {securityWarningCount !== null && !submitted && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="exam-security-title">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <AlertTriangle className="mx-auto h-11 w-11 text-amber-500" />
            <h2 id="exam-security-title" className="mt-4 text-center text-xl font-bold text-foreground">
              Examination security warning
            </h2>
            <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">
              Warning: Unauthorized activity detected ({securityWarningEvent ?? 'exam policy'}). Violation {securityWarningCount} of 3. Repeated violations will result in automatic exam submission.
            </p>
            {fullscreenCountdown !== null && (
              <p className="mt-3 text-center text-sm font-semibold text-destructive" role="status">
                Return to full-screen mode within {fullscreenCountdown} seconds or your exam will be submitted automatically.
              </p>
            )}
            {peripheralCountdown !== null && (
              <p className="mt-3 text-center text-sm font-semibold text-destructive" role="status">
                Restore the camera and microphone feeds within {peripheralCountdown} seconds or your exam will be submitted automatically.
              </p>
            )}
            {securityWarningCount < 3 ? (
                <button
                  type="button"
                  onClick={returnToExam}
                  className="mt-6 w-full rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Return to exam
                </button>
            ) : (
              <>
                <p className="mt-3 text-center text-sm leading-6 text-muted-foreground" role="status">
                  {securitySubmitFailed
                    ? `Automatic submission failed${syncError ? `: ${syncError}` : '.'}`
                    : 'Your exam is being submitted automatically.'}
                </p>
                {securitySubmitFailed && (
                  <button
                    type="button"
                    onClick={retrySecuritySubmission}
                    disabled={submitting}
                    className="mt-6 w-full rounded-md bg-destructive px-4 py-2.5 font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                  >
                    {submitting ? 'Retrying submission…' : 'Retry submission'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {duplicateSessionBlocked && !submitted && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" role="alertdialog" aria-modal="true" aria-labelledby="duplicate-session-title">
          <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-2xl">
            <AlertTriangle className="mx-auto h-11 w-11 text-amber-500" />
            <h2 id="duplicate-session-title" className="mt-4 text-center text-xl font-bold text-foreground">
              {DUPLICATE_ACTIVE_SESSION_MESSAGE}
            </h2>
            <p className="mt-3 text-center text-sm leading-6 text-muted-foreground">
              This examination is already active in another tab, browser, or device. Return to the original exam session to continue.
            </p>
            <button
              type="button"
              onClick={() => router.push('/dashboard/my-exams')}
              className="mt-6 w-full rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
            >
              Back to My Exams
            </button>
          </div>
        </div>
      )}
      {showIssueReport && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="issue-report-title">
          <div className="bg-card rounded-lg shadow-xl max-w-sm w-full p-5">
            <h2 id="issue-report-title" className="text-lg font-semibold">Report a technical issue</h2>
            <label className="block text-sm mt-4" htmlFor="issue-category">Issue category</label>
            <select id="issue-category" value={issueCategory} onChange={(event) => setIssueCategory(event.target.value)} className="w-full mt-1 rounded-md border bg-background px-3 py-2">
              <option value="webcam_interruption">Webcam interruption</option>
              <option value="synchronization_delay">Synchronization delay</option>
              <option value="interface_freeze">Interface freeze</option>
              <option value="other">Other</option>
            </select>
            <label className="block text-sm mt-4" htmlFor="issue-description">Short description</label>
            <textarea id="issue-description" value={issueDescription} onChange={(event) => setIssueDescription(event.target.value)} maxLength={500} rows={3} className="w-full mt-1 rounded-md border bg-background px-3 py-2" />
            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowIssueReport(false)} className="px-3 py-2 rounded-md bg-muted">Cancel</button>
              <button type="button" onClick={submitIssueReport} disabled={issueSending} className="px-3 py-2 rounded-md bg-primary text-primary-foreground">{issueSending ? 'Sending...' : 'Send report'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
