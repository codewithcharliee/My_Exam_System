import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { courseState } = vi.hoisted(() => ({
  courseState: {
    rows: [
      { id: 'law-course', code: 'LAW201', title: 'Constitutional Law' },
      { id: 'public-law-course', code: 'PUL201', title: 'Constitutional Law I' },
      { id: 'private-law-course', code: 'PPL301', title: 'Law of Torts I' },
      { id: 'non-law-course', code: 'INT-101', title: 'Integrity Seed Course' },
    ],
    created: [] as Array<Record<string, unknown>>,
    findManyArgs: null as unknown,
  },
}));

vi.mock('@/lib/roles', () => ({
  requireRouteAuthorization: vi.fn(async () => ({
    error: null,
    session: { user: { id: 'admin-1', role: 'admin' } },
  })),
}));

vi.mock('@/lib/audit', () => ({ createAuditEvent: vi.fn(async () => null) }));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    course: {
      findMany: vi.fn(async (args: unknown) => {
        courseState.findManyArgs = args;
        return courseState.rows
          .filter((course) => ['LAW', 'PUL', 'PPL', 'CIL', 'CLE', 'JIL']
            .some((prefix) => course.code.toUpperCase().startsWith(prefix)))
          .sort((left, right) => left.code.localeCompare(right.code));
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        courseState.created.push(data);
        return data;
      }),
    },
  },
}));

import { GET, POST } from '@/app/api/courses/route';
import { prisma } from '@/lib/prisma';

describe('Law faculty course scope', () => {
  beforeEach(() => {
    courseState.created.length = 0;
    courseState.findManyArgs = null;
    vi.clearAllMocks();
  });

  it('lists only Faculty of Law course-code prefixes', async () => {
    const response = await GET(new NextRequest('http://localhost/api/courses'));
    const courses = await response.json() as Array<{ code: string }>;

    expect(response.status).toBe(200);
    expect(courses.map((course) => course.code)).toEqual(['LAW201', 'PPL301', 'PUL201']);
    expect(courseState.findManyArgs).toMatchObject({
      where: {
        OR: expect.arrayContaining([
          { code: { startsWith: 'LAW', mode: 'insensitive' } },
          { code: { startsWith: 'PUL', mode: 'insensitive' } },
          { code: { startsWith: 'PPL', mode: 'insensitive' } },
        ]),
      },
    });
  });

  it('rejects non-Law course creation and normalizes LAW course codes', async () => {
    const nonLaw = await POST(new NextRequest('http://localhost/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'INT-101', title: 'Integrity Seed Course' }),
    }));
    expect(nonLaw.status).toBe(400);
    expect(prisma.course.create).not.toHaveBeenCalled();

    const law = await POST(new NextRequest('http://localhost/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'law401', title: 'Evidence' }),
    }));
    expect(law.status).toBe(201);
    expect(courseState.created).toEqual([expect.objectContaining({ code: 'LAW401', title: 'Evidence' })]);
  });
});