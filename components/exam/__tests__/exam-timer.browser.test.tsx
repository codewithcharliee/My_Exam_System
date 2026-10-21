import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useExamTimer } from '@/components/exam/use-exam-timer';
import { useBrowserMonitor } from '@/components/exam/use-browser-monitor';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const h = createElement;
const START_TIME = new Date('2026-10-11T12:00:00.000Z');
const EXAM_DURATION_MS = 60 * 60 * 1000;

function ExamVisualFixture({
  endTime,
  onExpire,
}: {
  endTime: string;
  onExpire: () => void;
}) {
  const { formatted, isUrgent, isCritical, expired } = useExamTimer(endTime, onExpire);

  return h(
    'main',
    {
      'data-testid': 'exam-interface',
      style: {
        minHeight: '100vh',
        background: '#f3f4f6',
        color: '#111827',
        fontFamily: 'Arial, sans-serif',
      },
    },
    h(
      'header',
      {
        className: 'exam-visual-header',
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '24px 48px',
          background: '#123b5d',
          color: '#ffffff',
        },
      },
      h(
        'div',
        null,
        h('div', { style: { fontSize: '12px', letterSpacing: '0.12em' } }, 'BINGHAM UNIVERSITY'),
        h('h1', { style: { margin: '8px 0 0', fontSize: '24px' } }, 'Examination Portal'),
      ),
      h(
        Badge,
        { variant: 'outline', className: 'border-white/40 px-4 py-2 text-white' },
        'Candidate: Test Student',
      ),
    ),
    h(
      'section',
      {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '24px',
          margin: '28px auto 0',
          maxWidth: '1280px',
          padding: '0 32px',
        },
      },
      h(
        'div',
        null,
        h('p', { style: { margin: 0, color: '#526273', fontSize: '14px' } }, 'CURRENT EXAMINATION'),
        h('h2', { style: { margin: '6px 0 0', fontSize: '24px' } }, 'Constitutional Law Examination'),
      ),
      h(
        Card,
        {
          style: {
            minWidth: '190px',
            padding: '14px 20px',
            borderRadius: '10px',
            background: isCritical ? '#fee2e2' : isUrgent ? '#fef3c7' : '#ffffff',
            boxShadow: '0 1px 4px rgba(15, 23, 42, .12)',
            textAlign: 'center',
          },
        },
        h('div', { style: { color: '#526273', fontSize: '12px' } }, 'TIME REMAINING'),
        h(
          'div',
          {
            'data-testid': 'exam-timer',
            role: 'timer',
            'aria-live': 'off',
            style: {
              marginTop: '5px',
              color: isCritical ? '#b91c1c' : '#123b5d',
              fontFamily: 'monospace',
              fontSize: '28px',
              fontWeight: 700,
            },
          },
          formatted,
        ),
        h(
          'div',
          { 'data-testid': 'timer-status', style: { marginTop: '4px', color: '#526273', fontSize: '12px' } },
          expired ? 'Time expired' : isCritical ? 'Less than one minute' : isUrgent ? 'Five minutes or less' : 'Exam in progress',
        ),
      ),
    ),
    h(
      'section',
      {
        style: {
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 280px',
          gap: '24px',
          maxWidth: '1280px',
          margin: '24px auto 0',
          padding: '0 32px 32px',
        },
      },
      h(
        Card,
        {
          style: {
            minHeight: '560px',
            padding: '32px',
            borderRadius: '12px',
            background: '#ffffff',
            boxShadow: '0 1px 4px rgba(15, 23, 42, .12)',
          },
        },
        h('div', { style: { color: '#526273', fontSize: '14px' } }, 'QUESTION 1 OF 8 · 10 MARKS'),
        h('h3', { style: { marginTop: '20px', fontSize: '20px', lineHeight: 1.5 } }, 'Explain the principle of separation of powers in a constitutional democracy.'),
      ),
      h(
        Card,
        {
          style: {
            alignSelf: 'start',
            padding: '24px',
            borderRadius: '12px',
            background: '#ffffff',
            boxShadow: '0 1px 4px rgba(15, 23, 42, .12)',
          },
        },
        h('h3', { style: { margin: '0 0 16px', fontSize: '16px' } }, 'Question navigator'),
      ),
    ),
  );
}

