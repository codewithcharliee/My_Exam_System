import { prisma } from '@/lib/prisma';
import { createAuditEvent } from '@/lib/audit';
import bcrypt from 'bcryptjs';
import { isRoleAllowedOnPortal, isUserRole } from '@/lib/role-access';

type CredentialInput = Partial<Record<'email' | 'password' | 'portal', unknown>>;

export async function authorizeCredentials(credentials: CredentialInput | undefined) {
  if (typeof credentials?.email !== 'string' || typeof credentials.password !== 'string') {
    return null;
  }

  const email = credentials.email.trim().toLowerCase();
  const portal = credentials.portal;
  if (!email || !credentials.password) return null;

  if (!isUserRole(portal)) {
    await createAuditEvent({
      actorId: null,
      actionType: 'login_failed',
      entityType: 'user',
      metadata: { accountIdentifier: email, outcome: 'denied', reason: 'invalid_portal' },
    });
    return null;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.accountStatus !== 'active') {
    await createAuditEvent({
      actorId: null,
      actionType: 'login_failed',
      entityType: 'user',
      metadata: { accountIdentifier: email, portal, outcome: 'denied' },
    });
    return null;
  }

  if (!isUserRole(user.role) || !isRoleAllowedOnPortal(user.role, portal)) {
    await createAuditEvent({
      actorId: user.id,
      actionType: 'login_failed',
      entityType: 'user',
      entityId: user.id,
      metadata: { accountIdentifier: email, portal, outcome: 'denied', reason: 'portal_mismatch' },
    });
    return null;
  }

  const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
  if (!isValid) {
    await createAuditEvent({
      actorId: user.id,
      actionType: 'login_failed',
      entityType: 'user',
      entityId: user.id,
      metadata: { accountIdentifier: email, portal, outcome: 'denied', reason: 'invalid_credentials' },
    });
    return null;
  }

  await createAuditEvent({
    actorId: user.id,
    actionType: 'login_success',
    entityType: 'user',
    entityId: user.id,
    metadata: { accountIdentifier: email, portal, outcome: 'allowed' },
  });

  return { id: user.id, email: user.email, name: user.name, role: user.role };
}
