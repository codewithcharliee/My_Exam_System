export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRouteAuthorization } from '@/lib/roles';
import { createAuditEvent } from '@/lib/audit';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error, session } = await requireRouteAuthorization('PATCH /api/users/[id]');
  if (error) return error;
  const { id } = await params;

  try {
    const body = await request.json();
    const { name, role, accountStatus, matricNumber, academicLevel, staffTitle } = body;
    const data: any = {};
    if (name) data.name = name;
    if (role) data.role = role;
    if (accountStatus) data.accountStatus = accountStatus;
    if (matricNumber !== undefined) data.matricNumber = matricNumber || null;
    if (academicLevel !== undefined) {
      const level = academicLevel === null || academicLevel === '' ? null : Number(academicLevel);
      if (level !== null && ![100, 200, 300, 400, 500].includes(level)) {
        return NextResponse.json({ error: 'Academic level must be 100, 200, 300, 400, or 500.' }, { status: 400 });
      }
      data.academicLevel = level;
    }
    if (staffTitle !== undefined) data.staffTitle = staffTitle || null;

    const user = await prisma.user.update({ where: { id }, data });

    await createAuditEvent({
      actorId: session!.user.id,
      actionType: 'user_updated',
      entityType: 'user',
      entityId: id,
      metadata: body,
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accountStatus: user.accountStatus,
      matricNumber: user.matricNumber,
      academicLevel: user.academicLevel,
      staffTitle: user.staffTitle,
    });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
