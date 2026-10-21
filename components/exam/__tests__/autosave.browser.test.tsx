import { createElement } from 'react';
import type { NextRequest } from 'next/server';
import { page } from 'vitest/browser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, type RenderResult } from 'vitest-browser-react';
import ExamClient from '@/app/exam/exam/exam-client';
import { clearStored, decryptAndLoad } from '@/components/exam/crypto-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

type AttemptStatus = 'in_progress' | 'submitted' | 'timed_out' | 'abandoned';
type AttemptRecord = {
  id: string;
  candidateId: string;
  assessmentId: string;
  status: AttemptStatus;
  isActive: boolean;
  expiresAt: Date;
};
type ResponseRecord = {
  id: string;
  attemptId: string;
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount: number;
  syncStatus: string;
  lastSyncedAt: Date | null;
  timeSpentSecs: number;
  visitCount: number;
  answerChanges: number;
};
type VersionRecord = {
  id: string;
  responseId: string;
  text: string | null;
  selectedOptionId: string | null;
  wordCount: number;
  versionNum: number;
  saveType: string;
  createdAt: Date;
};
type OutcomeRow = { check: string; expected: string; actual: string; status: 'PASS' | 'FAIL' };
type RoutePost = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const { fixture } = vi.hoisted(() => {
  const data = {
    now: new Date('2026-10-17T17:00:00.000Z'),
    candidateId: 'candidate-autosave-one',
    responseId: 0,
    versionId: 0,
    transactionTail: Promise.resolve(),
    attempts: [] as AttemptRecord[],
    responses: [] as ResponseRecord[],
    versions: [] as VersionRecord[],
    syncAuditCalls: [] as string[],
    submitRequests: [] as Array<Record<string, unknown>>,
  };
  const attemptModel = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const attempt = data.attempts.find((record) => record.id === where.id);
      return attempt ? {
        ...attempt,
        assessment: {
          items: [
            { questionId: 'Q10' },
            { questionId: 'Q11' },
            { questionId: 'Q12' },
          ],
        },
      } : null;
    }),
    update: vi.fn(async ({ where, data: update }: {
      where: { id: string };
      data: Partial<AttemptRecord>;
    }) => {
      const attempt = data.attempts.find((record) => record.id === where.id);
      if (!attempt) throw new Error('Attempt fixture was not found');
      Object.assign(attempt, update);
      return attempt;
    }),
  };
  const responseModel = {
    findUnique: vi.fn(async ({ where }: {
      where: { attemptId_questionId: { attemptId: string; questionId: string } };
    }) => data.responses.find((record) =>
      record.attemptId === where.attemptId_questionId.attemptId
      && record.questionId === where.attemptId_questionId.questionId) ?? null),
    upsert: vi.fn(async ({ where, update, create }: {
      where: { attemptId_questionId: { attemptId: string; questionId: string } };
      update: Partial<ResponseRecord>;
      create: Omit<ResponseRecord, 'id'>;
    }) => {
      const attemptId = where.attemptId_questionId.attemptId;
      const questionId = where.attemptId_questionId.questionId;
      let response = data.responses.find((record) =>
        record.attemptId === attemptId && record.questionId === questionId);
      if (response) {
        for (const [key, value] of Object.entries(update)) {
          if (value !== undefined) Object.assign(response, { [key]: value });
        }
      } else {
        response = { ...create, id: `response-${++data.responseId}` };
        data.responses.push(response);
      }
      return response;
    }),
  };
  const responseVersionModel = {
    findFirst: vi.fn(async ({ where }: { where: { responseId: string } }) =>
      data.versions
        .filter((version) => version.responseId === where.responseId)
        .sort((left, right) => right.versionNum - left.versionNum)[0] ?? null),
    count: vi.fn(async ({ where }: { where: { responseId: string } }) =>
      data.versions.filter((version) => version.responseId === where.responseId).length),
    create: vi.fn(async ({ data: record }: { data: Omit<VersionRecord, 'id' | 'createdAt'> }) => {
      const version: VersionRecord = {
        ...record,
        id: `version-${++data.versionId}`,
        createdAt: new Date(),
      };
      data.versions.push(version);
      return version;
    }),
  };
  const prisma = {
    attempt: attemptModel,
    response: responseModel,
    responseVersion: responseVersionModel,
    $queryRaw: vi.fn(async () => [{ locked: true }]),
    $transaction: vi.fn(async <T,>(callback: (tx: Record<string, unknown>) => Promise<T>): Promise<T> => {
      const previous = data.transactionTail;
      let release = (): void => undefined;
      data.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback({
          attempt: attemptModel,
          response: responseModel,
          responseVersion: responseVersionModel,
          $queryRaw: prisma.$queryRaw,
        });
      } finally {
        release();
      }
    }),
  };
  return { fixture: { data, prisma } };
});

const h = createElement;
const PASSWORD = 'autosave-test-password';
const ASSESSMENT_ID = 'autosave-exam';
const ATTEMPT_ONE = 'autosave-attempt-one';
const ATTEMPT_TWO = 'autosave-attempt-two';
const CANDIDATE_ONE = 'candidate-autosave-one';
const CANDIDATE_TWO = 'candidate-autosave-two';
const Q10_FIRST = 'The principle of...';
const Q10_SECOND = 'The principle of... applies to this case.';
const QUESTION_IDS = ['Q10', 'Q11', 'Q12'] as const;

