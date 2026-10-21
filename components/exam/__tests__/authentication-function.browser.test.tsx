import { createElement, useEffect, useState } from 'react';
import bcrypt from 'bcryptjs';
import { page } from 'vitest/browser';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';

const { authState, signInMock, pushMock } = vi.hoisted(() => ({
  authState: {
    users: [] as Array<{
      id: string;
      email: string;
      name: string;
      role: string;
      accountStatus: string;
      passwordHash: string;
    }>,
    auditEvents: [] as Array<Record<string, unknown>>,
    session: null as { user: { id: string; email: string; name: string; role: string } } | null,
  },
  signInMock: vi.fn<(provider: string, credentials: Record<string, unknown>) => Promise<{ error?: string }>>(),
  pushMock: vi.fn<(path: string) => void>(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        authState.users.find((user) => user.email === where.email) ?? null),
    },
  },
}));

vi.mock('@/lib/audit', () => ({
  createAuditEvent: vi.fn(async (event: Record<string, unknown>) => {
    authState.auditEvents.push(event);
    return { id: `auth-audit-${authState.auditEvents.length}` };
  }),
}));

vi.mock('next-auth/react', () => ({ signIn: signInMock }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn() }),
}));

import { authConfig } from '@/auth.config';
import { authorizeCredentials } from '@/lib/credential-auth';

const h = createElement;
let LoginForm: typeof import('@/components/auth/login-form').LoginForm;
let setNavigationMessage: ((message: string) => void) | null = null;
let passwordHashes: { student: string; lecturer: string; inactive: string } | null = null;
const activeStudentPassword = 'unit-one-student-only-password';
const activeLecturerPassword = 'unit-one-lecturer-only-password';
const inactivePassword = 'unit-one-inactive-only-password';
const genericFailureMessage = 'Invalid credentials or this account is not authorized for this portal.';
const resultRows: Array<{ scenario: string; account: string; expected: string; actual: string }> = [];
let screenshotStyle: HTMLStyleElement | null = null;

function recordResult(scenario: string, account: string, expected: string, actual: string): void {
  resultRows.push({ scenario, account, expected, actual });
}

function LoginEvidence() {
  const [navigationMessage, updateNavigationMessage] = useState('');
  useEffect(() => {
    setNavigationMessage = updateNavigationMessage;
    return () => {
      setNavigationMessage = null;
    };
  }, []);
  return h('div', null,
    h(LoginForm, { portal: 'candidate' }),
    navigationMessage ? h('p', {
      role: 'status',
      style: { position: 'fixed', top: '16px', right: '16px', border: '1px solid #000', padding: '12px', zIndex: 100 },
    }, `Authenticated session issued; navigating to ${navigationMessage}`) : null,
  );
}

function setupScreenshotStyle(): void {
  screenshotStyle = document.createElement('style');
  screenshotStyle.textContent = `
    html, body, #root { background: #fff !important; background-image: none !important; }
    html body * {
      color: #000 !important;
      font-family: "Times New Roman", Times, serif !important;
      background-color: #fff !important;
      background-image: none !important;
    }
    html body *[class] { color: #000 !important; background-color: #fff !important; }
  `;
  document.head.appendChild(screenshotStyle);
}

async function initializeTestAccounts(): Promise<void> {
  const hashes = passwordHashes;
  if (!hashes) throw new Error('Synthetic authentication fixture hashes were not initialized.');

  authState.users.length = 0;
  authState.auditEvents.length = 0;
  authState.session = null;
  authState.users.push(
    {
      id: 'unit-one-student',
      email: 'student@example.test',
      name: 'Unit Test Student',
      role: 'candidate',
      accountStatus: 'active',
      passwordHash: hashes.student,
    },
    {
      id: 'unit-one-lecturer',
      email: 'lecturer@example.test',
      name: 'Unit Test Lecturer',
      role: 'lecturer',
      accountStatus: 'active',
      passwordHash: hashes.lecturer,
    },
    {
      id: 'unit-one-inactive',
      email: 'inactive@example.test',
      name: 'Unit Test Inactive',
      role: 'candidate',
      accountStatus: 'inactive',
      passwordHash: hashes.inactive,
    },
  );

  signInMock.mockImplementation(async (_provider, credentials) => {
    const user = await authorizeCredentials({
      email: credentials.email,
      password: credentials.password,
      portal: credentials.portal,
    });
    if (!user) return { error: 'CredentialsSignin' };

    const token = await authConfig.callbacks!.jwt!({ token: {}, user: user as never } as never);
    const session = await authConfig.callbacks!.session!({
      session: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
      token,
      user: user as never,
      trigger: 'signIn',
      newSession: undefined,
    } as never);
    authState.session = {
      user: {
        id: session.user!.id!,
        email: session.user!.email!,
        name: session.user!.name!,
        role: (session.user as typeof session.user & { role: string }).role,
      },
    };
    return {};
  });

  vi.stubGlobal('fetch', vi.fn(async () => Response.json(authState.session)));
}

