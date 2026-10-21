export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/monitoring/events');
  if (error) return error;

  try {
    const { attemptId, eventType, metaJson, detail } = await request.json();

    if (!attemptId || !eventType) {
      return NextResponse.json({ error: 'Attempt and event type are required' }, { status: 400 });
    }

    const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.candidateId !== session!.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let storedJson: string | null = null;
    if (detail !== undefined && detail !== null) {
      storedJson = typeof detail === 'string' ? JSON.stringify({ detail }) : JSON.stringify(detail);
    } else if (metaJson !== undefined && metaJson !== null) {
      storedJson = typeof metaJson === 'string' ? metaJson : JSON.stringify(metaJson);
    }

    const event = await prisma.monitoringEvent.create({
      data: {
        attemptId,
        eventType,
        metaJson: storedJson,
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'monitoring_event_logged',
      entityType: 'monitoring_event',
      entityId: event.id,
      metadata: { attemptId, eventType },
    });

    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to log event' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('PATCH /api/monitoring/events');
  if (error) return error;

  const role = (session!.user as any).role;
  if (!['admin', 'invigilator', 'exam_officer'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { eventId, reviewed, flagged } = await request.json();
    if (!eventId) {
      return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    }

    const currentMeta = await prisma.monitoringEvent.findUnique({ where: { id: eventId }, select: { metaJson: true } });
    let metadata: any = {};
    try { metadata = currentMeta?.metaJson ? JSON.parse(currentMeta.metaJson) : {}; } catch { metadata = {}; }
    metadata.flagged = !!flagged;

    const updated = await prisma.monitoringEvent.update({
      where: { id: eventId },
      data: {
        reviewed: reviewed ?? true,
        reviewedBy: session!.user.id,
        reviewedAt: new Date(),
        metaJson: JSON.stringify(metadata),
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'monitoring_event_reviewed',
      entityType: 'monitoring_event',
      entityId: eventId,
      metadata: { reviewed: reviewed ?? true, flagged: !!flagged },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to update event review' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/monitoring/events');
  if (error) return error;

  const role = (session!.user as any).role;
  if (!['admin', 'invigilator', 'exam_officer'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const attemptId = url.searchParams.get('attemptId');

  const where: any = {};
  if (attemptId) where.attemptId = attemptId;

  const events = await prisma.monitoringEvent.findMany({
    where,
    include: {
      snapshot: { select: { id: true, takenAt: true } },
      attempt: {
        include: {
          candidate: { select: { name: true, email: true } },
          assessment: { select: { title: true } },
        },
      },
    },
    orderBy: { occurredAt: 'desc' },
    take: 200,
  });

  return NextResponse.json(events);
}
