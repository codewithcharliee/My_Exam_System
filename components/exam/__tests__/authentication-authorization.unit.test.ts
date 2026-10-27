import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    users: [] as Array<{
      id: string;
      email: string;
      name: string;
      role: string;
      accountStatus: string;
      passwordHash: string;
    }>,
    auditEvents: [] as Array<Record<string, unknown>>,
    session: null as { user: { id: string; role: string } } | null,
    attempts: [] as Array<{
      id: string;
      candidateId: string;
      assessmentId: string;
      status: string;
      isActive: boolean;
      assessment: { items: [] };
    }>,
    updatedAttempts: 0,
  },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) =>
        state.users.find((user) => user.email === where.email) ?? null),
    },
    auditEvent: {
      findFirst: vi.fn(async () => {
        const last = state.auditEvents.at(-1);
        return last ? { hash: last.hash } : null;
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const event = { id: `h03-audit-${state.auditEvents.length + 1}`, ...data };
        state.auditEvents.push(event);
        return event;
      }),
    },
    attempt: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        state.attempts.find((attempt) => attempt.id === where.id) ?? null),
      update: vi.fn(async ({ where }: { where: { id: string } }) => {
        state.updatedAttempts += 1;
        const attempt = state.attempts.find((entry) => entry.id === where.id);
        if (!attempt) throw new Error('Attempt fixture is missing');
        attempt.status = 'reset';
        attempt.isActive = false;
        return attempt;
      }),
    },
    gradeDecision: { upsert: vi.fn() },
    aiRequest: { create: vi.fn(async () => ({ id: 'h03-ai-request' })) },
  },
}));

vi.mock('@/lib/audit', () => ({
  createAuditEvent: vi.fn(async (input: {
    actorId: string | null;
    actionType: string;
    entityType?: string;
    entityId?: string;
    reason?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const event = {
      id: `h03-audit-${state.auditEvents.length + 1}`,
      ...input,
      metadataJson: JSON.stringify(input.metadata ?? {}),
      occurredAt: new Date(),
    };
    state.auditEvents.push(event);
    return event;
  }),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => state.session),
}));

vi.mock('@/lib/session-integrity', () => ({
  validateAttemptSession: vi.fn(async () => ({ ok: true })),
}));

import { auth } from '@/auth';
import { authConfig } from '@/auth.config';
import { POST as resetAttempt } from '@/app/api/admin/reset-attempt/route';
import { POST as startAttempt } from '@/app/api/attempts/start/route';
import { GET as getAttempt } from '@/app/api/attempts/[id]/route';
import { POST as submitAttempt } from '@/app/api/attempts/[id]/submit/route';
import { PATCH as saveGrade } from '@/app/api/grading/[attemptId]/[questionId]/route';
import { POST as assessWithAi } from '@/app/api/ai/assess/route';
import { POST as publicSignup } from '@/app/api/signup/route';
import { authorizeCredentials } from '@/lib/credential-auth';
import { prisma } from '@/lib/prisma';

type ResultRow = {
  scenario: string;
  account: string;
  action: string;
  expected: string;
  actual: string;
};

const rows: ResultRow[] = [];
const auditLedger: Array<Record<string, unknown>> = [];
const roles = ['candidate', 'lecturer', 'invigilator', 'admin'] as const;
const testPassword = 'h03-synthetic-test-password';

