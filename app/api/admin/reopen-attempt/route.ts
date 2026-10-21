export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/admin/reopen-attempt');
  if (error) return error;

  try {
    const { attemptId, reason, extraMinutes } = await request.json();
    if (typeof attemptId !== 'string' || !attemptId || typeof reason !== 'string' || !reason.trim()) {
      return NextResponse.json({ error: 'Attempt ID and reason required' }, { status: 400 });
    }

    const minutes = Number.isSafeInteger(extraMinutes) && extraMinutes > 0 ? extraMinutes : 60;
    const newExpiry = new Date(Date.now() + minutes * 60 * 1000);
    const reactivatedAt = new Date();
    const reactivated = await prisma.$transaction(async (tx) => {
      const lockKey = `attempt-reopen:${attemptId}`;
      await tx.$queryRaw<Array<{ locked: boolean }>>`
        WITH lock_result AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext(${lockKey}))
        )
        SELECT TRUE AS locked FROM lock_result
      `;

      const attempt = await tx.attempt.findUnique({ where: { id: attemptId } });
      if (!attempt) return 'not_found' as const;
      if (
        (attempt.status !== 'abandoned' && attempt.status !== 'timed_out')
        || attempt.isActive
      ) {
        return 'ineligible' as const;
      }

      const priorReactivation = await tx.attemptTimeEvent.findFirst({
        where: { attemptId, eventType: 'staff_reactivated_after_interruption' },
      });
      if (priorReactivation) return 'ineligible' as const;

      await tx.attemptSession.updateMany({
        where: { attemptId, supersededAt: null, endedAt: null },
        data: { supersededAt: reactivatedAt, endedAt: reactivatedAt },
      });
      await tx.attempt.update({
        where: { id: attemptId },
        data: { status: 'in_progress', isActive: true, expiresAt: newExpiry },
      });
      await tx.attemptTimeEvent.create({
        data: {
          attemptId,
          eventType: 'staff_reactivated_after_interruption',
          reason: reason.trim().slice(0, 500),
          occurredAt: reactivatedAt,
        },
      });
      return 'reopened' as const;
    });
    if (reactivated === 'not_found') {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }
    if (reactivated === 'ineligible') {
      return NextResponse.json(
        { error: 'Attempt is not eligible for reopening or has already been reopened.' },
        { status: 409 },
      );
    }

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'attempt_reopened',
      entityType: 'attempt',
      entityId: attemptId,
      reason: reason.trim(),
      metadata: { extraMinutes: minutes, outcome: 'allowed' },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Attempt reactivation failed:', error);
    return NextResponse.json({ error: 'Reopen failed' }, { status: 500 });
  }
}