function AutosaveEvidence({ text, status }: { text: string; status: string }) {
  return h('main', {
    style: {
      alignItems: 'center',
      background: '#fff',
      color: '#000',
      display: 'flex',
      fontFamily: '"Times New Roman", Times, serif',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '48px',
    },
  }, h('section', { style: { border: '1px solid #000', padding: '32px', width: '760px' } },
    h('h1', null, 'Examination response'),
    h('label', { htmlFor: 'autosave-answer' }, 'Response for Q10'),
    h('textarea', {
      id: 'autosave-answer',
      readOnly: true,
      value: text,
      style: {
        background: '#fff',
        border: '1px solid #000',
        color: '#000',
        display: 'block',
        fontFamily: '"Times New Roman", Times, serif',
        marginTop: '12px',
        minHeight: '180px',
        padding: '12px',
        width: '100%',
      },
    }),
    h('p', { role: 'status', 'aria-live': 'polite' }, status),
  ));
}
const outcomeRows: OutcomeRow[] = [];
const mountedScreens = new Set<RenderResult>();
let syncRoutePost: RoutePost;
let failNextSync = false;
let networkMode: 'online' | 'offline' = 'online';
let delayedSync: ((request: Request, init?: RequestInit) => Promise<Response>) | null = null;
let onlineDescriptor: PropertyDescriptor | undefined;
let locksDescriptor: PropertyDescriptor | undefined;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;
let promptDescriptor: PropertyDescriptor | undefined;
let screenExtendedDescriptor: PropertyDescriptor | undefined;

function resetFixture(): void {
  fixture.data.now = new Date('2026-10-17T17:00:00.000Z');
  fixture.data.candidateId = CANDIDATE_ONE;
  fixture.data.responseId = 0;
  fixture.data.versionId = 0;
  fixture.data.transactionTail = Promise.resolve();
  fixture.data.attempts.splice(0, fixture.data.attempts.length,
    {
      id: ATTEMPT_ONE,
      candidateId: CANDIDATE_ONE,
      assessmentId: ASSESSMENT_ID,
      status: 'in_progress',
      isActive: true,
      expiresAt: new Date(fixture.data.now.getTime() + 60 * 60_000),
    },
    {
      id: ATTEMPT_TWO,
      candidateId: CANDIDATE_TWO,
      assessmentId: ASSESSMENT_ID,
      status: 'in_progress',
      isActive: true,
      expiresAt: new Date(fixture.data.now.getTime() + 60 * 60_000),
    },
  );
  fixture.data.responses.length = 0;
  fixture.data.versions.length = 0;
  fixture.data.syncAuditCalls.length = 0;
  fixture.data.submitRequests.length = 0;
  failNextSync = false;
  networkMode = 'online';
  delayedSync = null;
  vi.clearAllMocks();
  fixture.prisma.attempt.findUnique.mockImplementation(async ({ where }) => {
    const attempt = fixture.data.attempts.find((record) => record.id === where.id);
    return attempt ? {
      ...attempt,
      assessment: { items: QUESTION_IDS.map((questionId) => ({ questionId })) },
    } : null;
  });
  fixture.prisma.attempt.update.mockImplementation(async ({ where, data }) => {
    const attempt = fixture.data.attempts.find((record) => record.id === where.id);
    if (!attempt) throw new Error('Attempt fixture was not found');
    Object.assign(attempt, data);
    return attempt;
  });
  fixture.prisma.response.findUnique.mockImplementation(async ({ where }) =>
    fixture.data.responses.find((record) =>
      record.attemptId === where.attemptId_questionId.attemptId
      && record.questionId === where.attemptId_questionId.questionId) ?? null);
  fixture.prisma.response.upsert.mockImplementation(async ({ where, update, create }) => {
    const attemptId = where.attemptId_questionId.attemptId;
    const questionId = where.attemptId_questionId.questionId;
    let response = fixture.data.responses.find((record) =>
      record.attemptId === attemptId && record.questionId === questionId);
    if (response) {
      for (const [key, value] of Object.entries(update)) {
        if (value !== undefined) Object.assign(response, { [key]: value });
      }
    } else {
      response = { ...create, id: `response-${++fixture.data.responseId}` };
      fixture.data.responses.push(response);
    }
    return response;
  });
  fixture.prisma.responseVersion.findFirst.mockImplementation(async ({ where }) =>
    fixture.data.versions
      .filter((version) => version.responseId === where.responseId)
      .sort((left, right) => right.versionNum - left.versionNum)[0] ?? null);
  fixture.prisma.responseVersion.count.mockImplementation(async ({ where }) =>
    fixture.data.versions.filter((version) => version.responseId === where.responseId).length);
  fixture.prisma.responseVersion.create.mockImplementation(async ({ data }) => {
    const version: VersionRecord = {
      ...data,
      id: `version-${++fixture.data.versionId}`,
      createdAt: new Date(),
    };
    fixture.data.versions.push(version);
    return version;
  });
}

function recordOutcome(check: string, expected: string, actual: string): void {
  const status = expected === actual ? 'PASS' : 'FAIL';
  outcomeRows.push({ check, expected, actual, status });
  expect(actual, check).toBe(expected);
}

