export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { isFirstLevelCourse } from '@/lib/academic-rules';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('PATCH /api/questions/[id]');
  if (error) return error;

  const { id } = await params;

  try {
    const body = await request.json();
    const { text, difficulty, topic, options, markingScheme, status, wordLimit, wordTarget } = body;

    const current = await prisma.question.findUnique({
      where: { id },
      include: {
        answerKeys: { orderBy: { version: 'desc' } },
        markingSchemes: { orderBy: { version: 'desc' }, include: { markingPoints: true } },
      },
    });
    if (!current) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

    if (session!.user.role === 'lecturer') {
      const assignment = await prisma.userCourse.findUnique({
        where: { userId_courseId: { userId: session!.user.id, courseId: current.courseId } },
        select: { role: true },
      });
      if (assignment?.role !== 'lecturer') return NextResponse.json({ error: 'You are not assigned to this course.' }, { status: 403 });
    }

    const requestedStatus = status ?? current.status;
    if (requestedStatus === 'approved' && current.type === 'multiple_choice') {
      const course = await prisma.course.findUnique({ where: { id: current.courseId }, select: { level: true } });
      if (!course || !isFirstLevelCourse(course.level)) {
        return NextResponse.json({ error: 'Objective questions can only be approved for 100-level Law courses.' }, { status: 400 });
      }
    }
    if (requestedStatus === 'approved' && current.type === 'multiple_choice' && (!Array.isArray(options) && current.answerKeys.length === 0)) return NextResponse.json({ error: 'A multiple-choice draft needs a valid answer before approval' }, { status: 400 });

    const updated = await prisma.question.update({
      where: { id },
      data: {
        text: text ?? current.text,
        difficulty: difficulty ?? current.difficulty,
        topic: topic ?? current.topic,
        status: requestedStatus,
        wordLimit: wordLimit === undefined ? current.wordLimit : (wordLimit ? Number(wordLimit) : null),
        wordTarget: wordTarget === undefined ? current.wordTarget : (wordTarget ? Number(wordTarget) : null),
        version: current.version + 1,
      },
    });

    if (Array.isArray(options) && current.type === 'multiple_choice') {
      await prisma.questionOption.deleteMany({ where: { questionId: id } });

      let correctOptionId: string | null = null;
      for (let i = 0; i < options.length; i++) {
        const opt = await prisma.questionOption.create({
          data: {
            questionId: id,
            text: options[i].text,
            isCorrect: !!options[i].isCorrect,
            sortOrder: i,
          },
        });
        if (options[i].isCorrect) correctOptionId = opt.id;
      }

      if (correctOptionId) {
        const nextVersion = (current.answerKeys?.[0]?.version ?? 0) + 1;
        await prisma.answerKey.create({
          data: {
            questionId: id,
            correctOptionId,
            version: nextVersion,
          },
        });
      }
    }

    if (markingScheme && current.type !== 'multiple_choice') {
      const latestSchemeVersion = current.markingSchemes?.[0]?.version ?? 0;
      const newScheme = await prisma.markingScheme.create({
        data: {
          questionId: id,
          method: markingScheme.method,
          maxMark: markingScheme.maxMark,
          configJson: markingScheme.configJson ? JSON.stringify(markingScheme.configJson) : null,
          version: latestSchemeVersion + 1,
        },
      });

      if (Array.isArray(markingScheme.markingPoints)) {
        for (const mp of markingScheme.markingPoints) {
          await prisma.markingPoint.create({
            data: {
              schemeId: newScheme.id,
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
      actionType: 'question_updated',
      entityType: 'question',
      entityId: id,
      metadata: { newVersion: updated.version },
    });

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('Update question error:', err);
    return NextResponse.json({ error: 'Failed to update question' }, { status: 500 });
  }
}