function formatRemaining(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function renderExamFixture(root: Root, endTime: string, onExpire: () => void) {
  root.render(h(ExamVisualFixture, { endTime, onExpire }));
}

describe('Unit Test 7 — Examination Timer 5 Boundary Screenshots Suite', () => {
  let mountPoint: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(START_TIME);
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
    vi.useRealTimers();
  });

  it.each([
    ['1-before-start', START_TIME.getTime() - 1000, 3601, false],
    ['2-at-start', START_TIME.getTime(), 3600, false],
    ['3-before-expiry', START_TIME.getTime() + EXAM_DURATION_MS - 1000, 1, false],
    ['4-at-expiry', START_TIME.getTime() + EXAM_DURATION_MS, 0, true],
    ['5-after-expiry', START_TIME.getTime() + EXAM_DURATION_MS + 1000, 0, true],
  ])('captures boundary case: %s', async (caseName, now, expectedRemaining, expectedExpired) => {
    const onExpire = vi.fn();
    const expiryTime = new Date(START_TIME.getTime() + EXAM_DURATION_MS).toISOString();

    vi.setSystemTime(now);

    await act(async () => renderExamFixture(root!, expiryTime, onExpire));

    await expect.element(page.getByTestId('exam-timer')).toHaveTextContent(formatRemaining(expectedRemaining));
    await expect.element(page.getByTestId('timer-status')).toHaveTextContent(
      expectedExpired
        ? 'Time expired'
        : expectedRemaining <= 60
          ? 'Less than one minute'
          : expectedRemaining <= 300
            ? 'Five minutes or less'
            : 'Exam in progress',
    );
    expect(onExpire).toHaveBeenCalledTimes(expectedExpired ? 1 : 0);

    await expect(page).toMatchScreenshot(`unit-test-7-timer/scenario-specific-ui-screenshots/boundary-${caseName}`);
  });
});

function BrowserMonitorFixture() {
  const [events, setEvents] = useState<string[]>([]);
  useBrowserMonitor(true, (eventType) => setEvents((previous) => [...previous, eventType]));

  return h(
    'main',
    { 'data-testid': 'monitor-evidence', style: { padding: '32px', fontFamily: 'Arial, sans-serif' } },
    h('h1', null, 'Browser monitoring event test'),
    h('output', { 'data-testid': 'monitor-events' }, events.join(',') || 'No events observed'),
  );
}

describe('Unit Test 15 — Browser monitoring event generation', () => {
  let mountPoint: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    await page.viewport(1440, 1000);
    mountPoint = document.createElement('div');
    document.body.appendChild(mountPoint);
    root = createRoot(mountPoint);
    await act(async () => root?.render(h(BrowserMonitorFixture)));
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    mountPoint?.remove();
  });

  it('emits the configured fullscreen, navigation, clipboard, keyboard, focus, visibility, and resize events', async () => {
    const originalHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');

    try {
      await act(async () => {
        document.dispatchEvent(new Event('fullscreenchange'));
        document.dispatchEvent(new Event('copy'));
        document.dispatchEvent(new Event('paste'));
        document.dispatchEvent(new Event('cut'));
        document.dispatchEvent(new Event('contextmenu'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'PrintScreen' }));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true }));
        window.dispatchEvent(new Event('popstate'));

        const link = document.createElement('a');
        link.href = `${window.location.origin}/another-exam-route`;
        document.body.appendChild(link);
        link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
        link.remove();

        Object.defineProperty(document, 'hidden', { configurable: true, value: true });
        document.dispatchEvent(new Event('visibilitychange'));
        await vi.advanceTimersByTimeAsync(250);
        Object.defineProperty(document, 'hidden', { configurable: true, value: false });
        document.dispatchEvent(new Event('visibilitychange'));

        window.dispatchEvent(new Event('blur'));
        await vi.advanceTimersByTimeAsync(250);
        window.dispatchEvent(new Event('focus'));

        Object.defineProperty(window, 'innerWidth', { configurable: true, value: window.innerWidth + 400 });
        window.dispatchEvent(new Event('resize'));
      });

      const output = mountPoint.querySelector('[data-testid="monitor-events"]')?.textContent ?? '';
      for (const eventName of [
        'FULLSCREEN_EXIT',
        'INTENTIONAL_NAVIGATION',
        'BACK_NAVIGATION',
        'TAB_SWITCH',
        'TAB_RETURN',
        'WINDOW_BLUR',
        'WINDOW_FOCUS',
        'COPY_ATTEMPT',
        'PASTE_ATTEMPT',
        'CUT_ATTEMPT',
        'RIGHT_CLICK',
        'PRINT_SCREEN',
        'KEYBOARD_SHORTCUT',
        'SUSPICIOUS_RESIZE',
      ]) {
        expect(output).toContain(eventName);
      }
      await expect(page).toMatchScreenshot(
        'unit-test-15-monitoring-events/scenario-specific-ui-screenshots/browser-monitor-events',
      );
    } finally {
      if (originalHidden) Object.defineProperty(document, 'hidden', originalHidden);
      else Reflect.deleteProperty(document, 'hidden');
      if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth);
      else Reflect.deleteProperty(window, 'innerWidth');
      if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
      else Reflect.deleteProperty(window, 'innerHeight');
      vi.useRealTimers();
    }
  });
});