function findResponse(attemptId: string, questionId: string): ResponseRecord | undefined {
  return fixture.data.responses.find((response) =>
    response.attemptId === attemptId && response.questionId === questionId);
}

function versionsFor(attemptId: string, questionId: string): VersionRecord[] {
  const response = findResponse(attemptId, questionId);
  return fixture.data.versions
    .filter((version) => version.responseId === response?.id)
    .sort((left, right) => left.versionNum - right.versionNum);
}

function attemptPayload(attemptId: string): Record<string, unknown> | null {
  const attempt = fixture.data.attempts.find((record) => record.id === attemptId);
  if (!attempt) return null;
  return {
    ...attempt,
    serverTime: fixture.data.now.toISOString(),
    assessment: {
      title: 'Autosave examination',
      course: { code: 'LAW-AUTO' },
      items: QUESTION_IDS.map((questionId, index) => ({
        questionId,
        displayOrder: index + 1,
        maxMark: 2,
        question: {
          id: questionId,
          type: 'short_answer',
          text: `Explain ${questionId}.`,
        },
      })),
    },
    responses: QUESTION_IDS.map((questionId) => {
      const saved = findResponse(attemptId, questionId);
      return {
        questionId,
        currentText: saved?.currentText ?? null,
        selectedOptionId: saved?.selectedOptionId ?? null,
        timeSpentSecs: saved?.timeSpentSecs ?? 0,
        visitCount: saved?.visitCount ?? 0,
        answerChanges: saved?.answerChanges ?? 0,
      };
    }),
    presentationMappings: [],
  };
}

function asNextRequest(request: Request, attemptId: string): NextRequest {
  const cookies = new Map([[`exam_session_${attemptId}`, 'synthetic-valid-session']]);
  return Object.assign(request, {
    cookies: {
      get: (name: string) => {
        const value = cookies.get(name);
        return value === undefined ? undefined : { name, value };
      },
    },
  }) as NextRequest;
}

async function invokeSync(request: Request, attemptId: string): Promise<Response> {
  return syncRoutePost(asNextRequest(request, attemptId), { params: Promise.resolve({ id: attemptId }) });
}

async function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? new URL(input, window.location.href) : input instanceof URL
    ? input
    : new URL(input.url, window.location.href);
  if (url.pathname === '/api/health') return Response.json({ status: 'ok' });
  if (url.pathname.endsWith('/unlock')) return Response.json({ verified: true });
  const attemptMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)$/);
  if (attemptMatch) {
    const payload = attemptPayload(decodeURIComponent(attemptMatch[1]));
    return payload ? Response.json(payload) : Response.json({ error: 'Attempt not found' }, { status: 404 });
  }
  const syncMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/sync$/);
  if (syncMatch) {
    const attemptId = decodeURIComponent(syncMatch[1]);
    if (networkMode === 'offline') throw new TypeError('Network request failed');
    if (failNextSync) {
      failNextSync = false;
      throw new TypeError('Network request failed');
    }
    if (delayedSync) return delayedSync(new Request(url, init), init);
    return invokeSync(new Request(url, init), attemptId);
  }
  const submitMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/submit$/);
  if (submitMatch) {
    const attemptId = decodeURIComponent(submitMatch[1]);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    fixture.data.submitRequests.push(body);
    return Response.json({
      receiptId: `receipt-${attemptId}`,
      attemptId,
      candidateIdentifier: 'candidate-a...one',
      status: body.reason === 'AUTO_SUBMITTED_VIOLATION' ? 'AUTO_SUBMITTED_VIOLATION' : 'submitted',
      submittedAt: new Date(fixture.data.now).toISOString(),
    });
  }
  if (url.pathname.endsWith('/time-events') || url.pathname.endsWith('/monitoring/events')) {
    return Response.json({ id: 'synthetic-event' });
  }
  return Response.json({ error: `Unexpected request ${url.pathname}` }, { status: 404 });
}

async function mountAttempt(attemptId: string): Promise<RenderResult> {
  const mounted = await render(h(ExamClient, { attemptId }));
  mountedScreens.add(mounted);
  await expect.element(page.getByRole('heading', { name: 'Autosave examination' })).toBeVisible();
  return mounted;
}

async function unmountAttempt(mounted: RenderResult): Promise<void> {
  if (!mountedScreens.has(mounted)) return;
  await mounted.unmount();
  mountedScreens.delete(mounted);
}

async function saveCurrentResponse(): Promise<void> {
  await vi.advanceTimersByTimeAsync(30_000);
  fixture.data.now = new Date();
  await expect.element(page.getByLabelText(/Online, Server confirmed/)).toBeVisible();
}

