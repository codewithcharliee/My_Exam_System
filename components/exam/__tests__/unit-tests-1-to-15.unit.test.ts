import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    prisma: {
      user: { findUnique: vi.fn() },
      assessment: { findUnique: vi.fn() },
      userCourse: { findFirst: vi.fn() },
      readinessCheck: { findFirst: vi.fn() },
      timeAdjustment: { findFirst: vi.fn() },
      attempt: { findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      attemptSession: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
      attemptTimeEvent: { findFirst: vi.fn() },
      response: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn() },
      responseVersion: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
      presentationMapping: { create: vi.fn() },
      objectiveOutcome: { upsert: vi.fn(), findMany: vi.fn() },
      gradeDecision: { upsert: vi.fn(), findMany: vi.fn() },
      result: { upsert: vi.fn() },
      monitoringEvent: { create: vi.fn() },
      auditEvent: { findFirst: vi.fn(), create: vi.fn() },
      $transaction: vi.fn(),
    },
    auth: vi.fn(),
    requireRole: vi.fn(),
    requireRoleForAction: vi.fn(),
    requireRouteAuthorization: vi.fn(),
    requireAuth: vi.fn(),
    validateAttemptSession: vi.fn(),
    createAuditEvent: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/auth', () => ({ auth: mocks.auth }));
vi.mock('@/lib/roles', () => ({
  requireRole: mocks.requireRole,
  requireRoleForAction: mocks.requireRoleForAction,
  requireRouteAuthorization: mocks.requireRouteAuthorization,
  requireAuth: mocks.requireAuth,
}));
vi.mock('@/lib/session-integrity', async () => {
  const actual = await vi.importActual<typeof import('@/lib/session-integrity')>('@/lib/session-integrity');
  return {
    ...actual,
    validateAttemptSession: mocks.validateAttemptSession,
  };
});
vi.mock('@/lib/audit', () => ({ createAuditEvent: mocks.createAuditEvent }));

import { POST as loginPost } from '@/app/api/auth/login/route';
import { POST as startAttemptPost } from '@/app/api/attempts/start/route';
import { GET as attemptGet } from '@/app/api/attempts/[id]/route';
import { POST as syncPost } from '@/app/api/attempts/[id]/sync/route';
import { POST as recoverSessionPost } from '@/app/api/attempts/[id]/recover-session/route';
import { POST as submitAttemptPost } from '@/app/api/attempts/[id]/submit/route';
import { PATCH as gradePatch } from '@/app/api/grading/[attemptId]/[questionId]/route';
import { POST as monitoringPost } from '@/app/api/monitoring/events/route';
import { canAccessDashboardPath, isRoleAllowedOnPortal, isUserRole } from '@/lib/role-access';
import { createSubmissionReceipt } from '@/lib/exam-receipt';
import { shuffleArray } from '@/lib/exam-randomization';
import { autoScoreSubjective, scoreObjectiveAnswer } from '@/lib/scoring';
import type { UserRole } from '@/lib/role-access';

const candidate = { id: 'candidate-12345678', role: 'candidate' as UserRole };
const at = (url: string, body?: unknown, init?: RequestInit) => new NextRequest(url, {
  method: init?.method ?? (body === undefined ? 'GET' : 'POST'),
  headers: init?.headers,
  body: body === undefined ? undefined : JSON.stringify(body),
});

function setRole(role: UserRole | null = 'candidate') {
  mocks.requireRole.mockImplementation(async (...allowedRoles: UserRole[]) => {
    if (!role) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }), session: null };
    if (!allowedRoles.includes(role)) return { error: Response.json({ error: 'Forbidden' }, { status: 403 }), session: null };
    return { error: null, session: { user: { id: role === 'lecturer' ? 'lecturer-1234abcd' : candidate.id, role } } };
  });
  mocks.requireAuth.mockResolvedValue(role
    ? { error: null, session: { user: { id: candidate.id, role } } }
    : { error: Response.json({ error: 'Unauthorized' }, { status: 401 }), session: null });
  mocks.requireRoleForAction.mockImplementation(async (_action: string, ...allowedRoles: UserRole[]) =>
    mocks.requireRole(...allowedRoles));
  mocks.requireRouteAuthorization.mockImplementation(async (policyKey: string) => {
    const policyRoles: Record<string, UserRole[]> = {
      'POST /api/attempts/start': ['candidate'],
      'GET /api/attempts/[id]': ['admin', 'exam_officer', 'lecturer', 'invigilator', 'candidate'],
      'POST /api/attempts/[id]/sync': ['candidate'],
      'POST /api/attempts/[id]/recover-session': ['candidate'],
      'POST /api/attempts/[id]/submit': ['candidate'],
      'PATCH /api/grading/[attemptId]/[questionId]': ['lecturer'],
      'POST /api/monitoring/events': ['admin', 'exam_officer', 'lecturer', 'invigilator', 'candidate'],
    };
    return mocks.requireRole(...(policyRoles[policyKey] ?? []));
  });
}

