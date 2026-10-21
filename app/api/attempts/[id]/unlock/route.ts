import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { validateAttemptSession } from '@/lib/session-integrity';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('POST /api/attempts/[id]/unlock');
  if (error) return error;
  const { id } = await params;
  try {
    const { password } = await request.json();
    if (typeof password !== 'string' || !password) return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    const attempt = await prisma.attempt.findUnique({ where: { id }, include: { candidate: { select: { passwordHash: true } } } });
    if (!attempt || attempt.candidateId !== session!.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const sessionCheck = await validateAttemptSession(id, request.cookies.get(`exam_session_${id}`)?.value ?? null);
    if (!sessionCheck.ok) return NextResponse.json({ code: sessionCheck.code, error: sessionCheck.error }, { status: 409 });
    const valid = await bcrypt.compare(password, attempt.candidate.passwordHash);
    if (!valid) return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
    return NextResponse.json({ verified: true });
  } catch {
    return NextResponse.json({ error: 'Unable to verify password' }, { status: 500 });
  }
}
