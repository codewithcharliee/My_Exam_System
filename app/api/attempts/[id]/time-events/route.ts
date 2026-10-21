export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('POST /api/attempts/[id]/time-events');
  if (error) return error;
  const { id } = await params;
  const body = await request.json();
  const attempt = await prisma.attempt.findFirst({ where: { id, candidateId: session!.user.id, status: 'in_progress' } });
  if (!attempt) return NextResponse.json({ error: 'Attempt is not active' }, { status: 404 });
  const event = await prisma.attemptTimeEvent.create({ data: { attemptId: id, eventType: String(body.eventType ?? 'resume'), durationSecs: Number.isFinite(body.durationSecs) ? body.durationSecs : null, reason: body.reason ? String(body.reason).slice(0, 500) : null } });
  await createAuditEvent({ actorId: session!.user.id, actionType: 'attempt_time_event_recorded', entityType: 'attempt', entityId: id, metadata: { eventType: event.eventType, durationSecs: event.durationSecs } });
  return NextResponse.json({ id: event.id }, { status: 201 });
}
