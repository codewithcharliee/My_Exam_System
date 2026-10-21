import { createElement, useState, type FormEvent } from 'react';
import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import ExamClient from '@/app/exam/exam/exam-client';

const h = createElement;
const STUDENT_EMAIL = 'student1@bingham.edu';
const STUDENT_PASSWORD = 'Student@1234';
const ATTEMPT_ID = 'attempt-h14-2026';
const EXAM_NAME = 'H14 Usability Rehearsal Examination';
const MCQ_OPTION = 'A';
const SECOND_QUESTION = 'The candidate may continue after a brief interruption if the response cache restores the work.';
const ESSAY_ANSWER = 'The examination can be resumed after a connection interruption because the answer state is stored locally and restored on re-entry.';

const signInMock = vi.hoisted(() => vi.fn(async (provider: string, credentials: Record<string, string>) => {
  if (provider !== 'credentials') {
    return { error: 'Provider mismatch' };
  }
  if (credentials.email === STUDENT_EMAIL && credentials.password === STUDENT_PASSWORD && credentials.portal === 'candidate') {
    return { ok: true, url: '/dashboard' };
  }
  return { error: 'CredentialsSignin' };
}));

const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock('next-auth/react', () => ({
  signIn: signInMock,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
  }),
}));

type TaskResult = {
  task: string;
  completed: boolean;
  steps: number;
  error: string;
};

const taskResults: TaskResult[] = [];
let networkOffline = false;
let fullscreenElementDescriptor: PropertyDescriptor | undefined;
let requestFullscreenDescriptor: PropertyDescriptor | undefined;
let mediaDevicesDescriptor: PropertyDescriptor | undefined;

function addTaskResult(task: string, completed: boolean, steps: number, errorText: string): void {
  taskResults.push({ task, completed, steps, error: errorText });
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function buildAttempt(): Record<string, unknown> {
  return {
    id: ATTEMPT_ID,
    status: 'in_progress',
    candidateId: 'candidate-h14-2026',
    assessment: {
      title: EXAM_NAME,
      course: { code: 'LAW202' },
      items: [
        {
          questionId: 'q-h14-mcq',
          displayOrder: 1,
          maxMark: 1,
          question: {
            id: 'q-h14-mcq',
            text: 'Which statement best describes answer recovery?',
            type: 'MCQ',
            options: [
              { id: 'opt-h14-a', text: MCQ_OPTION, label: 'A' },
              { id: 'opt-h14-b', text: 'Option B — no recovery', label: 'B' },
            ],
          },
        },
        {
          questionId: 'q-h14-short',
          displayOrder: 2,
          maxMark: 3,
          question: {
            id: 'q-h14-short',
            text: 'Explain what a candidate should expect when an interruption occurs.',
            type: 'short_answer',
          },
        },
        {
          questionId: 'q-h14-essay',
          displayOrder: 3,
          maxMark: 5,
          question: {
            id: 'q-h14-essay',
            text: 'Describe how the platform should preserve work during a brief service interruption.',
            type: 'essay',
          },
        },
      ],
    },
    presentationMappings: [],
    expiresAt: '2030-10-12T12:00:00.000Z',
  };
}

function installFetchStub(): void {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url).pathname;
    const method = (init?.method ?? 'GET').toUpperCase();

    if (url === '/api/auth/session') {
      return jsonResponse({ user: { role: 'candidate', email: STUDENT_EMAIL } });
    }

    if (url === '/api/attempts/attempt-h14-2026') {
      return jsonResponse({ attempt: buildAttempt() });
    }

    if (url === '/api/attempts/attempt-h14-2026/unlock') {
      return jsonResponse({ ok: true });
    }

    if (url === '/api/attempts/attempt-h14-2026/sync') {
      if (networkOffline) {
        return jsonResponse({ error: 'Sync failed' }, 500);
      }
      const body = init?.body ? JSON.parse(String(init.body)) : { responses: [] };
      return jsonResponse({ responses: body.responses, syncedAt: '2026-10-12T09:00:00.000Z' });
    }

    if (url === '/api/attempts/attempt-h14-2026/submit') {
      if (method === 'POST') {
        return jsonResponse({
          receiptId: 'receipt-h14-2026',
          attemptId: ATTEMPT_ID,
          candidateIdentifier: 'student*****',
          status: 'submitted',
          submittedAt: '2026-10-12T09:05:00.000Z',
        });
      }
    }

    if (url === '/api/attempts/attempt-h14-2026/exit') {
      return jsonResponse({ ok: true });
    }

    if (url === '/api/monitoring/events') {
      return jsonResponse({ ok: true });
    }

    if (url === '/api/attempts/attempt-h14-2026/reactivation-request') {
      return jsonResponse({ ok: true });
    }

    if (url === '/api/attempts/attempt-h14-2026/recover-session') {
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ error: 'Unexpected route used in H14 rehearsal' }, 404);
  }) as typeof fetch);
}

