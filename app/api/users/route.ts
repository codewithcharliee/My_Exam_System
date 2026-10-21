export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('GET /api/users');
  if (error) return error;

  const url = new URL(request.url);
  const courseId = url.searchParams.get('courseId');
  if (courseId) {
    if (session!.user.role === 'lecturer') {
      const assignment = await prisma.userCourse.findUnique({
        where: { userId_courseId: { userId: session!.user.id, courseId } },
        select: { id: true },
      });
      if (!assignment) return NextResponse.json({ error: 'You are not assigned to this course.' }, { status: 403 });
    }

    const candidates = await prisma.user.findMany({
      where: { role: 'candidate' },
      select: {
        id: true,
        name: true,
        email: true,
        matricNumber: true,
        academicLevel: true,
        userCourses: { where: { courseId }, select: { id: true } },
      },
      orderBy: [{ academicLevel: 'asc' }, { name: 'asc' }],
    });
    return NextResponse.json(candidates.map(({ userCourses, ...candidate }) => ({
      ...candidate,
      assigned: userCourses.length > 0,
    })));
  }

  if (session!.user.role === 'lecturer') {
    return NextResponse.json({ error: 'courseId is required for lecturer candidate lookup.' }, { status: 400 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      accountStatus: true,
      createdAt: true,
      matricNumber: true,
      academicLevel: true,
      staffTitle: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const { error, session } = await requireRouteAuthorization('POST /api/users');
  if (error) return error;

  try {
    const body = await request.json();
    const { name, email, password, role, matricNumber, academicLevel, staffTitle } = body;
    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    if (!['admin', 'exam_officer', 'lecturer', 'invigilator', 'candidate'].includes(role)) {
      return NextResponse.json({ error: 'Invalid account role' }, { status: 400 });
    }
    const level = academicLevel === undefined || academicLevel === '' ? null : Number(academicLevel);
    if (role === 'candidate' && level !== null && ![100, 200, 300, 400, 500].includes(level)) {
      return NextResponse.json({ error: 'Candidate academic level must be 100, 200, 300, 400, or 500.' }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: String(email).trim().toLowerCase(),
        passwordHash,
        role,
        matricNumber: matricNumber ? String(matricNumber).trim() : null,
        academicLevel: role === 'candidate' ? level : null,
        staffTitle: role === 'lecturer' && staffTitle ? String(staffTitle).trim() : null,
      },
    });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'user_created',
      entityType: 'user',
      entityId: user.id,
      metadata: { role },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      matricNumber: user.matricNumber,
      academicLevel: user.academicLevel,
      staffTitle: user.staffTitle,
    }, { status: 201 });
  } catch (err: any) {
    console.error('Create user error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
