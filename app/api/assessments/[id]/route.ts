export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('GET /api/assessments/[id]');
  if (error) return error;
  const { id } = await params;

  const assessment = await prisma.assessment.findUnique({
    where: { id },
    include: {
      course: true,
      items: {
        include: {
          question: {
            include: {
              options: { orderBy: { sortOrder: 'asc' } },
              markingSchemes: { include: { markingPoints: true } },
            },
          },
        },
        orderBy: { displayOrder: 'asc' },
      },
      _count: { select: { attempts: true } },
    },
  });

  if (!assessment) {
    return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
  }

  const { role } = session!.user;

  if (role === 'candidate') {
    if (assessment.status !== 'published') {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    const enrollment = await prisma.userCourse.findFirst({
      where: { userId: session!.user.id, courseId: assessment.courseId, role: 'candidate' },
      select: { id: true },
    });
    if (!enrollment) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 });
    }

    // Candidate-facing sanitized response. Strips marking schemes,
    // answer keys, and isCorrect flags to prevent answer leakage.
    const candidateAssessment = {
      ...assessment,
      items: assessment.items.map((item) => ({
        id: item.id,
        assessmentId: item.assessmentId,
        questionId: item.questionId,
        displayOrder: item.displayOrder,
        maxMark: item.maxMark,
        question: {
          id: item.question.id,
          type: item.question.type,
          text: item.question.text,
          difficulty: item.question.difficulty,
          topic: item.question.topic,
          options: item.question.options.map((option) => ({
            id: option.id,
            text: option.text,
            sortOrder: option.sortOrder,
          })),
        },
      })),
    };

    return NextResponse.json(candidateAssessment);
  }

  return NextResponse.json(assessment);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('PATCH /api/assessments/[id]');
  if (error) return error;
  const { id } = await params;

  try {
    const body = await request.json();
    const { status, title, durationMins, startAt, endAt, randomizeQuestions, randomizeOptions } = body;

    const data: any = {};
    if (status) data.status = status;
    if (title) data.title = title;
    if (durationMins) data.durationMins = durationMins;
    if (startAt !== undefined) data.startAt = startAt ? new Date(startAt) : null;
    if (endAt !== undefined) data.endAt = endAt ? new Date(endAt) : null;
    if (randomizeQuestions !== undefined) data.randomizeQuestions = randomizeQuestions;
    if (randomizeOptions !== undefined) data.randomizeOptions = randomizeOptions;

    const assessment = await prisma.assessment.update({ where: { id }, data });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'assessment_updated',
      entityType: 'assessment',
      entityId: id,
      metadata: body,
    });

    return NextResponse.json(assessment);
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to update assessment' }, { status: 500 });
  }
}
