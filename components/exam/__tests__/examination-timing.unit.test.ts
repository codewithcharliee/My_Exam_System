import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const { authState } = vi.hoisted(() => ({
  authState: { candidateId: '' },
}));

vi.mock('@/lib/roles', () => ({
  requireAuth: vi.fn(async () => ({
    error: null,
    session: { user: { id: authState.candidateId, role: 'candidate' } },
  })),
  requireRole: vi.fn(async () => ({
    error: null,
    session: { user: { id: authState.candidateId, role: 'candidate' } },
  })),
  requireRoleForAction: vi.fn(async () => ({
    error: null,
    session: { user: { id: authState.candidateId, role: 'candidate' } },
  })),
  requireRouteAuthorization: vi.fn(async () => ({
    error: null,
    session: { user: { id: authState.candidateId, role: 'candidate' } },
  })),
}));

vi.mock('@/lib/session-integrity', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/session-integrity')>(),
  validateAttemptSession: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/audit', () => ({
  createAuditEvent: vi.fn(async () => null),
}));

import { POST as startAttempt } from '@/app/api/attempts/start/route';
import { POST as syncResponses } from '@/app/api/attempts/[id]/sync/route';
import { GET as getAttempt } from '@/app/api/attempts/[id]/route';
import { POST as submitAttempt } from '@/app/api/attempts/[id]/submit/route';
import { prisma } from '@/lib/prisma';

const databaseDescribe = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const scheduleStart = new Date('2026-10-12T12:00:00.000Z');
const assessmentDurationMs = 5 * 60 * 1000;
const candidates = {
  early: `h04-early-${randomUUID()}`,
  exact: `h04-exact-${randomUUID()}`,
  middle: `h04-middle-${randomUUID()}`,
  nearExpiry: `h04-near-${randomUUID()}`,
  expiry: `h04-expiry-${randomUUID()}`,
  afterExpiry: `h04-after-${randomUUID()}`,
  late: `h04-late-${randomUUID()}`,
} as const;
const allCandidateIds = Object.values(candidates);
const creatorId = `h04-creator-${randomUUID()}`;
const courseId = `h04-course-${randomUUID()}`;
const questionId = `h04-question-${randomUUID()}`;
const assessments = Object.fromEntries(
  Object.entries(candidates).map(([key]) => [key, `h04-assessment-${key}-${randomUUID()}`]),
) as Record<keyof typeof candidates, string>;
const createdAttemptIds: string[] = [];
const timingRows: Array<{ name: string; configured: Date; recorded: Date; status: 'PASS' | 'FAIL' }> = [];

type ResponseInput = {
  questionId: string;
  currentText: string | null;
  selectedOptionId: string | null;
  wordCount: number;
  timeSpentSecs: number;
  visitCount: number;
  answerChanges: number;
};

