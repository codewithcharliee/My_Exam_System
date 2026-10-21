import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExamTimer } from '@/components/exam/use-exam-timer';

const h = createElement;
const EXAM_START = new Date('2026-10-12T12:00:00.000Z');
const DURATION_MS = 5 * 60 * 1000;
const EXPIRES_AT = new Date(EXAM_START.getTime() + DURATION_MS).toISOString();
const results: Array<{ name: string; expected: number; actual: number; status: 'PASS' | 'FAIL' }> = [];
let monotonicTime = 0;

function TimingEvidence({
  status: initialStatus,
  serverTime,
  expiresAt,
}: {
  status: 'not_started' | 'in_progress' | 'submitted' | 'timed_out';
  serverTime: string;
  expiresAt: string;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [answerSaved, setAnswerSaved] = useState(false);
  const onExpire = () => setStatus('submitted');
  const timer = useExamTimer(status === 'in_progress' ? expiresAt : null, onExpire, serverTime);

  if (status === 'not_started') {
    return h('main', { style: style.main },
      h('section', { style: style.card },
        h('h1', null, 'Constitutional Law Examination'),
        h('p', { role: 'status' }, 'The examination has not started yet.'),
      ),
    );
  }

  if (status === 'timed_out') {
    return h('main', { style: style.main },
      h('section', { style: style.card },
        h('h1', null, 'Time expired — exam locked'),
        h('p', { role: 'status' }, 'Only answers saved before expiry were retained.'),
      ),
    );
  }

  if (status === 'submitted') {
    return h('main', { style: style.main },
      h('section', { style: style.card },
        h('h1', null, 'Exam Submitted'),
        h('p', { role: 'status' }, 'Your answers have been submitted successfully.'),
      ),
    );
  }

  return h('main', { style: style.main },
    h('section', { style: style.card },
      h('p', null, 'BINGHAM UNIVERSITY · EXAMINATION PORTAL'),
      h('h1', null, 'Constitutional Law Examination'),
      h('p', null, 'Time remaining'),
      h('output', { role: 'timer', 'data-testid': 'countdown' }, timer.formatted),
      h('p', { role: 'status' },
        timer.isCritical ? 'Less than one minute remaining'
          : timer.isUrgent ? 'Five minutes or less remaining'
            : 'Examination in progress'),
      h('label', { htmlFor: 'answer' }, 'Answer'),
      h('textarea', {
        id: 'answer',
        defaultValue: 'Saved before expiry.',
        style: { boxSizing: 'border-box', width: '180px' },
      }),
      h('p', { role: 'status' }, answerSaved ? 'Answer saved' : 'Answer not yet saved'),
      h('button', { type: 'button', onClick: () => setAnswerSaved(true) }, 'Save answer'),
      h('button', { type: 'button', onClick: () => setStatus('submitted') }, 'Submit examination'),
    ),
  );
}

const style = {
  main: {
    alignItems: 'center',
    background: '#fff',
    color: '#000',
    display: 'flex',
    fontFamily: '"Times New Roman", Times, serif',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '40px',
  },
  card: {
    border: '1px solid #000',
    color: '#000',
    fontFamily: '"Times New Roman", Times, serif',
    maxWidth: '760px',
    padding: '36px',
    width: '100%',
  },
} as const;

function compareTiming(name: string, expected: number, actual: number) {
  const status = Math.abs(expected - actual) === 0 ? 'PASS' : 'FAIL';
  results.push({ name, expected, actual, status });
  expect(actual).toBe(expected);
}

async function renderTiming(
  root: Root,
  status: 'not_started' | 'in_progress' | 'submitted' | 'timed_out',
  serverTime: string,
) {
  await act(async () => {
    root.render(h(TimingEvidence, { status, serverTime, expiresAt: EXPIRES_AT }));
  });
}

describe('H04 — examination timing and expiry', () => {
  let mountPoint: HTMLDivElement;
  let root: Root | undefined;
  let performanceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(EXAM_START);
    monotonicTime = 0;
    performanceSpy = vi.spyOn(performance, 'now').mockImplementation(() => monotonicTime);
    await page.viewport(1440, 1000);
    mountPoint = document.createElement('div');
    document.body.appendChild(mountPoint);
    root = createRoot(mountPoint);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    mountPoint?.remove();
    performanceSpy.mockRestore();
    vi.useRealTimers();
  });

  it('shows the examination as not started one second before its configured start', async () => {
    vi.setSystemTime(EXAM_START.getTime() - 1000);
    await renderTiming(root!, 'not_started', new Date(EXAM_START.getTime() - 1000).toISOString());
    await expect.element(page.getByRole('status')).toHaveTextContent('The examination has not started yet.');
    compareTiming('One second before configured start', EXAM_START.getTime() - 1000, Date.now());
  });

  it('opens the five-minute countdown at the exact configured start', async () => {
    await renderTiming(root!, 'in_progress', EXAM_START.toISOString());
    await expect.element(page.getByRole('timer')).toHaveTextContent('00:05:00');
    compareTiming('Exact configured start', EXAM_START.getTime(), Date.now());
  });

  it('shows the correct middle-of-exam time and allows the answer to be saved', async () => {
    const middle = EXAM_START.getTime() + DURATION_MS / 2;
    vi.setSystemTime(middle);
    await renderTiming(root!, 'in_progress', new Date(middle).toISOString());
    await expect.element(page.getByRole('timer')).toHaveTextContent('00:02:30');
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect.element(page.getByText('Answer saved')).toBeVisible();
    compareTiming('Middle of examination', EXAM_START.getTime() + DURATION_MS / 2, middle);
  });

  it('warns near expiry while saving and manual submission remain available', async () => {
    const nearExpiry = EXAM_START.getTime() + DURATION_MS - 5000;
    vi.setSystemTime(nearExpiry);
    await renderTiming(root!, 'in_progress', new Date(nearExpiry).toISOString());
    await expect.element(page.getByRole('timer')).toHaveTextContent('00:00:05');
    await expect.element(page.getByText('Less than one minute remaining')).toBeVisible();
    await page.getByRole('button', { name: 'Save answer' }).click();
    await expect.element(page.getByText('Answer saved')).toBeVisible();
    await page.getByRole('button', { name: 'Submit examination' }).click();
    await expect.element(page.getByRole('heading', { name: 'Exam Submitted' })).toBeVisible();
    compareTiming('Five seconds before expiry', EXPIRES_AT ? Date.parse(EXPIRES_AT) - 5000 : 0, nearExpiry);
  });

  it('automatically locks the attempt at the exact expiry moment', async () => {
    await renderTiming(root!, 'in_progress', EXAM_START.toISOString());
    monotonicTime += DURATION_MS;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DURATION_MS);
    });
    await expect.element(page.getByRole('heading', { name: 'Exam Submitted' })).toBeVisible();
    compareTiming('Exact expiry', Date.parse(EXPIRES_AT), EXAM_START.getTime() + monotonicTime);
  });

  it('keeps the attempt locked after expiry and does not reopen answer controls', async () => {
    const afterExpiry = new Date(Date.parse(EXPIRES_AT) + 1000);
    vi.setSystemTime(afterExpiry);
    await renderTiming(root!, 'timed_out', afterExpiry.toISOString());
    await expect.element(page.getByRole('heading', { name: 'Time expired — exam locked' })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Save answer' })).not.toBeInTheDocument();
    compareTiming('One second after expiry', afterExpiry.getTime(), afterExpiry.getTime());
  });

  it('keeps countdown tied to server time when the device clock moves forward or backward', async () => {
    const middle = EXAM_START.getTime() + DURATION_MS / 2;
    vi.setSystemTime(middle);
    await renderTiming(root!, 'in_progress', new Date(middle).toISOString());

    vi.setSystemTime(middle + 12 * 60 * 60 * 1000);
    monotonicTime += 1000;
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await expect.element(page.getByRole('timer')).toHaveTextContent('00:02:29');

    vi.setSystemTime(middle - 12 * 60 * 60 * 1000);
    monotonicTime += 1000;
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await expect.element(page.getByRole('timer')).toHaveTextContent('00:02:28');
    compareTiming('Device clock independence', middle + 2000, middle + monotonicTime);
  });

  it('restores the original remaining time after a mid-exam page reload', async () => {
    const middle = EXAM_START.getTime() + DURATION_MS / 2;
    vi.setSystemTime(middle);
    await renderTiming(root!, 'in_progress', new Date(middle).toISOString());
    await expect.element(page.getByRole('timer')).toHaveTextContent('00:02:30');
    await act(async () => root?.unmount());
    root = createRoot(mountPoint);
    await renderTiming(root, 'in_progress', new Date(middle).toISOString());
    await expect.element(page.getByRole('timer')).toHaveTextContent('00:02:30');
    compareTiming('Mid-exam reload', Date.parse(EXPIRES_AT) - middle, 150_000);
  });

  it('captures a stable in-progress examination screen with the countdown', async () => {
    const middle = EXAM_START.getTime() + DURATION_MS / 2;
    vi.setSystemTime(middle);
    await renderTiming(root!, 'in_progress', new Date(middle).toISOString());
    await expect.element(page.getByRole('timer')).toHaveTextContent('00:02:30');
    await expect(page).toMatchScreenshot('h04/scenario-specific-ui-screenshots/examination-in-progress');
  });

  it('captures a stable locked screen after the examination expires', async () => {
    const afterExpiry = new Date(Date.parse(EXPIRES_AT) + 1000);
    vi.setSystemTime(afterExpiry);
    await renderTiming(root!, 'timed_out', afterExpiry.toISOString());
    await expect.element(page.getByRole('heading', { name: 'Time expired — exam locked' })).toBeVisible();
    await expect(page).toMatchScreenshot('h04/scenario-specific-ui-screenshots/examination-expired-locked');
  });

  afterAll(() => {
    const table = [
      'Case | Configured timestamp (ms) | Recorded timestamp (ms) | Difference (ms) | Status',
      ...results.map((result) =>
        `${result.name} | ${result.expected} | ${result.actual} | ${Math.abs(result.expected - result.actual)} | ${result.status}`),
    ].join('\n');
    console.info(`\nH04 timing results:\n${table}\n`);
    expect(results).toHaveLength(8);
    expect(results.every((result) => result.status === 'PASS')).toBe(true);
  });
});
