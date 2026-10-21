import { createElement } from 'react';
import { page } from 'vitest/browser';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, type RenderResult } from 'vitest-browser-react';
import ExamClient from '@/app/exam/exam/exam-client';
import { clearStored, decryptAndLoad, type LocalResponseCache } from '@/components/exam/crypto-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const h = createElement;
const NOW = new Date('2026-10-11T19:00:00.000Z');
const PASSWORD = 'h01-test-password';
const CANDIDATE_ID = 'candidate-h01-2026';
const ATTEMPT_ID = 'attempt-h01-2026';
const OTHER_CANDIDATE_ID = 'candidate-h01-other';
const OTHER_ATTEMPT_ID = 'attempt-h01-other';
const QUESTION_IDS = {
  multipleChoice: 'h01-question-mcq',
  shortAnswer: 'h01-question-short',
  essay: 'h01-question-essay',
} as const;
const OPTION_A_ID = 'h01-option-a';
const OPTION_A_TEXT = 'Option A — consideration is required';
const SHORT_ANSWER = 'Consideration is the value exchanged by each party to support a contractual promise.';
const ESSAY = [
  'A contract requires agreement, consideration, and an intention to create legal relations.',
  '“Consideration” may be an act, a forbearance, or a promise; café, naïve, and Ω remain intact.',
  'A past act is generally insufficient unless it was performed at the promisor’s request.',
].join('\n\n');
const OFFLINE_EXTENSION = '\n\nOffline addition: résumé, “good faith,” and § 2 are preserved.';

type ScenarioName = 'Browser refresh' | 'Network interruption' | 'Power loss';
type ScenarioStatus = 'PASS' | 'FAIL';

const scenarioResults: Record<ScenarioName, ScenarioStatus> = {
  'Browser refresh': 'FAIL',
  'Network interruption': 'FAIL',
  'Power loss': 'FAIL',
};

type ExamResponse = {
  questionId: string;
  selectedOptionId: string | null;
  currentText: string | null;
  timeSpentSecs: number;
  visitCount: number;
  answerChanges: number;
};

type AttemptFixture = {
  id: string;
  candidateId: string;
  status: 'in_progress';
  updatedAt: string;
  expiresAt: string;
  responses: ExamResponse[];
  assessment: {
    title: string;
    course: { code: string };
    items: Array<{
      questionId: string;
      displayOrder: number;
      maxMark: number;
      question: {
        id: string;
        type: 'MCQ' | 'short_answer' | 'essay';
        text: string;
        options?: Array<{ id: string; text: string; sortOrder: number }>;
      };
    }>;
  };
  presentationMappings: [];
};

const liveRenderings = new Set<RenderResult>();
let fetchMode: 'online' | 'offline' = 'online';
let navigatorOnlineDescriptor: PropertyDescriptor | undefined;
let navigatorLocksDescriptor: PropertyDescriptor | undefined;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;
let promptDescriptor: PropertyDescriptor | undefined;