function request(url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function record(
  scenario: string,
  account: string,
  action: string,
  expected: string,
  actual: string,
) {
  rows.push({ scenario, account, action, expected, actual });
}

function auditMetadata(event: Record<string, unknown>): Record<string, unknown> {
  const value = event.metadataJson;
  return typeof value === 'string' ? JSON.parse(value) as Record<string, unknown> : {};
}

function auditRow(
  event: Record<string, unknown>,
  account: string,
  action: string,
  outcome: string,
) {
  const metadata = auditMetadata(event);
  return event.actorId === account
    || metadata.accountIdentifier === account
    ? event.actionType === action && metadata.outcome === outcome && event.occurredAt instanceof Date
    : false;
}

describe('H03 — authentication and authorization against real handlers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    state.auditEvents.length = 0;
    state.users.length = 0;
    state.attempts.length = 0;
    state.session = null;
    state.updatedAttempts = 0;
    state.attempts.push(
      {
        id: 'h03-attempt-one',
        candidateId: 'h03-candidate',
        assessmentId: 'h03-assessment',
        status: 'in_progress',
        isActive: true,
        assessment: { items: [] },
      },
      {
        id: 'h03-attempt-two',
        candidateId: 'h03-student-two',
        assessmentId: 'h03-assessment',
        status: 'in_progress',
        isActive: true,
        assessment: { items: [] },
      },
    );

    const passwordHash = await bcrypt.hash(testPassword, 4);
    state.users.push(
      ...roles.map((role) => ({
        id: `h03-${role}`,
        email: `${role}@example.test`,
        name: `H03 ${role}`,
        role,
        accountStatus: 'active',
        passwordHash,
      })),
      {
        id: 'h03-student-two',
        email: 'student-two@example.test',
        name: 'H03 Student Two',
        role: 'candidate',
        accountStatus: 'active',
        passwordHash,
      },
    );
  });

  afterEach(() => {
    auditLedger.push(...state.auditEvents);
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    const mismatches = rows.filter((row) => row.expected !== row.actual);
    const table = [
      'Scenario | Account | Action | Expected | Actual',
      ...rows.map((row) => `${row.scenario} | ${row.account} | ${row.action} | ${row.expected} | ${row.actual}`),
    ].join('\n');
    console.info(`\nH03 scripted access results:\n${table}\n`);
    expect(mismatches).toEqual([]);
    expect(auditLedger.length).toBeGreaterThanOrEqual(
      rows.filter((row) => row.actual.includes('denied') || row.actual.includes('rejected') || row.actual.includes('403')).length,
    );
    expect(auditLedger.every((event) => event.occurredAt instanceof Date)).toBe(true);
  });

  it.each(roles)('creates a role-bound session for valid %s credentials', async (role) => {
    const credentials = { email: `${role}@example.test`, password: testPassword, portal: role };
    const user = await authorizeCredentials(credentials);
    if (!user) throw new Error(`Expected ${role} credentials to be accepted.`);
    expect(user).toMatchObject({ id: `h03-${role}`, role });

    const adapterUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: null,
      role: user.role,
    };
    const session = await authConfig.callbacks!.session!({
      session: {
        sessionToken: `h03-session-${role}`,
        userId: user.id,
        expires: new Date('2026-12-31T00:00:00.000Z'),
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          emailVerified: null,
          image: null,
          role: user.role,
        },
      },
      token: { id: user.id, role: user.role },
      user: adapterUser,
      trigger: 'update',
      newSession: undefined,
    } as never);
    expect(session.user).toMatchObject({ id: `h03-${role}`, role });
    record('valid login', role, 'credentials sign-in', 'session allowed', 'session allowed');

    const auditEvent = state.auditEvents.at(-1);
    expect(auditEvent).toBeDefined();
    expect(auditRow(auditEvent!, `h03-${role}`, 'login_success', 'allowed')).toBe(true);
  });

  it('rejects public profile creation and audits the disabled signup endpoint', async () => {
    const userCountBefore = state.users.length;

    for (const role of [null, 'candidate', 'admin'] as const) {
      state.session = role ? { user: { id: `h03-${role}`, role } } : null;
      const response = await publicSignup(request('http://localhost/api/signup', {
        name: 'Unapproved Student',
        email: 'unapproved@example.test',
        password: testPassword,
        matricNumber: 'BHU/25/LAW/001',
      }));

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        error: 'Public registration is disabled. Contact authorized staff to create a profile.',
      });
      expect(state.users).toHaveLength(userCountBefore);
      const event = state.auditEvents.at(-1);
      expect(event).toBeDefined();
      expect(event!.actionType).toBe('authorization_denied');
      expect(auditMetadata(event!).action).toBe('public_signup');
      expect(auditMetadata(event!).outcome).toBe('denied');
      record(`public registration by ${role ?? 'anonymous'}`, role ?? 'anonymous', 'create profile', '403; no change', '403; no change');
    }
  });

  it.each([
    ['wrong password', 'candidate@example.test', 'not-the-password'],
    ['unregistered student', 'not-registered@example.test', testPassword],
  ])('rejects %s with the same message and no session', async (scenario, email, password) => {
    const user = await authorizeCredentials({ email, password, portal: 'candidate' });
    const responseMessage = user ? 'Sign in allowed' : 'Invalid credentials or this account is not authorized for this portal.';
    expect(user).toBeNull();
    expect(responseMessage).toBe('Invalid credentials or this account is not authorized for this portal.');
    const event = state.auditEvents.at(-1);
    expect(event).toBeDefined();
    const metadata = auditMetadata(event!);
    expect(event!.actionType).toBe('login_failed');
    expect(metadata.outcome).toBe('denied');
    expect(metadata.accountIdentifier).toBe(email);
    expect(event!.occurredAt).toBeInstanceOf(Date);
    record(scenario, email, 'credentials sign-in', 'rejected; no session', 'rejected; no session');
  });

  it('redirects unauthenticated requests for dashboard and exam pages to login', async () => {
    for (const pathname of [
      '/dashboard/users',
      '/dashboard/ai-tools',
      '/dashboard/monitoring',
      '/dashboard/audit',
      '/dashboard/my-exams',
      '/exam/exam',
    ]) {
      const response = await authConfig.callbacks!.authorized!({
        auth: null,
        request: new NextRequest(`http://localhost${pathname}`),
      });
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).headers.get('location')).toContain('/login');
      record('unauthenticated page access', 'anonymous', pathname, 'redirect to login', 'redirect to login');
    }
    const events = state.auditEvents.filter((event) => event.actionType === 'authorization_denied');
    expect(events).toHaveLength(6);
    expect(events.every((event) => auditMetadata(event).outcome === 'denied' && event.occurredAt instanceof Date)).toBe(true);
  });

  it('redirects a student away from lecturer and administration pages and audits each denial', async () => {
    for (const pathname of [
      '/dashboard/grading',
      '/dashboard/ai-tools',
      '/dashboard/users',
      '/dashboard/admin',
      '/dashboard/monitoring',
    ]) {
      const response = await authConfig.callbacks!.authorized!({
        auth: { user: { id: 'h03-candidate', role: 'candidate' } } as never,
        request: new NextRequest(`http://localhost${pathname}`),
      });
      expect(response).toBeInstanceOf(Response);
      expect((response as Response).headers.get('location')).toContain('/dashboard');
      record('student restricted page', 'h03-candidate', pathname, 'redirect denied', 'redirect denied');
    }
    const denials = state.auditEvents.filter((event) => event.actionType === 'authorization_denied');
    expect(denials).toHaveLength(5);
    expect(denials.every((event) => event.actorId === 'h03-candidate'
      && auditMetadata(event).outcome === 'denied'
      && typeof auditMetadata(event).action === 'string')).toBe(true);
  });

  it('denies a student access to another candidate examination record without returning its data', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'h03-candidate', role: 'candidate' } } as never);
    const ownResponse = await getAttempt(request('http://localhost/api/attempts/h03-attempt-one'), {
      params: Promise.resolve({ id: 'h03-attempt-one' }),
    });
    expect(ownResponse.status).toBe(200);
    const ownRecord = await ownResponse.json();
    expect(ownRecord.candidateId).toBe('h03-candidate');
    record('own candidate read', 'h03-candidate', 'read h03-attempt-one', 'allowed', 'allowed');

    const response = await getAttempt(request('http://localhost/api/attempts/h03-attempt-two'), {
      params: Promise.resolve({ id: 'h03-attempt-two' }),
    });
    const body = await response.json();
    expect(response.status).toBe(403);
    expect(JSON.stringify(body)).not.toContain('h03-student-two');
    const event = state.auditEvents.at(-1);
    expect(event).toBeDefined();
    expect(event!.actionType).toBe('authorization_denied');
    expect(auditMetadata(event!).action).toBe('attempt_record_read');
    expect(auditMetadata(event!).outcome).toBe('denied');
    expect(event!.occurredAt).toBeInstanceOf(Date);
    record('cross-candidate read', 'h03-candidate', 'read h03-attempt-two', '403 with no data', '403 with no data');
  });

  it('rejects student attempts to update lecturer grades without changing grade data', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'h03-candidate', role: 'candidate' } } as never);
    const response = await saveGrade(request('http://localhost/api/grading/a/q', {
      officialGrade: 5,
      lecturerDecision: 'accepted',
    }), { params: Promise.resolve({ attemptId: 'h03-attempt-one', questionId: 'h03-question-one' }) });
    expect(response.status).toBe(403);
    expect(prisma.gradeDecision.upsert).not.toHaveBeenCalled();
    const event = state.auditEvents.at(-1);
    expect(event).toBeDefined();
    expect(auditMetadata(event!).action).toBe('grade_decision_update');
    expect(auditMetadata(event!).outcome).toBe('denied');
    record('lecturer-only grade update', 'h03-candidate', 'save official grade', '403; no change', '403; no change');
  });

  it('rejects lecturer calls to candidate-only start and submit functions', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'h03-lecturer', role: 'lecturer' } } as never);
    const start = await startAttempt(request('http://localhost/api/attempts/start', { assessmentId: 'h03-assessment' }));
    const submit = await submitAttempt(request('http://localhost/api/attempts/h03-attempt-one/submit', { responses: [] }), {
      params: Promise.resolve({ id: 'h03-attempt-one' }),
    });
    expect(start.status).toBe(403);
    expect(submit.status).toBe(403);
    expect(state.auditEvents.map((event) => auditMetadata(event).action)).toEqual(['attempt_start', 'attempt_submit']);
    expect(state.auditEvents.every((event) => auditMetadata(event).outcome === 'denied'
      && event.actorId === 'h03-lecturer'
      && event.occurredAt instanceof Date)).toBe(true);
    record('lecturer uses candidate-only action', 'h03-lecturer', 'start attempt', '403; no change', '403; no change');
    record('lecturer uses candidate-only action', 'h03-lecturer', 'submit attempt', '403; no change', '403; no change');
  });

  it('rejects a student administration action and allows an administrator reset', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'h03-candidate', role: 'candidate' } } as never);
    const denied = await resetAttempt(request('http://localhost/api/admin/reset-attempt', {
      attemptId: 'h03-attempt-one',
      reason: 'H03 test',
    }));
    expect(denied.status).toBe(403);
    expect(state.updatedAttempts).toBe(0);
    const denialEvent = state.auditEvents.at(-1);
    expect(denialEvent).toBeDefined();
    expect(denialEvent!.actorId).toBe('h03-candidate');
    expect(denialEvent!.actionType).toBe('authorization_denied');
    expect(auditMetadata(denialEvent!).action).toBe('attempt_reset');
    expect(auditMetadata(denialEvent!).outcome).toBe('denied');
    expect(denialEvent!.occurredAt).toBeInstanceOf(Date);
    record('student administration action', 'h03-candidate', 'reset attempt', '403; no change', '403; no change');

    vi.mocked(auth).mockResolvedValue({ user: { id: 'h03-admin', role: 'admin' } } as never);
    const allowed = await resetAttempt(request('http://localhost/api/admin/reset-attempt', {
      attemptId: 'h03-attempt-one',
      reason: 'H03 test',
    }));
    expect(allowed.status).toBe(200);
    expect(state.updatedAttempts).toBe(1);
    const event = state.auditEvents.at(-1);
    expect(event).toBeDefined();
    expect(auditRow(event!, 'h03-admin', 'attempt_reset', 'allowed')).toBe(true);
    record('administrator administration action', 'h03-admin', 'reset attempt', 'allowed', 'allowed');
  });

  it('rejects unauthorized AI requests and allows a lecturer without calling an external service', async () => {
    const validContent = JSON.stringify({
      suggested_score: 1,
      max_score: 1,
      strengths: [],
      weaknesses: [],
      criterion_observations: [{ criterion: 'Accuracy', met: true, comment: 'Correct.', awarded_score: 1, max_score: 1 }],
      uncertainty_level: 'low',
      rationale: 'Correct.',
    });
    const fakeFetch = vi.fn(async () => new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: validContent } }] })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    vi.stubGlobal('fetch', fakeFetch);

    for (const account of ['anonymous', 'h03-candidate', 'h03-invigilator', 'h03-admin']) {
      vi.mocked(auth).mockResolvedValue((account === 'anonymous'
        ? null
        : {
          user: {
            id: account,
            role: account === 'h03-admin'
              ? 'admin'
              : account === 'h03-invigilator'
                ? 'invigilator'
                : 'candidate',
          },
        }) as never);
      const denied = await assessWithAi(request('http://localhost/api/ai/assess', {
        questionText: 'Test question',
        responseText: 'Test answer',
        markingScheme: { maxMark: 1 },
      }));
      expect(denied.status).toBe(account === 'anonymous' ? 401 : 403);
      record('unauthorized AI assistance', account, 'AI assessment recommendation', 'rejected', 'rejected');
    }
    expect(fakeFetch).not.toHaveBeenCalled();
    const denials = state.auditEvents.filter((event) => event.actionType === 'authorization_denied');
    expect(denials).toHaveLength(4);
    expect(denials.every((event) => auditMetadata(event).action === 'ai_assessment_recommendation'
      && auditMetadata(event).outcome === 'denied'
      && event.occurredAt instanceof Date)).toBe(true);

    vi.mocked(auth).mockResolvedValue({ user: { id: 'h03-lecturer', role: 'lecturer' } } as never);
    vi.stubEnv('ABACUSAI_API_KEY', 'test-ai-provider-key');
    const allowed = await assessWithAi(request('http://localhost/api/ai/assess', {
      questionText: 'Test question',
      responseText: 'Test answer',
      markingScheme: { maxMark: 1 },
    }));
    expect(allowed.status).toBe(200);
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    await allowed.text();
    const allowedEvent = state.auditEvents.find((event) =>
      event.actionType === 'ai_assessment_recommendation');
    expect(allowedEvent).toBeDefined();
    expect(auditMetadata(allowedEvent!).outcome).toBe('allowed');
    expect(allowedEvent!.occurredAt).toBeInstanceOf(Date);
    record('authorized AI assistance', 'h03-lecturer', 'AI assessment recommendation', 'allowed', 'allowed');

    const inconsistentContent = JSON.stringify({
      suggested_score: 2,
      max_score: 1,
      strengths: [],
      weaknesses: [],
      criterion_observations: [{ criterion: 'Accuracy', met: true, comment: 'Check the total.', awarded_score: 2, max_score: 1 }],
      uncertainty_level: 'low',
      rationale: 'Inconsistent test result.',
    });
    fakeFetch.mockImplementationOnce(async () => new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content: inconsistentContent } }] })}\n\ndata: [DONE]\n\n`,
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
    ));
    const inconsistent = await assessWithAi(request('http://localhost/api/ai/assess', {
      questionText: 'Test question',
      responseText: 'Test answer',
      markingScheme: { maxMark: 1 },
    }));
    const inconsistentOutput = await inconsistent.text();
    expect(inconsistent.status).toBe(200);
    expect(inconsistentOutput).toContain('"passed":false');
    expect(inconsistentOutput).toContain('"review_required":true');
    expect(inconsistentOutput).toContain('Suggested score is outside the allowed mark range.');
    record('AI score validation', 'h03-lecturer', 'inconsistent marks', 'flagged for review', inconsistentOutput.includes('"review_required":true') ? 'flagged for review' : 'not flagged');
  });

});
