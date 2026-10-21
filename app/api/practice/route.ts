export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/practice');
  if (error) return error;

  try {
    const { assessmentId } = await request.json();
    if (!assessmentId) return NextResponse.json({ error: 'assessmentId is required' }, { status: 400 });

    const pa = await prisma.practiceAttempt.create({
      data: {
        candidateId: session!.user.id,
        assessmentId,
        status: 'in_progress',
        responseData: JSON.stringify({ responses: {}, startedAt: new Date().toISOString() }),
      },
      include: {
        assessment: {
          include: {
            course: { select: { code: true, title: true } },
            items: {
              include: {
                question: {
                  include: {
                    options: { orderBy: { sortOrder: 'asc' } },
                  },
                },
              },
              orderBy: { displayOrder: 'asc' },
            },
          },
        },
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'practice_started',
      entityType: 'practice_attempt',
      entityId: pa.id,
      metadata: { assessmentId },
    });

    return NextResponse.json(pa, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to start practice' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/practice');
  if (error) return error;

  try {
    const { practiceAttemptId, responses, complete } = await request.json();
    if (!practiceAttemptId) return NextResponse.json({ error: 'practiceAttemptId is required' }, { status: 400 });

    const current = await prisma.practiceAttempt.findUnique({ where: { id: practiceAttemptId } });
    if (!current || current.candidateId !== session!.user.id) {
      return NextResponse.json({ error: 'Practice attempt not found' }, { status: 404 });
    }

    const updated = await prisma.practiceAttempt.update({
      where: { id: practiceAttemptId },
      data: {
        responseData: JSON.stringify({ responses: responses ?? {}, updatedAt: new Date().toISOString() }),
        status: complete ? 'completed' : current.status,
        completedAt: complete ? new Date() : current.completedAt,
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: complete ? 'practice_completed' : 'practice_saved',
      entityType: 'practice_attempt',
      entityId: updated.id,
      metadata: { questionCount: Object.keys(responses ?? {}).length },
    });

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'Failed to save practice' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('PATCH /api/practice');
  if (error) return error;

  const practices = await prisma.practiceAttempt.findMany({
    where: { candidateId: session!.user.id },
    include: {
      assessment: {
        select: {
          id: true,
          title: true,
          course: { select: { code: true, title: true } },
        },
      },
    },
    orderBy: { startedAt: 'desc' },
  });

  return NextResponse.json(practices);
}
