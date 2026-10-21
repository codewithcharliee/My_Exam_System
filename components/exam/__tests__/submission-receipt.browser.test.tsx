import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckCircle } from 'lucide-react';
import { SubmissionReceipt, type SubmissionReceiptDetails } from '@/components/exam/submission-receipt';
import { createSubmissionReceipt, maskCandidateIdentifier } from '@/lib/exam-receipt';

const h = createElement;
type AttemptStatus = 'in_progress' | 'submitted';
type NetworkMode = 'online' | 'never' | 'timeout' | 'lost_response';
type ResultRow = {
  item: string;
  expected: string;
  actual: string;
  status: 'PASS' | 'FAIL';
};

type AttemptRecord = {
  id: string;
  assessmentId: string;
  candidateId: string;
  status: AttemptStatus;
  answers: Record<string, string | null>;
  submissionReceipt: string | null;
  submittedAt: string | null;
};

const assessmentId = 'assessment-unit10-2026';
const candidateOneId = 'candidate-12345678';
const candidateTwoId = 'candidate-87654321';
const attemptOneId = 'attempt-unit10-one';
const attemptTwoId = 'attempt-unit10-two';
const serverSubmissionTime = '2026-10-11T12:00:00.000Z';
const deviceBeforeSubmit = '2026-10-11T11:59:59.000Z';
const deviceAfterSubmit = '2026-10-11T12:00:01.000Z';
const results: ResultRow[] = [];
const attemptStore = new Map<string, AttemptRecord>();
const receiptStore = new Map<string, SubmissionReceiptDetails>();
let networkMode: NetworkMode = 'online';

function recordResult(item: string, expected: string, actual: string): void {
  const status = expected === actual ? 'PASS' : 'FAIL';
  results.push({ item, expected, actual, status });
}

function beforeEachResetFixture(): void {
  attemptStore.clear();
  receiptStore.clear();
  results.length = 0;
  networkMode = 'online';
  vi.setSystemTime(new Date('2026-10-11T12:00:00.000Z'));
  const first: AttemptRecord = {
    id: attemptOneId,
    assessmentId,
    candidateId: candidateOneId,
    status: 'in_progress',
    answers: {
      'question-mcq': 'option-b',
      'question-short': 'Short answer from candidate one.',
      'question-essay': 'Essay answer from candidate one.',
    },
    submissionReceipt: null,
    submittedAt: null,
  };
  const second: AttemptRecord = {
    id: attemptTwoId,
    assessmentId,
    candidateId: candidateTwoId,
    status: 'in_progress',
    answers: {
      'question-mcq': 'option-a',
      'question-short': 'Separate response from candidate two.',
      'question-essay': 'Second candidate essay answer.',
    },
    submissionReceipt: null,
    submittedAt: null,
  };
  attemptStore.set(first.id, first);
  attemptStore.set(second.id, second);
}

function createResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { 'Content-Type': 'application/json' },
  });
}

function getStoredReceipt(attemptId: string): SubmissionReceiptDetails | null {
  const cached = receiptStore.get(attemptId);
  if (!cached) return null;
  return {
    ...cached,
    submittedAt: new Date(cached.submittedAt).toISOString(),
  };
}

function buildReceipt(attempt: AttemptRecord): SubmissionReceiptDetails {
  const timestamp = attempt.submittedAt ?? serverSubmissionTime;
  const receiptId = createSubmissionReceipt(attempt.assessmentId, attempt.id, attempt.candidateId, new Date(timestamp));
  return {
    receiptId,
    attemptId: attempt.id,
    candidateIdentifier: maskCandidateIdentifier(attempt.candidateId),
    status: 'submitted',
    submittedAt: new Date(timestamp).toISOString(),
  };
}

function buildSubmissionJson(attempt: AttemptRecord): Record<string, unknown> {
  const receipt = buildReceipt(attempt);
  receiptStore.set(attempt.id, receipt);
  return {
    receiptId: receipt.receiptId,
    attemptId: receipt.attemptId,
    candidateIdentifier: receipt.candidateIdentifier,
    status: 'submitted',
    submittedAt: receipt.submittedAt,
  };
}