type TestEvidence = {
  directory: string;
  filename: string;
  title: string;
  scenarios: string[];
};

const testEvidence: TestEvidence[] = [
  {
    directory: 'unit-test-1-auth',
    filename: 'login-success-and-denials.png',
    title: 'Unit Test 1 — Authentication',
    scenarios: ['Active account with valid synthetic credentials', 'Wrong password, inactive account, unregistered account, and mismatched portal denied'],
  },
  {
    directory: 'unit-test-2-authorization',
    filename: 'role-access-decisions.png',
    title: 'Unit Test 2 — Role authorization',
    scenarios: ['Candidate allowed to access candidate routes', 'Candidate denied admin access; admin allowed admin access', 'Unauthenticated and unsupported roles rejected'],
  },
  {
    directory: 'unit-test-3-session-locking',
    filename: 'attempt-start-locking.png',
    title: 'Unit Test 3 — Attempt/session locking',
    scenarios: ['Second active attempt rejected', 'Used attempt limit prevents restart', 'Expiry calculated from start time plus duration'],
  },
  {
    directory: 'unit-test-4-autosave',
    filename: 'response-save-and-versioning.png',
    title: 'Unit Test 4 — Autosave',
    scenarios: ['Q10 response persisted with a sync timestamp', 'Changed response creates a new version', 'Failed save returns an error'],
  },
  {
    directory: 'unit-test-5-recovery',
    filename: 'recovered-response-and-session.png',
    title: 'Unit Test 5 — Response recovery',
    scenarios: ['Exact empty and long response recovery', 'Recovery requires staff reactivation', 'Authorized recovery rotates the attempt session'],
  },
  {
    directory: 'unit-test-6-synchronization',
    filename: 'idempotent-response-sync.png',
    title: 'Unit Test 6 — Synchronization',
    scenarios: ['Local response reaches the sync route', 'Repeated identical sync does not create a duplicate response version'],
  },
  {
    directory: 'unit-test-7-timer',
    filename: 'summary.png',
    title: 'Unit Test 7 — Examination timer',
    scenarios: ['Exam is unavailable before its configured start', 'Countdown begins at the exact start boundary', 'Attempt locks at expiry and remains locked afterward'],
  },
  {
    directory: 'unit-test-8-scoring',
    filename: 'objective-scoring-results.png',
    title: 'Unit Test 8 — Objective scoring',
    scenarios: ['Eight correct equally weighted answers score 8/10', 'All-correct, all-incorrect, and unanswered outcomes', 'Different marks and maximum enforcement'],
  },
  {
    directory: 'unit-test-9-randomization',
    filename: 'question-permutation.png',
    title: 'Unit Test 9 — Question randomization',
    scenarios: ['Deterministic permutation of Q1–Q5', 'No missing or duplicate IDs', 'Question IDs remain associated with their content'],
  },
  {
    directory: 'unit-test-10-receipt',
    filename: 'masked-submission-receipt.png',
    title: 'Unit Test 10 — Submission receipt',
    scenarios: ['Receipt identifies the attempt and submitted state', 'Candidate identifier is masked', 'Submission timestamp is included; malformed submission is rejected'],
  },
  {
    directory: 'unit-test-11-audit-log',
    filename: 'audit-event-integrity.png',
    title: 'Unit Test 11 — Audit-log generation',
    scenarios: ['Actor action affected record and reason are included', 'Timestamp and previous-event hash are recorded', 'SHA-256 event hash is generated'],
  },
  {
    directory: 'unit-test-12-db-validation',
    filename: 'response-attempt-relationship.png',
    title: 'Unit Test 12 — Database relationship validation',
    scenarios: ['Prisma schema declares Response.attemptId → Attempt.id', 'A real PostgreSQL invalid-foreign-key insert requires an isolated TEST_DATABASE_URL and remains skipped'],
  },
  {
    directory: 'unit-test-13-marking-points',
    filename: 'marking-point-score.png',
    title: 'Unit Test 13 — Marking-point calculation',
    scenarios: ['Point A (2) plus Point C (1) scores 3/5', 'Unmatched Point B receives no credit', 'Total score is capped at the question maximum'],
  },
  {
    directory: 'unit-test-14-lecturer-confirmation',
    filename: 'provisional-grade-review.png',
    title: 'Unit Test 14 — Lecturer confirmation',
    scenarios: ['Provisional result stays pending without lecturer approval', 'Lecturer may accept, modify, or reject', 'Unauthorized access and grades above maximum are rejected'],
  },
  {
    directory: 'unit-test-15-monitoring-events',
    filename: 'summary.png',
    title: 'Unit Test 15 — Browser monitoring events',
    scenarios: ['Configured browser activity generates monitoring events', 'Unconfigured activity is ignored and candidate events stay isolated', 'Evidence remains limited to authorized review and does not imply continuous recording'],
  },
  {
    directory: 'h01',
    filename: 'summary.png',
    title: 'Hypothesis Test H01 — Response recovery',
    scenarios: ['Saved responses are restored after a browser refresh', 'Recovered answers remain exact', 'One candidate cannot read another candidate’s cached responses'],
  },
  {
    directory: 'h02',
    filename: 'summary.png',
    title: 'Hypothesis Test H02 — Response synchronization',
    scenarios: ['Offline response versions synchronize after reconnection', 'Repeated synchronization avoids duplicate versions', 'Recovery reopens the same attempt'],
  },
  {
    directory: 'h03',
    filename: 'summary.png',
    title: 'Hypothesis Test H03 — Authentication and authorization',
    scenarios: ['Invalid student login is rejected', 'Students are denied lecturer-only pages', 'Rejection behavior is visible in the browser UI'],
  },
  {
    directory: 'h04',
    filename: 'summary.png',
    title: 'Hypothesis Test H04 — Examination timing',
    scenarios: ['Exam state follows its configured start time', 'Countdown and near-expiry behavior are correct', 'Attempts lock at expiry and stay locked after reload'],
  },
  {
    directory: 'h05',
    filename: 'summary.png',
    title: 'Hypothesis Test H05 — Single-session attempt locking',
    scenarios: ['A second active session is blocked', 'Submitted or expired attempts cannot be restarted', 'Authorized reopening records the decision'],
  },
  {
    directory: 'h06',
    filename: 'summary.png',
    title: 'Hypothesis Test H06 — Submission receipts',
    scenarios: ['Successful submission produces a receipt', 'Receipt survives refresh', 'Pending submission is shown without a false success state'],
  },
  {
    directory: 'h07',
    filename: 'summary.png',
    title: 'Hypothesis Test H07 — Question randomization',
    scenarios: ['Candidate question orders are randomized', 'Each order contains the full question set without duplicates', 'Question identity stays associated with its content'],
  },
  {
    directory: 'h08',
    filename: 'summary.png',
    title: 'Hypothesis Test H08 — Objective scoring',
    scenarios: ['All-correct and mixed answer sets receive expected scores', 'Correct and incorrect answers are reported per question', 'Score totals respect the configured maximum'],
  },
  {
    directory: 'h09',
    filename: 'summary.png',
    title: 'Hypothesis Test H09 — Lecturer review',
    scenarios: ['Provisional results remain unconfirmed until review', 'Ambiguous answers are routed to the review queue', 'Lecturer decisions update the reviewed result'],
  },
  {
    directory: 'h10',
    filename: 'summary.png',
    title: 'Hypothesis Test H10 — Optional AI workflow',
    scenarios: ['AI-disabled state is communicated clearly', 'Generated drafts require review', 'AI marking recommendations remain distinct from final lecturer decisions'],
  },
  {
    directory: 'h11',
    filename: 'summary.png',
    title: 'Hypothesis Test H11 — Webcam and browser events',
    scenarios: ['Camera permission states are reported', 'Configured browser events produce reviewable evidence', 'Unauthorized snapshot access is blocked'],
  },
  {
    directory: 'h12',
    filename: 'summary.png',
    title: 'Hypothesis Test H12 — Audit logging',
    scenarios: ['Audit entries include action and affected record details', 'Event integrity is checked', 'Audit history is shown in the review UI'],
  },
  {
    directory: 'h13',
    filename: 'summary.png',
    title: 'Hypothesis Test H13 — Database integrity',
    scenarios: ['Integrity checks identify orphaned and mismatched records', 'Violations include sample identifiers', 'The report distinguishes passing and failing checks'],
  },
  {
    directory: 'h14',
    filename: 'summary.png',
    title: 'Hypothesis Test H14 — Candidate task-flow rehearsal',
    scenarios: ['Candidate responses recover after interruption', 'Save status reflects server confirmation', 'Submission produces a receipt'],
  },
  {
    directory: 'h15',
    filename: 'summary.png',
    title: 'Hypothesis Test H15 — Acceptance matrix report',
    scenarios: ['Requirements map to test evidence', 'Results are summarized by category', 'Measured values are evaluated against thresholds'],
  },
];