describe('Unit Test 1 — Authentication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('authenticates an active account using its password and selected portal', async () => {
    const passwordHash = await bcrypt.hash('synthetic-test-password', 4);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: candidate.id,
      email: 'candidate@example.test',
      name: 'Test Candidate',
      role: 'candidate',
      accountStatus: 'active',
      passwordHash,
    });

    const response = await loginPost(at('http://localhost/api/auth/login', {
      email: ' CANDIDATE@example.test ',
      password: 'synthetic-test-password',
      portal: 'candidate',
    }) as NextRequest);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ id: candidate.id, role: 'candidate' });
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it.each([
    ['wrong password', { accountStatus: 'active' }, 'not-the-password', 'candidate', 401],
    ['inactive account', { accountStatus: 'inactive' }, 'synthetic-test-password', 'candidate', 401],
    ['unregistered account', null, 'synthetic-test-password', 'candidate', 401],
    ['wrong portal', { accountStatus: 'active' }, 'synthetic-test-password', 'admin', 403],
  ])('denies %s without returning a session', async (_case, userOverrides, password, portal, status) => {
    const passwordHash = await bcrypt.hash('synthetic-test-password', 4);
    mocks.prisma.user.findUnique.mockResolvedValue(userOverrides
      ? {
        ...userOverrides,
        id: candidate.id,
        email: 'candidate@example.test',
        name: 'Test Candidate',
        role: 'candidate',
        accountStatus: userOverrides.accountStatus ?? 'active',
        passwordHash,
      }
      : null);

    const response = await loginPost(at('http://localhost/api/auth/login', {
      email: 'candidate@example.test',
      password,
      portal,
    }) as NextRequest);

    expect(response.status).toBe(status);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(mocks.createAuditEvent).not.toHaveBeenCalledWith(expect.objectContaining({ actionType: 'login' }));
  });
});

describe('Unit Test 2 — Role authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue(null);
  });

  it('allows candidate routes, denies candidate admin access, and allows admin access', async () => {
    expect(canAccessDashboardPath('candidate', '/dashboard/my-exams')).toBe(true);
    expect(canAccessDashboardPath('candidate', '/dashboard/admin/users')).toBe(false);
    expect(canAccessDashboardPath('admin', '/dashboard/admin/users')).toBe(true);
    expect(isRoleAllowedOnPortal('candidate', 'candidate')).toBe(true);
    expect(isRoleAllowedOnPortal('candidate', 'admin')).toBe(false);
    expect(isUserRole('unsupported-role')).toBe(false);

    mocks.auth.mockResolvedValue({ user: { id: candidate.id, role: 'candidate' } });
    const { requireRole } = await vi.importActual<typeof import('@/lib/roles')>('@/lib/roles');
    const denied = await requireRole('admin');
    expect(denied.error?.status).toBe(403);

    mocks.auth.mockResolvedValue(null);
    const unauthenticated = await requireRole('candidate');
    expect(unauthenticated.error?.status).toBe(401);
  });
});

