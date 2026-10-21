export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { isFirstLevelCourse } from '@/lib/academic-rules';

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/questions');
  if (error) return error;

  const url = new URL(request.url);
  const courseId = url.searchParams.get('courseId');
  const type = url.searchParams.get('type');
  const difficulty = url.searchParams.get('difficulty');
  const topic = url.searchParams.get('topic');
  const status = url.searchParams.get('status');

  const where: any = {};
  if (courseId) where.courseId = courseId;
  if (type) where.type = type;
  if (difficulty) where.difficulty = difficulty;
  if (topic) where.topic = { contains: topic };
  if (status) where.status = status;

  const role = (session!.user as any).role;
  if (role === 'lecturer') {
    const courses = await prisma.userCourse.findMany({
      where: { userId: session!.user.id, role: 'lecturer' },
      select: { courseId: true },
    });
    where.courseId = { in: courses.map((c: any) => c.courseId) };
  }

  const firstLevelCourses = await prisma.course.findMany({
    where: { level: { contains: '100', mode: 'insensitive' } },
    select: { id: true },
  });
  where.AND = [
    ...(Array.isArray(where.AND) ? where.AND : []),
    {
      OR: [
        { type: { not: 'multiple_choice' } },
        { type: 'multiple_choice', courseId: { in: firstLevelCourses.map((course) => course.id) } },
      ],
    },
  ];

  const questions = await prisma.question.findMany({
    where,
    include: {
      course: { select: { code: true, title: true } },
      options: { orderBy: { sortOrder: 'asc' } },
      markingSchemes: { include: { markingPoints: true }, orderBy: { version: 'desc' } },
      answerKeys: { orderBy: { version: 'desc' } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(questions);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/questions');
  if (error) return error;

  try {
    const body = await request.json();
    const { courseId, type, text, difficulty, topic, options, markingScheme, status, wordLimit, wordTarget } = body;

    if (!courseId || !type || !text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, level: true } });
    if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    if (session!.user.role === 'lecturer') {
      const assignment = await prisma.userCourse.findUnique({
        where: { userId_courseId: { userId: session!.user.id, courseId } },
        select: { role: true },
      });
      if (assignment?.role !== 'lecturer') return NextResponse.json({ error: 'You are not assigned to this course.' }, { status: 403 });
    }
    if (type === 'multiple_choice' && !isFirstLevelCourse(course.level)) {
      return NextResponse.json({ error: 'Objective questions are only available for 100-level Law courses.' }, { status: 400 });
    }

    if (type === 'multiple_choice' && (status !== 'draft' && (!Array.isArray(options) || options.length < 2 || options.filter((option: any) => option.isCorrect).length !== 1))) return NextResponse.json({ error: 'Multiple-choice questions must have at least two options and exactly one correct answer' }, { status: 400 });

    const question = await prisma.question.create({
      data: {
        courseId,
        type,
        text,
        status: status === 'draft' ? 'draft' : 'approved',
        wordLimit: wordLimit ? Number(wordLimit) : null,
        wordTarget: wordTarget ? Number(wordTarget) : null,
        difficulty: difficulty || 'medium',
        topic: topic || '',
        createdBy: session!.user.id,
      },
    });

    if (type === 'multiple_choice' && options?.length) {
      let correctCount = 0;
      for (let i = 0; i < options.length; i++) {
        const opt = await prisma.questionOption.create({
          data: {
            questionId: question.id,
            text: options[i].text,
            isCorrect: options[i].isCorrect || false,
            sortOrder: i,
          },
        });
        if (options[i].isCorrect) {
          correctCount += 1;
          await prisma.answerKey.create({
            data: { questionId: question.id, correctOptionId: opt.id, version: 1 },
          });
        }
      }

      if (correctCount !== 1) {
        return NextResponse.json({ error: 'Multiple-choice questions must have exactly one correct option' }, { status: 400 });
      }
    }

    if (markingScheme && type !== 'multiple_choice') {
      const scheme = await prisma.markingScheme.create({
        data: {
          questionId: question.id,
          method: markingScheme.method,
          maxMark: markingScheme.maxMark,
          configJson: markingScheme.configJson ? JSON.stringify(markingScheme.configJson) : null,
          version: 1,
        },
      });

      if (markingScheme.markingPoints?.length) {
        for (const mp of markingScheme.markingPoints) {
          await prisma.markingPoint.create({
            data: {
              schemeId: scheme.id,
              pointText: mp.pointText,
              marks: mp.marks,
              alternativesJson: mp.alternativesJson ? JSON.stringify(mp.alternativesJson) : null,
            },
          });
        }
      }
    }

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'question_created',
      entityType: 'question',
      entityId: question.id,
      metadata: { courseId, type },
    });

    return NextResponse.json(question, { status: 201 });
  } catch (err: any) {
    console.error('Create question error:', err);
    return NextResponse.json({ error: 'Failed to create question' }, { status: 500 });
  }
}
