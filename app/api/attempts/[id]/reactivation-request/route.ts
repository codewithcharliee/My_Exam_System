export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { ATTEMPT_SESSION_STALE_AFTER_MS } from '@/lib/session-integrity';
import { createAuditEvent } from '@/lib/audit';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('POST /api/attempts/[id]/reactivation-request');
  if (error) return error;

  const { id } = await params;
  try {
    const attempt = await prisma.attempt.findFirst({
      where: { id, candidateId: session!.user.id },
      include: {
        assessment: { select: { endAt: true } },
        sessions: { orderBy: { startedAt: 'desc' }, take: 1 },
        timeEvents: {
          where: { eventType: { in: ['student_reactivation_requested', 'staff_reactivated_after_interruption'] } },
          orderBy: { occurredAt: 'desc' },
          take: 1,
        },
      },
    });
    if (!attempt || !['abandoned', 'in_progress'].includes(attempt.status)) {
      return NextResponse.json({ error: 'This attempt is not eligible for staff reactivation.' }, { status: 409 });
    }
    if (attempt.assessment.endAt && attempt.assessment.endAt <= new Date()) {
      return NextResponse.json({ error: 'The examination window has ended.' }, { status: 409 });
    }
    if (attempt.status === 'in_progress') {
      const latestSession = attempt.sessions[0];
      const sessionIsStale = !latestSession
        || !!latestSession.endedAt
        || Date.now() - latestSession.lastSeenAt.getTime() > ATTEMPT_SESSION_STALE_AFTER_MS;
      if (!sessionIsStale) {
        return NextResponse.json({ error: 'This examination still has an active session.' }, { status: 409 });
      }
    }

    if (attempt.timeEvents[0]?.eventType === 'student_reactivation_requested') {
      return NextResponse.json({ requested: true, alreadyRequested: true });
    }

    await prisma.attemptTimeEvent.create({
      data: {
        attemptId: id,
        eventType: 'student_reactivation_requested',
        reason: 'Candidate requested authorized staff to reactivate an interrupted examination.',
      },
    });
    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'attempt_reactivation_requested',
      entityType: 'attempt',
      entityId: id,
    });

    return NextResponse.json({ requested: true });
  } catch (requestError) {
    console.error('Exam reactivation request failed:', requestError);
    return NextResponse.json({ error: 'Unable to send the reactivation request.' }, { status: 500 });
  }
}