describe('Unit Test 3 — Attempt/session locking', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setRole('candidate');
    mocks.prisma.assessment.findUnique.mockResolvedValue({
      id: 'assessment-1234',
      courseId: 'course-1234',
      status: 'published',
      durationMins: 60,
      maxAttempts: 1,
      items: [],
    });
    mocks.prisma.userCourse.findFirst.mockResolvedValue({ id: 'enrollment-1' });
    mocks.prisma.readinessCheck.findFirst.mockResolvedValue({ detailsJson: '{"failedCount":0,"blocked":false}' });
    mocks.prisma.timeAdjustment.findFirst.mockResolvedValue(null);
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback({
      $queryRaw: vi.fn(),
      attempt: {
        updateMany: vi.fn(),
        findFirst: mocks.prisma.attempt.findFirst,
        count: mocks.prisma.attempt.count,
        create: mocks.prisma.attempt.create,
      },
      attemptSession: { create: mocks.prisma.attemptSession.create },
    }));
  });

  it('rejects a second start while another active attempt exists', async () => {
    mocks.prisma.attempt.findFirst.mockResolvedValue({ id: 'active-attempt', assessmentId: 'assessment-1234' });
    mocks.validateAttemptSession.mockResolvedValue({ ok: false, code: 'DUPLICATE_ACTIVE_SESSION', error: 'Duplicate session' });

    const response = await startAttemptPost(at('http://localhost/api/attempts/start', { assessmentId: 'assessment-1234' }) as NextRequest);

    expect(response.status).toBe(409);
    expect(mocks.prisma.attempt.create).not.toHaveBeenCalled();
  });

  it('denies a restart when the configured attempt limit has already been used', async () => {
    mocks.prisma.attempt.findFirst.mockResolvedValue(null);
    mocks.prisma.attempt.count.mockResolvedValue(1);

    const response = await startAttemptPost(at('http://localhost/api/attempts/start', { assessmentId: 'assessment-1234' }) as NextRequest);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Maximum attempts reached' });
    expect(mocks.prisma.attempt.create).not.toHaveBeenCalled();
    expect(mocks.prisma.attempt.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['submitted', 'auto_submitted_violation', 'timed_out', 'abandoned'] } }),
    }));
  });

  it('sets expiry to the server start time plus the configured exam duration', async () => {
    const startAt = new Date('2026-10-11T12:00:00.000Z');
    const expiresAt = new Date(startAt.getTime() + 60 * 60 * 1000);
    vi.useFakeTimers();
    vi.setSystemTime(startAt);
    mocks.prisma.attempt.findFirst.mockResolvedValue(null);
    mocks.prisma.attempt.count.mockResolvedValue(0);
    mocks.prisma.attempt.create.mockResolvedValue({ id: 'new-attempt', startAt, expiresAt });

    try {
      const response = await startAttemptPost(at('http://localhost/api/attempts/start', {
        assessmentId: 'assessment-1234',
      }) as NextRequest);

      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ attemptId: 'new-attempt', expiresAt: expiresAt.toISOString() });
      expect(mocks.prisma.attempt.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ startAt, expiresAt, status: 'in_progress', isActive: true }),
      }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Unit Test 4 — Autosave', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setRole('candidate');
    mocks.validateAttemptSession.mockResolvedValue({ ok: true });
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: Record<string, unknown>) => Promise<unknown>) =>
      callback({ ...mocks.prisma, $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]) }));
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: 'attempt-1234',
      candidateId: candidate.id,
      status: 'in_progress',
      isActive: true,
      expiresAt: null,
      assessment: { items: [{ questionId: 'Q10' }] },
    });
    mocks.prisma.response.findUnique.mockResolvedValue(null);
    mocks.prisma.response.upsert.mockResolvedValue({ id: 'response-10', wordCount: 3 });
    mocks.prisma.responseVersion.findFirst.mockResolvedValue(null);
    mocks.prisma.responseVersion.count.mockResolvedValue(0);
  });

  it('persists the Q10 response, creates its first version, and records a sync timestamp', async () => {
    const response = await syncPost(at('http://localhost/api/attempts/attempt-1234/sync', {
      responses: [{ questionId: 'Q10', currentText: 'known synthetic answer', wordCount: 3 }],
    }), { params: Promise.resolve({ id: 'attempt-1234' }) });

    expect(response.status).toBe(200);
    const savedAt = await response.json();
    expect(savedAt.syncedAt).toBeTruthy();
    expect(mocks.prisma.response.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { attemptId_questionId: { attemptId: 'attempt-1234', questionId: 'Q10' } },
      update: expect.objectContaining({ currentText: 'known synthetic answer', syncStatus: 'synced' }),
    }));
    expect(mocks.prisma.responseVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ responseId: 'response-10', text: 'known synthetic answer', versionNum: 1 }),
    }));
  });

  it('creates a new version when an answer changes and returns a failure for a failed retry', async () => {
    mocks.prisma.attempt.findUnique.mockReset().mockResolvedValue({
      id: 'attempt-1234',
      candidateId: candidate.id,
      status: 'in_progress',
      isActive: true,
      expiresAt: null,
      assessment: { items: [{ questionId: 'Q10' }] },
    });
    mocks.prisma.responseVersion.findFirst.mockResolvedValue({ text: 'older answer', versionNum: 1 });
    mocks.prisma.responseVersion.count.mockResolvedValue(1);

    const response = await syncPost(at('http://localhost/api/attempts/attempt-1234/sync', {
      responses: [{ questionId: 'Q10', currentText: 'updated answer', wordCount: 2 }],
    }), { params: Promise.resolve({ id: 'attempt-1234' }) });
    expect(response.status).toBe(200);
    expect(mocks.prisma.responseVersion.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ text: 'updated answer', versionNum: 2 }),
    }));

    mocks.prisma.attempt.findUnique.mockReset().mockResolvedValue({
      id: 'attempt-1234',
      candidateId: candidate.id,
      status: 'in_progress',
      isActive: true,
      expiresAt: null,
      assessment: { items: [{ questionId: 'Q10' }] },
    });
    mocks.prisma.response.upsert.mockRejectedValueOnce(new Error('synthetic database failure'));
    const failedRetry = await syncPost(at('http://localhost/api/attempts/attempt-1234/sync', {
      responses: [{ questionId: 'Q10', currentText: 'updated answer' }],
    }), { params: Promise.resolve({ id: 'attempt-1234' }) });
    expect(failedRetry.status).toBe(500);
  });

  it('ignores an out-of-order autosave whose answer-change sequence is stale', async () => {
    mocks.prisma.attempt.findUnique.mockReset().mockResolvedValue({
      id: 'attempt-1234',
      candidateId: candidate.id,
      status: 'in_progress',
      isActive: true,
      expiresAt: null,
      assessment: { items: [{ questionId: 'Q10' }] },
    });
    mocks.prisma.response.findUnique.mockResolvedValue({
      id: 'response-10',
      currentText: 'newest answer',
      selectedOptionId: null,
      answerChanges: 4,
      wordCount: 2,
    });

    const response = await syncPost(at('http://localhost/api/attempts/attempt-1234/sync', {
      responses: [{
        questionId: 'Q10',
        currentText: 'older delayed answer',
        selectedOptionId: null,
        wordCount: 3,
        timeSpentSecs: 0,
        visitCount: 1,
        answerChanges: 3,
      }],
    }), { params: Promise.resolve({ id: 'attempt-1234' }) });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      responses: [{ currentText: 'newest answer' }],
    });
    expect(mocks.prisma.response.upsert).not.toHaveBeenCalled();
    expect(mocks.prisma.responseVersion.create).not.toHaveBeenCalled();
  });
});

