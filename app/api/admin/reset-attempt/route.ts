export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/admin/reset-attempt');
  if (error) return error;

  try {
    const { attemptId, reason } = await request.json();
    if (!attemptId || !reason) {
      return NextResponse.json({ error: 'Attempt ID and reason required' }, { status: 400 });
    }

    const attempt = await prisma.attempt.update({
      where: { id: attemptId },
      data: { status: 'reset', isActive: false },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'attempt_reset',
      entityType: 'attempt',
      entityId: attemptId,
      reason,
      metadata: { outcome: 'allowed' },
    });

    return NextResponse.json({ success: true, attempt });
  } catch (err: any) {
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