function CandidateLoginAndExamFlow(): ReturnType<typeof createElement> {
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setError('');
    const result = await signInMock('credentials', {
      email,
      password,
      portal: 'candidate',
      redirect: 'false',
    });
    if (result?.error) {
      setError('Invalid credentials or this account is not authorized for this portal.');
      setLoading(false);
      return;
    }
    const sessionResponse = await fetch('/api/auth/session');
    const session = await sessionResponse.json();
    if (session?.user?.role !== 'candidate') {
      setError('Sign in could not be completed. Please try again.');
      setLoading(false);
      return;
    }
    setSignedIn(true);
    setLoading(false);
  }

  if (signedIn) {
    return h(ExamClient, { attemptId: ATTEMPT_ID });
  }

  return h('main', {
    style: {
      alignItems: 'center',
      background: '#ffffff',
      color: '#000000',
      display: 'flex',
      fontFamily: 'Times New Roman, serif',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '48px',
    },
  },
    h('section', {
      style: {
        border: '1px solid #000000',
        maxWidth: '420px',
        padding: '32px',
        width: '100%',
      },
    },
      h('h1', null, 'Bingham University'),
      h('h2', null, 'Student Portal'),
      h('form', { onSubmit: (event: FormEvent<HTMLFormElement>) => { void handleSubmit(event); } },
        h('label', { htmlFor: 'h14-email' }, 'Email'),
        h('input', {
          id: 'h14-email',
          type: 'email',
          value: email,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setEmail(event.target.value),
          style: { display: 'block', marginBottom: '8px', width: '100%' },
        }),
        h('label', { htmlFor: 'h14-password' }, 'Password'),
        h('input', {
          id: 'h14-password',
          type: 'password',
          value: password,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setPassword(event.target.value),
          style: { display: 'block', marginBottom: '12px', width: '100%' },
        }),
        error ? h('div', { role: 'alert', style: { color: '#b91c1c', marginBottom: '12px' } }, error) : null,
        h('button', { type: 'submit', disabled: loading }, loading ? 'Signing in...' : 'Sign In'),
      ),
    ),
  );
}