describe('Unit Test 5 — Response recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setRole('candidate');
    mocks.validateAttemptSession.mockResolvedValue({ ok: true });
  });

  it('recovers the exact saved answer, including empty and long responses', async () => {
    const exactText = `  ${'recovered answer '.repeat(400)}  `;
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: 'attempt-1234',
      candidateId: candidate.id,
      status: 'in_progress',
      isActive: true,
      assessment: { items: [{ questionId: 'Q10', question: { id: 'Q10', type: 'essay', text: 'Synthetic prompt', options: [] } }] },
      responses: [
        { questionId: 'Q10', currentText: exactText },
        { questionId: 'Q11', currentText: '' },
      ],
    });

    const response = await attemptGet(at('http://localhost/api/attempts/attempt-1234', undefined, {
      headers: { cookie: 'exam_session_attempt-1234=synthetic-session' },
    }), { params: Promise.resolve({ id: 'attempt-1234' }) });

    expect(response.status).toBe(200);
    const recovered = await response.json();
    expect(recovered.responses[0].currentText).toBe(exactText);
    expect(recovered.responses[1].currentText).toBe('');
    expect(recovered.assessment.items[0].question.answerKeys).toEqual([]);
  });

  it('requires staff reactivation and rotates the session after recovery is authorized', async () => {
    const tx = {
      $queryRaw: vi.fn(),
      attempt: { findFirst: vi.fn().mockResolvedValue({
        id: 'attempt-1234', status: 'in_progress', isActive: true, expiresAt: null,
      }) },
      attemptTimeEvent: { findFirst: vi.fn().mockResolvedValue(null) },
      attemptSession: { findFirst: vi.fn().mockResolvedValue({ startedAt: new Date('2026-01-01T00:00:00Z') }), updateMany: vi.fn(), create: vi.fn() },
    };
    mocks.prisma.$transaction.mockImplementation((callback) => callback(tx));
    const denied = await recoverSessionPost(at('http://localhost/api/attempts/attempt-1234', {}), {
      params: Promise.resolve({ id: 'attempt-1234' }),
    });
    expect(denied.status).toBe(403);
    expect(tx.attemptSession.create).not.toHaveBeenCalled();

    tx.attemptTimeEvent.findFirst.mockResolvedValue({ occurredAt: new Date('2026-02-01T00:00:00Z') });
    const recovered = await recoverSessionPost(at('http://localhost/api/attempts/attempt-1234', {}), {
      params: Promise.resolve({ id: 'attempt-1234' }),
    });
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({ recovered: true, attemptId: 'attempt-1234' });
    expect(tx.attemptSession.updateMany).toHaveBeenCalled();
    expect(tx.attemptSession.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ attemptId: 'attempt-1234', sessionTokenHash: expect.any(String) }),
    }));
  });
});

