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
const START = new Date('2026-10-11T20:00:00.000Z');
const PASSWORD = 'h02-test-password';
const ASSESSMENT_ID = 'assessment-h02-2026';
const CANDIDATE_ONE = 'candidate-h02-one';
const CANDIDATE_TWO = 'candidate-h02-two';
const ATTEMPT_ONE = 'attempt-h02-one';
const ATTEMPT_TWO = 'attempt-h02-two';
const QUESTION_IDS = {
  multipleChoice: 'h02-question-mcq',
  shortAnswer: 'h02-question-short',
  essay: 'h02-question-essay',
} as const;
const OPTION_A = 'h02-option-a';
const OPTION_B = 'h02-option-b';
const OPTION_A_LABEL = 'Option A — H02 candidate response';
const OPTION_B_LABEL = 'Option B — H02 alternate response';
const CANDIDATE_ONE_SHORT = 'H02-CANDIDATE-ONE-SHORT-FINAL — consideration remains distinct.';
const CANDIDATE_ONE_ESSAY = 'H02-CANDIDATE-ONE-ESSAY-FINAL:\n“naïve café Ω.”';
const CANDIDATE_TWO_SHORT = 'H02-CANDIDATE-TWO-SHORT — separate attempt, same exam.';
const CANDIDATE_TWO_ESSAY = 'H02-CANDIDATE-TWO-ESSAY:\n“別々の答え.”';

type ScenarioName = 'Offline synchronization' | 'Retries and ownership' | 'Same-attempt reopening';
type ScenarioStatus = 'PASS' | 'FAIL';

const scenarioResults: Record<ScenarioName, ScenarioStatus> = {
  'Offline synchronization': 'FAIL',
  'Retries and ownership': 'FAIL',
  'Same-attempt reopening': 'FAIL',
};

type SyncPayload = {
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount: number;
  timeSpentSecs: number;
  visitCount: number;
  answerChanges: number;
};

type VersionRecord = {
  versionNum: number;
  text: string | null;
  selectedOptionId: string | null;
};

type ServerRecord = {
  candidateId: string;
  assessmentId: string;
  attemptId: string;
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  versions: VersionRecord[];
};

type AttemptData = {
  id: string;
  candidateId: string;
  assessmentId: string;
  status: 'in_progress';
  isActive: true;
  expiresAt: string;
  responses: Array<{
    questionId: string;
    currentText: string | null;
    selectedOptionId: string | null;
    timeSpentSecs: number;
    visitCount: number;
    answerChanges: number;
  }>;
  assessment: {
    title: string;
    course: { code: string };
    items: Array<{
      questionId: string;
      displayOrder: number;
      maxMark: number;
      question: {
        id: string;
        type: 'multiple_choice' | 'short_answer' | 'essay';
        text: string;
        options?: Array<{ id: string; text: string; sortOrder: number }>;
      };
    }>;
  };
  presentationMappings: [];
};

