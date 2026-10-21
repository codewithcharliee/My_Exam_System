export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import { isCourseSemester } from '@/lib/course-semester';

const LAW_COURSE_CODE_PREFIXES = ['LAW', 'PUL', 'PPL', 'CIL', 'CLE', 'JIL'];
const lawCourseCodeFilter = {
  OR: LAW_COURSE_CODE_PREFIXES.map((prefix) => ({ code: { startsWith: prefix, mode: 'insensitive' as const } })),
};

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/courses');
  if (error) return error;

  const semester = request.nextUrl.searchParams.get('semester');
  if (semester && semester !== 'unassigned' && !isCourseSemester(semester)) {
    return NextResponse.json({ error: 'Semester must be first, second, full_year, or unassigned.' }, { status: 400 });
  }

  const where: any = { ...lawCourseCodeFilter };
  if (semester === 'unassigned') where.semester = null;
  else if (semester) where.semester = semester;
  if (session!.user.role === 'lecturer') {
    const assignments = await prisma.userCourse.findMany({
      where: { userId: session!.user.id, role: 'lecturer' },
      select: { courseId: true },
    });
    where.id = { in: assignments.map((assignment) => assignment.courseId) };
  }

  const courses = await prisma.course.findMany({
    where,
    include: {
      userCourses: { include: { user: { select: { id: true, name: true, role: true, staffTitle: true } } } },
      _count: { select: { questions: true, assessments: true } },
    },
    orderBy: [{ semester: 'asc' }, { code: 'asc' }],
  });
  return NextResponse.json(courses);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/courses');
  if (error) return error;

  try {
    const body = await request.json();
    const { code, title, level, semester, isElective, creditUnits, catalogSource } = body;
    if (!code || !title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const normalizedCode = String(code).trim().toUpperCase();
    if (!LAW_COURSE_CODE_PREFIXES.some((prefix) => normalizedCode.startsWith(prefix))) {
      return NextResponse.json({ error: 'Only Faculty of Law course codes can be created.' }, { status: 400 });
    }
    if (!isCourseSemester(semester)) {
      return NextResponse.json({ error: 'Semester must be first, second, or full_year.' }, { status: 400 });
    }

    const units = creditUnits === undefined || creditUnits === null || creditUnits === ''
      ? null
      : Number(creditUnits);
    if (units !== null && (!Number.isFinite(units) || units <= 0)) {
      return NextResponse.json({ error: 'Credit units must be a positive number.' }, { status: 400 });
    }
    const course = await prisma.course.create({
      data: {
        code: normalizedCode,
        title: String(title).trim(),
        level: level || 'LLB',
        semester,
        isElective: isElective === true,
        creditUnits: units,
        catalogSource: catalogSource ? String(catalogSource).trim() : null,
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'course_created',
      entityType: 'course',
      entityId: course.id,
    });

    return NextResponse.json(course, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to create course' }, { status: 500 });
  }
}
