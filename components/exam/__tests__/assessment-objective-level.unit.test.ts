import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { state } = vi.hoisted(() => ({
  state: { level: 'LLB 200', created: 0 },
}));

vi.mock('@/lib/roles', () => ({
  requireRouteAuthorization: vi.fn(async () => ({
    error: null,
    session: { user: { id: 'lecturer-1', role: 'lecturer' } },
  })),
}));

vi.mock('@/lib/audit', () => ({ createAuditEvent: vi.fn(async () => null) }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: any) => Promise<unknown>) => callback({
      course: { findUnique: vi.fn(async () => ({ level: state.level })) },
      question: { findMany: vi.fn(async () => [{ id: 'objective-question', type: 'multiple_choice' }]) },
      assessment: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          state.created += 1;
          return { id: 'assessment-1', ...data };
        }),
      },
    })),
  },
}));

import { POST } from '@/app/api/assessments/route';

function createRequest() {
  return new NextRequest('http://localhost/api/assessments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: 'law-course',
      title: 'Objective assessment',
      durationMins: 60,
      items: [{ questionId: 'objective-question', displayOrder: 1, maxMark: 5 }],
    }),
  });
}

describe('Objective question level rule', () => {
  beforeEach(() => {
    state.level = 'LLB 200';
    state.created = 0;
  });

  it('rejects objective items for non-100-level courses', async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('only be included in 100-level') });
    expect(state.created).toBe(0);
  });

  it('allows objective items for 100-level courses', async () => {
    state.level = 'LLB 100';
    const response = await POST(createRequest());

    expect(response.status).toBe(201);
    expect(state.created).toBe(1);
  });
});