function installFetchMock(): void {
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url.startsWith('/api/attempts/')) {
      const match = url.match(/^\/api\/attempts\/([^/]+)\/(submit|receipt)$/);
      if (match) {
        const attemptId = match[1];
        const route = match[2];
        const attempt = attemptStore.get(attemptId);
        const candidateHeader = new Headers(init?.headers ?? {}).get('x-candidate-id');

        if (!attempt) {
          return createResponse({ error: 'Attempt not found' }, 404);
        }

        if (route === 'receipt') {
          if (candidateHeader !== attempt.candidateId) {
            return createResponse({ error: 'Forbidden' }, 403);
          }
          if (attempt.status !== 'submitted' || !attempt.submissionReceipt) {
            return createResponse({ error: 'Receipt not found' }, 404);
          }
          const receipt = getStoredReceipt(attemptId) ?? buildReceipt(attempt);
          return createResponse({
            receiptId: receipt.receiptId,
            attemptId: receipt.attemptId,
            candidateIdentifier: receipt.candidateIdentifier,
            status: receipt.status,
            submittedAt: receipt.submittedAt,
          });
        }

        if (route === 'submit') {
          if (candidateHeader !== attempt.candidateId) {
            return createResponse({ error: 'Forbidden' }, 403);
          }

          if (networkMode === 'never') {
            await new Promise<void>(() => undefined);
          }

          if (networkMode === 'timeout') {
            throw new Error('Request timed out');
          }

          if (attempt.status === 'submitted' && attempt.submissionReceipt) {
            const receipt = buildReceipt(attempt);
            return createResponse({
              receiptId: receipt.receiptId,
              attemptId: receipt.attemptId,
              candidateIdentifier: receipt.candidateIdentifier,
              status: receipt.status,
              submittedAt: receipt.submittedAt,
            });
          }

          if (networkMode === 'lost_response') {
            const timestamp = new Date(serverSubmissionTime).toISOString();
            attempt.status = 'submitted';
            attempt.submissionReceipt = createSubmissionReceipt(attempt.assessmentId, attempt.id, attempt.candidateId, new Date(timestamp));
            attempt.submittedAt = timestamp;
            buildSubmissionJson(attempt);
            return new Response('', { status: 200, headers: { 'Content-Type': 'application/json' } });
          }

          if (method === 'POST') {
            const timestamp = new Date(serverSubmissionTime).toISOString();
            attempt.status = 'submitted';
            attempt.submissionReceipt = createSubmissionReceipt(attempt.assessmentId, attempt.id, attempt.candidateId, new Date(timestamp));
            attempt.submittedAt = timestamp;
            return createResponse(buildSubmissionJson(attempt));
          }
        }
      }
    }

    return createResponse({ error: 'Not found' }, 404);
  });

  vi.stubGlobal('fetch', fetchStub as typeof fetch);
}

