export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/results');
  if (error) return error;

  const role = (session!.user as any).role;
  const where: any = {};

  if (role === 'candidate') {
    where.attempt = { candidateId: session!.user.id };
    where.status = 'released';
  }

  const results = await prisma.result.findMany({
    where,
    include: {
      attempt: {
        include: {
          candidate: { select: { name: true, email: true } },
          assessment: {
            include: {
              course: { select: { code: true, title: true, semester: true } },
              items: true,
            },
          },
        },
      },
    },
    orderBy: { attemptId: 'desc' },
  });

  // Enrich with presentation fields used by the client: percentage,
  // letter grade, passed flag and the submission receipt.
  const enriched = results.map((r: any) => {
    const totalMax = r.attempt.assessment.items?.reduce(
      (sum: number, item: any) => sum + (item.maxMark ?? 0),
      0
    ) ?? 0;
    const total = r.totalScore ?? r.totalObjectiveScore ?? 0;
    const percentage = totalMax > 0 ? (total / totalMax) * 100 : 0;

    let grade = 'F';
    if (percentage >= 70) grade = 'A';
    else if (percentage >= 60) grade = 'B';
    else if (percentage >= 50) grade = 'C';
    else if (percentage >= 45) grade = 'D';

    return {
      ...r,
      percentage,
      grade,
      passed: percentage >= 45,
      attempt: {
        ...r.attempt,
        receipt: r.attempt.submissionReceipt,
      },
    };
  });

  return NextResponse.json({ results: enriched });
}