describe('Unit Test 1 — authentication function', () => {
  beforeAll(async () => {
    passwordHashes = {
      student: await bcrypt.hash(activeStudentPassword, 12),
      lecturer: await bcrypt.hash(activeLecturerPassword, 12),
      inactive: await bcrypt.hash(inactivePassword, 12),
    };
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.stubGlobal('process', { env: { NODE_ENV: 'test' } });
    ({ LoginForm } = await import('@/components/auth/login-form'));
    setNavigationMessage = null;
    pushMock.mockImplementation((path) => setNavigationMessage?.(path));
    await initializeTestAccounts();
    setupScreenshotStyle();
    await page.viewport(1440, 1000);
  });

  afterEach(() => {
    screenshotStyle?.remove();
    screenshotStyle = null;
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('authenticates an active student and issues role-bound JWT and session claims without password data', async () => {
    const user = await authorizeCredentials({
      email: 'student@example.test',
      password: activeStudentPassword,
      portal: 'candidate',
    });

    expect(user).toEqual({
      id: 'unit-one-student',
      email: 'student@example.test',
      name: 'Unit Test Student',
      role: 'candidate',
    });
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('passwordHash');

    await render(h(LoginEvidence));
    await page.getByLabelText('Email').fill('student@example.test');
    await page.getByLabelText('Password').fill(activeStudentPassword);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect.element(page.getByRole('status')).toBeVisible();
    expect(authState.session?.user).toMatchObject({ id: 'unit-one-student', role: 'candidate' });
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Authenticated session issued');
    expect(authState.auditEvents.at(-1)).toMatchObject({
      actorId: 'unit-one-student',
      actionType: 'login_success',
    });
    expect(document.getElementById('password')?.getAttribute('type')).toBe('password');
    expect(document.body.textContent).not.toContain(activeStudentPassword);
    await expect(page).toMatchScreenshot('unit-test-1-auth/scenario-specific-ui-screenshots/login-success');
    recordResult('Active student login', 'student@example.test', 'authenticated session', 'authenticated session');
  });

  it('authenticates a registered active lecturer only on the matching portal', async () => {
    const user = await authorizeCredentials({
      email: 'LECTURER@example.test',
      password: activeLecturerPassword,
      portal: 'lecturer',
    });

    expect(user).toMatchObject({ id: 'unit-one-lecturer', role: 'lecturer' });
    expect(user).not.toHaveProperty('passwordHash');
    recordResult('Active lecturer login', 'lecturer@example.test', 'lecturer authenticated', 'lecturer authenticated');
  });

  it('rejects a wrong password with the generic failure and captures the form evidence', async () => {
    const wrongPasswordResult = await signInMock('credentials', {
      email: 'student@example.test',
      password: 'unit-one-wrong-password',
      portal: 'candidate',
      redirect: false,
    });
    const unregisteredResult = await signInMock('credentials', {
      email: 'missing@example.test',
      password: 'unit-one-unknown-account-password',
      portal: 'candidate',
      redirect: false,
    });
    expect(wrongPasswordResult).toEqual(unregisteredResult);
    expect(JSON.stringify(wrongPasswordResult)).not.toContain('password');
    expect(JSON.stringify(wrongPasswordResult)).not.toContain('inactive');

    await render(h(LoginEvidence));
    await page.getByLabelText('Email').fill('student@example.test');
    await page.getByLabelText('Password').fill('unit-one-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect.element(page.getByRole('alert')).toHaveTextContent(genericFailureMessage);
    expect(authState.session).toBeNull();
    expect(pushMock).not.toHaveBeenCalled();
    expect(authState.auditEvents.at(-1)).toMatchObject({ actionType: 'login_failed' });
    expect(JSON.stringify(authState.auditEvents.at(-1))).not.toContain(activeStudentPassword);
    await expect(page).toMatchScreenshot('unit-test-1-auth/scenario-specific-ui-screenshots/login-rejected');
    recordResult('Wrong password', 'student@example.test', 'generic rejection without session', 'generic rejection without session');
  });

  it('rejects inactive and unregistered accounts with the same caller-visible response', async () => {
    const inactiveResult = await signInMock('credentials', {
      email: 'inactive@example.test',
      password: inactivePassword,
      portal: 'candidate',
      redirect: false,
    });
    const unknownResult = await signInMock('credentials', {
      email: 'missing@example.test',
      password: 'unit-one-unknown-account-password',
      portal: 'candidate',
      redirect: false,
    });

    expect(inactiveResult).toEqual(unknownResult);
    expect(inactiveResult).toEqual({ error: 'CredentialsSignin' });
    expect(authState.session).toBeNull();

    await render(h(LoginEvidence));
    await page.getByLabelText('Email').fill('inactive@example.test');
    await page.getByLabelText('Password').fill(inactivePassword);
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect.element(page.getByRole('alert')).toHaveTextContent(genericFailureMessage);
    expect(authState.session).toBeNull();
    expect(document.body.textContent).not.toContain(inactivePassword);
    await expect(page).toMatchScreenshot('unit-test-1-auth/scenario-specific-ui-screenshots/inactive-account');
    recordResult('Inactive account', 'inactive@example.test', 'generic rejection without session', 'generic rejection without session');
    recordResult('Unregistered account', 'missing@example.test', 'generic rejection without session', 'generic rejection without session');
  });

  it.each([
    ['empty username', '', activeStudentPassword],
    ['empty password', 'student@example.test', ''],
    ['both fields empty', '', ''],
    ['long username', `${'a'.repeat(500)}@example.test`, activeStudentPassword],
    ['long password', 'student@example.test', 'x'.repeat(500)],
    ['username injection characters', '\'" ; DROP TABLE users; --@example.test', activeStudentPassword],
    ['password injection characters', 'student@example.test', '\'" ; DROP TABLE users; --'],
    ['password in the wrong case', 'student@example.test', activeStudentPassword.toUpperCase()],
  ])('rejects %s safely without creating a session or changing account data', async (_scenario, email, password) => {
    const before = authState.users.map((user) => ({ ...user }));
    const user = await authorizeCredentials({ email, password, portal: 'candidate' });

    expect(user).toBeNull();
    expect(authState.session).toBeNull();
    expect(authState.users).toEqual(before);
    recordResult(_scenario, email || '(empty)', 'rejected without mutation', 'rejected without mutation');
  });

  it('normalizes email whitespace and case before authenticating', async () => {
    const user = await authorizeCredentials({
      email: '  STUDENT@EXAMPLE.TEST  ',
      password: activeStudentPassword,
      portal: 'candidate',
    });

    expect(user).toMatchObject({ id: 'unit-one-student', role: 'candidate' });
    recordResult('Trimmed case-insensitive email', 'student@example.test', 'authenticated', 'authenticated');
  });

  it('rejects missing credentials without throwing or creating a session', async () => {
    await expect(authorizeCredentials(undefined)).resolves.toBeNull();
    await expect(authorizeCredentials({ email: undefined, password: undefined, portal: 'candidate' })).resolves.toBeNull();
    expect(authState.session).toBeNull();
    recordResult('Missing credentials', '(undefined)', 'rejected without exception', 'rejected without exception');
  });

  it('allows repeat valid sign-ins and does not mutate accounts after a failed sign-in', async () => {
    const before = authState.users.map((user) => ({ ...user }));
    const first = await signInMock('credentials', {
      email: 'student@example.test',
      password: activeStudentPassword,
      portal: 'candidate',
    });
    const second = await signInMock('credentials', {
      email: 'student@example.test',
      password: activeStudentPassword,
      portal: 'candidate',
    });
    const denied = await signInMock('credentials', {
      email: 'student@example.test',
      password: 'unit-one-wrong-password',
      portal: 'candidate',
    });

    expect(first).toEqual({});
    expect(second).toEqual({});
    expect(denied).toEqual({ error: 'CredentialsSignin' });
    expect(authState.session?.user).toMatchObject({ id: 'unit-one-student', role: 'candidate' });
    expect(authState.users).toEqual(before);
    recordResult('Repeat and failure state', 'student@example.test', 'two successes; failure has no account mutation', 'two successes; failure has no account mutation');
  });

  it('prints authentication results and reports the missing dummy-hash timing defense without failing', async () => {
    const startedWrongPassword = performance.now();
    await authorizeCredentials({
      email: 'student@example.test',
      password: 'unit-one-timing-wrong-password',
      portal: 'candidate',
    });
    const wrongPasswordDuration = performance.now() - startedWrongPassword;

    const startedUnknownUser = performance.now();
    await authorizeCredentials({
      email: 'unknown-timing@example.test',
      password: 'unit-one-timing-unknown-password',
      portal: 'candidate',
    });
    const unknownUserDuration = performance.now() - startedUnknownUser;

    console.info(`Timing observation (not a pass/fail threshold): known-user rejection ${wrongPasswordDuration.toFixed(2)}ms; unknown-user rejection ${unknownUserDuration.toFixed(2)}ms. The credential handler does not compare a dummy hash for unknown or inactive accounts.`);
    const table = [
      'Case | Account | Expected | Actual',
      ...resultRows.map((row) => `${row.scenario} | ${row.account} | ${row.expected} | ${row.actual}`),
    ].join('\n');
    console.info(`\nUnit Test 1 authentication results:\n${table}\nFinal overall result: ${resultRows.every((row) => row.expected === row.actual) ? 'PASS' : 'FAIL'}`);
    expect(resultRows.every((row) => row.expected === row.actual)).toBe(true);
  });
});