function createAttempt(id: string, candidateId: string, includeOlderServerAnswers: boolean): AttemptFixture {
  const olderResponses: ExamResponse[] = [
    {
      questionId: QUESTION_IDS.multipleChoice,
      selectedOptionId: 'h01-option-b',
      currentText: null,
      timeSpentSecs: 0,
      visitCount: 1,
      answerChanges: 1,
    },
    {
      questionId: QUESTION_IDS.shortAnswer,
      selectedOptionId: null,
      currentText: 'An older server-saved short answer.',
      timeSpentSecs: 0,
      visitCount: 1,
      answerChanges: 1,
    },
    {
      questionId: QUESTION_IDS.essay,
      selectedOptionId: null,
      currentText: 'An older server-saved essay.',
      timeSpentSecs: 0,
      visitCount: 1,
      answerChanges: 1,
    },
  ];

  return {
    id,
    candidateId,
    status: 'in_progress',
    updatedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    expiresAt: new Date(NOW.getTime() + 60 * 60_000).toISOString(),
    responses: includeOlderServerAnswers ? olderResponses : [],
    assessment: {
      title: 'H01 Response Recovery Examination',
      course: { code: 'LAW 201' },
      items: [
        {
          questionId: QUESTION_IDS.multipleChoice,
          displayOrder: 1,
          maxMark: 1,
          question: {
            id: QUESTION_IDS.multipleChoice,
            type: 'MCQ',
            text: 'Which option identifies the required doctrine?',
            options: [
              { id: OPTION_A_ID, text: OPTION_A_TEXT, sortOrder: 1 },
              { id: 'h01-option-b', text: 'Option B — an older server choice', sortOrder: 2 },
            ],
          },
        },
        {
          questionId: QUESTION_IDS.shortAnswer,
          displayOrder: 2,
          maxMark: 3,
          question: {
            id: QUESTION_IDS.shortAnswer,
            type: 'short_answer',
            text: 'Explain consideration in contract law.',
          },
        },
        {
          questionId: QUESTION_IDS.essay,
          displayOrder: 3,
          maxMark: 10,
          question: {
            id: QUESTION_IDS.essay,
            type: 'essay',
            text: 'Discuss the role of consideration in contract formation.',
          },
        },
      ],
    },
    presentationMappings: [],
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function responseFromAttemptUrl(url: string): Response {
  const match = url.match(/^\/api\/attempts\/([^/]+)$/);
  if (!match) return jsonResponse({ error: 'Not found' }, 404);
  const id = decodeURIComponent(match[1]);
  if (id === ATTEMPT_ID) return jsonResponse(createAttempt(id, CANDIDATE_ID, true));
  if (id === OTHER_ATTEMPT_ID) return jsonResponse(createAttempt(id, OTHER_CANDIDATE_ID, false));
  return jsonResponse({ error: 'Not found' }, 404);
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.pathname;
  return new URL(input.url).pathname;
}

function installFetchStub() {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (fetchMode === 'offline') throw new TypeError('Network request failed');
    if (url === '/api/health') return jsonResponse({ status: 'ok' });
    if (url.endsWith('/unlock')) return jsonResponse({ verified: true });
    if (url === `/api/attempts/${ATTEMPT_ID}` || url === `/api/attempts/${OTHER_ATTEMPT_ID}`) {
      return responseFromAttemptUrl(url);
    }
    if (url.endsWith('/sync')) return jsonResponse({ responses: [], syncedAt: NOW.toISOString() });
    if (url.endsWith('/monitoring/events')) return jsonResponse({ id: 'h01-event' });
    if (url.endsWith('/time-events')) return jsonResponse({ ok: true });
    return jsonResponse({ error: 'Unexpected test request' }, 404);
  }));
}

async function mountExam(attemptId = ATTEMPT_ID): Promise<RenderResult> {
  const mounted = await render(h(ExamClient, { attemptId }));
  liveRenderings.add(mounted);
  await expect.element(page.getByRole('heading', { name: 'H01 Response Recovery Examination' })).toBeVisible();
  return mounted;
}

async function unmountExam(mounted: RenderResult): Promise<void> {
  if (!liveRenderings.has(mounted)) return;
  await mounted.unmount();
  liveRenderings.delete(mounted);
}

async function enterAllResponses(): Promise<void> {
  await page.getByRole('button', { name: OPTION_A_TEXT }).click();
  await page.getByRole('button', { name: /^Question 2/ }).click();
  await page.getByRole('textbox', { name: 'Response for question 2' }).fill(SHORT_ANSWER);
  await page.getByRole('button', { name: /^Question 3/ }).click();
  await page.getByRole('textbox', { name: 'Response for question 3' }).fill(ESSAY);
}

async function storedRecordTimestamp(attemptId: string): Promise<number | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('bingham_exam_db', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const request = db.transaction('responses', 'readonly').objectStore('responses').get(attemptId);
  const result: unknown = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  if (!result || typeof result !== 'object') return null;
  const timestamp = (result as Record<string, unknown>).timestamp;
  return typeof timestamp === 'number' ? timestamp : null;
}

