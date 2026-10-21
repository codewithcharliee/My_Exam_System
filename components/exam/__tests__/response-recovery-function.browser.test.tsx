import { createElement } from 'react';
import type { NextRequest } from 'next/server';
import { page } from 'vitest/browser';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, type RenderResult } from 'vitest-browser-react';
import ExamClient from '@/app/exam/exam/exam-client';
import {
  clearStored,
  decryptAndLoad,
  deriveCredentialKey,
  encryptAndStore,
  type LocalResponseCache,
} from '@/components/exam/crypto-utils';

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
  updatedAt: Date;
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
type SyncResponse = {
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount: number;
  timeSpentSecs: number;
  visitCount: number;
  answerChanges: number;
};
type Outcome = {
  testCase: string;
  saved: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
};
type RouteHandler = (request: NextRequest, context: { params: Promise<{ id: string }> }) => Promise<Response>;

const { fixture } = vi.hoisted(() => {
  const data = {
    currentCandidateId: 'candidate-unit-5-one',
    now: new Date('2026-10-17T18:00:00.000Z'),
    responseId: 0,
    versionId: 0,
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
        candidate: { id: attempt.candidateId, name: 'Test Candidate', email: 'candidate@example.test' },
        assessment: {
          title: 'Unit Test 5 Response Recovery',
          course: { code: 'LAW-U5', title: 'Law' },
          items: questionIds.map((questionId, index) => ({
            questionId,
            displayOrder: index + 1,
            maxMark: index + 1,
            question: {
              id: questionId,
              type: 'essay',
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
    $transaction: vi.fn(async <T,>(callback: (tx: Record<string, unknown>) => Promise<T>): Promise<T> =>
      callback({
        attempt: attemptModel,
        response: responseModel,
        responseVersion: responseVersionModel,
        $queryRaw: prisma.$queryRaw,
      })),
  };

  return { fixture: { data, prisma } };
});

const h = createElement;
const PASSWORD = 'unit-test-5-local-cache-password';
const ASSESSMENT_ID = 'assessment-unit-5';
const ATTEMPT_ONE = 'attempt-unit-5-one';
const ATTEMPT_TWO = 'attempt-unit-5-two';
const CANDIDATE_ONE = 'candidate-unit-5-one';
const CANDIDATE_TWO = 'candidate-unit-5-two';
const QUESTION_IDS = ['Q10', 'Q11', 'Q12'] as const;
const KNOWN_RESPONSE = 'Q10 saved exactly: “consideration” — café Ω.';
const EMPTY_RESPONSE = '';
const WHITESPACE_RESPONSE = ' \t\n  \n';
const LONG_RESPONSE = Array.from({ length: 320 }, (_, index) =>
  `Paragraph ${index + 1}: tabs\tquotes "‘’“”"; [brackets] {curly}; café naïve; 日本語; العربية; 😀; <script>do not execute</script>.\nSecond line ${index + 1}.`,
).join('\n\n');
const INTERRUPTED_BASELINE = 'Last committed answer — complete and exact.';
const INTERRUPTED_DRAFT = `${INTERRUPTED_BASELINE}\n\nUNCOMMITTED-NEW-TEXT`;
const NOW = new Date('2026-10-17T18:00:00.000Z');
const EXPECTED_OUTCOME_COUNT = 11;
const outcomeRows: Outcome[] = [];
const mountedScreens = new Set<RenderResult>();

let getAttemptRoute: RouteHandler;
let syncAttemptRoute: RouteHandler;
let onlineDescriptor: PropertyDescriptor | undefined;
let locksDescriptor: PropertyDescriptor | undefined;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;
let promptDescriptor: PropertyDescriptor | undefined;
let networkMode: 'online' | 'offline' = 'online';

function resetFixture(): void {
  fixture.data.currentCandidateId = CANDIDATE_ONE;
  fixture.data.now = new Date(NOW);
  fixture.data.responseId = 0;
  fixture.data.versionId = 0;
  fixture.data.attempts.splice(0, fixture.data.attempts.length,
    {
      id: ATTEMPT_ONE,
      candidateId: CANDIDATE_ONE,
      assessmentId: ASSESSMENT_ID,
      status: 'in_progress',
      isActive: true,
      updatedAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    },
    {
      id: ATTEMPT_TWO,
      candidateId: CANDIDATE_TWO,
      assessmentId: ASSESSMENT_ID,
      status: 'in_progress',
      isActive: true,
      updatedAt: new Date(NOW.getTime() - 60_000),
      expiresAt: new Date(NOW.getTime() + 60 * 60_000),
    },
  );
  fixture.data.responses.length = 0;
  fixture.data.versions.length = 0;
  fixture.data.auditActions.length = 0;
  networkMode = 'online';
  vi.clearAllMocks();
}

function recordOutcome(testCase: string, saved: string, expected: string, actual: string): void {
  const status = expected === actual ? 'PASS' : 'FAIL';
  outcomeRows.push({ testCase, saved, expected, actual, status });
  expect(actual, testCase).toBe(expected);
}

function responseFor(attemptId: string, questionId: string): ResponseRecord | undefined {
  return fixture.data.responses.find((response) =>
    response.attemptId === attemptId && response.questionId === questionId);
}

function versionsFor(attemptId: string, questionId: string): VersionRecord[] {
  const response = responseFor(attemptId, questionId);
  return fixture.data.versions
    .filter((version) => version.responseId === response?.id)
    .sort((left, right) => left.versionNum - right.versionNum);
}

function versionNumberSummary(attemptId: string): string {
  return QUESTION_IDS.map((questionId) =>
    `${questionId}:${versionsFor(attemptId, questionId).map((version) => version.versionNum).join(',')}`).join(';');
}

async function saveLocalResponses(
  attemptId: string,
  candidateId: string,
  responses: Record<string, unknown>,
  timestamp = Date.now() + 10_000,
): Promise<void> {
  await encryptAndStore(attemptId, PASSWORD, candidateId, {
    responses,
    flagged: [],
    timestamp,
  });
}

function responseText(cache: LocalResponseCache, questionId: string): string {
  const response = cache.responses[questionId];
  if (!response || typeof response !== 'object') {
    throw new Error(`No saved response exists for ${questionId}.`);
  }
  const text = (response as Record<string, unknown>).essayText;
  if (typeof text !== 'string') throw new Error(`Saved response for ${questionId} is not text.`);
  return text;
}

function cookiesFor(attemptId: string): Map<string, string> {
  return new Map([[`exam_session_${attemptId}`, 'unit-test-5-session']]);
}

function asNextRequest(request: Request, attemptId: string): NextRequest {
  const cookies = cookiesFor(attemptId);
  return Object.assign(request, {
    cookies: {
      get: (name: string) => {
        const value = cookies.get(name);
        return value === undefined ? undefined : { name, value };
      },
    },
  }) as NextRequest;
}

async function invokeAttemptGet(attemptId: string): Promise<Response> {
  const request = asNextRequest(new Request(`http://localhost/api/attempts/${attemptId}`), attemptId);
  return getAttemptRoute(request, { params: Promise.resolve({ id: attemptId }) });
}

async function invokeSync(attemptId: string, responses: SyncResponse[]): Promise<Response> {
  const request = asNextRequest(new Request(`http://localhost/api/attempts/${attemptId}/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ responses }),
  }), attemptId);
  return syncAttemptRoute(request, { params: Promise.resolve({ id: attemptId }) });
}

function syncPayload(questionId: string, text: string, answerChanges: number): SyncResponse {
  return {
    questionId,
    currentText: text,
    selectedOptionId: null,
    wordCount: text.trim().split(/\s+/).filter(Boolean).length,
    timeSpentSecs: 0,
    visitCount: 1,
    answerChanges,
  };
}

async function saveServerText(questionId: string, text: string, answerChanges: number): Promise<void> {
  const response = await invokeSync(ATTEMPT_ONE, [syncPayload(questionId, text, answerChanges)]);
  expect(response.status).toBe(200);
}

async function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? new URL(input, window.location.href) : input instanceof URL
    ? input
    : new URL(input.url, window.location.href);
  if (url.pathname === '/api/health') return Response.json({ status: 'ok' });
  if (url.pathname.endsWith('/unlock')) return Response.json({ verified: true });
  const attemptMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)$/);
  if (attemptMatch) {
    const attemptId = decodeURIComponent(attemptMatch[1]);
    return invokeAttemptGet(attemptId);
  }
  const syncMatch = url.pathname.match(/^\/api\/attempts\/([^/]+)\/sync$/);
  if (syncMatch) {
    if (networkMode === 'offline' || !navigator.onLine) throw new TypeError('Network request failed');
    return syncAttemptRoute(
      asNextRequest(new Request(url, init), decodeURIComponent(syncMatch[1])),
      { params: Promise.resolve({ id: decodeURIComponent(syncMatch[1]) }) },
    );
  }
  if (url.pathname.endsWith('/time-events') || url.pathname.endsWith('/monitoring/events')) {
    return Response.json({ id: 'unit-test-5-event' });
  }
  return Response.json({ error: `Unexpected request ${url.pathname}` }, { status: 404 });
}

async function mountExam(attemptId = ATTEMPT_ONE, candidateId = CANDIDATE_ONE): Promise<RenderResult> {
  fixture.data.currentCandidateId = candidateId;
  const mounted = await render(h(ExamClient, { attemptId }));
  mountedScreens.add(mounted);
  await expect.element(page.getByRole('heading', { name: 'Unit Test 5 Response Recovery' })).toBeVisible();
  return mounted;
}

async function unmountExam(mounted: RenderResult): Promise<void> {
  if (!mountedScreens.has(mounted)) return;
  await mounted.unmount();
  mountedScreens.delete(mounted);
}

async function mountAndAssertAnswer(questionIndex: number, expected: string): Promise<void> {
  const textbox = page.getByRole('textbox', { name: `Response for question ${questionIndex + 1}` });
  await expect.element(textbox).toHaveValue(expected);
}

async function storeEncryptedPayload(attemptId: string, payload: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveCredentialKey(PASSWORD, salt);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(payload),
  );
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('bingham_exam_db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction('responses', 'readwrite');
  tx.objectStore('responses').put({
    key: attemptId,
    salt: Array.from(salt),
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
    timestamp: Date.now() + 10_000,
  });
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Corrupted cache fixture transaction aborted'));
  });
  db.close();
}

async function readRawCacheRecord(attemptId: string): Promise<Record<string, unknown> | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('bingham_exam_db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const request = db.transaction('responses', 'readonly').objectStore('responses').get(attemptId);
  const value: unknown = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

beforeAll(async () => {
  (globalThis as Record<string, unknown>).__dirname = new URL('../../..', import.meta.url).pathname;
  vi.doMock('@/lib/prisma', () => ({ prisma: fixture.prisma }));
  vi.doMock('@/lib/roles', () => ({
    requireRouteAuthorization: async () => ({
      error: null,
      session: { user: { id: fixture.data.currentCandidateId, role: 'candidate' } },
    }),
  }));
  vi.doMock('@/lib/session-integrity', () => ({
    validateAttemptSession: async () => ({ ok: true }),
  }));
  vi.doMock('@/lib/audit', () => ({
    createAuditEvent: async (event: { actionType: string }) => {
      fixture.data.auditActions.push(event.actionType);
      return { id: `audit-${fixture.data.auditActions.length}` };
    },
  }));
  const [attemptModule, syncModule] = await Promise.all([
    import('@/app/api/attempts/[id]/route'),
    import('@/app/api/attempts/[id]/sync/route'),
  ]);
  getAttemptRoute = attemptModule.GET;
  syncAttemptRoute = syncModule.POST;
});

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
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
  for (const mounted of mountedScreens) await unmountExam(mounted);
  vi.clearAllTimers();
  vi.useRealTimers();
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
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
  vi.unstubAllGlobals();
});

afterAll(() => {
  const allPassed = outcomeRows.length === EXPECTED_OUTCOME_COUNT
    && outcomeRows.every((row) => row.status === 'PASS');
  console.info([
    'Case\tSaved value\tExpected recovered value\tResult\tStatus',
    ...outcomeRows.map((row) =>
      `${row.testCase}\t${row.saved}\t${row.expected}\t${row.actual}\t${row.status}`),
    `Final overall result\t\t\t\t${allPassed ? 'PASS' : 'FAIL'}`,
  ].join('\n'));
  expect(outcomeRows).toHaveLength(EXPECTED_OUTCOME_COUNT);
  expect(outcomeRows.every((row) => row.status === 'PASS')).toBe(true);
});

describe('Unit Test 5 — Response recovery', () => {
  it('recovers the exact saved response for its question, attempt, and candidate after a fresh mount', async () => {
    await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
      Q10: { essayText: KNOWN_RESPONSE, selectedOptionId: null },
    });

    const recovered = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
    expect(recovered).not.toBeNull();
    expect(recovered?.candidateId).toBe(CANDIDATE_ONE);
    expect(Object.keys(recovered?.responses ?? {})).toContain('Q10');
    expect(responseText(recovered!, 'Q10')).toBe(KNOWN_RESPONSE);
    const attemptResponse = await invokeAttemptGet(ATTEMPT_ONE);
    expect(attemptResponse.status).toBe(200);
    const attemptBody: unknown = await attemptResponse.json();
    expect(attemptBody).toMatchObject({
      id: ATTEMPT_ONE,
      candidateId: CANDIDATE_ONE,
      assessmentId: ASSESSMENT_ID,
    });
    const mounted = await mountExam();
    await mountAndAssertAnswer(0, KNOWN_RESPONSE);
    recordOutcome(
      'Exact response after fresh mount',
      'Q10 · assessment-unit-5 · attempt-unit-5-one · candidate-unit-5-one',
      KNOWN_RESPONSE,
      responseText(recovered!, 'Q10'),
    );
    await unmountExam(mounted);
  });

  describe('Empty response', () => {
    it('preserves an empty string separately from a missing response and follows the answered rule', async () => {
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q10: { essayText: EMPTY_RESPONSE, selectedOptionId: null },
      });
      const recovered = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
      expect(recovered).not.toBeNull();
      expect(Object.prototype.hasOwnProperty.call(recovered?.responses, 'Q10')).toBe(true);
      expect(responseText(recovered!, 'Q10')).toBe('');
      expect(Object.prototype.hasOwnProperty.call(recovered?.responses, 'Q11')).toBe(false);
      expect(recovered?.responses.Q11).toBeUndefined();

      const mounted = await mountExam();
      await mountAndAssertAnswer(0, '');
      await expect.element(page.getByText('Answered (0)')).toBeVisible();
      recordOutcome('Empty and missing responses', 'empty string; Q11 absent', 'Q10 is empty, Q11 is missing', 'Q10 is empty, Q11 is missing');
      await unmountExam(mounted);
    });

    it('returns whitespace-only text without trimming it during recovery', async () => {
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q10: { essayText: WHITESPACE_RESPONSE, selectedOptionId: null },
      });
      const recovered = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
      expect(recovered).not.toBeNull();
      expect(responseText(recovered!, 'Q10')).toBe(WHITESPACE_RESPONSE);
      recordOutcome('Whitespace-only response', JSON.stringify(WHITESPACE_RESPONSE), JSON.stringify(WHITESPACE_RESPONSE), JSON.stringify(responseText(recovered!, 'Q10')));
    });
  });

  describe('Long response', () => {
    it('recovers a long Unicode and multiline response exactly without truncation', async () => {
      expect(LONG_RESPONSE.length).toBeGreaterThan(20_000);
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q12: { essayText: LONG_RESPONSE, selectedOptionId: null },
      });
      const recovered = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
      expect(recovered).not.toBeNull();
      const text = responseText(recovered!, 'Q12');
      expect(text).toBe(LONG_RESPONSE);
      expect(text.length).toBe(LONG_RESPONSE.length);
      expect(text).toContain('\t');
      expect(text).toContain('日本語');
      expect(text).toContain('العربية');
      expect(text).toContain('😀');
      expect(text).toContain('<script>do not execute</script>');
      const mounted = await mountExam();
      await page.getByRole('button', { name: /^Question 3/ }).click();
      await mountAndAssertAnswer(2, LONG_RESPONSE);
      recordOutcome('Long response beyond any configured limit', `${LONG_RESPONSE.length} characters`, `${LONG_RESPONSE.length} exact characters`, `${text.length} exact characters`);
      await unmountExam(mounted);
    });
  });

  describe('Multiple versions', () => {
    it('restores the latest server version across questions and ignores a delayed older version', async () => {
      const q10First = 'Q10 version one — retained unchanged.';
      const q10Latest = 'Q10 version three — latest complete text.';
      const q11First = 'Q11 version one.';
      const q11Latest = 'Q11 version two.';
      const q12First = 'Q12 version one.';
      const q12Latest = LONG_RESPONSE;

      for (const [questionId, text] of [
        ['Q10', q10First],
        ['Q11', q11First],
        ['Q12', q12First],
      ] as const) {
        await saveServerText(questionId, text, 1);
      }
      fixture.data.now = new Date(NOW.getTime() + 2_000);
      await saveServerText('Q10', q10Latest, 3);
      await saveServerText('Q11', q11Latest, 2);
      await saveServerText('Q12', q12Latest, 2);
      fixture.data.now = new Date(NOW.getTime() + 1_000);
      await saveServerText('Q10', 'Q10 delayed version two.', 2);

      expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.versionNum)).toEqual([1, 2]);
      expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.text)).toEqual([q10First, q10Latest]);
      expect(versionsFor(ATTEMPT_ONE, 'Q10')[0]?.text).toBe(q10First);
      expect(responseFor(ATTEMPT_ONE, 'Q10')?.currentText).toBe(q10Latest);
      expect(versionsFor(ATTEMPT_ONE, 'Q11').map((version) => version.text)).toEqual([q11First, q11Latest]);
      expect(versionsFor(ATTEMPT_ONE, 'Q12').map((version) => version.text)).toEqual([q12First, q12Latest]);
      for (const questionId of QUESTION_IDS) {
        const versions = versionsFor(ATTEMPT_ONE, questionId);
        expect(versions.at(-1)?.versionNum).toBe(versions.length);
        expect(responseFor(ATTEMPT_ONE, questionId)?.currentText).toBe(versions.at(-1)?.text);
      }

      const serverLoad = await invokeAttemptGet(ATTEMPT_ONE);
      expect(serverLoad.status).toBe(200);
      const serverBody: unknown = await serverLoad.json();
      expect(serverBody).toMatchObject({
        responses: expect.arrayContaining([
          expect.objectContaining({ questionId: 'Q10', currentText: q10Latest }),
          expect.objectContaining({ questionId: 'Q11', currentText: q11Latest }),
          expect.objectContaining({ questionId: 'Q12', currentText: q12Latest }),
        ]),
      });
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q10: { essayText: q10Latest, selectedOptionId: null },
        Q11: { essayText: q11Latest, selectedOptionId: null },
        Q12: { essayText: q12Latest, selectedOptionId: null },
      });
      const recovered = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
      expect(recovered).not.toBeNull();
      expect(responseText(recovered!, 'Q10')).toBe(q10Latest);
      expect(responseText(recovered!, 'Q11')).toBe(q11Latest);
      expect(responseText(recovered!, 'Q12')).toBe(q12Latest);
      expect(versionNumberSummary(ATTEMPT_ONE)).toBe('Q10:1,2;Q11:1,2;Q12:1,2');

      const mounted = await mountExam();
      await mountAndAssertAnswer(0, q10Latest);
      await page.getByRole('button', { name: /^Question 2/ }).click();
      await mountAndAssertAnswer(1, q11Latest);
      await page.getByRole('button', { name: /^Question 3/ }).click();
      await mountAndAssertAnswer(2, q12Latest);
      await expect(page).toMatchScreenshot('unit-test-5-recovery/scenario-specific-ui-screenshots/restored-multiple-answers');
      recordOutcome('Multiple questions and out-of-order versions', 'two committed versions per question', 'latest Q10/Q11/Q12; server versions 1,2 each', 'latest Q10/Q11/Q12; server versions 1,2 each');
      await unmountExam(mounted);
    });
  });

  describe('Interrupted save', () => {
    it('keeps the last complete cache value when an IndexedDB transaction aborts after put', async () => {
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q10: { essayText: INTERRUPTED_BASELINE, selectedOptionId: null },
      });
      const originalPut = IDBObjectStore.prototype.put;
      const putSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args
      ) {
        const request = Reflect.apply(originalPut, this, args) as IDBRequest<IDBValidKey>;
        this.transaction.abort();
        return request;
      });
      await encryptAndStore(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE, {
        responses: { Q10: { essayText: INTERRUPTED_DRAFT, selectedOptionId: null } },
        flagged: [],
        timestamp: Date.now() + 20_000,
      });
      putSpy.mockRestore();

      const throwingPutSpy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
        this: IDBObjectStore,
        ...args
      ) {
        Reflect.apply(originalPut, this, args);
        this.transaction.abort();
        throw new Error('Injected failure after staging the cache write');
      });
      await encryptAndStore(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE, {
        responses: { Q10: { essayText: `${INTERRUPTED_DRAFT} CORRUPTED`, selectedOptionId: null } },
        flagged: [],
        timestamp: Date.now() + 30_000,
      });
      throwingPutSpy.mockRestore();

      const recovered = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
      expect(recovered).not.toBeNull();
      expect(responseText(recovered!, 'Q10')).toBe(INTERRUPTED_BASELINE);
      expect(responseText(recovered!, 'Q10')).not.toContain('UNCOMMITTED-NEW-TEXT');
      recordOutcome(
        'Aborted and throwing IndexedDB writes',
        'complete baseline; both newer transactions aborted',
        INTERRUPTED_BASELINE,
        responseText(recovered!, 'Q10'),
      );
    });

    it('recovers a draft persisted before the encrypted cache write completes', async () => {
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q10: { essayText: INTERRUPTED_BASELINE, selectedOptionId: null },
      });
      const mounted = await mountExam();
      await page.getByRole('textbox', { name: 'Response for question 1' }).fill(INTERRUPTED_DRAFT);
      await vi.advanceTimersByTimeAsync(999);
      await unmountExam(mounted);
      vi.clearAllTimers();
      const recovered = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
      expect(recovered).not.toBeNull();
      expect(responseText(recovered!, 'Q10')).toBe(INTERRUPTED_BASELINE);
      const localProgress = JSON.parse(localStorage.getItem(`exam-progress:${ATTEMPT_ONE}`) ?? 'null') as {
        responses?: Record<string, { essayText?: string }>;
      } | null;
      expect(localProgress?.responses?.Q10?.essayText).toBe(INTERRUPTED_DRAFT);
      recordOutcome('Component discarded before delayed cache write', 'encrypted cache baseline; localStorage draft', INTERRUPTED_DRAFT, localProgress?.responses?.Q10?.essayText ?? '');
    });

    it('recovers the complete local save after a network failure and versions the next normal save', async () => {
      await saveServerText('Q10', INTERRUPTED_BASELINE, 1);
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q10: { essayText: INTERRUPTED_BASELINE, selectedOptionId: null },
      });
      const mounted = await mountExam();
      networkMode = 'offline';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      await page.getByRole('textbox', { name: 'Response for question 1' }).fill(INTERRUPTED_DRAFT);
      await page.getByRole('button', { name: 'Save now' }).click();
      await expect.element(page.getByText(/Network error.*saved locally/i)).toBeVisible();
      await vi.advanceTimersByTimeAsync(1_000);
      let local: LocalResponseCache | null = null;
      await vi.waitFor(async () => {
        local = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
        expect(local).not.toBeNull();
        expect(responseText(local!, 'Q10')).toBe(INTERRUPTED_DRAFT);
      }, { timeout: 20_000, interval: 100 });
      expect(responseFor(ATTEMPT_ONE, 'Q10')?.currentText).toBe(INTERRUPTED_BASELINE);
      await unmountExam(mounted);

      networkMode = 'online';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      const recovered = await mountExam();
      await mountAndAssertAnswer(0, INTERRUPTED_DRAFT);
      await expect(page).toMatchScreenshot('unit-test-5-recovery/scenario-specific-ui-screenshots/restored-after-interrupted-save');
      await saveServerText('Q10', INTERRUPTED_DRAFT, 2);
      expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.versionNum)).toEqual([1, 2]);
      expect(versionsFor(ATTEMPT_ONE, 'Q10').map((version) => version.text))
        .toEqual([INTERRUPTED_BASELINE, INTERRUPTED_DRAFT]);
      recordOutcome('Network interruption and later normal save', 'complete offline draft; next server version', 'local exact draft; server versions 1,2', 'local exact draft; server versions 1,2');
      await unmountExam(recovered);
    });
  });

  describe('Integrity and isolation', () => {
    it('rejects missing data, a foreign candidate, and another candidate’s attempt', async () => {
      expect(await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE)).toBeNull();
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q10: { essayText: KNOWN_RESPONSE, selectedOptionId: null },
      });
      expect(await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_TWO)).toBeNull();
      expect(await decryptAndLoad(ATTEMPT_TWO, PASSWORD, CANDIDATE_TWO)).toBeNull();

      fixture.data.currentCandidateId = CANDIDATE_TWO;
      const forbidden = await invokeAttemptGet(ATTEMPT_ONE);
      expect(forbidden.status).toBe(403);
      recordOutcome('Candidate and attempt isolation', 'candidate one data under attempt one', 'no foreign cache or server response', 'no foreign cache or server response');
    });

    it('handles corrupted and incomplete encrypted cache payloads without inventing responses', async () => {
      await storeEncryptedPayload(ATTEMPT_ONE, '{invalid-json');
      await expect(decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE)).resolves.toBeNull();

      await storeEncryptedPayload(ATTEMPT_ONE, JSON.stringify({
        candidateId: CANDIDATE_ONE,
        responses: {},
        timestamp: Date.now(),
      }));
      await expect(decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE)).resolves.toBeNull();
      recordOutcome('Corrupted and missing-field cache records', 'invalid JSON; then missing flagged field', 'no recovered response', 'no recovered response');
    });

    it('returns the same recovery repeatedly without mutating stored encrypted data', async () => {
      await saveLocalResponses(ATTEMPT_ONE, CANDIDATE_ONE, {
        Q10: { essayText: KNOWN_RESPONSE, selectedOptionId: null },
        Q11: { essayText: WHITESPACE_RESPONSE, selectedOptionId: null },
      });
      const storedBefore = await readRawCacheRecord(ATTEMPT_ONE);
      const first = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
      const second = await decryptAndLoad(ATTEMPT_ONE, PASSWORD, CANDIDATE_ONE);
      const storedAfter = await readRawCacheRecord(ATTEMPT_ONE);
      expect(first).toEqual(second);
      expect(responseText(first!, 'Q10')).toBe(KNOWN_RESPONSE);
      expect(responseText(first!, 'Q11')).toBe(WHITESPACE_RESPONSE);
      expect(storedAfter).toEqual(storedBefore);
      recordOutcome('Repeated recovery has no side effects', 'two exact responses', 'same result; stored record unchanged', 'same result; stored record unchanged');
    });
  });
});