const questionRecords: AttemptData['assessment']['items'] = [
  {
    questionId: QUESTION_IDS.multipleChoice,
    displayOrder: 1,
    maxMark: 1,
    question: {
      id: QUESTION_IDS.multipleChoice,
      type: 'multiple_choice',
      text: 'Choose the H02 multiple-choice response.',
      options: [
        { id: OPTION_A, text: OPTION_A_LABEL, sortOrder: 1 },
        { id: OPTION_B, text: OPTION_B_LABEL, sortOrder: 2 },
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
      text: 'Give the H02 short response.',
    },
  },
  {
    questionId: QUESTION_IDS.essay,
    displayOrder: 3,
    maxMark: 10,
    question: {
      id: QUESTION_IDS.essay,
      type: 'essay',
      text: 'Write the H02 essay response.',
    },
  },
];

const questionIds = Object.values(QUESTION_IDS);
const questionIdSet = new Set<string>(questionIds);
const allAttempts = [
  { id: ATTEMPT_ONE, candidateId: CANDIDATE_ONE },
  { id: ATTEMPT_TWO, candidateId: CANDIDATE_TWO },
] as const;
const liveRenderings = new Set<RenderResult>();
const serverRecords = new Map<string, ServerRecord>();
const attemptCreationCounts = new Map<string, number>();
const acceptedSyncRequests: string[] = [];
let connectivity: 'online' | 'offline' = 'online';
let dropNextSyncAcknowledgement = false;
let navigatorOnlineDescriptor: PropertyDescriptor | undefined;
let navigatorLocksDescriptor: PropertyDescriptor | undefined;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;
let promptDescriptor: PropertyDescriptor | undefined;

function recordKey(attemptId: string, questionId: string): string {
  return `${attemptId}:${questionId}`;
}

function seedBaseline(attemptId: string, candidateId: string) {
  const baseline: Array<Pick<ServerRecord, 'questionId' | 'currentText' | 'selectedOptionId'>> = [
    { questionId: QUESTION_IDS.multipleChoice, currentText: null, selectedOptionId: OPTION_B },
    { questionId: QUESTION_IDS.shortAnswer, currentText: `H02 old short for ${candidateId}.`, selectedOptionId: null },
    { questionId: QUESTION_IDS.essay, currentText: `H02 old essay for ${candidateId}.`, selectedOptionId: null },
  ];
  attemptCreationCounts.set(attemptId, 1);
  baseline.forEach((response) => {
    serverRecords.set(recordKey(attemptId, response.questionId), {
      ...response,
      candidateId,
      assessmentId: ASSESSMENT_ID,
      attemptId,
      versions: [{
        versionNum: 1,
        text: response.currentText,
        selectedOptionId: response.selectedOptionId,
      }],
    });
  });
}

function resetServer() {
  serverRecords.clear();
  acceptedSyncRequests.length = 0;
  attemptCreationCounts.clear();
  seedBaseline(ATTEMPT_ONE, CANDIDATE_ONE);
  seedBaseline(ATTEMPT_TWO, CANDIDATE_TWO);
  connectivity = 'online';
  dropNextSyncAcknowledgement = false;
}

function getAttempt(attemptId: string): AttemptData | null {
  const attempt = allAttempts.find((candidate) => candidate.id === attemptId);
  if (!attempt) return null;
  return {
    ...attempt,
    assessmentId: ASSESSMENT_ID,
    status: 'in_progress',
    isActive: true,
    expiresAt: new Date(START.getTime() + 60 * 60_000).toISOString(),
    responses: questionIds.map((questionId) => {
      const saved = serverRecords.get(recordKey(attemptId, questionId));
      return {
        questionId,
        currentText: saved?.currentText ?? null,
        selectedOptionId: saved?.selectedOptionId ?? null,
        timeSpentSecs: 0,
        visitCount: 1,
        answerChanges: 1,
      };
    }),
    assessment: {
      title: 'H02 Synchronization Examination',
      course: { code: 'LAW-H02' },
      items: questionRecords,
    },
    presentationMappings: [],
  };
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') throw new Error('Expected a JSON object.');
  return value as Record<string, unknown>;
}

function parseSyncBody(body: BodyInit | null | undefined): SyncPayload[] {
  if (typeof body !== 'string') throw new Error('Expected a JSON sync body.');
  const data = asObject(JSON.parse(body) as unknown);
  if (!Array.isArray(data.responses)) throw new Error('Sync body is missing responses.');
  return data.responses.map((raw) => {
    const response = asObject(raw);
    if (
      typeof response.questionId !== 'string'
      || !(response.currentText === null || typeof response.currentText === 'string')
      || !(response.selectedOptionId === null || typeof response.selectedOptionId === 'string')
      || typeof response.wordCount !== 'number'
      || typeof response.timeSpentSecs !== 'number'
      || typeof response.visitCount !== 'number'
      || typeof response.answerChanges !== 'number'
    ) throw new Error('Sync payload response is malformed.');
    return {
      questionId: response.questionId,
      currentText: response.currentText,
      selectedOptionId: response.selectedOptionId,
      wordCount: response.wordCount,
      timeSpentSecs: response.timeSpentSecs,
      visitCount: response.visitCount,
      answerChanges: response.answerChanges,
    };
  });
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function requestPath(input: RequestInfo | URL): string {
  if (typeof input === 'string') return new URL(input, window.location.href).pathname;
  if (input instanceof URL) return input.pathname;
  return new URL(input.url, window.location.href).pathname;
}

async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const path = requestPath(input);
  if (path === '/api/health') {
    if (connectivity === 'offline') throw new TypeError('Network request failed');
    return jsonResponse({ status: 'ok' });
  }
  if (path.endsWith('/unlock')) {
    if (connectivity === 'offline') throw new TypeError('Network request failed');
    return jsonResponse({ verified: true });
  }
  const attemptMatch = path.match(/^\/api\/attempts\/([^/]+)$/);
  if (attemptMatch) {
    if (connectivity === 'offline') throw new TypeError('Network request failed');
    const attempt = getAttempt(decodeURIComponent(attemptMatch[1]));
    return attempt ? jsonResponse(attempt) : jsonResponse({ error: 'Attempt not found' }, 404);
  }
  const syncMatch = path.match(/^\/api\/attempts\/([^/]+)\/sync$/);
  if (syncMatch) {
    if (connectivity === 'offline') throw new TypeError('Network request failed');
    const attemptId = decodeURIComponent(syncMatch[1]);
    const attempt = allAttempts.find((candidate) => candidate.id === attemptId);
    if (!attempt) return jsonResponse({ error: 'Unknown attempt' }, 404);

    const responses = parseSyncBody(init?.body);
    const saved: Array<{ record: ServerRecord; payload: SyncPayload }> = [];
    for (const response of responses) {
      if (!questionIdSet.has(response.questionId)) return jsonResponse({ error: 'Unknown question' }, 400);
      const key = recordKey(attemptId, response.questionId);
      const previous = serverRecords.get(key);
      if (!previous || previous.candidateId !== attempt.candidateId) {
        return jsonResponse({ error: 'Attempt ownership mismatch' }, 403);
      }
      if (
        previous.currentText !== response.currentText
        || previous.selectedOptionId !== response.selectedOptionId
      ) {
        previous.versions.push({
          versionNum: previous.versions.length + 1,
          text: response.currentText,
          selectedOptionId: response.selectedOptionId,
        });
      }
      previous.currentText = response.currentText;
      previous.selectedOptionId = response.selectedOptionId;
      saved.push({ record: previous, payload: response });
    }
    acceptedSyncRequests.push(attemptId);
    if (dropNextSyncAcknowledgement) {
      dropNextSyncAcknowledgement = false;
      throw new TypeError('Sync response timed out after the server committed it');
    }
    return jsonResponse({
      status: 'synced',
      syncedAt: new Date().toISOString(),
      responses: saved.map(({ record, payload }) => ({
        questionId: record.questionId,
        currentText: record.currentText,
        selectedOptionId: record.selectedOptionId,
        wordCount: payload.wordCount,
        timeSpentSecs: payload.timeSpentSecs,
        visitCount: payload.visitCount,
        answerChanges: payload.answerChanges,
      })),
    });
  }
  if (path.endsWith('/time-events') || path.endsWith('/monitoring/events')) return jsonResponse({ id: 'h02-event' });
  return jsonResponse({ error: 'Unexpected test request' }, 404);
}

async function mountExam(attemptId: string): Promise<RenderResult> {
  const mounted = await render(h(ExamClient, { attemptId }));
  liveRenderings.add(mounted);
  await expect.element(page.getByRole('heading', { name: 'H02 Synchronization Examination' })).toBeVisible();
  return mounted;
}

async function unmountExam(mounted: RenderResult): Promise<void> {
  if (!liveRenderings.has(mounted)) return;
  await mounted.unmount();
  liveRenderings.delete(mounted);
}

async function selectOption(optionLabel: string): Promise<void> {
  await page.getByRole('button', { name: optionLabel }).click();
}

async function localCache(
  attemptId: string,
  candidateId: string,
  expected?: { shortAnswer?: string; essay?: string; selectedOptionId?: string },
): Promise<LocalResponseCache> {
  let cached: LocalResponseCache | null = null;
  await vi.waitFor(async () => {
    cached = await decryptAndLoad(attemptId, PASSWORD, candidateId);
    expect(cached).not.toBeNull();
    if (expected?.shortAnswer !== undefined) {
      expect(localQuestion(cached as LocalResponseCache, QUESTION_IDS.shortAnswer).essayText).toBe(expected.shortAnswer);
    }
    if (expected?.essay !== undefined) {
      expect(localQuestion(cached as LocalResponseCache, QUESTION_IDS.essay).essayText).toBe(expected.essay);
    }
    if (expected?.selectedOptionId !== undefined) {
      expect(localQuestion(cached as LocalResponseCache, QUESTION_IDS.multipleChoice).selectedOptionId)
        .toBe(expected.selectedOptionId);
    }
  }, { timeout: 20_000, interval: 100 });
  if (!cached) throw new Error(`No local response cache for ${attemptId}.`);
  return cached;
}

function localQuestion(cache: LocalResponseCache, questionId: string): Record<string, unknown> {
  const response = cache.responses[questionId];
  if (!response || typeof response !== 'object') throw new Error(`No local answer for ${questionId}.`);
  return response as Record<string, unknown>;
}

function assertSynced(attemptId: string, candidateId: string, expectedShort: string, expectedEssay: string) {
  const current = questionIds.map((questionId) => serverRecords.get(recordKey(attemptId, questionId)));
  expect(current.every((response) => response !== undefined)).toBe(true);
  for (const response of current) {
    expect(response?.candidateId).toBe(candidateId);
    expect(response?.assessmentId).toBe(ASSESSMENT_ID);
    expect(response?.attemptId).toBe(attemptId);
    expect(response?.versions.length).toBe(2);
    expect(response?.versions[1].versionNum).toBeGreaterThan(response?.versions[0].versionNum ?? 0);
  }
  expect(serverRecords.get(recordKey(attemptId, QUESTION_IDS.multipleChoice))?.selectedOptionId).toBe(OPTION_A);
  expect(serverRecords.get(recordKey(attemptId, QUESTION_IDS.shortAnswer))?.currentText).toBe(expectedShort);
  expect(serverRecords.get(recordKey(attemptId, QUESTION_IDS.essay))?.currentText).toBe(expectedEssay);
  expect(current).toHaveLength(3);
}

async function markScenario(name: ScenarioName, action: () => Promise<void>) {
  try {
    await action();
    scenarioResults[name] = 'PASS';
  } catch (error) {
    scenarioResults[name] = 'FAIL';
    throw error;
  }
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  resetServer();
  navigatorOnlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  navigatorLocksDescriptor = Object.getOwnPropertyDescriptor(navigator, 'locks');
  mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
  promptDescriptor = Object.getOwnPropertyDescriptor(window, 'prompt');
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [], getVideoTracks: () => [] }) },
  });
  Object.defineProperty(window, 'prompt', { configurable: true, value: vi.fn(() => PASSWORD) });
  vi.stubGlobal('fetch', vi.fn(mockFetch));
  await clearStored(ATTEMPT_ONE);
  await clearStored(ATTEMPT_TWO);
  await page.viewport(1440, 1000);
});