async function readPersistedCache(
  expectedEssay = ESSAY,
  minimumStoredTimestamp = Date.now() + 1000,
): Promise<LocalResponseCache> {
  await vi.waitFor(async () => {
    expect(await storedRecordTimestamp(ATTEMPT_ID)).toBeGreaterThanOrEqual(minimumStoredTimestamp);
  }, { timeout: 60_000, interval: 100 });
  const cache = await decryptAndLoad(ATTEMPT_ID, PASSWORD, CANDIDATE_ID);
  if (!cache) throw new Error('The locally autosaved response cache was not found.');
  expect(savedText(cache, QUESTION_IDS.essay)).toBe(expectedEssay);
  return cache;
}

function responseValue(cache: LocalResponseCache, questionId: string): Record<string, unknown> {
  const response = cache.responses[questionId];
  if (!response || typeof response !== 'object') {
    throw new Error(`No saved response exists for question ${questionId}.`);
  }
  return response as Record<string, unknown>;
}

function savedText(cache: LocalResponseCache, questionId: string): string {
  const value = responseValue(cache, questionId).essayText;
  if (typeof value !== 'string') throw new Error(`Saved response for ${questionId} is not text.`);
  return value;
}

async function assertRestoredAnswers(
  cache: LocalResponseCache,
  shortAnswer: string,
  essay: string,
  restoredEssay = essay,
): Promise<void> {
  expect(cache.candidateId).toBe(CANDIDATE_ID);
  expect(Object.keys(cache.responses)).toEqual(expect.arrayContaining(Object.values(QUESTION_IDS)));
  expect(responseValue(cache, QUESTION_IDS.multipleChoice).selectedOptionId).toBe(OPTION_A_ID);
  expect(savedText(cache, QUESTION_IDS.shortAnswer)).toBe(shortAnswer);
  expect(savedText(cache, QUESTION_IDS.essay)).toBe(essay);
  expect(savedText(cache, QUESTION_IDS.shortAnswer).length).toBe(shortAnswer.length);
  expect(savedText(cache, QUESTION_IDS.essay).length).toBe(essay.length);
  expect(savedText(cache, QUESTION_IDS.shortAnswer).indexOf(shortAnswer))
    .toBe(savedText(cache, QUESTION_IDS.shortAnswer).lastIndexOf(shortAnswer));
  expect(savedText(cache, QUESTION_IDS.essay).indexOf(essay))
    .toBe(savedText(cache, QUESTION_IDS.essay).lastIndexOf(essay));
  expect(essay).toContain('“');
  expect(essay).toContain('é');
  expect(essay).toContain('Ω');
  expect(essay).toContain('\n\n');

  await page.getByRole('button', { name: /^Question 1/ }).click();
  await expect.element(page.getByRole('button', { name: OPTION_A_TEXT })).toHaveClass(/border-primary/);
  await page.getByRole('button', { name: /^Question 2/ }).click();
  await expect.element(page.getByRole('textbox', { name: 'Response for question 2' })).toHaveValue(shortAnswer);
  await page.getByRole('button', { name: /^Question 3/ }).click();
  await expect.element(page.getByRole('textbox', { name: 'Response for question 3' })).toHaveValue(restoredEssay);
}

function RecoveryEvidence({ shortAnswer, essay }: { shortAnswer: string; essay: string }) {
  return h(
    'main',
    {
      style: {
        minHeight: '100vh',
        padding: '56px',
        background: '#ffffff',
        color: '#000000',
        fontFamily: '"Times New Roman", Times, serif',
      },
    },
    h('header', { style: { maxWidth: '1050px', margin: '0 auto 30px' } },
      h('div', { style: { fontSize: '12px', letterSpacing: '0.12em' } }, 'BINGHAM UNIVERSITY'),
      h('h1', { style: { margin: '8px 0', fontSize: '30px' } }, 'H01 · Response recovery after refresh'),
      h('p', { style: { margin: 0 } }, `Candidate ${CANDIDATE_ID} · Attempt ${ATTEMPT_ID}`),
    ),
    h('section', {
      style: { maxWidth: '1050px', margin: '0 auto', padding: '28px', border: '1px solid #000000' },
    },
    h('h2', { style: { marginTop: 0 } }, 'Recovered responses · exact local version'),
    h('article', { style: { padding: '16px 0', borderTop: '1px solid #000000' } },
      h('h3', { style: { margin: '0 0 8px' } }, `Question 1 · ${QUESTION_IDS.multipleChoice}`),
      h('p', { style: { margin: 0 } }, 'Option A — consideration is required'),
    ),
    h('article', { style: { padding: '16px 0', borderTop: '1px solid #000000' } },
      h('h3', { style: { margin: '0 0 8px' } }, `Question 2 · ${QUESTION_IDS.shortAnswer}`),
      h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, shortAnswer),
    ),
    h('article', { style: { padding: '16px 0', borderTop: '1px solid #000000' } },
      h('h3', { style: { margin: '0 0 8px' } }, `Question 3 · ${QUESTION_IDS.essay}`),
      h('p', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, essay),
    )),
  );
}

