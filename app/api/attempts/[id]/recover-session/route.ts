export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createSessionToken, hashSessionToken } from '@/lib/session-integrity';
import { createAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('POST /api/attempts/[id]/recover-session');
  if (error) return error;

  const { id } = await params;
  const sessionToken = createSessionToken();
  const now = new Date();

  try {
    const recovery = await prisma.$transaction(async (tx) => {
      const lockKey = `exam-session-recovery:${id}`;
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        WITH lock_result AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
        )
        SELECT TRUE AS locked FROM lock_result
      `;

      const attempt = await tx.attempt.findFirst({
        where: { id, candidateId: session!.user.id },
      });
      if (!attempt || attempt.status !== 'in_progress' || !attempt.isActive) {
        return { recovered: false as const, status: 409 as const };
      }
      if (attempt.expiresAt && attempt.expiresAt <= now) {
        return { recovered: false as const, status: 409 as const };
      }

      const [reactivation, latestSession] = await Promise.all([
        tx.attemptTimeEvent.findFirst({
          where: { attemptId: id, eventType: 'staff_reactivated_after_interruption' },
          orderBy: { occurredAt: 'desc' },
        }),
        tx.attemptSession.findFirst({
          where: { attemptId: id },
          orderBy: { startedAt: 'desc' },
        }),
      ]);
      if (!reactivation || (latestSession && reactivation.occurredAt <= latestSession.startedAt)) {
        return { recovered: false as const, status: 403 as const };
      }

      await tx.attemptSession.updateMany({
        where: { attemptId: id, supersededAt: null, endedAt: null },
        data: { supersededAt: now, endedAt: now },
      });
      await tx.attemptSession.create({
        data: {
          attemptId: id,
          sessionTokenHash: hashSessionToken(sessionToken),
          userAgent: request.headers.get('user-agent'),
        },
      });
      return { recovered: true as const, expiresAt: attempt.expiresAt };
    });

    if (!recovery.recovered) {
      return NextResponse.json(
        {
          error: recovery.status === 403
            ? 'Authorized personnel must reactivate this interrupted attempt before it can be resumed.'
            : 'This attempt cannot currently be recovered.',
        },
        { status: recovery.status },
      );
    }

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'attempt_session_recovered_after_staff_reactivation',
      entityType: 'attempt',
      entityId: id,
    });

    const response = NextResponse.json({ recovered: true, attemptId: id });
    const maxAge = recovery.expiresAt
      ? Math.max(1, Math.floor((recovery.expiresAt.getTime() - now.getTime()) / 1000))
      : undefined;
    response.cookies.set(`exam_session_${id}`, sessionToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      ...(maxAge === undefined ? {} : { maxAge }),
      path: '/',
    });
    return response;
  } catch (recoveryError) {
    console.error('Exam session recovery error:', recoveryError);
    return NextResponse.json(
      { error: recoveryError instanceof Error ? recoveryError.message : 'Unable to recover the active exam session.' },
      { status: 500 },
    );
  }
}