afterEach(async () => {
  for (const mounted of liveRenderings) await unmountExam(mounted);
  vi.clearAllTimers();
  await clearStored(ATTEMPT_ONE);
  await clearStored(ATTEMPT_TWO);
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
    `Offline synchronization | ${scenarioResults['Offline synchronization']}`,
    `Retries and ownership | ${scenarioResults['Retries and ownership']}`,
    `Same-attempt reopening | ${scenarioResults['Same-attempt reopening']}`,
  ].join('\n'));
});

describe('IT-07 — offline synchronization and same-attempt recovery', () => {
  it('synchronizes exact offline versions once online, separates candidates, and reopens the same attempt', async () => {
    let firstCandidateScreen = await mountExam(ATTEMPT_ONE);
    await markScenario('Offline synchronization', async () => {
      await selectOption(OPTION_A_LABEL);
      await page.getByRole('button', { name: /^Question 2/ }).click();
      await page.getByRole('textbox', { name: 'Response for question 2' }).fill('H02-CANDIDATE-ONE-SHORT-DRAFT.');
      await page.getByRole('button', { name: /^Question 3/ }).click();
      await page.getByRole('textbox', { name: 'Response for question 3' }).fill('H02-CANDIDATE-ONE-ESSAY-DRAFT.');

      connectivity = 'offline';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
      await vi.advanceTimersByTimeAsync(1000);
      const firstLocal = await localCache(ATTEMPT_ONE, CANDIDATE_ONE, {
        selectedOptionId: OPTION_A,
        shortAnswer: 'H02-CANDIDATE-ONE-SHORT-DRAFT.',
        essay: 'H02-CANDIDATE-ONE-ESSAY-DRAFT.',
      });
      expect(localQuestion(firstLocal, QUESTION_IDS.multipleChoice).selectedOptionId).toBe(OPTION_A);
      expect(localQuestion(firstLocal, QUESTION_IDS.shortAnswer).essayText).toBe('H02-CANDIDATE-ONE-SHORT-DRAFT.');
      expect(localQuestion(firstLocal, QUESTION_IDS.essay).essayText).toBe('H02-CANDIDATE-ONE-ESSAY-DRAFT.');
      expect(acceptedSyncRequests).toHaveLength(0);
      expect(questionIds.every((questionId) =>
        serverRecords.get(recordKey(ATTEMPT_ONE, questionId))?.versions.length === 1)).toBe(true);

      await page.getByRole('button', { name: /^Question 2/ }).click();
      await page.getByRole('textbox', { name: 'Response for question 2' }).fill(CANDIDATE_ONE_SHORT);
      await page.getByRole('button', { name: /^Question 3/ }).click();
      await page.getByRole('textbox', { name: 'Response for question 3' }).fill('H02-CANDIDATE-ONE-ESSAY-EDIT-ONE.');
      await page.getByRole('textbox', { name: 'Response for question 3' }).fill(CANDIDATE_ONE_ESSAY);
      await page.getByRole('button', { name: /^Question 1/ }).click();
      await selectOption(OPTION_B_LABEL);
      await selectOption(OPTION_A_LABEL);
      await vi.advanceTimersByTimeAsync(1000);

      const latestLocal = await localCache(ATTEMPT_ONE, CANDIDATE_ONE, {
        selectedOptionId: OPTION_A,
        shortAnswer: CANDIDATE_ONE_SHORT,
        essay: CANDIDATE_ONE_ESSAY,
      });
      expect(localQuestion(latestLocal, QUESTION_IDS.multipleChoice).selectedOptionId).toBe(OPTION_A);
      expect(localQuestion(latestLocal, QUESTION_IDS.shortAnswer).essayText).toBe(CANDIDATE_ONE_SHORT);
      expect(localQuestion(latestLocal, QUESTION_IDS.essay).essayText).toBe(CANDIDATE_ONE_ESSAY);
      expect(acceptedSyncRequests).toHaveLength(0);

      connectivity = 'online';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(acceptedSyncRequests).toHaveLength(1), { timeout: 10_000 });
      assertSynced(ATTEMPT_ONE, CANDIDATE_ONE, CANDIDATE_ONE_SHORT, CANDIDATE_ONE_ESSAY);
      await expect.element(page.getByText(/Server confirmed/)).toBeVisible();
    });

    await markScenario('Retries and ownership', async () => {
      await page.getByRole('button', { name: /^Question 3/ }).click();
      await page.getByRole('button', { name: 'Save now' }).click();
      await vi.waitFor(() => expect(acceptedSyncRequests).toHaveLength(2), { timeout: 10_000 });

      dropNextSyncAcknowledgement = true;
      await page.getByRole('button', { name: 'Save now' }).click();
      await vi.waitFor(() => expect(document.body.textContent).toContain('Network error - responses saved locally'), {
        timeout: 10_000,
      });
      await page.getByRole('button', { name: 'Save now' }).click();
      await vi.waitFor(() => expect(acceptedSyncRequests).toHaveLength(4), { timeout: 10_000 });
      expect(acceptedSyncRequests).toEqual([ATTEMPT_ONE, ATTEMPT_ONE, ATTEMPT_ONE, ATTEMPT_ONE]);

      for (const questionId of questionIds) {
        const record = serverRecords.get(recordKey(ATTEMPT_ONE, questionId));
        expect(record?.versions.map((version) => version.versionNum)).toEqual([1, 2]);
        expect(new Set(record?.versions.map((version) => version.versionNum)).size).toBe(2);
      }

      connectivity = 'offline';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
      await unmountExam(firstCandidateScreen);

      connectivity = 'online';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      const secondCandidateScreen = await mountExam(ATTEMPT_TWO);
      connectivity = 'offline';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
      await page.getByRole('button', { name: /^Question 1/ }).click();
      await selectOption(OPTION_A_LABEL);
      await page.getByRole('button', { name: /^Question 2/ }).click();
      await page.getByRole('textbox', { name: 'Response for question 2' }).fill(CANDIDATE_TWO_SHORT);
      await page.getByRole('button', { name: /^Question 3/ }).click();
      await page.getByRole('textbox', { name: 'Response for question 3' }).fill(CANDIDATE_TWO_ESSAY);
      await vi.advanceTimersByTimeAsync(1000);
      const secondLocal = await localCache(ATTEMPT_TWO, CANDIDATE_TWO, {
        selectedOptionId: OPTION_A,
        shortAnswer: CANDIDATE_TWO_SHORT,
        essay: CANDIDATE_TWO_ESSAY,
      });
      expect(localQuestion(secondLocal, QUESTION_IDS.shortAnswer).essayText).toBe(CANDIDATE_TWO_SHORT);
      expect(localQuestion(secondLocal, QUESTION_IDS.essay).essayText).toBe(CANDIDATE_TWO_ESSAY);
      expect(serverRecords.get(recordKey(ATTEMPT_ONE, QUESTION_IDS.shortAnswer))?.currentText).toBe(CANDIDATE_ONE_SHORT);

      connectivity = 'online';
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      window.dispatchEvent(new Event('online'));
      await vi.waitFor(() => expect(acceptedSyncRequests.filter((id) => id === ATTEMPT_TWO)).toHaveLength(1), {
        timeout: 10_000,
      });
      assertSynced(ATTEMPT_TWO, CANDIDATE_TWO, CANDIDATE_TWO_SHORT, CANDIDATE_TWO_ESSAY);
      expect(serverRecords.get(recordKey(ATTEMPT_ONE, QUESTION_IDS.essay))?.currentText).toBe(CANDIDATE_ONE_ESSAY);
      expect(serverRecords.get(recordKey(ATTEMPT_TWO, QUESTION_IDS.essay))?.currentText).not.toBe(CANDIDATE_ONE_ESSAY);
      await unmountExam(secondCandidateScreen);
    });

    await markScenario('Same-attempt reopening', async () => {
      expect(attemptCreationCounts.get(ATTEMPT_ONE)).toBe(1);
      expect(attemptCreationCounts.get(ATTEMPT_TWO)).toBe(1);
      firstCandidateScreen = await mountExam(ATTEMPT_ONE);
      await page.getByRole('button', { name: /^Question 1/ }).click();
      await expect.element(page.getByRole('button', { name: OPTION_A_LABEL })).toHaveClass(/border-primary/);
      await page.getByRole('button', { name: /^Question 2/ }).click();
      await expect.element(page.getByRole('textbox', { name: 'Response for question 2' })).toHaveValue(CANDIDATE_ONE_SHORT);
      await page.getByRole('button', { name: /^Question 3/ }).click();
      await expect.element(page.getByRole('textbox', { name: 'Response for question 3' })).toHaveValue(CANDIDATE_ONE_ESSAY);
      expect(attemptCreationCounts.get(ATTEMPT_ONE)).toBe(1);

      await page.getByRole('button', { name: 'Save now' }).click();
      await vi.waitFor(() => {
        expect(acceptedSyncRequests.filter((id) => id === ATTEMPT_ONE)).toHaveLength(5);
      }, { timeout: 10_000 });
      assertSynced(ATTEMPT_ONE, CANDIDATE_ONE, CANDIDATE_ONE_SHORT, CANDIDATE_ONE_ESSAY);
      await expect.element(page.getByText(/Server confirmed/)).toBeVisible();
      vi.setSystemTime(START);
      await vi.advanceTimersByTimeAsync(1000);
      const countdown = document.querySelector<HTMLElement>('[data-testid="exam-countdown"]');
      expect(countdown).not.toBeNull();
      countdown!.style.visibility = 'hidden';
      await expect(page).toMatchScreenshot('h02/scenario-specific-ui-screenshots/synchronized-responses-after-reconnection');
      await unmountExam(firstCandidateScreen);
    });
  }, 60_000);
});