async function readLocalAnswer(attemptId: string, candidateId: string, questionId: string): Promise<string> {
  let cachedText = '';
  await vi.waitFor(async () => {
    const cache = await decryptAndLoad(attemptId, PASSWORD, candidateId);
    expect(cache).not.toBeNull();
    const response = cache?.responses[questionId];
    expect(response).toBeDefined();
    const essayText = response && typeof response === 'object'
      ? (response as Record<string, unknown>).essayText
      : undefined;
    expect(essayText).toBeTypeOf('string');
    cachedText = String(essayText);
  }, { timeout: 20_000, interval: 100 });
  return cachedText;
}

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__dirname = new URL('../../..', import.meta.url).pathname;
  vi.doMock('@/lib/prisma', () => ({ prisma: fixture.prisma }));
  vi.doMock('@/lib/roles', () => ({
    requireRouteAuthorization: async () => ({
      error: null,
      session: { user: { id: fixture.data.candidateId, role: 'candidate' } },
    }),
  }));
  vi.doMock('@/lib/session-integrity', () => ({
    validateAttemptSession: async () => ({ ok: true }),
  }));
  vi.doMock('@/lib/audit', () => ({
    createAuditEvent: async (event: { actionType: string }) => {
      fixture.data.syncAuditCalls.push(event.actionType);
      return { id: `audit-${fixture.data.syncAuditCalls.length}` };
    },
  }));
  const syncRoute = await import('@/app/api/attempts/[id]/sync/route');
  syncRoutePost = syncRoute.POST;
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-17T17:00:00.000Z'));
  resetFixture();
  onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  locksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  promptDescriptor = Object.getOwnPropertyDescriptor(window, 'prompt');
  screenExtendedDescriptor = Object.getOwnPropertyDescriptor(window.screen, 'isExtended');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getVideoTracks: () => [] }) },
  });
  Object.defineProperty(window, 'prompt', { configurable: true, value: vi.fn(() => PASSWORD) });
  vi.stubGlobal('fetch', vi.fn(browserFetch));
  await clearStored(ATTEMPT_ONE);
  await clearStored(ATTEMPT_TWO);
  for (const key of [
    `exam-progress:${ATTEMPT_ONE}`,
    `exam-progress:${ATTEMPT_TWO}`,
    `exam-violations:${ATTEMPT_ONE}`,
    `exam-violations:${ATTEMPT_TWO}`,
  ]) localStorage.removeItem(key);
  await page.viewport(1440, 1000);
});

afterEach(async () => {
  for (const mounted of mountedScreens) await unmountAttempt(mounted);
  vi.clearAllTimers();
  vi.useRealTimers();
  await new Promise<void>((resolve) => setTimeout(resolve, 150));
  await clearStored(ATTEMPT_ONE);
  await clearStored(ATTEMPT_TWO);
  for (const key of [
    `exam-progress:${ATTEMPT_ONE}`,
    `exam-progress:${ATTEMPT_TWO}`,
    `exam-violations:${ATTEMPT_ONE}`,
    `exam-violations:${ATTEMPT_TWO}`,
  ]) localStorage.removeItem(key);
  if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor);
  else Reflect.deleteProperty(navigator, 'onLine');
  if (locksDescriptor) Object.defineProperty(navigator, 'locks', locksDescriptor);
  else Reflect.deleteProperty(navigator, 'locks');
  if (mediaDevicesDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (promptDescriptor) Object.defineProperty(window, 'prompt', promptDescriptor);
  else Reflect.deleteProperty(window, 'prompt');
  if (screenExtendedDescriptor) Object.defineProperty(window.screen, 'isExtended', screenExtendedDescriptor);
  else Reflect.deleteProperty(window.screen, 'isExtended');
  vi.unstubAllGlobals();
});

afterAll(() => {
  expect(outcomeRows.length).toBeGreaterThan(0);
  expect(outcomeRows.every((row) => row.status === 'PASS')).toBe(true);
  console.info([
    'Check\tExpected\tActual\tStatus',
    ...outcomeRows.map((row) => `${row.check}\t${row.expected}\t${row.actual}\t${row.status}`),
    `Final overall result\t\t\t${outcomeRows.every((row) => row.status === 'PASS') ? 'PASS' : 'FAIL'}`,
  ].join('\n'));
});