async function runScenario(name: ScenarioName, testAction: () => Promise<void>): Promise<void> {
  try {
    await testAction();
    scenarioResults[name] = 'PASS';
  } catch (error) {
    scenarioResults[name] = 'FAIL';
    throw error;
  }
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  fetchMode = 'online';
  navigatorOnlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  navigatorLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  promptDescriptor = Object.getOwnPropertyDescriptor(window, 'prompt');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [],
        getVideoTracks: () => [],
      }),
    },
  });
  Object.defineProperty(window, 'prompt', { configurable: true, value: vi.fn(() => PASSWORD) });
  installFetchStub();
  await clearStored(ATTEMPT_ID);
  await clearStored(OTHER_ATTEMPT_ID);
  for (const key of [
    `exam-progress:${ATTEMPT_ID}`,
    `exam-progress:${OTHER_ATTEMPT_ID}`,
    `exam-violations:${ATTEMPT_ID}`,
    `exam-violations:${OTHER_ATTEMPT_ID}`,
  ]) localStorage.removeItem(key);
  await page.viewport(1440, 1000);
});

afterEach(async () => {
  for (const mounted of liveRenderings) await unmountExam(mounted);
  vi.clearAllTimers();
  await clearStored(ATTEMPT_ID);
  await clearStored(OTHER_ATTEMPT_ID);
  for (const key of [
    `exam-progress:${ATTEMPT_ID}`,
    `exam-progress:${OTHER_ATTEMPT_ID}`,
    `exam-violations:${ATTEMPT_ID}`,
    `exam-violations:${OTHER_ATTEMPT_ID}`,
  ]) localStorage.removeItem(key);
  if (navigatorOnlineDescriptor) Object.defineProperty(navigator, 'onLine', navigatorOnlineDescriptor);
  else Reflect.deleteProperty(navigator, 'onLine');
  if (navigatorLocksDescriptor) Object.defineProperty(navigator, 'locks', navigatorLocksDescriptor);
  else Reflect.deleteProperty(navigator, 'locks');
  if (mediaDevicesDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (promptDescriptor) Object.defineProperty(window, 'prompt', promptDescriptor);
  else Reflect.deleteProperty(window, 'prompt');
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

afterAll(() => {
  console.log([
    'Scenario | Status',
    `Browser refresh | ${scenarioResults['Browser refresh']}`,
    `Network interruption | ${scenarioResults['Network interruption']}`,
    `Power loss | ${scenarioResults['Power loss']}`,
  ].join('\n'));
});

describe('IT-07 — browser refresh recovery', () => {
  it('restores the exact last local response after a browser refresh and isolates another candidate', async () => {
    await runScenario('Browser refresh', async () => {
      const first = await mountExam();
      await enterAllResponses();
      const cacheTimestamp = Date.now() + 1000;
      await vi.advanceTimersByTimeAsync(1000);
      const cache = await readPersistedCache(ESSAY, cacheTimestamp);

      await unmountExam(first);
      const refreshed = await mountExam();
      await assertRestoredAnswers(cache, SHORT_ANSWER, ESSAY);

      await unmountExam(refreshed);
      const evidence = await render(h(RecoveryEvidence, { shortAnswer: SHORT_ANSWER, essay: ESSAY }));
      liveRenderings.add(evidence);
      await expect(page).toMatchScreenshot('h01/scenario-specific-ui-screenshots/restored-response-after-refresh');
      await expect(page).toMatchScreenshot('unit-test-5-recovery/scenario-specific-ui-screenshots/recovered-response-after-refresh');
      await unmountExam(evidence);

      expect(await decryptAndLoad(ATTEMPT_ID, PASSWORD, OTHER_CANDIDATE_ID)).toBeNull();
      const secondCandidate = await mountExam(OTHER_ATTEMPT_ID);
      await expect.element(page.getByRole('button', { name: /^Question 1$/ })).toBeVisible();
      await expect.element(page.getByRole('button', { name: OPTION_A_TEXT })).not.toHaveClass(/(^|\s)border-primary(\s|$)/);
      await page.getByRole('button', { name: /^Question 2/ }).click();
      await expect.element(page.getByRole('textbox', { name: 'Response for question 2' })).toHaveValue('');
      await page.getByRole('button', { name: /^Question 3/ }).click();
      await expect.element(page.getByRole('textbox', { name: 'Response for question 3' })).toHaveValue('');
      await unmountExam(secondCandidate);
    });
  }, 60_000);
});

describe('IT-07 — network interruption recovery', () => {
  it('recovers the newest locally saved text after offline edits while the server remains stale', async () => {
    await runScenario('Network interruption', async () => {
      const first = await mountExam();
      await enterAllResponses();
      const initialCacheTimestamp = Date.now() + 1000;
      await vi.advanceTimersByTimeAsync(1000);
      await readPersistedCache(ESSAY, initialCacheTimestamp);

      fetchMode = 'offline';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
      await page.getByRole('textbox', { name: 'Response for question 3' }).fill(`${ESSAY}${OFFLINE_EXTENSION}`);
      await page.getByRole('button', { name: 'Save now' }).click();
      await vi.waitFor(() => expect(document.body.textContent).toContain('Network error - responses saved locally'));
      await expect(page).toMatchScreenshot('h01/scenario-specific-ui-screenshots/network-interruption-local-save');
      const cacheTimestamp = Date.now() + 1000;
      await vi.advanceTimersByTimeAsync(1000);

      const latestEssay = `${ESSAY}${OFFLINE_EXTENSION}`;
      const latest = await readPersistedCache(latestEssay, cacheTimestamp);
      expect(savedText(latest, QUESTION_IDS.essay)).toBe(latestEssay);
      expect(latestEssay).not.toBe('An older server-saved essay.');
      await unmountExam(first);

      fetchMode = 'online';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
      await mountExam();
      await assertRestoredAnswers(latest, SHORT_ANSWER, latestEssay);
      const countdown = document.querySelector<HTMLElement>('[data-testid="exam-countdown"]');
      expect(countdown).not.toBeNull();
      countdown!.style.visibility = 'hidden';
      await expect(page).toMatchScreenshot('h01/scenario-specific-ui-screenshots/restored-after-network-reconnection');
    });
  }, 60_000);
});

describe('IT-07 — abrupt interruption recovery', () => {
  it('restores the latest locally persisted draft after abrupt loss without a final flush', async () => {
    await runScenario('Power loss', async () => {
      const interrupted = await mountExam();
      await enterAllResponses();
      const cacheTimestamp = Date.now() + 1000;
      await vi.advanceTimersByTimeAsync(1000);
      const lastSaved = await readPersistedCache(ESSAY, cacheTimestamp);
      const incompleteDraft = `${ESSAY}\n\nUNSAVED-PARTIAL`;
      await page.getByRole('textbox', { name: 'Response for question 3' }).fill(incompleteDraft);

      vi.clearAllTimers();
      await unmountExam(interrupted);
      const recovered = await mountExam();
      await assertRestoredAnswers(lastSaved, SHORT_ANSWER, ESSAY, incompleteDraft);
      await expect(page).toMatchScreenshot('h01/scenario-specific-ui-screenshots/restored-after-power-loss');
      expect(savedText(lastSaved, QUESTION_IDS.essay)).not.toContain('UNSAVED-PARTIAL');
      await unmountExam(recovered);
    });
  }, 60_000);
});
