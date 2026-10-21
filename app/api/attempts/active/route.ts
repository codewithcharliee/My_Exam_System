import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { error, session } = await requireRouteAuthorization('GET /api/attempts/active');
  if (error) return error;

  const now = new Date();
  const [attempts, interruptedAttempts] = await Promise.all([
    prisma.attempt.findMany({
      where: {
        candidateId: session!.user.id,
        status: 'in_progress',
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        assessment: {
          select: {
            title: true,
            course: { select: { code: true, title: true } },
          },
        },
      },
      orderBy: { startAt: 'desc' },
    }),
    prisma.attempt.findMany({
      where: {
        candidateId: session!.user.id,
        status: 'abandoned',
        assessment: { OR: [{ endAt: null }, { endAt: { gt: now } }] },
      },
      include: {
        assessment: {
          select: {
            title: true,
            course: { select: { code: true, title: true } },
          },
        },
        timeEvents: {
          where: { eventType: 'student_reactivation_requested' },
          orderBy: { occurredAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { startAt: 'desc' },
    }),
  ]);

  return NextResponse.json({
    activeAttempts: attempts.map((attempt) => ({
      attemptId: attempt.id,
      startedAt: attempt.startAt,
      expiresAt: attempt.expiresAt,
      assessmentTitle: attempt.assessment.title,
      courseCode: attempt.assessment.course.code,
      courseTitle: attempt.assessment.course.title,
    })),
    interruptedAttempts: interruptedAttempts.map((attempt) => ({
      attemptId: attempt.id,
      assessmentTitle: attempt.assessment.title,
      courseCode: attempt.assessment.course.code,
      courseTitle: attempt.assessment.course.title,
      reactivationRequested: attempt.timeEvents.length > 0,
    })),
  });
}
