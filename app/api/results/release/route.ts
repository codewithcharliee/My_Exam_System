export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

const SUBJECTIVE_TYPES = ['short_answer', 'essay', 'legal_problem', 'case_analysis'];

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/results/release');
  if (error) return error;

  try {
    const { attemptId } = await request.json();

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: { include: { items: { include: { question: true } } } },
        gradeDecisions: true,
      },
    });
    if (!attempt) return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });

    const subjectiveQuestionIds = attempt.assessment.items
      .filter((item: any) => SUBJECTIVE_TYPES.includes(item.question.type))
      .map((item: any) => item.questionId);

    const undecided = subjectiveQuestionIds.filter((qid: string) => {
      const gd = (attempt.gradeDecisions ?? []).find((g: any) => g.questionId === qid);
      if (!gd) return true;
      if (gd.officialGrade === null || gd.officialGrade === undefined) return true;
      return !['accepted', 'modified', 'replaced'].includes(gd.lecturerDecision);
    });

    if (undecided.length > 0) {
      return NextResponse.json({
        error: 'Cannot release result yet. Some subjective questions are still pending lecturer grading.',
        pendingQuestionCount: undecided.length,
      }, { status: 400 });
    }

    const result = await prisma.result.update({
      where: { attemptId },
      data: {
        status: 'released',
        releasedAt: new Date(),
        releasedBy: session!.user.id,
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'result_released',
      entityType: 'result',
      entityId: result.id,
      metadata: { attemptId },
    });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to release result' }, { status: 500 });
  }
}
