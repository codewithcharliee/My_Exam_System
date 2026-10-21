export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/audit');
  if (error) return error;

  const url = new URL(request.url);
  const actionType = url.searchParams.get('actionType');
  const entityType = url.searchParams.get('entityType');
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);

  const where: any = {};
  if (actionType) where.actionType = actionType;
  if (entityType) where.entityType = entityType;

  const [events, total] = await Promise.all([
    prisma.auditEvent.findMany({
      where,
      include: { actor: { select: { name: true, email: true, role: true } } },
      orderBy: { occurredAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditEvent.count({ where }),
  ]);

  await createAuditEvent({
    actorId: session!.user.id,
    actionType: 'audit_viewed',
    entityType: 'audit',
  });

  return NextResponse.json({ events, total, page, limit });
}
