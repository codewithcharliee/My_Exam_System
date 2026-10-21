export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { isFirstLevelCourse } from '@/lib/academic-rules';

export async function GET() {
  const { error, session } = await requireRouteAuthorization('GET /api/assessments');
  if (error) return error;

  const role = (session!.user as any).role;
  const where: any = {};

  if (role === 'candidate') {
    where.status = 'published';
    const courses = await prisma.userCourse.findMany({
      where: { userId: session!.user.id, role: 'candidate' },
      select: { courseId: true },
    });
    where.courseId = { in: courses.map((c: any) => c.courseId) };
  } else if (role === 'lecturer') {
    const courses = await prisma.userCourse.findMany({
      where: { userId: session!.user.id, role: 'lecturer' },
      select: { courseId: true },
    });
    where.courseId = { in: courses.map((c: any) => c.courseId) };
  }

  const assessments = await prisma.assessment.findMany({
    where,
    include: {
      course: { select: { code: true, title: true } },
      items: { include: { question: { select: { id: true, type: true, text: true } } } },
      _count: { select: { attempts: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(assessments);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/assessments');
  if (error) return error;

  try {
    const body = await request.json();
    const { courseId, title, type, durationMins, startAt, endAt, randomizeQuestions, randomizeOptions, maxAttempts, items } = body;

    if (!courseId || !title || !durationMins) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (items !== undefined && items !== null && !Array.isArray(items)) {
      return NextResponse.json({ error: 'Assessment items must be an array' }, { status: 400 });
    }

    const itemQuestionIds = (items ?? []).map((item: { questionId?: unknown }) => item?.questionId);
    if (
      itemQuestionIds.some((questionId: unknown) => typeof questionId !== 'string' || !questionId)
      || new Set(itemQuestionIds).size !== itemQuestionIds.length
      || (items ?? []).some((item: { displayOrder?: unknown; maxMark?: unknown }) =>
        !Number.isInteger(item?.displayOrder)
        || typeof item?.maxMark !== 'number'
        || !Number.isFinite(item.maxMark)
        || item.maxMark <= 0)
    ) {
      return NextResponse.json({ error: 'Assessment items are invalid' }, { status: 400 });
    }

    const creation = await prisma.$transaction(async (tx) => {
      const course = await tx.course.findUnique({ where: { id: courseId }, select: { level: true } });
      if (!course) return { error: 'Course not found' } as const;

      const approvedQuestions = itemQuestionIds.length === 0
        ? []
        : await tx.question.findMany({
          where: {
            id: { in: itemQuestionIds as string[] },
            courseId,
            status: 'approved',
          },
          select: { id: true, type: true },
        });
      if (approvedQuestions.length !== itemQuestionIds.length) {
        return { error: 'Draft, missing, or out-of-course questions cannot be added to an assessment' } as const;
      }
      if (!isFirstLevelCourse(course.level) && approvedQuestions.some((question) => question.type === 'multiple_choice')) {
        return { error: 'Objective questions can only be included in 100-level Law assessments.' } as const;
      }

      const assessment = await tx.assessment.create({
        data: {
          courseId,
          title,
          type: type || 'exam',
          durationMins,
          startAt: startAt ? new Date(startAt) : null,
          endAt: endAt ? new Date(endAt) : null,
          randomizeQuestions: randomizeQuestions || false,
          randomizeOptions: randomizeOptions || false,
          maxAttempts: maxAttempts || 1,
          createdBy: session!.user.id,
          items: {
            create: (items ?? []).map((item: {
              questionId: string;
              displayOrder: number;
              maxMark: number;
              markingMethod?: string;
            }) => ({
              questionId: item.questionId,
              displayOrder: item.displayOrder,
              maxMark: item.maxMark,
              markingMethod: item.markingMethod || null,
            })),
          },
        },
      });
      return { assessment } as const;
    });

    if ('error' in creation) {
      return NextResponse.json({ error: creation.error }, { status: 400 });
    }
    const { assessment } = creation;

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'assessment_created',
      entityType: 'assessment',
      entityId: assessment.id,
    });

    return NextResponse.json(assessment, { status: 201 });
  } catch (err: any) {
    console.error('Create assessment error:', err);
    return NextResponse.json({ error: 'Failed to create assessment' }, { status: 500 });
  }
}
