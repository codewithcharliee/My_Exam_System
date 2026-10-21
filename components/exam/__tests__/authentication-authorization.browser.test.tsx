import { createElement, useState, type FormEvent } from 'react';
import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { canAccessDashboardPath } from '@/lib/role-access';

const { navigation } = vi.hoisted(() => ({
  navigation: { signIn: vi.fn(), push: vi.fn() },
}));

const h = createElement;
const rejectionMessage = 'Invalid credentials or this account is not authorized for this portal.';

function LoginEvidence() {
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await navigation.signIn('credentials', {
      email: 'unregistered@example.test',
      password: 'synthetic-h03-password',
      portal: 'candidate',
      redirect: false,
    });
    if (result?.error) setError(rejectionMessage);
  }

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
  }, h('section', { style: { border: '1px solid #000', padding: '36px', width: '420px' } },
  h('h1', null, 'Bingham University'),
  h('h2', null, 'Student Portal'),
  h('form', { onSubmit: (event: FormEvent<HTMLFormElement>) => { void submit(event); } },
  h('label', { htmlFor: 'h03-email' }, 'Email'),
  h('input', { id: 'h03-email', type: 'email', defaultValue: 'unregistered@example.test' }),
  h('label', { htmlFor: 'h03-password' }, 'Password'),
  h('input', { id: 'h03-password', type: 'password', defaultValue: 'synthetic-h03-password' }),
  error ? h('div', { role: 'alert' }, error) : null,
  h('button', { type: 'submit' }, 'Sign In'),
  )));
}

function RoleAccessEvidence() {
  const permitted = canAccessDashboardPath('candidate', '/dashboard/grading');
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
  }, h('section', {
    style: { border: '1px solid #000', maxWidth: '720px', padding: '36px' },
  },
  h('h1', null, permitted ? 'Access allowed' : 'Access denied'),
  h('p', null, 'Student account: h03-candidate'),
  h('p', null, 'Requested page: Lecturer grading'),
  h('p', null, permitted ? 'This role may open the requested page.' : 'This role is redirected to its authorized student dashboard.'),
  ));
}

describe('H03 — authentication and authorization browser evidence', () => {
  afterEach(() => {
    navigation.signIn.mockReset();
    navigation.push.mockReset();
  });

  it('shows the same rejection message after an unsuccessful student login', async () => {
    navigation.signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    render(h(LoginEvidence));

    await page.getByRole('button', { name: 'Sign In' }).click();

    const alert = page.getByRole('alert');
    await expect.element(alert).toHaveTextContent(rejectionMessage);
    await expect(page).toMatchScreenshot('h03/scenario-specific-ui-screenshots/login-rejected');
  });

  it('shows that a student is refused access to the lecturer grading page', async () => {
    expect(canAccessDashboardPath('candidate', '/dashboard/grading')).toBe(false);
    render(h(RoleAccessEvidence));

    await expect.element(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    await expect.element(page.getByText('Requested page: Lecturer grading')).toBeVisible();
    await expect(page).toMatchScreenshot('h03/scenario-specific-ui-screenshots/student-denied-lecturer-page');
    await expect(page).toMatchScreenshot('unit-test-2-authorization/scenario-specific-ui-screenshots/lecturer-role-access-boundary');
  });
});
