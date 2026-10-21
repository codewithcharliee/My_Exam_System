export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createAuditEvent } from '@/lib/audit';
import { isRoleAllowedOnPortal, isUserRole } from '@/lib/role-access';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;
    const portal = body.portal;

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return NextResponse.json({ error: 'Missing credentials' }, { status: 400 });
    }
    if (!isUserRole(portal)) {
      return NextResponse.json({ error: 'A valid login portal is required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (!user || user.accountStatus !== 'active') {
      await createAuditEvent({
        actorId: null,
        actionType: 'login_failed',
        entityType: 'user',
        metadata: { accountIdentifier: email.trim().toLowerCase(), portal, outcome: 'denied' },
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    if (!isUserRole(user.role) || !isRoleAllowedOnPortal(user.role, portal)) {
      await createAuditEvent({
        actorId: user.id,
        actionType: 'login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { accountIdentifier: user.email, portal, outcome: 'denied', reason: 'portal_mismatch' },
      });
      return NextResponse.json(
        { error: 'This account is not authorized for the selected portal' },
        { status: 403 },
      );
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await createAuditEvent({
        actorId: user.id,
        actionType: 'login_failed',
        entityType: 'user',
        entityId: user.id,
        metadata: { accountIdentifier: user.email, portal, outcome: 'denied', reason: 'invalid_credentials' },
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    await createAuditEvent({
      actorId: user.id,
      actionType: 'login_success',
      entityType: 'user',
      entityId: user.id,
      metadata: { accountIdentifier: user.email, portal, outcome: 'allowed' },
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