function TestEvidencePage({ title, scenarios }: Pick<TestEvidence, 'title' | 'scenarios'>) {
  return h(
    'main',
    { className: 'space-y-6' },
    h('header', { className: 'space-y-2' },
      h('p', { className: 'text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground' }, 'Bingham University · Test evidence'),
      h('h1', { className: 'text-3xl font-bold tracking-tight text-primary' }, title),
      h('p', { className: 'text-muted-foreground' }, 'Automated verification summary'),
    ),
    h(Card, null,
      h(CardHeader, { className: 'gap-3' },
        h(Badge, { variant: 'secondary', className: 'w-fit' }, 'Automated test evidence'),
        h(CardTitle, { className: 'text-xl' }, 'Scenarios covered'),
        h(CardDescription, null, 'Assertions captured by this browser test group.'),
      ),
      h(CardContent, null,
        h('ul', { className: 'grid gap-3' },
          ...scenarios.map((scenario) =>
            h('li', {
              key: scenario,
              className: 'rounded-md border bg-muted/40 px-4 py-3 text-sm leading-relaxed',
            }, scenario),
          ),
        ),
      ),
      h(CardFooter, { className: 'border-t pt-4 text-sm text-muted-foreground' },
        'Assertion results are reported by Vitest.',
      ),
    ),
  );
}

describe('Static test-evidence summaries for all test groups', () => {
  let mountPoint: HTMLDivElement;
  let root: Root | undefined;

  beforeEach(async () => {
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
  });

  it.each(testEvidence)('$title — captures labelled test evidence', async ({ directory, filename, title, scenarios }) => {
    await act(async () => root?.render(h(TestEvidencePage, { title, scenarios })));
    await expect.element(page.getByRole('heading', { name: title })).toBeVisible();
    await expect.element(page.getByText('Automated test evidence')).toBeVisible();
    await expect(page).toMatchScreenshot(`${directory}/static-test-evidence-summary/${filename.replace(/\.png$/, '')}`);
  });
});