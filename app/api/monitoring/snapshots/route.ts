export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { encryptSnapshot, decryptSnapshot } from '@/lib/snapshot-crypto';

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/monitoring/snapshots');
  if (error) return error;
  try {
    const { attemptId, eventId, imageData, trigger } = await request.json();
    if (!attemptId || typeof imageData !== 'string' || !imageData.startsWith('data:image/')) return NextResponse.json({ error: 'Attempt and valid image are required' }, { status: 400 });
    const attempt = await prisma.attempt.findUnique({ where: { id: attemptId } });
    if (!attempt || attempt.candidateId !== session!.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (eventId) {
      const event = await prisma.monitoringEvent.findUnique({ where: { id: eventId }, select: { attemptId: true } });
      if (!event || event.attemptId !== attemptId) return NextResponse.json({ error: 'Monitoring event does not belong to this attempt' }, { status: 400 });
    }
    if (await prisma.snapshot.count({ where: { attemptId, deletedAt: null } }) >= 20) return NextResponse.json({ error: 'Max snapshots reached' }, { status: 429 });
    const snapshot = await prisma.snapshot.create({ data: { attemptId, monitoringEventId: eventId || null, imageData: encryptSnapshot(imageData), retentionUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) } });
    await createAuditEvent({ actorId: session!.user.id, actionType: 'snapshot_captured', entityType: 'snapshot', entityId: snapshot.id, metadata: { attemptId, eventId: eventId ?? null, trigger: trigger ?? null, encrypted: true } });
    return NextResponse.json({ id: snapshot.id }, { status: 201 });
  } catch (error) {
    console.error('Snapshot save error:', error);
    return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/monitoring/snapshots');
  if (error) return error;
  if (!['admin', 'exam_officer'].includes((session!.user as any).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const { snapshotId } = await request.json();
    if (!snapshotId) return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
    const snapshot = await prisma.snapshot.findUnique({ where: { id: snapshotId }, select: { id: true, attemptId: true } });
    if (!snapshot) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    const audit = await createAuditEvent({ actorId: session!.user.id, actionType: 'snapshot_deleted', entityType: 'snapshot', entityId: snapshot.id, metadata: { attemptId: snapshot.attemptId, reason: 'manual deletion' } });
    if (!audit) throw new Error('Could not audit snapshot deletion');
    await prisma.snapshot.delete({ where: { id: snapshot.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Snapshot deletion error:', error);
    return NextResponse.json({ error: 'Failed to delete snapshot' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('DELETE /api/monitoring/snapshots');
  if (error) return error;
  if (!['admin', 'invigilator', 'exam_officer'].includes((session!.user as any).role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const attemptId = new URL(request.url).searchParams.get('attemptId');
  const where: any = {
    deletedAt: null,
    OR: [{ retentionUntil: null }, { retentionUntil: { gt: new Date() } }],
  };
  if (attemptId) where.attemptId = attemptId;
  const snapshots = await prisma.snapshot.findMany({
    where,
    include: {
      monitoringEvent: { select: { id: true, eventType: true, occurredAt: true } },
      attempt: {
        include: {
          candidate: { select: { name: true } },
          assessment: { select: { title: true } },
        },
      },
    },
    orderBy: { takenAt: 'desc' },
    take: 50,
  });
  await createAuditEvent({ actorId: session!.user.id, actionType: 'snapshots_viewed', entityType: 'snapshot', metadata: { attemptId, count: snapshots.length } });
  return NextResponse.json(snapshots.map((snapshot) => ({ ...snapshot, imageData: decryptSnapshot(snapshot.imageData) })));
}
