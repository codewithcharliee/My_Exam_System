export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

function getCronSecret(): string | undefined {
  return typeof process === 'undefined' ? undefined : process.env.CRON_SECRET;
}

function isAuthorizedCronRequest(request: NextRequest): boolean {
  const secret = getCronSecret();
  const authorization = request.headers.get('authorization');
  if (!secret || !authorization?.startsWith('Bearer ')) return false;

  const provided = authorization.slice('Bearer '.length);
  if (provided.length !== secret.length) return false;
  let difference = 0;
  for (let index = 0; index < secret.length; index++) {
    difference |= provided.charCodeAt(index) ^ secret.charCodeAt(index);
  }
  return difference === 0;
}

async function purgeExpiredSnapshots(actorId: string | null) {
  const now = new Date();
  const expired = await prisma.snapshot.findMany({
    where: {
      OR: [
        { deletedAt: { not: null } },
        { retentionUntil: { lt: now } },
      ],
    },
    select: { id: true, attemptId: true },
  });

  for (const snapshot of expired) {
    const audit = await createAuditEvent({
      actorId,
      actionType: 'snapshot_deleted',
      entityType: 'snapshot',
      entityId: snapshot.id,
      metadata: { attemptId: snapshot.attemptId, reason: 'retention expiry' },
    });
    if (!audit) throw new Error(`Could not audit deletion of snapshot ${snapshot.id}`);
  }

  if (expired.length === 0) return 0;
  const result = await prisma.snapshot.deleteMany({
    where: { id: { in: expired.map((snapshot) => snapshot.id) } },
  });
  return result.count;
}

export async function GET(request: NextRequest) {
  if (!getCronSecret()) {
    return NextResponse.json({ error: 'Snapshot cleanup is not configured' }, { status: 503 });
  }
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    return NextResponse.json({ deleted: await purgeExpiredSnapshots(null) });
  } catch (error) {
    console.error('Snapshot retention cleanup failed:', error);
    return NextResponse.json({ error: 'Failed to clean up expired snapshots' }, { status: 500 });
  }
}

export async function POST() {
  const { error, session } = await requireRouteAuthorization('POST /api/monitoring/snapshots/cleanup');
  if (error) return error;

  try {
    return NextResponse.json({ deleted: await purgeExpiredSnapshots(session!.user.id) });
  } catch (error) {
    console.error('Snapshot retention cleanup failed:', error);
    return NextResponse.json({ error: 'Failed to clean up expired snapshots' }, { status: 500 });
  }
}
