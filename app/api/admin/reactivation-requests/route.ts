export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';

export async function GET() {
  const { error } = await requireRouteAuthorization('GET /api/admin/reactivation-requests');
  if (error) return error;

  try {
    const attempts = await prisma.attempt.findMany({
      where: {
        status: { in: ['abandoned', 'in_progress'] },
        timeEvents: { some: { eventType: 'student_reactivation_requested' } },
      },
      select: {
        id: true,
        status: true,
        candidate: { select: { name: true, email: true } },
        assessment: { select: { title: true, endAt: true } },
        timeEvents: {
          where: { eventType: { in: ['student_reactivation_requested', 'staff_reactivated_after_interruption'] } },
          orderBy: { occurredAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    const requests = attempts.flatMap((attempt) => {
      const latestEvent = attempt.timeEvents[0];
      if (
        latestEvent?.eventType !== 'student_reactivation_requested'
        || (attempt.assessment.endAt && attempt.assessment.endAt <= now)
      ) {
        return [];
      }
      return [{
        attemptId: attempt.id,
        status: attempt.status,
        candidateName: attempt.candidate.name,
        candidateEmail: attempt.candidate.email,
        assessmentTitle: attempt.assessment.title,
        requestedAt: latestEvent.occurredAt,
      }];
    });

    return NextResponse.json({ requests });
  } catch (requestError) {
    console.error('Unable to load exam reactivation requests:', requestError);
    return NextResponse.json({ error: 'Unable to load reactivation requests.' }, { status: 500 });
  }
}
