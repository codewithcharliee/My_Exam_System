import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    prisma: {
      attempt: { findUnique: vi.fn() },
      gradeDecision: { upsert: vi.fn(), findMany: vi.fn() },
      objectiveOutcome: { findMany: vi.fn() },
      result: { upsert: vi.fn() },
    },
    requireRole: vi.fn(),
    requireRoleForAction: vi.fn(),
    createAuditEvent: vi.fn(),
  },
}));

vi.mock('@/lib/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/roles', () => ({
  requireRole: mocks.requireRole,
  requireRoleForAction: mocks.requireRoleForAction,
  requireRouteAuthorization: vi.fn(async () => mocks.requireRole('lecturer')),
}));
vi.mock('@/lib/audit', () => ({ createAuditEvent: mocks.createAuditEvent }));

import { PATCH as gradePatch } from '@/app/api/grading/[attemptId]/[questionId]/route';

const lecturer = { id: 'lecturer-1234', role: 'lecturer' };
const attemptId = 'attempt-1234';
const questionId = 'question-1234';

function request(body: Record<string, unknown>) {
  return new NextRequest(`http://localhost/api/grading/${attemptId}/${questionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ attemptId, questionId }) };

describe('Unit Test 14 — H09: provisional score remains pending lecturer review', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ error: null, session: { user: lecturer } });
    mocks.requireRoleForAction.mockImplementation(async () => mocks.requireRole());
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: attemptId,
      assessment: { items: [{ questionId, maxMark: 5 }] },
    });
    mocks.prisma.gradeDecision.upsert.mockImplementation(async ({ create, update }) => ({
      id: 'grade-decision-1',
      ...create,
      ...update,
      provisionalScore: create.provisionalScore ?? 3,
    }));
    mocks.prisma.gradeDecision.findMany.mockResolvedValue([]);
    mocks.prisma.objectiveOutcome.findMany.mockResolvedValue([]);
    mocks.prisma.result.upsert.mockResolvedValue({});
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it('stores a provisional score without creating an official grade or reviewer timestamp', async () => {
    const response = await gradePatch(request({ provisionalScore: 3, lecturerDecision: 'pending' }), context);

    expect(response.status).toBe(200);
    expect(mocks.prisma.gradeDecision.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        provisionalScore: 3,
        officialGrade: null,
        lecturerDecision: 'pending',
        gradedBy: null,
        gradedAt: null,
      }),
      update: expect.objectContaining({ officialGrade: null, lecturerDecision: 'pending' }),
    }));
    expect(mocks.prisma.result.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'pending' }),
    }));
  });

  it('refuses to write any official grade for a pending decision and preserves the original provisional score', async () => {
    const invalidPromotion = await gradePatch(
      request({ provisionalScore: 3, officialGrade: 3, lecturerDecision: 'pending' }),
      context,
    );
    expect(invalidPromotion.status).toBe(400);
    expect(mocks.prisma.gradeDecision.upsert).not.toHaveBeenCalled();

    const repeatedMarking = await gradePatch(
      request({ provisionalScore: 5, lecturerDecision: 'pending' }),
      context,
    );
    expect(repeatedMarking.status).toBe(200);
    expect(mocks.prisma.gradeDecision.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.not.objectContaining({ provisionalScore: expect.anything() }),
      create: expect.objectContaining({ provisionalScore: 5, officialGrade: null }),
    }));
  });
});

describe('Unit Test 14 — H10: lecturer decisions control official grades', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ error: null, session: { user: lecturer } });
    mocks.requireRoleForAction.mockImplementation(async () => mocks.requireRole());
    mocks.prisma.attempt.findUnique.mockResolvedValue({
      id: attemptId,
      assessment: { items: [{ questionId, maxMark: 5 }] },
    });
    mocks.prisma.gradeDecision.upsert.mockImplementation(async ({ create, update }) => ({
      id: 'grade-decision-1',
      ...create,
      ...update,
      provisionalScore: create.provisionalScore ?? 3,
    }));
    mocks.prisma.gradeDecision.findMany.mockResolvedValue([]);
    mocks.prisma.objectiveOutcome.findMany.mockResolvedValue([]);
    mocks.prisma.result.upsert.mockResolvedValue({});
    mocks.createAuditEvent.mockResolvedValue({});
  });

  it('records reviewer identity and timestamp when confirming the provisional score', async () => {
    const response = await gradePatch(request({ lecturerDecision: 'accepted', officialGrade: 3 }), context);
    const grade = await response.json();

    expect(response.status).toBe(200);
    expect(grade).toMatchObject({
      provisionalScore: 3,
      officialGrade: 3,
      lecturerDecision: 'accepted',
      gradedBy: lecturer.id,
    });
    expect(grade.gradedAt).toBeTruthy();
    expect(mocks.prisma.result.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'graded' }),
    }));
  });

  it('changes the official grade without overwriting the stored provisional score', async () => {
    const response = await gradePatch(request({ lecturerDecision: 'modified', officialGrade: 2 }), context);

    expect(response.status).toBe(200);
    expect(mocks.prisma.gradeDecision.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        officialGrade: 2,
        lecturerDecision: 'modified',
        gradedBy: lecturer.id,
      }),
      create: expect.objectContaining({ provisionalScore: null, officialGrade: 2 }),
    }));
    const update = mocks.prisma.gradeDecision.upsert.mock.calls[0][0].update;
    expect(update).not.toHaveProperty('provisionalScore');
  });

  it('rejects a result without assigning an official grade', async () => {
    const response = await gradePatch(request({ lecturerDecision: 'rejected', officialGrade: null }), context);

    expect(response.status).toBe(200);
    expect(mocks.prisma.gradeDecision.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        officialGrade: null,
        lecturerDecision: 'rejected',
        notes: 'Returned for re-marking',
        gradedBy: lecturer.id,
      }),
    }));
    expect(mocks.prisma.result.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ status: 'pending' }),
    }));
  });

  it.each([
    ['confirm', { lecturerDecision: 'accepted', officialGrade: 3 }],
    ['change', { lecturerDecision: 'modified', officialGrade: 2 }],
    ['reject', { lecturerDecision: 'rejected', officialGrade: null }],
  ])('refuses a candidate attempting to %s a grade', async (_action, body) => {
    mocks.requireRole.mockResolvedValue({
      error: Response.json({ error: 'Forbidden' }, { status: 403 }),
      session: null,
    });
    const forbidden = await gradePatch(request(body), context);
    expect(forbidden.status).toBe(403);
    expect(mocks.prisma.gradeDecision.upsert).not.toHaveBeenCalled();
  });

  it('rejects a lecturer grade above the question maximum', async () => {
    const overMaximum = await gradePatch(request({ lecturerDecision: 'modified', officialGrade: 6 }), context);
    expect(overMaximum.status).toBe(400);
    expect(mocks.prisma.gradeDecision.upsert).not.toHaveBeenCalled();
  });
});
