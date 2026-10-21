import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { createAuditEvent } from '@/lib/audit';
import { isUserRole, USER_ROLES, type UserRole } from '@/lib/role-access';

export type Role = UserRole;

const ALL_AUTHENTICATED_ROLES = USER_ROLES;

export const AUTHORIZATION_POLICIES = {
  'GET /api/admin/reactivation-requests': ['admin', 'exam_officer'],
  'POST /api/admin/reopen-attempt': ['admin', 'exam_officer'],
  'POST /api/admin/reset-attempt': ['admin'],
  'POST /api/admin/time-adjustment': ['admin', 'exam_officer'],
  'GET /api/admin/time-adjustment': ['admin', 'exam_officer'],
  'POST /api/ai/assess': ['lecturer'],
  'POST /api/ai/generate-questions': ['lecturer'],
  'GET /api/assessments/[id]': ALL_AUTHENTICATED_ROLES,
  'PATCH /api/assessments/[id]': ['lecturer', 'admin'],
  'GET /api/assessments': ALL_AUTHENTICATED_ROLES,
  'POST /api/assessments': ['lecturer'],
  'POST /api/attempts/[id]/exit': ['candidate'],
  'POST /api/attempts/[id]/reactivation-request': ['candidate'],
  'POST /api/attempts/[id]/recover-session': ['candidate'],
  'GET /api/attempts/[id]': ALL_AUTHENTICATED_ROLES,
  'POST /api/attempts/[id]/submit': ['candidate'],
  'POST /api/attempts/[id]/sync': ['candidate'],
  'POST /api/attempts/[id]/time-events': ['candidate'],
  'POST /api/attempts/[id]/unlock': ['candidate'],
  'GET /api/attempts/active': ['candidate'],
  'POST /api/attempts/start': ['candidate'],
  'GET /api/audit': ['admin', 'exam_officer'],
  'GET /api/audit/verify': ['admin', 'exam_officer'],
  'POST /api/courses/[id]/assign': ['admin', 'exam_officer', 'lecturer'],
  'GET /api/courses': ALL_AUTHENTICATED_ROLES,
  'POST /api/courses': ['admin'],
  'DELETE /api/courses/[id]/assign': ['admin', 'exam_officer', 'lecturer'],
  'POST /api/exports': ['admin', 'lecturer'],
  'PATCH /api/grading/[attemptId]/[questionId]': ['lecturer'],
  'GET /api/grading': ['lecturer', 'admin', 'exam_officer'],
  'GET /api/health': ALL_AUTHENTICATED_ROLES,
  'POST /api/issue-reports': ['candidate'],
  'GET /api/issue-reports': ['admin', 'invigilator', 'exam_officer'],
  'PATCH /api/issue-reports': ALL_AUTHENTICATED_ROLES,
  'GET /api/monitoring/active-sessions': ['admin', 'invigilator', 'exam_officer'],
  'POST /api/monitoring/events': ALL_AUTHENTICATED_ROLES,
  'PATCH /api/monitoring/events': ALL_AUTHENTICATED_ROLES,
  'GET /api/monitoring/events': ALL_AUTHENTICATED_ROLES,
  'POST /api/monitoring/snapshots/cleanup': ['admin', 'exam_officer'],
  'POST /api/monitoring/snapshots': ALL_AUTHENTICATED_ROLES,
  'DELETE /api/monitoring/snapshots': ALL_AUTHENTICATED_ROLES,
  'GET /api/monitoring/snapshots': ALL_AUTHENTICATED_ROLES,
  'POST /api/practice': ['candidate'],
  'PATCH /api/practice': ['candidate'],
  'GET /api/practice': ['candidate'],
  'PATCH /api/questions/[id]': ['lecturer', 'admin'],
  'GET /api/questions': ['admin', 'lecturer', 'exam_officer'],
  'POST /api/questions': ['lecturer'],
  'POST /api/readiness': ['candidate'],
  'GET /api/reports': ['admin', 'exam_officer', 'lecturer'],
  'POST /api/results/release': ['lecturer', 'admin'],
  'GET /api/results': ALL_AUTHENTICATED_ROLES,
  'PATCH /api/users/[id]': ['admin'],
  'GET /api/users': ['admin', 'exam_officer', 'lecturer'],
  'POST /api/users': ['admin'],
} as const satisfies Record<string, readonly Role[]>;

export type AuthorizationPolicyKey = keyof typeof AUTHORIZATION_POLICIES;

export const AUTHORIZATION_POLICY_KEYS = Object.keys(AUTHORIZATION_POLICIES) as AuthorizationPolicyKey[];

const AUTHORIZATION_AUDIT_ACTIONS: Partial<Record<AuthorizationPolicyKey, string>> = {
  'POST /api/admin/reset-attempt': 'attempt_reset',
  'POST /api/ai/assess': 'ai_assessment_recommendation',
  'POST /api/ai/generate-questions': 'ai_question_generation',
  'POST /api/attempts/[id]/submit': 'attempt_submit',
  'POST /api/attempts/start': 'attempt_start',
  'PATCH /api/grading/[attemptId]/[questionId]': 'grade_decision_update',
};

export function canRoleAccessRoute(role: unknown, policyKey: unknown): boolean {
  if (typeof policyKey !== 'string' || !isUserRole(role)) return false;
  if (!Object.prototype.hasOwnProperty.call(AUTHORIZATION_POLICIES, policyKey)) return false;
  const allowedRoles: readonly UserRole[] = AUTHORIZATION_POLICIES[policyKey as AuthorizationPolicyKey];
  return allowedRoles.includes(role);
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    await createAuditEvent({
      actorId: null,
      actionType: 'authorization_denied',
      entityType: 'authorization',
      metadata: { action: 'authenticated_resource_access', outcome: 'denied', reason: 'unauthenticated' },
    });
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function requireRole(...roles: Role[]) {
  return requireRoles(roles, `role_guard:${roles.join('|')}`);
}

export async function requireRouteAuthorization(policyKey: AuthorizationPolicyKey) {
  return requireRoles(
    [...AUTHORIZATION_POLICIES[policyKey]],
    AUTHORIZATION_AUDIT_ACTIONS[policyKey] ?? policyKey,
  );
}

export async function requireRoleForAction(action: string, ...roles: Role[]) {
  return requireRoles(roles, action);
}

async function requireRoles(roles: Role[], action: string) {
  const session = await auth();
  if (!session?.user?.id) {
    await createAuditEvent({
      actorId: null,
      actionType: 'authorization_denied',
      entityType: 'authorization',
      metadata: { action, outcome: 'denied', reason: 'unauthenticated', requiredRoles: roles },
    });
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }), session: null };
  }

  const userRole = session.user.role;
  if (!isUserRole(userRole) || !roles.includes(userRole)) {
    await createAuditEvent({
      actorId: session.user.id,
      actionType: 'authorization_denied',
      entityType: 'authorization',
      entityId: session.user.id,
      metadata: { action, outcome: 'denied', role: userRole, requiredRoles: roles },
    });
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null };
  }
  return { error: null, session };
}
