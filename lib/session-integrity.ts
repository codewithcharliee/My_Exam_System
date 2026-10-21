import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export const DUPLICATE_ACTIVE_SESSION_CODE = 'DUPLICATE_ACTIVE_SESSION';
export const DUPLICATE_ACTIVE_SESSION_MESSAGE = 'A duplicate active session cannot be opened';
export const INTERRUPTED_SESSION_REQUIRES_STAFF_CODE = 'INTERRUPTED_SESSION_REQUIRES_STAFF';
export const ATTEMPT_SESSION_STALE_AFTER_MS = 2 * 60 * 1000;

export function createSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function validateAttemptSession(attemptId: string, token: string | null) {
  if (!token) {
    return {
      ok: false as const,
      code: DUPLICATE_ACTIVE_SESSION_CODE,
      error: DUPLICATE_ACTIVE_SESSION_MESSAGE,
    };
  }
  const session = await prisma.attemptSession.findFirst({
    where: { attemptId, supersededAt: null, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (!session || session.sessionTokenHash !== hashSessionToken(token)) {
    return {
      ok: false as const,
      code: DUPLICATE_ACTIVE_SESSION_CODE,
      error: DUPLICATE_ACTIVE_SESSION_MESSAGE,
    };
  }
  if (Date.now() - session.lastSeenAt.getTime() > ATTEMPT_SESSION_STALE_AFTER_MS) {
    return {
      ok: false as const,
      code: INTERRUPTED_SESSION_REQUIRES_STAFF_CODE,
      error: 'This interrupted attempt is locked. Authorized personnel must reactivate it before you can continue.',
    };
  }
  await prisma.attemptSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return { ok: true as const, session };
}