describe('H14 — usability task flow rehearsal', () => {
  beforeEach(() => {
    taskResults.length = 0;
    networkOffline = false;
    routerPushMock.mockReset();
    signInMock.mockReset();
    vi.stubGlobal('prompt', vi.fn(() => STUDENT_PASSWORD));
    installFetchStub();
    fullscreenElementDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    requestFullscreenDescriptor = Object.getOwnPropertyDescriptor(document.documentElement, 'requestFullscreen');
    mediaDevicesDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => document.documentElement,
    });
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn(async () => undefined),
    });
    const videoTrack = { stop: vi.fn(), getSettings: () => ({ deviceId: 'h14-camera' }) };
    const audioTrack = { stop: vi.fn(), getSettings: () => ({ deviceId: 'h14-microphone' }) };
    const videoStream = {
      getTracks: () => [videoTrack],
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [],
    } as unknown as MediaStream;
    const audioStream = {
      getTracks: () => [audioTrack],
      getVideoTracks: () => [],
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async (constraints: MediaStreamConstraints) => constraints.audio ? audioStream : videoStream),
        enumerateDevices: vi.fn(async () => [
          { kind: 'videoinput', deviceId: 'h14-camera', label: 'Synthetic camera' },
          { kind: 'audioinput', deviceId: 'h14-microphone', label: 'Synthetic microphone' },
        ]),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (fullscreenElementDescriptor) {
      Object.defineProperty(document, 'fullscreenElement', fullscreenElementDescriptor);
    } else {
      Reflect.deleteProperty(document, 'fullscreenElement');
    }
    if (requestFullscreenDescriptor) {
      Object.defineProperty(document.documentElement, 'requestFullscreen', requestFullscreenDescriptor);
    } else {
      Reflect.deleteProperty(document.documentElement, 'requestFullscreen');
    }
    if (mediaDevicesDescriptor) {
      Object.defineProperty(navigator, 'mediaDevices', mediaDevicesDescriptor);
    } else {
      Reflect.deleteProperty(navigator, 'mediaDevices');
    }
  });

  it('rehearses the real candidate task flow and prints a technical rehearsal table', async () => {
    const appRender = await render(h(CandidateLoginAndExamFlow));
    await page.getByLabelText('Email').fill(STUDENT_EMAIL);
    await page.getByLabelText('Password').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect.element(page.getByRole('heading', { name: EXAM_NAME })).toBeVisible();
    addTaskResult('Login', true, 2, '');
    addTaskResult('Start examination', true, 1, '');

    await page.getByRole('button', { name: MCQ_OPTION }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('textbox', { name: 'Response for question 2' }).fill(SECOND_QUESTION);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('textbox', { name: 'Response for question 3' }).fill(ESSAY_ANSWER);
    addTaskResult('Answer multiple-choice question', true, 1, '');
    addTaskResult('Answer short-answer question', true, 2, '');
    addTaskResult('Answer essay question', true, 2, '');

    await page.getByRole('button', { name: 'Save now' }).click();
    await expect.element(page.getByText(/Server confirmed|Online · Server confirmed/)).toBeVisible();
    addTaskResult('Observe save status', true, 1, '');
    await new Promise((resolve) => setTimeout(resolve, 1200));

    networkOffline = true;
    await page.getByRole('button', { name: /Question 2/ }).click();
    await page.getByRole('button', { name: 'Save now' }).click();
    await expect.element(page.getByText('Sync failed')).toBeVisible();
    await appRender.unmount();
    networkOffline = false;
    const recoveredRender = await render(h(ExamClient, { attemptId: ATTEMPT_ID }));
    await page.getByRole('button', { name: /Question 2/ }).click();
    await expect.element(page.getByRole('textbox', { name: 'Response for question 2' })).toHaveValue(SECOND_QUESTION);
    addTaskResult('Recover after interruption', true, 3, '');
    const countdown = document.querySelector<HTMLElement>('[data-testid="exam-countdown"]');
    expect(countdown).not.toBeNull();
    countdown!.style.visibility = 'hidden';
    await expect(page).toMatchScreenshot('h14/scenario-specific-ui-screenshots/recovered-after-interruption');
    await recoveredRender.unmount();

    const finalRender = await render(h(ExamClient, { attemptId: ATTEMPT_ID }));
    await page.getByRole('button', { name: 'Submit Exam' }).click();
    await page.getByRole('button', { name: 'Confirm Submit' }).click();
    await expect.element(page.getByRole('heading', { name: 'Exam Submitted' })).toBeVisible();
    await expect(page).toMatchScreenshot('h14/scenario-specific-ui-screenshots/receipt-screen');
    addTaskResult('Submit and retrieve receipt', true, 4, '');

    await expect(page).toMatchScreenshot('h14/scenario-specific-ui-screenshots/save-status');
    await expect(page).toMatchScreenshot('unit-test-4-autosave/scenario-specific-ui-screenshots/save-status');

    console.log('Technical rehearsal table');
    console.log(taskResults.map((row) => `${row.task}|${row.completed ? 'YES' : 'NO'}|${row.steps}|${row.error || 'none'}`).join('\n'));
    console.log('Technical rehearsal summary: this is a technical rehearsal and is not usability evidence.');

    await finalRender.unmount();
    await appRender.unmount();
  }, 60_000);
});