describe('Unit Test 6 — Synchronization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setRole('candidate');
    mocks.validateAttemptSession.mockResolvedValue({ ok: true });
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: Record<string, unknown>) => Promise<unknown>) =>
      callback({ ...mocks.prisma, $queryRaw: vi.fn().mockResolvedValue([{ locked: true }]) }));
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: 'attempt-1234',
      candidateId: candidate.id,
      status: 'in_progress',
      isActive: true,
      expiresAt: null,
      assessment: { items: [{ questionId: 'Q10' }] },
    });
    mocks.prisma.response.upsert.mockResolvedValue({ id: 'response-10' });
    mocks.prisma.responseVersion.findFirst.mockResolvedValue({ text: 'same response', versionNum: 1 });
  });

  it('syncs an identical retry idempotently without adding another response version', async () => {
    const makeRequest = () => at('http://localhost/api/attempts/attempt-1234/sync', {
      responses: [{ questionId: 'Q10', currentText: 'same response' }],
    });
    const context = { params: Promise.resolve({ id: 'attempt-1234' }) };

    const first = await syncPost(makeRequest(), context);
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: 'attempt-1234',
      candidateId: candidate.id,
      status: 'in_progress',
      isActive: true,
      expiresAt: null,
      assessment: { items: [{ questionId: 'Q10' }] },
    });
    const retry = await syncPost(makeRequest(), context);

    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(mocks.prisma.response.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.responseVersion.create).not.toHaveBeenCalled();
  });
});

describe('Unit Test 8 — Objective scoring', () => {
  it('scores eight of ten equally weighted answers as 8/10 and handles all-correct, wrong, and unanswered answers', () => {
    const scores = Array.from({ length: 10 }, (_, index) =>
      scoreObjectiveAnswer(index < 8 ? `correct-${index}` : `wrong-${index}`, `correct-${index}`, 1));
    expect(scores.reduce((total, answer) => total + answer.score, 0)).toBe(8);
    expect(scores.filter((answer) => answer.isCorrect)).toHaveLength(8);
    expect(scores.slice(0, 8).every((answer) => answer.isCorrect)).toBe(true);
    expect(Array.from({ length: 10 }, (_, index) => scoreObjectiveAnswer(`correct-${index}`, `correct-${index}`, 1))
      .reduce((total, answer) => total + answer.score, 0)).toBe(10);
    expect(Array.from({ length: 10 }, (_, index) => scoreObjectiveAnswer(`wrong-${index}`, `correct-${index}`, 1))
      .reduce((total, answer) => total + answer.score, 0)).toBe(0);
    expect(scoreObjectiveAnswer('incorrect', 'right', 2)).toMatchObject({ score: 0, isCorrect: false });
    expect(scoreObjectiveAnswer(null, 'right', 2)).toMatchObject({ score: 0, isCorrect: false, isUnanswered: true });
  });

  it('uses each question mark value and does not award beyond its maximum', () => {
    const answers = [
      scoreObjectiveAnswer('a', 'a', 2),
      scoreObjectiveAnswer('b', 'b', 5),
      scoreObjectiveAnswer('wrong', 'c', 10),
    ];
    expect(answers.reduce((total, answer) => total + answer.score, 0)).toBe(7);
    expect(scoreObjectiveAnswer('right', 'right', 3)).toMatchObject({ score: 3, isCorrect: true });
  });
});

