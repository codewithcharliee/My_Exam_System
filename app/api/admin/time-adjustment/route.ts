export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/admin/time-adjustment');
  if (error) return error;

  try {
    const body = await request.json();

    const attemptId = body?.attemptId as string | undefined;
    let candidateId = body?.candidateId as string | undefined;
    let assessmentId = body?.assessmentId as string | undefined;
    let extraMinutes = Number(body?.extraMinutes ?? body?.minutes ?? 0);

    if (attemptId && (!candidateId || !assessmentId)) {
      const attempt = await prisma.attempt.findUnique({
        where: { id: attemptId },
        select: { candidateId: true, assessmentId: true },
      });
      if (!attempt) {
        return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
      }
      candidateId = attempt.candidateId;
      assessmentId = attempt.assessmentId;
    }

    if (!candidateId || !assessmentId || !Number.isFinite(extraMinutes) || extraMinutes <= 0) {
      return NextResponse.json({ error: 'candidateId, assessmentId and positive extraMinutes are required' }, { status: 400 });
    }

    extraMinutes = Math.round(extraMinutes);

    const adj = await prisma.timeAdjustment.create({
      data: {
        attemptId: attemptId ?? null,
        candidateId,
        assessmentId,
        extraMinutes,
        approvedBy: session!.user.id,
      },
      include: {
        candidate: { select: { id: true, name: true, email: true } },
        assessment: { select: { id: true, title: true } },
        approver: { select: { id: true, name: true, email: true } },
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'time_adjustment_created',
      entityType: 'time_adjustment',
      entityId: adj.id,
      metadata: { attemptId: attemptId ?? null, candidateId, assessmentId, extraMinutes },
    });

    return NextResponse.json({ adjustment: adj }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to create adjustment' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { error } = await requireRouteAuthorization('GET /api/admin/time-adjustment');
  if (error) return error;

  const adjustments = await prisma.timeAdjustment.findMany({
    include: {
      candidate: { select: { id: true, name: true, email: true } },
      assessment: { select: { id: true, title: true } },
      approver: { select: { id: true, name: true, email: true } },
      attempt: { select: { id: true } },
    },
    orderBy: { approvedAt: 'desc' },
  });

  return NextResponse.json({ adjustments });
}