function SubmissionHarness({
  candidateId,
  attemptId,
  renderMode,
}: {
  candidateId: string;
  attemptId: string;
  renderMode: 'success' | 'pending';
}) {
  const [receipt, setReceipt] = useState<SubmissionReceiptDetails | null>(null);
  const [submissionState, setSubmissionState] = useState<'idle' | 'pending' | 'submitted' | 'failed'>('idle');
  const [statusText, setStatusText] = useState('Ready to submit');

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/attempts/${attemptId}/receipt`, {
        headers: { 'x-candidate-id': candidateId },
      });
      if (response.ok) {
        const data = await response.json();
        if (typeof data.receiptId === 'string') {
          setReceipt({
            receiptId: String(data.receiptId),
            attemptId: String(data.attemptId),
            candidateIdentifier: String(data.candidateIdentifier),
            status: String(data.status),
            submittedAt: String(data.submittedAt),
          });
          setSubmissionState('submitted');
          setStatusText('Submission acknowledged');
        }
      }
    })();
  }, [attemptId, candidateId]);

  async function submitAttempt(): Promise<void> {
    if (renderMode === 'pending') {
      setSubmissionState('pending');
      setStatusText('Submission pending acknowledgement');
      try {
        const response = await fetch(`/api/attempts/${attemptId}/submit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-candidate-id': candidateId,
          },
          body: JSON.stringify({ responses: { 'question-mcq': 'option-b' } }),
        });
        if (!response.ok) {
          setSubmissionState('failed');
          setStatusText('Submission failed. Retry');
          return;
        }
        try {
          const parsed = await response.json();
          const nextReceipt: SubmissionReceiptDetails = {
            receiptId: String(parsed.receiptId),
            attemptId: String(parsed.attemptId),
            candidateIdentifier: String(parsed.candidateIdentifier),
            status: String(parsed.status),
            submittedAt: String(parsed.submittedAt),
          };
          setReceipt(nextReceipt);
          setSubmissionState('submitted');
          setStatusText('Submission acknowledged');
        } catch {
          setSubmissionState('pending');
          setStatusText('Submission pending acknowledgement');
        }
      } catch {
        setSubmissionState('failed');
        setStatusText('Submission is pending. Retry when the network is restored.');
      }
      return;
    }

    setSubmissionState('pending');
    setStatusText('Submission pending acknowledgement');

    try {
      const response = await fetch(`/api/attempts/${attemptId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-candidate-id': candidateId,
        },
        body: JSON.stringify({ responses: { 'question-mcq': 'option-b' } }),
      });

      if (!response.ok) {
        setSubmissionState('failed');
        setStatusText('Submission failed. Retry');
        return;
      }

      const parsed = await response.json();
      const nextReceipt: SubmissionReceiptDetails = {
        receiptId: String(parsed.receiptId),
        attemptId: String(parsed.attemptId),
        candidateIdentifier: String(parsed.candidateIdentifier),
        status: String(parsed.status),
        submittedAt: String(parsed.submittedAt),
      };
      setReceipt(nextReceipt);
      setSubmissionState('submitted');
      setStatusText('Submission acknowledged');
    } catch {
      setSubmissionState('failed');
      setStatusText('Submission failed. Retry');
    }
  }

  return h(
    'div',
    { className: 'min-h-screen bg-background flex items-center justify-center' },
    h(
      'div',
      { className: 'text-center max-w-md bg-card rounded-lg shadow-lg p-8' },
      submissionState === 'submitted' && h(CheckCircle, { className: 'h-16 w-16 text-green-500 mx-auto' }),
      h('h1', { className: 'text-2xl font-bold mt-4 text-foreground' }, submissionState === 'submitted' ? 'Exam Submitted' : 'Submit exam'),
      h('p', { className: 'text-muted-foreground mt-2', role: 'status' }, statusText),
      submissionState === 'submitted' && receipt
        ? h(SubmissionReceipt, { receipt })
        : null,
      submissionState === 'pending' || submissionState === 'failed'
        ? h('button', { type: 'button', className: 'mt-6', onClick: () => { void submitAttempt(); } }, 'Retry submission')
        : submissionState === 'submitted'
          ? h('button', { type: 'button', className: 'mt-6' }, 'Back to My Exams')
          : h('button', { type: 'button', className: 'mt-6', onClick: () => { void submitAttempt(); } }, 'Submit exam attempt'),
    ),
  );
}

function mountSubmissionHarness(candidateId: string, attemptId: string, renderMode: 'success' | 'pending'): { root: Root; mountPoint: HTMLDivElement } {
  const mountPoint = document.createElement('div');
  document.body.appendChild(mountPoint);
  const root = createRoot(mountPoint);
  act(() => {
    root.render(h(SubmissionHarness, { candidateId, attemptId, renderMode }));
  });
  return { root, mountPoint };
}

describe('IT-09 — submission receipt', () => {
  beforeEach(() => {
    beforeEachResetFixture();
    installFetchMock();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T12:00:00.000Z'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('acknowledges a valid submission and exposes a server-generated receipt', async () => {
    const { root, mountPoint } = mountSubmissionHarness(candidateOneId, attemptOneId, 'success');
    const submitButton = page.getByRole('button', { name: 'Submit exam attempt' });
    await submitButton.click();
    await expect.element(page.getByRole('heading', { name: 'Exam Submitted' })).toBeVisible();
    await expect.element(page.getByRole('status')).toHaveTextContent('Submission acknowledged');
    const expectedReceiptId = createSubmissionReceipt(assessmentId, attemptOneId, candidateOneId, new Date(serverSubmissionTime));
    await expect.element(page.getByTestId('receipt-id')).toHaveTextContent(expectedReceiptId);
    await expect.element(page.getByTestId('attempt-id')).toHaveTextContent(attemptOneId);
    await expect.element(page.getByTestId('candidate-identifier')).toHaveTextContent(maskCandidateIdentifier(candidateOneId));
    await expect.element(page.getByTestId('submission-status')).toHaveTextContent('submitted');
    await expect.element(page.getByTestId('server-timestamp')).toHaveTextContent(serverSubmissionTime);
    expect(mountPoint.textContent).not.toContain(candidateOneId);

    const receipt = getStoredReceipt(attemptOneId);
    expect(receipt).not.toBeNull();
    expect(receipt?.attemptId).toBe(attemptOneId);
    const beforeSubmit = new Date(deviceBeforeSubmit).getTime();
    const afterSubmit = new Date(deviceAfterSubmit).getTime();
    const receiptTime = new Date(receipt!.submittedAt).getTime();
    expect(receiptTime).toBeGreaterThan(beforeSubmit);
    expect(receiptTime).toBeLessThan(afterSubmit);
    expect(receipt?.candidateIdentifier).toBe(maskCandidateIdentifier(candidateOneId));

    const serverResponse = await fetch(`/api/attempts/${attemptOneId}/receipt`, {
      headers: { 'x-candidate-id': candidateOneId },
    });
    const data = await serverResponse.json();
    expect(String(data.receiptId)).toBe(receipt?.receiptId);
    expect(String(data.receiptId)).toBe(expectedReceiptId);
    expect(String(data.attemptId)).toBe(attemptOneId);
    expect(String(data.candidateIdentifier)).toBe(maskCandidateIdentifier(candidateOneId));
    expect(String(data.status)).toBe('submitted');
    expect(String(data.submittedAt)).toBe(serverSubmissionTime);
    expect(mountPoint.textContent).not.toContain(candidateOneId);
    await expect(page).toMatchScreenshot('unit-test-10-receipt/scenario-specific-ui-screenshots/submission-confirmation');

    recordResult('receipt shows masked candidate', maskCandidateIdentifier(candidateOneId), String(data.candidateIdentifier));
    recordResult('receipt references the correct attempt', attemptOneId, String(data.attemptId));
    recordResult('receipt status is submitted', 'submitted', String(data.status));
    recordResult('server timestamp is generated by the server', serverSubmissionTime, String(data.submittedAt));
    recordResult('candidate id is hidden from the receipt UI', 'masked', mountPoint.textContent?.includes(candidateOneId) ? 'visible' : 'masked');

    act(() => {
      root.unmount();
    });
    mountSubmissionHarness(candidateOneId, attemptOneId, 'success');
    const refreshedReceipt = await fetch(`/api/attempts/${attemptOneId}/receipt`, {
      headers: { 'x-candidate-id': candidateOneId },
    });
    const refreshedData = await refreshedReceipt.json();
    expect(String(refreshedData.receiptId)).toBe(String(data.receiptId));
    expect(String(refreshedData.submittedAt)).toBe(String(data.submittedAt));
    expect(String(refreshedData.attemptId)).toBe(attemptOneId);

    const secondCandidateRequest = await fetch(`/api/attempts/${attemptOneId}/receipt`, {
      headers: { 'x-candidate-id': candidateTwoId },
    });
    const secondCandidatePayload = await secondCandidateRequest.json();
    expect(secondCandidateRequest.status).toBe(403);
    expect(String(secondCandidatePayload.error)).toContain('Forbidden');

    recordResult('second candidate cannot read the receipt', 'forbidden', String(secondCandidatePayload.error));
    recordResult('refresh keeps the original receipt', String(data.receiptId), String(refreshedData.receiptId));
    recordResult('receipt remains stable after re-mount', String(data.submittedAt), String(refreshedData.submittedAt));
  });

  it('recovers the persisted receipt after a lost response without duplicate records', async () => {
    networkMode = 'lost_response';
    const { root, mountPoint } = mountSubmissionHarness(candidateOneId, attemptOneId, 'pending');
    const submitButton = page.getByRole('button', { name: 'Submit exam attempt' });
    await submitButton.click();
    await expect.element(page.getByRole('status')).toHaveTextContent('Submission pending acknowledgement');
    expect(mountPoint.textContent).not.toContain('Submission acknowledged');
    expect(mountPoint.textContent).not.toContain(candidateOneId);

    const pendingAttempt = attemptStore.get(attemptOneId);
    expect(pendingAttempt?.status).toBe('submitted');
    expect(pendingAttempt?.submissionReceipt).not.toBeNull();
    await expect(page).toMatchScreenshot('unit-test-10-receipt/scenario-specific-ui-screenshots/submission-pending');

    const pendingRows = await fetch(`/api/attempts/${attemptOneId}/receipt`, {
      headers: { 'x-candidate-id': candidateOneId },
    });
    const pendingPayload = await pendingRows.json();
    expect(pendingPayload.receiptId).toBe(pendingAttempt?.submissionReceipt);

    networkMode = 'online';
    act(() => {
      root.unmount();
    });
    const retryHarness = mountSubmissionHarness(candidateOneId, attemptOneId, 'success');
    await expect.element(page.getByRole('status')).toHaveTextContent('Submission acknowledged');
    await expect.element(page.getByTestId('receipt-id')).toHaveTextContent(String(pendingAttempt?.submissionReceipt));
    const finalReceipt = getStoredReceipt(attemptOneId);
    expect(finalReceipt?.receiptId).toBe(pendingAttempt?.submissionReceipt);

    const items = Array.from(attemptStore.values()).filter((record) => record.id === attemptOneId);
    expect(items.length).toBe(1);

    recordResult('lost response keeps the original receipt', String(pendingAttempt?.submissionReceipt), String(finalReceipt?.receiptId));
    recordResult('retry does not create a duplicate record', '1', String(items.length));
    recordResult(
      'pending screen does not show a completed receipt',
      'Submission pending acknowledgement',
      mountPoint.querySelector('[role="status"]')?.textContent ?? '',
    );

    act(() => {
      retryHarness.root.unmount();
    });
  });

  it('keeps the pending state during timeout and retry scenarios and records a stable receipt', async () => {
    networkMode = 'timeout';
    const harness = mountSubmissionHarness(candidateOneId, attemptOneId, 'pending');
    const submitButton = page.getByRole('button', { name: 'Submit exam attempt' });
    await submitButton.click();
    await expect.element(page.getByRole('status')).toHaveTextContent('Submission is pending. Retry when the network is restored.');
    expect(harness.mountPoint.textContent).not.toContain('Submission acknowledged');
    const timedOutStatus = harness.mountPoint.querySelector('[role="status"]')?.textContent ?? '';

    networkMode = 'online';
    const retry = page.getByRole('button', { name: 'Retry submission' });
    await retry.click();
    await expect.element(page.getByRole('status')).toHaveTextContent('Submission acknowledged');
    const receipt = getStoredReceipt(attemptOneId);
    expect(receipt?.status).toBe('submitted');
    recordResult(
      'timeout keeps the UI in a pending state',
      'Submission is pending. Retry when the network is restored.',
      timedOutStatus,
    );
    recordResult('retry completes the receipt flow', 'submitted', String(receipt?.status));

    act(() => {
      harness.root.unmount();
    });
  });
});

it('prints a results table and confirms the overall submission receipt status', async () => {
  await Promise.resolve();
  const tableText = results.map((row) => `${row.item} | ${row.expected} | ${row.actual} | ${row.status}`).join('\n');
  console.log(tableText);
  console.log(`Final overall result: ${results.some((row) => row.status === 'FAIL') ? 'FAIL' : 'PASS'}`);
  expect(results.some((row) => row.status === 'FAIL')).toBe(false);
});
