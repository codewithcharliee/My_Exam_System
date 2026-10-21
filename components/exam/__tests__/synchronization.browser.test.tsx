import { createElement } from 'react';
import type { NextRequest } from 'next/server';
import { page } from 'vitest/browser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, type RenderResult } from 'vitest-browser-react';
import ExamClient from '@/app/exam/exam/exam-client';
import { clearStored, decryptAndLoad, type LocalResponseCache } from '@/components/exam/crypto-utils';

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
type SyncItem = {
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount: number;
  timeSpentSecs: number;
  visitCount: number;
  answerChanges: number;
};
type ResultRow = {
  name: string;
  local: string;
  expected: string;
  actual: string;
  count: number;
  status: 'PASS' | 'FAIL';
};
type RouteHandler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const { fixture } = vi.hoisted(() => {
  const data = {
    now: new Date('2026-10-17T19:00:00.000Z'),
    candidateId: 'candidate-unit-6-one',
    responseId: 0,
    versionId: 0,
    transactionTail: Promise.resolve(),
    attempts: [] as AttemptRecord[],
    responses: [] as ResponseRecord[],
    versions: [] as VersionRecord[],
    auditActions: [] as string[],
  };
  const questionIds = ['Q10', 'Q11', 'Q12'];

  const attemptModel = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const attempt = data.attempts.find((record) => record.id === where.id);
      if (!attempt) return null;
      return {
        ...attempt,
        candidate: { id: attempt.candidateId, name: 'Candidate One', email: 'candidate-one@example.test' },
        assessment: {
          title: 'Unit Test 6 Synchronization',
          course: { code: 'LAW-U6', title: 'Law' },
          items: questionIds.map((questionId, index) => ({
            questionId,
            displayOrder: index + 1,
            maxMark: 2,
            question: {
              id: questionId,
              type: 'short_answer',
              text: `Explain ${questionId}.`,
              topic: null,
              difficulty: null,
              options: [],
              answerKeys: [],
              markingSchemes: [],
            },
          })),
        },
        presentationMappings: [],
        responses: data.responses.filter((response) => response.attemptId === where.id),
        objectiveOutcomes: [],
        gradeDecisions: [],
      };
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
      const { attemptId, questionId } = where.attemptId_questionId;
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
      data.versions.filter((version) => version.responseId === where.responseId)
        .sort((left, right) => right.versionNum - left.versionNum)[0] ?? null),
    count: vi.fn(async ({ where }: { where: { responseId: string } }) =>
      data.versions.filter((version) => version.responseId === where.responseId).length),
    create: vi.fn(async ({ data: record }: { data: Omit<VersionRecord, 'id' | 'createdAt'> }) => {
      const version: VersionRecord = {
        ...record,
        id: `version-${++data.versionId}`,
        createdAt: new Date(data.now),
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
const PASSWORD = 'unit-test-6-local-cache-password';
const ASSESSMENT_ID = 'assessment-unit-6';
const ATTEMPT_ONE = 'attempt-unit-6-one';
const ATTEMPT_TWO = 'attempt-unit-6-two';
const CANDIDATE_ONE = 'candidate-unit-6-one';
const CANDIDATE_TWO = 'candidate-unit-6-two';
const QUESTION_IDS = ['Q10', 'Q11', 'Q12'] as const;
const Q10_FIRST = 'Q10 local response — “exact” café Ω.';
const Q10_SECOND = 'Q10 local response version two.';
const Q10_THIRD = 'Q10 local response version three.';
const Q11_TEXT = 'Q11 local response with tabs\tand line breaks.\nSecond line.';
const Q12_TEXT = `Q12 very long response: ${'paragraph with 日本語 العربية 😀 <tag> intact.\n'.repeat(900)}`;
const SERVER_NOW = new Date('2026-10-17T19:00:00.000Z');
const EXPECTED_RESULT_ROWS = 13;
const results: ResultRow[] = [];
const mountedScreens = new Set<RenderResult>();

let syncRoute: RouteHandler;
let onlineDescriptor: PropertyDescriptor | undefined;
let locksDescriptor: PropertyDescriptor | undefined;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;
let promptDescriptor: PropertyDescriptor | undefined;
let networkMode: 'online' | 'offline' = 'online';
let rejectNextSync: 'bad-request' | 'server-error' | null = null;
let commitThenLoseResponse = false;

function resetFixture(): void {
  fixture.data.now = new Date('2026-10-17T19:00:00.000Z');
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
  fixture.data.auditActions.length = 0;
  networkMode = 'online';
  rejectNextSync = null;
  commitThenLoseResponse = false;
  vi.clearAllMocks();
}

function recordResult(
  name: string,
  local: string,
  expected: string,
  actual: string,
  count = 1,
): void {
  const status = expected === actual ? 'PASS' : 'FAIL';
  results.push({ name, local, expected, actual, count, status });
  expect(actual, name).toBe(expected);
}

function attemptRecord(attemptId: string): AttemptRecord | undefined {
  return fixture.data.attempts.find((attempt) => attempt.id === attemptId);
}

function responseRecord(attemptId: string, questionId: string): ResponseRecord | undefined {
  return fixture.data.responses.find((response) =>
    response.attemptId === attemptId && response.questionId === questionId);
}

function versionsFor(attemptId: string, questionId: string): VersionRecord[] {
  const response = responseRecord(attemptId, questionId);
  return fixture.data.versions.filter((version) => version.responseId === response?.id)
    .sort((left, right) => left.versionNum - right.versionNum);
}

function localText(cache: LocalResponseCache | null, questionId: string): string | null {
  const response = cache?.responses[questionId];
  if (!response || typeof response !== 'object') return null;
  const text = (response as Record<string, unknown>).essayText;
  return typeof text === 'string' ? text : null;
}

async function saveLocal(
  attemptId: string,
  candidateId: string,
  responses: Record<string, unknown>,
): Promise<void> {
  const { encryptAndStore } = await import('@/components/exam/crypto-utils');
  await encryptAndStore(attemptId, PASSWORD, candidateId, {
    responses,
    flagged: [],
    timestamp: Date.now() + 10_000,
  });
}

function syncItem(questionId: string, currentText: string, answerChanges: number): SyncItem {
  return {
    questionId,
    currentText,
    selectedOptionId: null,
    wordCount: currentText.trim().split(/\s+/).filter(Boolean).length,
    timeSpentSecs: 0,
    visitCount: 1,
    answerChanges,
  };
}

function nextRequest(attemptId: string, responses: SyncItem[]): NextRequest {
  const request = new Request(`http://localhost/api/attempts/${attemptId}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  });
  return Object.assign(request, {
    cookies: {
      get: (name: string) => name === `exam_session_${attemptId}`
        ? { name, value: 'unit-test-6-session' }
        : undefined,
    },
  }) as NextRequest;
}

async function directSync(attemptId: string, items: SyncItem[]): Promise<Response> {
  return syncRoute(nextRequest(attemptId, items), { params: Promise.resolve({ id: attemptId }) });
}

async function directSyncAs(candidateId: string, attemptId: string, items: SyncItem[]): Promise<Response> {
  const previousCandidateId = fixture.data.candidateId;
  fixture.data.candidateId = candidateId;
  const result = directSync(attemptId, items);
  fixture.data.candidateId = previousCandidateId;
  return result;
}

async function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? new URL(input, window.location.href) : input instanceof URL
    ? input
    : new URL(input.url, window.location.href);
  if (url.pathname === '/api/health') return Response.json({ status: 'ok' });
  if (url.pathname.endsWith('/unlock')) return Response.json({ verified: true });
  if (url.pathname === `/api/attempts/${ATTEMPT_ONE}` || url.pathname === `/api/attempts/${ATTEMPT_TWO}`) {
    const attemptId = url.pathname.endsWith(ATTEMPT_ONE) ? ATTEMPT_ONE : ATTEMPT_TWO;
    const attempt = attemptRecord(attemptId);
    if (!attempt) return Response.json({ error: 'Attempt not found' }, { status: 404 });
    return Response.json({
      ...attempt,
      updatedAt: new Date(fixture.data.now.getTime() - 60_000).toISOString(),
      serverTime: fixture.data.now.toISOString(),
      assessment: {
        title: 'Unit Test 6 Synchronization',
        course: { code: 'LAW-U6' },
        items: QUESTION_IDS.map((questionId, index) => ({
          questionId,
          displayOrder: index + 1,
          maxMark: 2,
          question: { id: questionId, type: 'short_answer', text: `Explain ${questionId}.` },
        })),
      },
      responses: fixture.data.responses
        .filter((response) => response.attemptId === attemptId)
        .map((response) => ({
          questionId: response.questionId,
          currentText: response.currentText,
          selectedOptionId: response.selectedOptionId,
          timeSpentSecs: response.timeSpentSecs,
          visitCount: response.visitCount,
          answerChanges: response.answerChanges,
        })),
      presentationMappings: [],
    });
  }
  const match = url.pathname.match(/^\/api\/attempts\/([^/]+)\/sync$/);
  if (match) {
    if (networkMode === 'offline' || !navigator.onLine) throw new TypeError('Network request failed');
    const attemptId = decodeURIComponent(match[1]);
    if (rejectNextSync) {
      const rejection = rejectNextSync;
      rejectNextSync = null;
      return rejection === 'bad-request'
        ? Response.json({ error: 'Invalid responses' }, { status: 400 })
        : Response.json({ error: 'Temporary server failure' }, { status: 503 });
    }
    const response = await syncRoute(
      nextRequest(attemptId, JSON.parse(String(init?.body)).responses as SyncItem[]),
      { params: Promise.resolve({ id: attemptId }) },
    );
    if (commitThenLoseResponse) {
      commitThenLoseResponse = false;
      throw new TypeError('Response timed out after server commit');
    }
    return response;
  }
  if (url.pathname.endsWith('/time-events') || url.pathname.endsWith('/monitoring/events')) {
    return Response.json({ id: 'unit-test-6-event' });
  }
  return Response.json({ error: `Unexpected request ${url.pathname}` }, { status: 404 });
}

async function mountExam(attemptId = ATTEMPT_ONE, candidateId = CANDIDATE_ONE): Promise<RenderResult> {
  fixture.data.candidateId = candidateId;
  const mounted = await render(h(ExamClient, { attemptId }));
  mountedScreens.add(mounted);
  await expect.element(page.getByRole('heading', { name: 'Unit Test 6 Synchronization' })).toBeVisible();
  return mounted;
}

async function unmountExam(mounted: RenderResult): Promise<void> {
  if (!mountedScreens.has(mounted)) return;
  await mounted.unmount();
  mountedScreens.delete(mounted);
}

async function fillAnswer(questionIndex: number, text: string): Promise<void> {
  if (questionIndex > 0) await page.getByRole('button', { name: new RegExp(`^Question ${questionIndex + 1}`) }).click();
  await page.getByRole('textbox', { name: `Response for question ${questionIndex + 1}` }).fill(text);
}

async function performSync(): Promise<void> {
  await page.getByRole('button', { name: 'Save now' }).click();
}

async function waitForLocalText(attemptId: string, candidateId: string, questionId: string, expected: string): Promise<LocalResponseCache> {
  let cache: LocalResponseCache | null = null;
  await vi.waitFor(async () => {
    cache = await decryptAndLoad(attemptId, PASSWORD, candidateId);
    expect(localText(cache, questionId)).toBe(expected);
  }, { timeout: 20_000, interval: 100 });
  if (!cache) throw new Error('Local encrypted response cache was missing.');
  return cache;
}

async function deleteResponses(): Promise<void> {
  await Promise.all([ATTEMPT_ONE, ATTEMPT_TWO].map((attemptId) => clearStored(attemptId)));
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
  vi.doMock('@/lib/session-integrity', () => ({ validateAttemptSession: async () => ({ ok: true }) }));
  vi.doMock('@/lib/audit', () => ({
    createAuditEvent: async (event: { actionType: string }) => {
      fixture.data.auditActions.push(event.actionType);
      return { id: `unit-test-6-audit-${fixture.data.auditActions.length}` };
    },
  }));
  const route = await import('@/app/api/attempts/[id]/sync/route');
  syncRoute = route.POST;
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-17T19:00:00.000Z'));
  resetFixture();
  onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  locksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  promptDescriptor = Object.getOwnPropertyDescriptor(window, 'prompt');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getVideoTracks: () => [] }) },
  });
  Object.defineProperty(window, 'prompt', { configurable: true, value: vi.fn(() => PASSWORD) });
  vi.stubGlobal('fetch', vi.fn(browserFetch));
  await deleteResponses();
  await page.viewport(1440, 1000);
});

afterEach(async () => {
  for (const mounted of mountedScreens) await unmountExam(mounted);
  vi.clearAllTimers();
  vi.useRealTimers();
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  await deleteResponses();
  if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor);
  else Reflect.deleteProperty(navigator, 'onLine');
  if (locksDescriptor) Object.defineProperty(navigator, 'locks', locksDescriptor);
  else Reflect.deleteProperty(navigator, 'locks');
  if (mediaDevicesDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (promptDescriptor) Object.defineProperty(window, 'prompt', promptDescriptor);
  else Reflect.deleteProperty(window, 'prompt');
  vi.unstubAllGlobals();
});

afterAll(() => {
  const allPassed = results.length === EXPECTED_RESULT_ROWS && results.every((row) => row.status === 'PASS');
  const printable = (value: string): string => value
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  console.info([
    'Case\tLocal value\tExpected server value\tActual server value\tServer records\tStatus',
    ...results.map((row) =>
      [row.name, row.local, row.expected, row.actual, String(row.count), row.status].map(printable).join('\t')),
    `Final overall result\t\t\t\t\t${allPassed ? 'PASS' : 'FAIL'}`,
  ].join('\n'));
  expect(results).toHaveLength(EXPECTED_RESULT_ROWS);
  expect(results.every((row) => row.status === 'PASS')).toBe(true);
});

describe('Unit Test 6 — Synchronization', () => {
  it('syncs one locally saved response to the correct server record and confirms the screen status', async () => {
    await saveLocal(ATTEMPT_ONE, CANDIDATE_ONE, { Q10: { essayText: Q10_FIRST, selectedOptionId: null } });
    const local = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
    expect(localText(local, 'Q10')).toBe(Q10_FIRST);
    expect(fixture.data.responses).toHaveLength(0);

    const mounted = await mountExam();
    await expect.element(page.getByRole('textbox', { name: 'Response for question 1' })).toHaveValue(Q10_FIRST);
    vi.setSystemTime(SERVER_NOW);
    await expect(page.getByText('Changes pending')).toBeVisible();
    await expect(page).toMatchScreenshot('unit-test-6-synchronization/scenario-specific-ui-screenshots/pending-local-response');

    await performSync();
    await expect(page.getByText('Server confirmed')).toBeVisible();
    const response = responseRecord(ATTEMPT_ONE, 'Q10');
    const version = versionsFor(ATTEMPT_ONE, 'Q10')[0];
    expect(response).toMatchObject({
      attemptId: ATTEMPT_ONE,
      questionId: 'Q10',
      currentText: Q10_FIRST,
      syncStatus: 'synced',
    });
    expect(attemptRecord(ATTEMPT_ONE)?.candidateId).toBe(CANDIDATE_ONE);
    expect(attemptRecord(ATTEMPT_ONE)?.assessmentId).toBe(ASSESSMENT_ID);
    expect(version).toMatchObject({ versionNum: 1, text: Q10_FIRST, saveType: 'sync' });
    expect(version?.createdAt.getTime()).toBe(SERVER_NOW.getTime());
    await expect(page).toMatchScreenshot('unit-test-6-synchronization/scenario-specific-ui-screenshots/response-synchronized');
    recordResult('Initial synchronization', Q10_FIRST, Q10_FIRST, response?.currentText ?? '', 1);
    await unmountExam(mounted);
  });

  it('does not add another response version when synchronization is repeated', async () => {
    await saveLocal(ATTEMPT_ONE, CANDIDATE_ONE, { Q10: { essayText: Q10_FIRST, selectedOptionId: null } });
    const mounted = await mountExam();
    await expect.element(page.getByRole('textbox', { name: 'Response for question 1' })).toHaveValue(Q10_FIRST);
    await performSync();
    await expect(page.getByText('Server confirmed')).toBeVisible();
    const firstVersion = { ...versionsFor(ATTEMPT_ONE, 'Q10')[0] };
    await performSync();
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')[0]).toEqual(firstVersion);
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Server confirmed');
    }, { timeout: 10_000 });
    await expect(page).toMatchScreenshot('unit-test-6-synchronization/scenario-specific-ui-screenshots/duplicate-sync-no-change');
    recordResult('Repeated synchronization', Q10_FIRST, Q10_FIRST, responseRecord(ATTEMPT_ONE, 'Q10')?.currentText ?? '', 1);
    await unmountExam(mounted);
  });

  it('keeps one response version when identical direct handler requests are concurrent', async () => {
    const requests = await Promise.all([
      directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_FIRST, 1)]),
      directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_FIRST, 1)]),
    ]);
    expect(requests.every((response) => response.status === 200)).toBe(true);
    expect(fixture.data.responses).toHaveLength(1);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
    recordResult('Concurrent identical requests', Q10_FIRST, Q10_FIRST, responseRecord(ATTEMPT_ONE, 'Q10')?.currentText ?? '', 1);
  });

  it('makes a retry harmless after the server commits but the client loses the response', async () => {
    commitThenLoseResponse = true;
    await expect(browserFetch(`/api/attempts/${ATTEMPT_ONE}/sync`, {
      method: 'POST',
      body: JSON.stringify({ responses: [syncItem('Q10', Q10_FIRST, 1)] }),
    })).rejects.toThrow('Response timed out after server commit');
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
    await directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_FIRST, 1)]);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
    recordResult('Retry after lost commit response', Q10_FIRST, Q10_FIRST, responseRecord(ATTEMPT_ONE, 'Q10')?.currentText ?? '', 1);
  });

  it('retries the same saved answer after restarting the exam component', async () => {
    await saveLocal(ATTEMPT_ONE, CANDIDATE_ONE, { Q10: { essayText: Q10_FIRST, selectedOptionId: null } });
    const first = await mountExam();
    await fillAnswer(0, Q10_FIRST);
    await vi.advanceTimersByTimeAsync(1_000);
    await waitForLocalText(ATTEMPT_ONE, CANDIDATE_ONE, 'Q10', Q10_FIRST);
    commitThenLoseResponse = true;
    await performSync();
    await expect(page.getByText(/Network error.*saved locally/i)).toBeVisible();
    await unmountExam(first);

    const restarted = await mountExam();
    await expect.element(page.getByRole('textbox', { name: 'Response for question 1' })).toHaveValue(Q10_FIRST);
    await performSync();
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
    recordResult('Restart and retry after lost response', Q10_FIRST, Q10_FIRST, responseRecord(ATTEMPT_ONE, 'Q10')?.currentText ?? '', 1);
    await unmountExam(restarted);
  });

  it('ignores an older queued response after the newer answer has synchronized', async () => {
    await directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_THIRD, 3)]);
    await directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_SECOND, 2)]);
    expect(responseRecord(ATTEMPT_ONE, 'Q10')?.currentText).toBe(Q10_THIRD);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.text)).toEqual([Q10_THIRD]);
    recordResult('Older queued answer replay', Q10_SECOND, Q10_THIRD, responseRecord(ATTEMPT_ONE, 'Q10')?.currentText ?? '', 1);
  });

  it('synchronizes shuffled edits for multiple questions without gaps or omissions', async () => {
    const queued = [
      syncItem('Q10', Q10_FIRST, 1),
      syncItem('Q10', Q10_SECOND, 2),
      syncItem('Q10', Q10_THIRD, 3),
      syncItem('Q11', Q11_TEXT, 1),
      syncItem('Q12', Q12_TEXT, 1),
    ];
    for (const item of [queued[2], queued[4], queued[0], queued[3], queued[1]]) {
      await directSync(ATTEMPT_ONE, [item!]);
    }
    expect(responseRecord(ATTEMPT_ONE, 'Q10')?.currentText).toBe(Q10_THIRD);
    expect(responseRecord(ATTEMPT_ONE, 'Q11')?.currentText).toBe(Q11_TEXT);
    expect(responseRecord(ATTEMPT_ONE, 'Q12')?.currentText).toBe(Q12_TEXT);
    expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.versionNum)).toEqual([1]);
    expect(versionsFor(ATTEMPT_ONE, 'Q11').map((version) => version.versionNum)).toEqual([1]);
    expect(versionsFor(ATTEMPT_ONE, 'Q12').map((version) => version.versionNum)).toEqual([1]);
    expect(fixture.data.responses).toHaveLength(3);
    recordResult(
      'Shuffled multi-question and edit sync',
      'Q10 v3; Q11 and Q12 v1',
      `all exact; Q12 ${Q12_TEXT.length} characters`,
      `all exact; Q12 ${responseRecord(ATTEMPT_ONE, 'Q12')?.currentText?.length} characters`,
      3,
    );
  });

  it('retains pending local values on rejected or failed sync and succeeds when the server recovers', async () => {
    await saveLocal(ATTEMPT_ONE, CANDIDATE_ONE, { Q10: { essayText: Q10_FIRST, selectedOptionId: null } });
    networkMode = 'offline';
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const mounted = await mountExam();
    await expect.element(page.getByRole('textbox', { name: 'Response for question 1' })).toHaveValue(Q10_FIRST);
    await performSync();
    await expect(page.getByText(/Network error.*saved locally/)).toBeVisible();
    expect(fixture.data.responses).toHaveLength(0);
    expect(localText(await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE), 'Q10')).toBe(Q10_FIRST);

    networkMode = 'online';
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    rejectNextSync = 'server-error';
    const serverFailure = await fetch(`/api/attempts/${ATTEMPT_ONE}/sync`, {
      method: 'POST',
      body: JSON.stringify({ responses: [syncItem('Q10', Q10_FIRST, 1)] }),
    });
    expect(serverFailure.status).toBe(503);
    expect(fixture.data.responses).toHaveLength(0);

    rejectNextSync = 'bad-request';
    const badRequest = await fetch(`/api/attempts/${ATTEMPT_ONE}/sync`, {
      method: 'POST',
      body: JSON.stringify({ responses: [syncItem('Q10', Q10_FIRST, 1)] }),
    });
    expect(badRequest.status).toBe(400);
    expect(fixture.data.responses).toHaveLength(0);

    await performSync();
    await expect(page.getByText('Server confirmed')).toBeVisible();
    recordResult('Server rejection then recovery', Q10_FIRST, Q10_FIRST, responseRecord(ATTEMPT_ONE, 'Q10')?.currentText ?? '', 1);
    await unmountExam(mounted);
  });

  it('rejects an invalid mixed batch without writing, then accepts a separate valid batch', async () => {
    const response = await directSync(ATTEMPT_ONE, [
      syncItem('Q10', Q10_FIRST, 1),
      syncItem('unknown-question', 'Must not be written', 1),
    ]);
    expect(response.status).toBe(400);
    expect(fixture.data.responses).toHaveLength(0);
    await directSync(ATTEMPT_ONE, [syncItem('Q11', Q11_TEXT, 1)]);
    expect(responseRecord(ATTEMPT_ONE, 'Q11')?.currentText).toBe(Q11_TEXT);
    recordResult(
      'Invalid mixed batch rejected; later valid batch succeeds',
      'valid Q11 response sent separately',
      Q11_TEXT,
      responseRecord(ATTEMPT_ONE, 'Q11')?.currentText ?? '',
      1,
    );
  });

  it('rejects sync writes for submitted, expired, and inactive attempts', async () => {
    const submitted = attemptRecord(ATTEMPT_ONE);
    if (!submitted) throw new Error('Missing attempt fixture.');
    submitted.status = 'submitted';
    submitted.isActive = false;
    expect((await directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_FIRST, 1)])).status).toBe(400);

    const expired = attemptRecord(ATTEMPT_ONE);
    if (!expired) throw new Error('Missing attempt fixture.');
    expired.status = 'in_progress';
    expired.isActive = true;
    expired.expiresAt = new Date(fixture.data.now.getTime() - 1);
    expect((await directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_FIRST, 1)])).status).toBe(400);

    const inactive = attemptRecord(ATTEMPT_ONE);
    if (!inactive) throw new Error('Missing attempt fixture.');
    inactive.status = 'in_progress';
    inactive.isActive = false;
    inactive.expiresAt = new Date(fixture.data.now.getTime() + 60_000);
    expect((await directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_FIRST, 1)])).status).toBe(400);
    expect(fixture.data.responses).toHaveLength(0);
    recordResult('Closed and expired attempts', Q10_FIRST, 'no response version', 'no response version', 0);
  });

  it('rejects foreign ownership, unknown questions, and response writes for another candidate', async () => {
    const ownAttempt = await directSync(ATTEMPT_ONE, [syncItem('Q10', Q10_FIRST, 1)]);
    expect(ownAttempt.status).toBe(200);

    const foreignCandidate = fixture.data.attempts.find((attempt) => attempt.id === ATTEMPT_TWO);
    if (!foreignCandidate) throw new Error('Missing second candidate attempt.');
    const otherSession = fixture.data.candidateId;
    fixture.data.candidateId = CANDIDATE_ONE;
    const forbiddenAttempt = await directSync(ATTEMPT_TWO, [syncItem('Q10', Q10_FIRST, 1)]);
    expect(forbiddenAttempt.status).toBe(403);
    fixture.data.candidateId = otherSession;

    const invalidQuestion = await directSync(ATTEMPT_ONE, [syncItem('outside-assessment', 'bad', 1)]);
    expect(invalidQuestion.status).toBe(400);
    expect(fixture.data.responses).toHaveLength(1);
    expect(responseRecord(ATTEMPT_TWO, 'Q10')).toBeUndefined();
    recordResult('Candidate and assessment boundary', Q10_FIRST, Q10_FIRST, responseRecord(ATTEMPT_ONE, 'Q10')?.currentText ?? '', 1);
  });

  it('keeps two candidates isolated when their attempts synchronize concurrently', async () => {
    const candidateTwoText = 'Candidate two response remains private.';
    const responses = await Promise.all([
      directSyncAs(CANDIDATE_ONE, ATTEMPT_ONE, [syncItem('Q10', Q10_FIRST, 1)]),
      directSyncAs(CANDIDATE_TWO, ATTEMPT_TWO, [syncItem('Q10', candidateTwoText, 1)]),
    ]);
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(responseRecord(ATTEMPT_ONE, 'Q10')?.currentText).toBe(Q10_FIRST);
    expect(responseRecord(ATTEMPT_TWO, 'Q10')?.currentText).toBe(candidateTwoText);
    expect(attemptRecord(ATTEMPT_ONE)?.candidateId).toBe(CANDIDATE_ONE);
    expect(attemptRecord(ATTEMPT_TWO)?.candidateId).toBe(CANDIDATE_TWO);
    expect(versionsFor(ATTEMPT_ONE, 'Q10')).toHaveLength(1);
    expect(versionsFor(ATTEMPT_TWO, 'Q10')).toHaveLength(1);
    recordResult('Concurrent candidate isolation', 'distinct candidate and attempt values', 'each value stays in its attempt', 'each value stays in its attempt', 2);
  });

  it('preserves special characters and long text and uses the server clock', async () => {
    const serverClock = new Date('2035-01-01T00:00:00.000Z');
    vi.setSystemTime(serverClock);
    fixture.data.now = new Date(serverClock);
    const attempt = attemptRecord(ATTEMPT_ONE);
    if (!attempt) throw new Error('Missing attempt fixture.');
    attempt.expiresAt = new Date('2040-01-01T00:00:00.000Z');
    await directSync(ATTEMPT_ONE, [
      syncItem('Q11', Q11_TEXT, 1),
      syncItem('Q12', Q12_TEXT, 1),
    ]);
    expect(responseRecord(ATTEMPT_ONE, 'Q11')?.currentText).toBe(Q11_TEXT);
    expect(responseRecord(ATTEMPT_ONE, 'Q12')?.currentText).toBe(Q12_TEXT);
    expect(responseRecord(ATTEMPT_ONE, 'Q11')?.lastSyncedAt?.getTime()).toBe(serverClock.getTime());
    expect(responseRecord(ATTEMPT_ONE, 'Q12')?.lastSyncedAt?.getTime()).toBe(serverClock.getTime());
    expect(versionsFor(ATTEMPT_ONE, 'Q11')[0]?.createdAt.getTime()).toBe(serverClock.getTime());
    recordResult(
      'Exact text and handler-generated timestamp',
      `${Q11_TEXT.length} chars; ${Q12_TEXT.length} chars; no client timestamp field`,
      'exact values; server handler clock',
      'exact values; server handler clock',
      2,
    );
  });
});