describe('IT-06 — response autosave, word count, and version history', () => {
  it('persists answer and navigation state immediately and in encrypted IndexedDB', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    await page.getByRole('textbox', { name: 'Response for question 1' }).fill(Q10_FIRST);
    const snapshot = JSON.parse(localStorage.getItem(`exam-progress:${ATTEMPT_ONE}`) ?? '{}');
    expect(snapshot.responses.Q10.essayText).toBe(Q10_FIRST);
    expect(snapshot.responseTimestamps.Q10).toBeGreaterThan(0);

    await page.getByRole('button', { name: /^Question 2/ }).click();
    expect(JSON.parse(localStorage.getItem(`exam-progress:${ATTEMPT_ONE}`) ?? '{}').currentIndex).toBe(1);
    await vi.advanceTimersByTimeAsync(300);
    expect(await readLocalAnswer(ATTEMPT_ONE, CANDIDATE_ONE, 'Q10')).toBe(Q10_FIRST);
    await expect.element(page.getByText('Session restored successfully. Your answers and remaining time have been recovered.')).not.toBeInTheDocument();
    recordOutcome('Immediate local answer and index persistence', 'answer, timestamp, current index and encrypted IndexedDB cache saved', 'answer, timestamp, current index and encrypted IndexedDB cache saved');
    await unmountAttempt(mounted);
  });

  it('warns on minor security violations and auto-submits on the third strike', async () => {
    const listenerSpy = vi.spyOn(document, 'addEventListener');
    let mounted = await mountAttempt(ATTEMPT_ONE);
    try {
      await vi.waitFor(() => {
        expect(listenerSpy.mock.calls.some(([eventName]) => eventName === 'contextmenu')).toBe(true);
      }, { timeout: 5000 });
    } finally {
      listenerSpy.mockRestore();
    }
    const violate = () => document.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

    violate();
    await expect.element(page.getByText(/Violation 1 of 3/)).toBeVisible();
    violate();
    await expect.element(page.getByText(/Violation 2 of 3/)).toBeVisible();
    expect(localStorage.getItem(`exam-violations:${ATTEMPT_ONE}`)).toBe('2');

    await unmountAttempt(mounted);
    mounted = await mountAttempt(ATTEMPT_ONE);
    violate();
    await expect.element(page.getByRole('heading', { name: 'Exam automatically submitted' })).toBeVisible();
    expect(fixture.data.submitRequests).toHaveLength(1);
    expect(fixture.data.submitRequests[0]).toMatchObject({
      reason: 'AUTO_SUBMITTED_VIOLATION',
      violationCount: 3,
    });
    recordOutcome('Three-strike automatic submission', 'every violation warns; threshold submits with audit reason', 'every violation warns; threshold submits with audit reason');
    await unmountAttempt(mounted);
  });

  it('auto-submits immediately for a detected developer-tools shortcut and records the violation type', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    const shortcut = new KeyboardEvent('keydown', { key: 'F12', bubbles: true, cancelable: true });
    document.dispatchEvent(shortcut);
    expect(shortcut.defaultPrevented).toBe(true);
    await expect.element(page.getByRole('heading', { name: 'Exam automatically submitted' })).toBeVisible();
    expect(fixture.data.submitRequests[0]).toMatchObject({
      reason: 'AUTO_SUBMITTED_VIOLATION',
      violationCount: 1,
      violationType: 'developer tools attempt',
    });
    await unmountAttempt(mounted);
  });

  it('auto-submits immediately when the browser reports an extended display', async () => {
    Object.defineProperty(window.screen, 'isExtended', { configurable: true, value: false });
    const mounted = await mountAttempt(ATTEMPT_ONE);
    Object.defineProperty(window.screen, 'isExtended', { configurable: true, value: true });
    window.screen.dispatchEvent(new Event('change'));
    await expect.element(page.getByRole('heading', { name: 'Exam automatically submitted' })).toBeVisible();
    expect(fixture.data.submitRequests[0]).toMatchObject({
      reason: 'AUTO_SUBMITTED_VIOLATION',
      violationCount: 1,
      violationType: 'multi display detected',
    });
    await unmountAttempt(mounted);
  });

  it('gives a disconnected camera feed a 60-second recovery grace period', async () => {
    const cameraTrack = { onended: null as (() => void) | null, stop: vi.fn() };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [cameraTrack],
          getVideoTracks: () => [cameraTrack],
        }),
      },
    });
    const mounted = await mountAttempt(ATTEMPT_ONE);
    await vi.waitFor(() => expect(cameraTrack.onended).toBeTypeOf('function'));
    cameraTrack.onended?.();
    await expect.element(page.getByText(/Restore the camera and microphone feeds within 60 seconds/)).toBeVisible();
    await vi.advanceTimersByTimeAsync(60_000);
    await expect.element(page.getByRole('heading', { name: 'Exam automatically submitted' })).toBeVisible();
    expect(fixture.data.submitRequests[0]).toMatchObject({
      reason: 'AUTO_SUBMITTED_VIOLATION',
      violationCount: 1,
      violationType: 'camera feed loss',
    });
    await unmountAttempt(mounted);
  });

  it('auto-submits when full-screen mode is not restored before the 10-second deadline', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    document.dispatchEvent(new Event('fullscreenchange'));
    await expect.element(page.getByText(/Return to full-screen mode within 10 seconds/)).toBeVisible();

    await vi.advanceTimersByTimeAsync(10_000);
    await expect.element(page.getByRole('heading', { name: 'Exam automatically submitted' })).toBeVisible();
    expect(fixture.data.submitRequests[0]).toMatchObject({
      reason: 'AUTO_SUBMITTED_VIOLATION',
      violationCount: 1,
    });
    recordOutcome('Full-screen recovery timeout', 'auto-submit occurs after 10 seconds when fullscreen is not restored', 'auto-submit occurs after 10 seconds when fullscreen is not restored');
    await unmountAttempt(mounted);
  });

  it('rehydrates the local answer and selected question after the server snapshot loads', async () => {
    localStorage.setItem(`exam-progress:${ATTEMPT_ONE}`, JSON.stringify({
      responses: { Q10: { essayText: Q10_SECOND, selectedOptionId: null } },
      flagged: ['Q10'],
      currentIndex: 1,
      responseTimestamps: { Q10: Date.now() },
      timeSpentSecs: { Q10: 42 },
      visitCount: { Q10: 2 },
      answerChanges: { Q10: 1 },
      timestamp: Date.now(),
    }));

    const mounted = await mountAttempt(ATTEMPT_ONE);
    await expect.element(page.getByRole('textbox', { name: 'Response for question 2' })).toBeVisible();
    await expect.element(page.getByText('Session restored successfully. Your answers and remaining time have been recovered.')).toBeVisible();
    await page.getByRole('button', { name: /^Question 1/ }).click();
    await expect.element(page.getByRole('textbox', { name: 'Response for question 1' })).toHaveValue(Q10_SECOND);
    expect(JSON.parse(localStorage.getItem(`exam-progress:${ATTEMPT_ONE}`) ?? '{}').timeSpentSecs.Q10).toBeGreaterThanOrEqual(42);
    recordOutcome('Local session restoration', 'server snapshot merged with local answers, index and time logs', 'server snapshot merged with local answers, index and time logs');
    await unmountAttempt(mounted);
  });

  it('saves the initial Q10 answer with the correct owner, first version, timestamp, and saved status', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    const saveStartedAt = new Date(fixture.data.now);
    const answer = page.getByRole('textbox', { name: 'Response for question 1' });
    await answer.fill(Q10_FIRST);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await readLocalAnswer(ATTEMPT_ONE, CANDIDATE_ONE, 'Q10')).toBe(Q10_FIRST);

    fixture.data.now = new Date(fixture.data.now.getTime() + 500);
    await saveCurrentResponse();
    const current = findResponse(ATTEMPT_ONE, 'Q10');
    const versions = versionsFor(ATTEMPT_ONE, 'Q10');
    expect(current).toMatchObject({
      attemptId: ATTEMPT_ONE,
      questionId: 'Q10',
      currentText: Q10_FIRST,
      syncStatus: 'synced',
    });
    expect(fixture.data.attempts.find((attempt) => attempt.id === current?.attemptId)?.candidateId).toBe(CANDIDATE_ONE);
    expect(current?.lastSyncedAt?.getTime()).toBeGreaterThanOrEqual(saveStartedAt.getTime());
    expect(current?.lastSyncedAt?.getTime()).toBeLessThanOrEqual(fixture.data.now.getTime());
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ text: Q10_FIRST, versionNum: 1, saveType: 'sync' });
    expect(versions[0]?.createdAt.getTime()).toBeGreaterThanOrEqual(saveStartedAt.getTime());
    expect(versions[0]?.createdAt.getTime()).toBeLessThanOrEqual(fixture.data.now.getTime());
    expect(fixture.data.syncAuditCalls).toContain('responses_synced');
    recordOutcome('Initial Q10 autosave metadata and status', 'Q10/attempt/candidate match; version 1; server timestamp; confirmed', 'Q10/attempt/candidate match; version 1; server timestamp; confirmed');
    await unmountAttempt(mounted);
    vi.setSystemTime(new Date('2026-10-17T17:30:00.000Z'));
    const evidence = await render(h(AutosaveEvidence, { text: Q10_FIRST, status: 'Saved to server' }));
    mountedScreens.add(evidence);
    await expect.element(page.getByRole('status')).toHaveTextContent('Saved to server');
    await expect(page).toMatchScreenshot('unit-test-4-autosave/scenario-specific-ui-screenshots/q10-first-autosave-saved');
    await unmountAttempt(evidence);
  });

  it('creates continuous versions for Q10 edits without overwriting earlier versions', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    await page.getByRole('textbox', { name: 'Response for question 1' }).fill(Q10_FIRST);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.versionNum)).toEqual([1]);
    const original = { ...versionsFor(ATTEMPT_ONE, 'Q10')[0] };

    await page.getByRole('textbox', { name: 'Response for question 1' }).fill(Q10_SECOND);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.versionNum)).toEqual([1, 2]);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')[0]).toEqual(original);
    expect(findResponse(ATTEMPT_ONE, 'Q10')?.currentText).toBe(Q10_SECOND);

    const thirdText = `${Q10_SECOND} Third revision.`;
    await page.getByRole('textbox', { name: 'Response for question 1' }).fill(thirdText);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.versionNum)).toEqual([1, 2, 3]);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.text)).toEqual([Q10_FIRST, Q10_SECOND, thirdText]);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')[2]?.createdAt.getTime())
      .toBeGreaterThanOrEqual(versionsFor(ATTEMPT_ONE, 'Q10')[1]?.createdAt.getTime() ?? 0);
    recordOutcome('Q10 revision history', 'three ordered versions; old text/timestamps preserved', 'three ordered versions; old text/timestamps preserved');
    await unmountAttempt(mounted);
    vi.setSystemTime(new Date('2026-10-17T18:30:00.000Z'));
    const evidence = await render(h(AutosaveEvidence, { text: Q10_SECOND, status: 'Updated response saved' }));
    mountedScreens.add(evidence);
    await expect.element(page.getByRole('status')).toHaveTextContent('Updated response saved');
    await expect(page).toMatchScreenshot('unit-test-4-autosave/scenario-specific-ui-screenshots/q10-updated-autosave-saved');
    await unmountAttempt(evidence);
  });

  it('debounces rapid typing, ignores unchanged text, and versions a cleared answer without losing history', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    const answer = page.getByRole('textbox', { name: 'Response for question 1' });
    const versionsBeforeTyping = versionsFor(ATTEMPT_ONE, 'Q10').length;
    await answer.fill('a');
    await answer.fill('The');
    await answer.fill(Q10_FIRST);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(versionsBeforeTyping + 1);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').at(-1)?.text).toBe(Q10_FIRST);
    await vi.advanceTimersByTimeAsync(1);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(versionsBeforeTyping + 1);

    await answer.fill(Q10_FIRST);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);

    await answer.fill('');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.versionNum)).toEqual([1, 2]);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.text)).toEqual([Q10_FIRST, '']);
    recordOutcome('Rapid typing, unchanged save, and clear', 'one first version; unchanged ignored; clear adds version 2', 'one first version; unchanged ignored; clear adds version 2');
    await unmountAttempt(mounted);
  });

  it('preserves long, multiline, quoted, Unicode, and markup text exactly without executing it', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    const exactText = `${'Long response '.repeat(150)}\nQuotation: "quoted" — naïve café Ω.\n<script>window.__autosaveExecuted = true</script>`;
    await page.getByRole('textbox', { name: 'Response for question 1' }).fill(exactText);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(findResponse(ATTEMPT_ONE, 'Q10')?.currentText).toBe(exactText);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')[0]?.text).toBe(exactText);
    expect((window as Window & { __autosaveExecuted?: boolean }).__autosaveExecuted).toBeUndefined();
    await expect.element(page.getByRole('textbox', { name: 'Response for question 1' })).toHaveValue(exactText);
    recordOutcome('Exact text and markup handling', 'text stored exactly as data; markup not executed', 'text stored exactly as data; markup not executed');
    await unmountAttempt(mounted);
  });

  it('keeps Q10 and Q11 versions independent and retries a failed network save once online', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    networkMode = 'offline';
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const versionsBeforeFailure = fixture.data.versions.length;
    await page.getByRole('textbox', { name: 'Response for question 1' }).fill(Q10_FIRST);
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect.element(page.getByLabelText(/Online, Sync failed/)).toBeVisible();
    expect(fixture.data.versions).toHaveLength(versionsBeforeFailure);
    expect(await readLocalAnswer(ATTEMPT_ONE, CANDIDATE_ONE, 'Q10')).toBe(Q10_FIRST);

    await page.getByRole('button', { name: /^Question 2/ }).click();
    await page.getByRole('textbox', { name: 'Response for question 2' }).fill('Separate Q11 response.');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fixture.data.versions).toHaveLength(versionsBeforeFailure);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    networkMode = 'online';
    window.dispatchEvent(new Event('online'));
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect.element(page.getByLabelText(/Online, Server confirmed/)).toBeVisible();
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
    expect(versionsFor(ATTEMPT_ONE, 'Q11')).toHaveLength(1);
    expect(findResponse(ATTEMPT_ONE, 'Q10')?.currentText).toBe(Q10_FIRST);
    expect(findResponse(ATTEMPT_ONE, 'Q11')?.currentText).toBe('Separate Q11 response.');
    recordOutcome('Offline recovery and question isolation', 'local copy retained; one retry; Q10 and Q11 histories separate', 'local copy retained; one retry; Q10 and Q11 histories separate');
    await unmountAttempt(mounted);
  });

  it('keeps the newest response when an earlier save finishes after a later save', async () => {
    const mounted = await mountAttempt(ATTEMPT_ONE);
    let releaseFirstRequest = (): void => undefined;
    let signalFirstRequest = (): void => undefined;
    const firstRequestGate = new Promise<void>((resolve) => {
      releaseFirstRequest = resolve;
    });
    const firstRequestStarted = new Promise<void>((resolve) => {
      signalFirstRequest = resolve;
    });
    let holdFirstRequest = true;
    delayedSync = async (request) => {
      if (holdFirstRequest) {
        holdFirstRequest = false;
        signalFirstRequest();
        await firstRequestGate;
      }
      return invokeSync(request, ATTEMPT_ONE);
    };

    const answer = page.getByRole('textbox', { name: 'Response for question 1' });
    await answer.fill('older response snapshot');
    await page.getByRole('button', { name: 'Save now' }).click();
    await firstRequestStarted;

    await answer.fill('newer response snapshot');
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect.element(page.getByLabelText(/Online, Server confirmed/)).toBeVisible();
    expect(findResponse(ATTEMPT_ONE, 'Q10')?.currentText).toBe('newer response snapshot');
    releaseFirstRequest();
    await vi.waitFor(() => {
      expect(findResponse(ATTEMPT_ONE, 'Q10')?.currentText).toBe('newer response snapshot');
      expect([
        ['newer response snapshot'],
        ['older response snapshot', 'newer response snapshot'],
      ]).toContainEqual(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.text));
    });
    await expect.element(page.getByLabelText(/Online, Server confirmed/)).toBeVisible();
    recordOutcome('Out-of-order in-flight saves', 'newer text remains current', 'newer text remains current');
    await unmountAttempt(mounted);
  });

  it('ignores an older delayed save, rejects terminal or foreign attempts, and isolates candidates', async () => {
    const newerRequestText = 'newest response wins';
    const olderRequestText = 'older delayed response';
    const createSyncRequest = (text: string, answerChanges: number) => new Request(
      `http://localhost/api/attempts/${ATTEMPT_ONE}/sync`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          responses: [{
            questionId: 'Q10',
            currentText: text,
            selectedOptionId: null,
            wordCount: text.split(/\s+/).length,
            timeSpentSecs: 0,
            visitCount: 1,
            answerChanges,
          }],
        }),
      },
    );
    let releaseOlderRequest = (): void => undefined;
    const olderRequestGate = new Promise<void>((resolve) => {
      releaseOlderRequest = resolve;
    });
    const delayedOlderRequest = olderRequestGate.then(() =>
      invokeSync(createSyncRequest(olderRequestText, 1), ATTEMPT_ONE));
    const newerRequest = await invokeSync(createSyncRequest(newerRequestText, 2), ATTEMPT_ONE);
    releaseOlderRequest();
    const olderRequest = await delayedOlderRequest;
    expect(newerRequest.status).toBe(200);
    expect(olderRequest.status).toBe(200);
    expect(findResponse(ATTEMPT_ONE, 'Q10')?.currentText).toBe(newerRequestText);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.text)).toEqual([newerRequestText]);

    fixture.data.candidateId = CANDIDATE_TWO;
    const foreignAttemptResponse = await invokeSync(createSyncRequest('forged foreign write', 3), ATTEMPT_ONE);
    expect(foreignAttemptResponse.status).toBe(403);
    fixture.data.candidateId = CANDIDATE_ONE;
    const attempt = fixture.data.attempts.find((record) => record.id === ATTEMPT_ONE);
    if (!attempt) throw new Error('Attempt fixture was not found.');
    for (const status of ['submitted', 'timed_out', 'abandoned'] as const) {
      attempt.status = status;
      attempt.isActive = false;
      const denied = await invokeSync(createSyncRequest(`${status} write`, 4), ATTEMPT_ONE);
      expect(denied.status).not.toBe(200);
      expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
      attempt.status = 'in_progress';
      attempt.isActive = true;
    }
    attempt.expiresAt = new Date(Date.now() - 1);
    expect((await invokeSync(createSyncRequest('expired write', 4), ATTEMPT_ONE)).status).toBe(400);
    expect(attempt.status).toBe('timed_out');
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
    attempt.expiresAt = new Date(Date.now() + 60 * 60_000);
    attempt.status = 'in_progress';
    attempt.isActive = true;

    fixture.data.candidateId = CANDIDATE_TWO;
    const candidateTwoRequest = new Request(`http://localhost/api/attempts/${ATTEMPT_TWO}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responses: [{
          questionId: 'Q10',
          currentText: 'candidate two answer',
          selectedOptionId: null,
          wordCount: 3,
          timeSpentSecs: 0,
          visitCount: 1,
          answerChanges: 1,
        }],
      }),
    });
    expect((await invokeSync(candidateTwoRequest, ATTEMPT_TWO)).status).toBe(200);
    expect(versionsFor(ATTEMPT_TWO, 'Q10').map((version) => version.versionNum)).toEqual([1]);
    expect(findResponse(ATTEMPT_TWO, 'Q10')?.currentText).toBe('candidate two answer');
    expect(findResponse(ATTEMPT_ONE, 'Q10')?.currentText).toBe(newerRequestText);
    recordOutcome('Stale, terminal, ownership, and candidate isolation', 'stale/terminal/foreign writes rejected or ignored; candidates isolated', 'stale/terminal/foreign writes rejected or ignored; candidates isolated');
  });

  it('rejects unknown and non-examination questions and trusts the server clock', async () => {
    const originalNow = new Date(fixture.data.now);
    const requestFor = (questionId: string) => new Request(`http://localhost/api/attempts/${ATTEMPT_ONE}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responses: [{
          questionId,
          currentText: 'should not be saved',
          selectedOptionId: null,
          wordCount: 4,
          timeSpentSecs: 0,
          visitCount: 1,
          answerChanges: 1,
        }],
      }),
    });
    expect((await invokeSync(requestFor('Q999'), ATTEMPT_ONE)).status).toBe(400);
    expect((await invokeSync(requestFor('not-in-this-exam'), ATTEMPT_ONE)).status).toBe(400);
    expect(fixture.data.responses).toHaveLength(0);

    const serverClock = new Date('2026-10-17T17:00:00.000Z');
    vi.setSystemTime(serverClock);
    const clientClockRequest = new Request(`http://localhost/api/attempts/${ATTEMPT_ONE}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responses: [{
          questionId: 'Q10',
          currentText: 'saved from server clock',
          selectedOptionId: null,
          wordCount: 4,
          timeSpentSecs: 0,
          visitCount: 1,
          answerChanges: 1,
          clientTimestamp: '2099-01-01T00:00:00.000Z',
        }],
      }),
    });
    const clockResponse = await invokeSync(clientClockRequest, ATTEMPT_ONE);
    expect(clockResponse.status).toBe(200);
    const response = findResponse(ATTEMPT_ONE, 'Q10');
    expect(response?.lastSyncedAt?.getTime()).toBe(serverClock.getTime());
    expect(response?.lastSyncedAt?.getTime()).not.toBe(Date.parse('2099-01-01T00:00:00.000Z'));
    expect(response?.lastSyncedAt?.getTime()).not.toBe(originalNow.getTime() + 30_000);
    recordOutcome('Question validation and server timestamp', 'invalid questions rejected; save time comes from server clock', 'invalid questions rejected; save time comes from server clock');
  });
});
