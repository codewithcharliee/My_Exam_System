import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: {
    role: 'lecturer',
    userId: 'lecturer-1',
    attempts: [] as unknown[],
    attemptRecord: null as Record<string, unknown> | null,
    courseAssignment: null as { id: string; role: string } | null,
    findManyArgs: null as unknown,
  },
}));

vi.mock('@/lib/roles', () => ({
  requireRouteAuthorization: vi.fn(async () => ({
    error: null,
    session: { user: { id: state.userId, role: state.role } },
  })),
}));

vi.mock('@/lib/audit', () => ({ createAuditEvent: vi.fn(async () => null) }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    attempt: {
      findMany: vi.fn(async (args: unknown) => {
        state.findManyArgs = args;
        return state.attempts;
      }),
      findUnique: vi.fn(async () => state.attemptRecord),
    },
    userCourse: {
      findMany: vi.fn(async () => [{ courseId: 'course-1' }]),
      findUnique: vi.fn(async () => state.courseAssignment),
    },
  },
}));

import { GET as getGradingQueue } from '@/app/api/grading/route';
import { GET as getAttempt } from '@/app/api/attempts/[id]/route';
import { prisma } from '@/lib/prisma';

describe('lecturer grading queue', () => {
  beforeEach(() => {
    state.role = 'lecturer';
    state.userId = 'lecturer-1';
    state.attempts = [];
    state.attemptRecord = null;
    state.courseAssignment = null;
    state.findManyArgs = null;
    vi.clearAllMocks();
  });

  it('filters submitted scripts by academic level and matric number', async () => {
    const response = await getGradingQueue(new NextRequest(
      'http://localhost/api/grading?level=300&matricNumber=LAW-300-002',
    ));

    expect(response.status).toBe(200);
    expect(state.findManyArgs).toMatchObject({
      where: {
        candidate: {
          academicLevel: 300,
          matricNumber: { contains: 'LAW-300-002', mode: 'insensitive' },
        },
        assessment: { courseId: { in: ['course-1'] } },
      },
      include: {
        candidate: { select: { matricNumber: true, academicLevel: true } },
      },
    });
  });

  it('rejects invalid levels before querying scripts', async () => {
    const response = await getGradingQueue(new NextRequest('http://localhost/api/grading?level=250'));

    expect(response.status).toBe(400);
    expect(prisma.attempt.findMany).not.toHaveBeenCalled();
  });

  it('blocks lecturers from opening attempts outside their course assignments', async () => {
    state.attemptRecord = {
      id: 'attempt-1',
      candidateId: 'candidate-1',
      status: 'submitted',
      assessment: { courseId: 'course-2' },
    };

    const response = await getAttempt(
      new NextRequest('http://localhost/api/attempts/attempt-1'),
      { params: Promise.resolve({ id: 'attempt-1' }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: 'You are not assigned to this course.' });
  });
});