describe('Unit Test 9 — Question randomization', () => {
  it('returns a deterministic permutation while keeping each question and its content paired', () => {
    const questions = [
      { id: 'Q1', text: 'First' },
      { id: 'Q2', text: 'Second' },
      { id: 'Q3', text: 'Third' },
      { id: 'Q4', text: 'Fourth' },
      { id: 'Q5', text: 'Fifth' },
    ];
    const randomValues = [0.1, 0.7, 0.2, 0.9];
    let randomIndex = 0;
    const shuffled = shuffleArray(questions, () => randomValues[randomIndex++]);

    expect(shuffled).toHaveLength(5);
    expect(new Set(shuffled.map(({ id }) => id))).toEqual(new Set(questions.map(({ id }) => id)));
    expect(shuffled.map(({ text }) => text).sort()).toEqual(['Fifth', 'First', 'Fourth', 'Second', 'Third']);
    expect(shuffled.every((item) => questions.some((original) => original.id === item.id && original.text === item.text))).toBe(true);
  });
});

describe('Unit Test 10 — Submission receipt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setRole('candidate');
  });

  it('returns receipt display fields after a valid exam attempt is submitted', async () => {
    mocks.validateAttemptSession.mockResolvedValue({ ok: true });
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: 'attempt-abcdef123456',
      assessmentId: 'assessment-123456',
      candidateId: candidate.id,
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 60_000),
      assessment: { items: [] },
      responses: [],
    });
    mocks.prisma.objectiveOutcome.findMany.mockResolvedValue([]);
    mocks.prisma.attemptSession.findFirst.mockResolvedValue(null);

    const response = await submitAttemptPost(
      new NextRequest('http://localhost/api/attempts/attempt-abcdef123456/submit', { method: 'POST' }),
      { params: Promise.resolve({ id: 'attempt-abcdef123456' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      receiptId: expect.stringContaining('EXAM-assessme-ATT-attempt--CAND-cand****5678-'),
      attemptId: 'attempt-abcdef123456',
      candidateIdentifier: 'cand****5678',
      status: 'submitted',
    });
    expect(Date.parse(body.submittedAt)).not.toBeNaN();
    expect(body.receipt).toBe(body.receiptId);
    expect(body.receiptId).not.toContain(candidate.id);
  });

  it('stores submission marking as provisional without assigning an official grade', async () => {
    mocks.validateAttemptSession.mockResolvedValue({ ok: true });
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: 'attempt-abcdef123456',
      assessmentId: 'assessment-123456',
      candidateId: candidate.id,
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 60_000),
      assessment: {
        items: [{
          questionId: 'Q10',
          maxMark: 5,
          question: {
            type: 'short_answer',
            markingSchemes: [{
              version: 1,
              method: 'marking_points',
              configJson: null,
              markingPoints: [
                { pointText: 'Point A', marks: 2, alternativesJson: null },
                { pointText: 'Point B', marks: 2, alternativesJson: null },
                { pointText: 'Point C', marks: 1, alternativesJson: null },
              ],
            }],
          },
        }],
      },
      responses: [{ questionId: 'Q10', currentText: 'Point A and Point C' }],
    });
    mocks.prisma.objectiveOutcome.findMany.mockResolvedValue([]);
    mocks.prisma.attemptSession.findFirst.mockResolvedValue(null);

    const response = await submitAttemptPost(
      new NextRequest('http://localhost/api/attempts/attempt-abcdef123456/submit', { method: 'POST' }),
      { params: Promise.resolve({ id: 'attempt-abcdef123456' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.gradeDecision.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        provisionalScore: 3,
        officialGrade: null,
        lecturerDecision: 'pending',
      }),
      update: expect.not.objectContaining({ officialGrade: expect.anything() }),
    }));
  });

  it('creates a timestamped submitted receipt for the correct attempt with a masked candidate identifier', () => {
    const receipt = createSubmissionReceipt('assessment-123456', 'attempt-abcdef', 'candidate-12345678', new Date('2026-10-11T12:00:00.000Z'));
    expect(receipt).toContain('EXAM-assessme-ATT-attempt--CAND-cand****5678');
    expect(receipt).toContain('2026-10-11T12:00:00.000Z-SUBMITTED');
    expect(receipt).not.toContain('candidate-12345678');
  });

  it('does not return a successful receipt for a malformed submission', async () => {
    const response = await submitAttemptPost(new NextRequest('http://localhost/api/attempts/attempt-1234/submit', {
      method: 'POST',
      body: '{malformed',
    }), { params: Promise.resolve({ id: 'attempt-1234' }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Invalid final response payload' });
  });
});

describe('Unit Test 11 — Audit-log generation', () => {
  beforeEach(() => vi.resetAllMocks());

  it('writes actor, action, entity, reason, timestamp, and a chained integrity hash', async () => {
    mocks.prisma.auditEvent.findFirst.mockResolvedValue({ hash: 'previous-hash' });
    mocks.prisma.auditEvent.create.mockImplementation(async ({ data }) => ({ id: 'audit-1', ...data }));
    const { createAuditEvent } = await vi.importActual<typeof import('@/lib/audit')>('@/lib/audit');

    const event = await createAuditEvent({
      actorId: 'admin-test-id',
      actionType: 'attempt_reset',
      entityType: 'attempt',
      entityId: 'attempt-1234',
      reason: 'Synthetic test reset',
    });

    expect(event).toMatchObject({
      actorId: 'admin-test-id',
      actionType: 'attempt_reset',
      entityId: 'attempt-1234',
      reason: 'Synthetic test reset',
      prevHash: 'previous-hash',
    });
    expect(event?.occurredAt).toBeInstanceOf(Date);
    expect(event?.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('Unit Test 12 — Database relationship validation', () => {
  const isolatedDatabaseUrl = process.env.TEST_DATABASE_URL;
  const integrationPrisma = isolatedDatabaseUrl
    ? new PrismaClient({ datasources: { db: { url: isolatedDatabaseUrl } } })
    : null;
  const itWithIsolatedDatabase = integrationPrisma ? it : it.skip;

  afterAll(async () => {
    await integrationPrisma?.$disconnect();
  });

  it('declares the response-to-attempt foreign key in the real Prisma schema', async () => {
    const schema = await readFile(new URL('../../../prisma/schema.prisma', import.meta.url), 'utf8');
    const responseModel = schema.match(/model Response \{[\s\S]*?\n\}/)?.[0] ?? '';
    expect(responseModel).toMatch(/attempt\s+Attempt\s+@relation\(fields:\s*\[attemptId\],\s*references:\s*\[id\]/);
  });

  itWithIsolatedDatabase('rejects a response whose attempt ID is absent from the isolated PostgreSQL database', async () => {
    await expect(integrationPrisma!.response.create({
      data: { attemptId: 'missing-attempt-for-foreign-key-test', questionId: 'synthetic-question-id' },
    })).rejects.toThrow();
  });
});

describe('Unit Test 13 — Marking-point calculation', () => {
  it('awards 3/5 for points A and C and caps totals at the question maximum', () => {
    const result = autoScoreSubjective('Point A and Point C', {
      method: 'marking_points',
      maxMark: 5,
      configJson: null,
      markingPoints: [
        { pointText: 'Point A', marks: 2, alternativesJson: null },
        { pointText: 'Point B', marks: 2, alternativesJson: null },
        { pointText: 'Point C', marks: 1, alternativesJson: null },
      ],
    });
    expect(result).toMatchObject({
      provisionalScore: 3,
      matchedPoints: ['Point A', 'Point C'],
      unmatchedPoints: ['Point B'],
      stage: 'auto',
    });

    const capped = autoScoreSubjective('Point A Point B Point C', {
      method: 'marking_points',
      maxMark: 4,
      configJson: null,
      markingPoints: [
        { pointText: 'Point A', marks: 2, alternativesJson: null },
        { pointText: 'Point B', marks: 2, alternativesJson: null },
        { pointText: 'Point C', marks: 1, alternativesJson: null },
      ],
    });
    expect(capped.provisionalScore).toBe(4);
  });
});

describe('Unit Test 14 — Lecturer confirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setRole('lecturer');
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: 'attempt-1234',
      assessment: { items: [{ questionId: 'Q10', maxMark: 5 }] },
    });
    mocks.prisma.gradeDecision.upsert.mockImplementation(async ({ create }) => ({ id: 'grade-1', ...create }));
    mocks.prisma.gradeDecision.findMany.mockResolvedValue([]);
    mocks.prisma.objectiveOutcome.findMany.mockResolvedValue([]);
    mocks.prisma.result.upsert.mockResolvedValue({});
  });

  it('does not promote a provisional score without lecturer approval and supports confirm, modify, and reject decisions', async () => {
    const context = { params: Promise.resolve({ attemptId: 'attempt-1234', questionId: 'Q10' }) };
    const pending = await gradePatch(at('http://localhost/api/grading', {
      provisionalScore: 3,
      lecturerDecision: 'pending',
    }), context);
    expect(pending.status).toBe(200);
    expect(mocks.prisma.gradeDecision.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      create: expect.objectContaining({ officialGrade: null, provisionalScore: 3, lecturerDecision: 'pending' }),
    }));

    for (const [decision, officialGrade] of [['accepted', 3], ['modified', 2], ['rejected', null]] as const) {
      const result = await gradePatch(at('http://localhost/api/grading', { lecturerDecision: decision, officialGrade }), context);
      expect(result.status).toBe(200);
      expect(mocks.prisma.gradeDecision.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
        create: expect.objectContaining({ lecturerDecision: decision, officialGrade }),
      }));
    }
  });

  it('denies candidates and rejects grades above the item maximum', async () => {
    setRole('candidate');
    const denied = await gradePatch(at('http://localhost/api/grading', { officialGrade: 5 }), {
      params: Promise.resolve({ attemptId: 'attempt-1234', questionId: 'Q10' }),
    });
    expect(denied.status).toBe(403);

    setRole('lecturer');
    const invalid = await gradePatch(at('http://localhost/api/grading', { officialGrade: 6 }), {
      params: Promise.resolve({ attemptId: 'attempt-1234', questionId: 'Q10' }),
    });
    expect(invalid.status).toBe(400);
  });
});

