export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/monitoring/active-sessions');
  if (error) return error;

  const activeSessions = await prisma.attempt.findMany({
    where: { isActive: true, status: 'in_progress' },
    include: {
      candidate: { select: { name: true, email: true } },
      assessment: { select: { title: true, course: { select: { code: true } } } },
      _count: { select: { monitoringEvents: true, snapshots: true } },
    },
    orderBy: { startAt: 'desc' },
  });

  return NextResponse.json(activeSessions);
}