function routeRequest(url: string, method: 'GET' | 'POST', body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function saveTiming(name: string, configured: Date, recorded: Date) {
  const status = configured.getTime() === recorded.getTime() ? 'PASS' : 'FAIL';
  timingRows.push({ name, configured, recorded, status });
  expect(recorded.getTime()).toBe(configured.getTime());
}

const answer = (currentText: string): ResponseInput => ({
  questionId,
  currentText,
  selectedOptionId: null,
  wordCount: currentText.split(/\s+/).length,
  timeSpentSecs: 5,
  visitCount: 1,
  answerChanges: 1,
});

databaseDescribe('H04 — timing rules through the real PostgreSQL handlers', () => {
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL is required for the H04 timing integration tests.');
    }

    await prisma.user.createMany({
      data: [
        {
          id: creatorId,
          name: 'H04 Test Administrator',
          email: `${creatorId}@example.test`,
          passwordHash: 'synthetic-test-hash',
          role: 'admin',
        },
        ...Object.entries(candidates).map(([key, id]) => ({
          id,
          name: `H04 Candidate ${key}`,
          email: `${id}@example.test`,
          passwordHash: 'synthetic-test-hash',
          role: 'candidate' as const,
        })),
      ],
    });
    await prisma.course.create({
      data: { id: courseId, code: `H04-${randomUUID().slice(0, 8)}`, title: 'H04 Timing Test Course' },
    });
    await prisma.question.create({
      data: {
        id: questionId,
        courseId,
        type: 'short_answer',
        text: 'Explain the timing rule.',
        createdBy: creatorId,
      },
    });
    await prisma.assessment.createMany({
      data: Object.entries(assessments).map(([key, id]) => ({
        id,
        courseId,
        title: `H04 ${key} timed examination`,
        durationMins: 5,
        startAt: scheduleStart,
        endAt: new Date(scheduleStart.getTime() + 60 * 60 * 1000),
        status: 'published',
        maxAttempts: 1,
        createdBy: creatorId,
      })),
    });
    await prisma.assessmentItem.createMany({
      data: Object.values(assessments).map((assessmentId) => ({
        assessmentId,
        questionId,
        displayOrder: 1,
        maxMark: 5,
      })),
    });
    await prisma.userCourse.createMany({
      data: allCandidateIds.map((userId) => ({ userId, courseId, role: 'candidate' })),
    });
    await prisma.readinessCheck.createMany({
      data: allCandidateIds.map((candidateId) => ({
        candidateId,
        checkType: 'readiness_summary',
        status: 'passed',
        detailsJson: JSON.stringify({ failedCount: 0, blocked: false }),
      })),
    });
  }, 60_000);

  afterAll(async () => {
    const table = [
      'Case | Configured timestamp (ms) | Recorded timestamp (ms) | Difference (ms) | Status',
      ...timingRows.map((row) => {
        const configured = row.configured.getTime();
        const recorded = row.recorded.getTime();
        return `${row.name} | ${configured} | ${recorded} | ${Math.abs(configured - recorded)} | ${row.status}`;
      }),
    ].join('\n');
    console.info(`\nH04 PostgreSQL timing results:\n${table}\n`);
    expect(timingRows.length).toBeGreaterThanOrEqual(8);
    expect(timingRows.every((row) => row.status === 'PASS')).toBe(true);

    if (createdAttemptIds.length > 0) {
      await prisma.attempt.deleteMany({ where: { id: { in: createdAttemptIds } } });
    }
    await prisma.readinessCheck.deleteMany({ where: { candidateId: { in: allCandidateIds } } });
    await prisma.userCourse.deleteMany({ where: { userId: { in: allCandidateIds } } });
    await prisma.assessment.deleteMany({ where: { id: { in: Object.values(assessments) } } });
    await prisma.question.deleteMany({ where: { id: questionId } });
    await prisma.course.deleteMany({ where: { id: courseId } });
    await prisma.user.deleteMany({ where: { id: { in: [...allCandidateIds, creatorId] } } });
    await prisma.$disconnect();
  }, 60_000);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(scheduleStart);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects a start one second before schedule without creating an attempt', async () => {
    vi.setSystemTime(scheduleStart.getTime() - 1000);
    authState.candidateId = candidates.early;
    const response = await startAttempt(routeRequest(
      'http://localhost/api/attempts/start',
      'POST',
      { assessmentId: assessments.early },
    ));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: 'Assessment has not started yet' });
    expect(await prisma.attempt.count({ where: { candidateId: candidates.early } })).toBe(0);
    saveTiming('Before scheduled start', new Date(scheduleStart.getTime() - 1000), new Date(Date.now()));
  });

  it('creates an in-progress attempt with the exact scheduled start and five-minute expiry', async () => {
    authState.candidateId = candidates.exact;
    const response = await startAttempt(routeRequest(
      'http://localhost/api/attempts/start',
      'POST',
      { assessmentId: assessments.exact },
    ));
    expect(response.status).toBe(201);
    const body = await response.json();
    createdAttemptIds.push(body.attemptId);
    const attempt = await prisma.attempt.findUnique({ where: { id: body.attemptId } });
    expect(attempt).toMatchObject({ status: 'in_progress', isActive: true });
    expect(attempt?.startAt).toEqual(scheduleStart);
    expect(attempt?.expiresAt).toEqual(new Date(scheduleStart.getTime() + assessmentDurationMs));
    saveTiming('Recorded startAt', scheduleStart, attempt!.startAt!);
    saveTiming('Recorded expiresAt', new Date(scheduleStart.getTime() + assessmentDurationMs), attempt!.expiresAt!);
  });

  it('saves answers mid-exam and submits them at exact expiry', async () => {
    authState.candidateId = candidates.expiry;
    const started = await startAttempt(routeRequest('http://localhost/api/attempts/start', 'POST', {
      assessmentId: assessments.expiry,
    }));
    expect(started.status).toBe(201);
    const { attemptId } = await started.json() as { attemptId: string };
    createdAttemptIds.push(attemptId);

    vi.setSystemTime(scheduleStart.getTime() + 150_000);
    const saved = await syncResponses(routeRequest(
      `http://localhost/api/attempts/${attemptId}/sync`,
      'POST',
      { responses: [answer('Saved at the middle of the examination.')] },
    ), { params: Promise.resolve({ id: attemptId }) });
    expect(saved.status).toBe(200);
    const responseBeforeExpiry = await prisma.response.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
    });
    expect(responseBeforeExpiry?.currentText).toBe('Saved at the middle of the examination.');
    const reloaded = await getAttempt(routeRequest(
      `http://localhost/api/attempts/${attemptId}`,
      'GET',
    ), { params: Promise.resolve({ id: attemptId }) });
    expect(reloaded.status).toBe(200);
    const reloadedData = await reloaded.json();
    expect(reloadedData.expiresAt).toBe(new Date(scheduleStart.getTime() + assessmentDurationMs).toISOString());
    expect(Date.parse(reloadedData.serverTime)).toBe(Date.now());
    saveTiming(
      'Reload preserves original expiry',
      new Date(scheduleStart.getTime() + assessmentDurationMs),
      new Date(reloadedData.expiresAt),
    );

    vi.setSystemTime(scheduleStart.getTime() + assessmentDurationMs);
    const submitted = await submitAttempt(routeRequest(
      `http://localhost/api/attempts/${attemptId}/submit`,
      'POST',
      { responses: [answer('Final answer at exact expiry.')] },
    ), { params: Promise.resolve({ id: attemptId }) });
    expect(submitted.status).toBe(200);
    const finalBody = await submitted.json();
    const completed = await prisma.attempt.findUnique({ where: { id: attemptId } });
    expect(finalBody.status).toBe('submitted');
    expect(completed?.status).toBe('submitted');
    expect(completed?.submittedAt).toEqual(new Date(scheduleStart.getTime() + assessmentDurationMs));
    const finalResponse = await prisma.response.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
    });
    expect(finalResponse?.currentText).toBe('Final answer at exact expiry.');
    saveTiming('Submission at exact expiry', new Date(scheduleStart.getTime() + assessmentDurationMs), completed!.submittedAt!);
  });

  it('accepts saving and manual submission five seconds before expiry', async () => {
    authState.candidateId = candidates.nearExpiry;
    const started = await startAttempt(routeRequest('http://localhost/api/attempts/start', 'POST', {
      assessmentId: assessments.nearExpiry,
    }));
    expect(started.status).toBe(201);
    const { attemptId } = await started.json() as { attemptId: string };
    createdAttemptIds.push(attemptId);

    vi.setSystemTime(scheduleStart.getTime() + assessmentDurationMs - 5000);
    const response = await submitAttempt(routeRequest(
      `http://localhost/api/attempts/${attemptId}/submit`,
      'POST',
      { responses: [answer('Submitted five seconds before expiry.')] },
    ), { params: Promise.resolve({ id: attemptId }) });
    expect(response.status).toBe(200);
    const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
    expect(attempt?.status).toBe('submitted');
    saveTiming('Submission before expiry', new Date(scheduleStart.getTime() + assessmentDurationMs - 5000), attempt!.submittedAt!);
  });

  it('locks the attempt after expiry and does not mutate answers from late sync or submission', async () => {
    authState.candidateId = candidates.afterExpiry;
    const started = await startAttempt(routeRequest('http://localhost/api/attempts/start', 'POST', {
      assessmentId: assessments.afterExpiry,
    }));
    expect(started.status).toBe(201);
    const { attemptId } = await started.json() as { attemptId: string };
    createdAttemptIds.push(attemptId);

    vi.setSystemTime(scheduleStart.getTime() + 150_000);
    const saved = await syncResponses(routeRequest(
      `http://localhost/api/attempts/${attemptId}/sync`,
      'POST',
      { responses: [answer('Last answer saved before expiry.')] },
    ), { params: Promise.resolve({ id: attemptId }) });
    expect(saved.status).toBe(200);

    vi.setSystemTime(scheduleStart.getTime() + assessmentDurationMs + 1000);
    const lateSync = await syncResponses(routeRequest(
      `http://localhost/api/attempts/${attemptId}/sync`,
      'POST',
      { responses: [answer('Must not be accepted after expiry.')] },
    ), { params: Promise.resolve({ id: attemptId }) });
    expect(lateSync.status).toBe(400);

    const lateSubmission = await submitAttempt(routeRequest(
      `http://localhost/api/attempts/${attemptId}/submit`,
      'POST',
      { responses: [answer('Must also not be accepted after expiry.')] },
    ), { params: Promise.resolve({ id: attemptId }) });
    expect(lateSubmission.status).toBe(400);
    await expect(lateSubmission.json()).resolves.toMatchObject({ error: 'Attempt already submitted' });

    const timedOut = await prisma.attempt.findUnique({ where: { id: attemptId } });
    const savedResponse = await prisma.response.findUnique({
      where: { attemptId_questionId: { attemptId, questionId } },
    });
    expect(timedOut).toMatchObject({ status: 'timed_out', isActive: false });
    expect(savedResponse?.currentText).toBe('Last answer saved before expiry.');
    saveTiming(
      'Timeout transition after deadline',
      new Date(scheduleStart.getTime() + assessmentDurationMs + 1000),
      new Date(Date.now()),
    );
  });

  it('grants a late starter the full five-minute duration configured by the current rule', async () => {
    const lateStart = new Date(scheduleStart.getTime() + 60_000);
    vi.setSystemTime(lateStart);
    authState.candidateId = candidates.late;
    const response = await startAttempt(routeRequest(
      'http://localhost/api/attempts/start',
      'POST',
      { assessmentId: assessments.late },
    ));
    expect(response.status).toBe(201);
    const { attemptId } = await response.json() as { attemptId: string };
    createdAttemptIds.push(attemptId);
    const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
    expect(attempt?.startAt).toEqual(lateStart);
    expect(attempt?.expiresAt).toEqual(new Date(lateStart.getTime() + assessmentDurationMs));
    saveTiming('Late start timestamp', lateStart, attempt!.startAt!);
    saveTiming(
      'Late start full-duration expiry',
      new Date(lateStart.getTime() + assessmentDurationMs),
      attempt!.expiresAt!,
    );
  });
});