describe('Unit Test 15 — Monitoring-event generation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setRole('candidate');
    mocks.prisma.attempt.findUnique.mockResolvedValue({ id: 'attempt-1234', candidateId: candidate.id });
    mocks.prisma.monitoringEvent.create.mockImplementation(async ({ data }) => ({
      id: 'event-1',
      occurredAt: new Date(),
      ...data,
    }));
  });

  it('stores a fullscreen-exit event against the authenticated candidate attempt', async () => {
    const response = await monitoringPost(at('http://localhost/api/monitoring/events', {
      attemptId: 'attempt-1234',
      eventType: 'FULLSCREEN_EXIT',
      detail: 'Candidate exited fullscreen mode',
    }));
    expect(response.status).toBe(201);
    expect(mocks.prisma.monitoringEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        attemptId: 'attempt-1234',
        eventType: 'FULLSCREEN_EXIT',
        metaJson: JSON.stringify({ detail: 'Candidate exited fullscreen mode' }),
      }),
    });
    expect(mocks.createAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorId: candidate.id,
      actionType: 'monitoring_event_logged',
    }));
  });

  it('rejects missing identifiers and denies events for another candidate', async () => {
    const missing = await monitoringPost(at('http://localhost/api/monitoring/events', { eventType: 'FULLSCREEN_EXIT' }));
    expect(missing.status).toBe(400);

    mocks.prisma.attempt.findUnique.mockResolvedValue({ id: 'attempt-other', candidateId: 'another-candidate' });
    const forbidden = await monitoringPost(at('http://localhost/api/monitoring/events', {
      attemptId: 'attempt-other',
      eventType: 'FULLSCREEN_EXIT',
    }));
    expect(forbidden.status).toBe(403);
  });

  it('accepts an unknown non-empty event type under the route’s current validation rules', async () => {
    const response = await monitoringPost(at('http://localhost/api/monitoring/events', {
      attemptId: 'attempt-1234',
      eventType: 'SYNTHETIC_UNKNOWN_EVENT',
    }));

    expect(response.status).toBe(201);
    expect(mocks.prisma.monitoringEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: 'SYNTHETIC_UNKNOWN_EVENT' }),
    }));
  });
});
