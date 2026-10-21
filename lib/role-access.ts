export const USER_ROLES = ['admin', 'exam_officer', 'lecturer', 'invigilator', 'candidate'] as const;
export type UserRole = (typeof USER_ROLES)[number];
export type LoginPortal = UserRole;

export const DASHBOARD_ROUTES: Record<UserRole, readonly string[]> = {
  admin: [
    '/dashboard/users',
    '/dashboard/courses',
    '/dashboard/assessments',
    '/dashboard/monitoring',
    '/dashboard/reports',
    '/dashboard/audit',
    '/dashboard/admin',
  ],
  exam_officer: [
    '/dashboard/assessments',
    '/dashboard/reports',
    '/dashboard/audit',
    '/dashboard/admin',
  ],
  lecturer: [
    '/dashboard/courses',
    '/dashboard/questions',
    '/dashboard/assessments',
    '/dashboard/grading',
    '/dashboard/reports',
    '/dashboard/ai-tools',
  ],
  invigilator: ['/dashboard/monitoring'],
  candidate: [
    '/dashboard/my-exams',
    '/dashboard/readiness',
    '/dashboard/practice',
    '/dashboard/my-results',
  ],
};

export function isUserRole(role: unknown): role is UserRole {
  return role === 'admin'
    || role === 'exam_officer'
    || role === 'lecturer'
    || role === 'invigilator'
    || role === 'candidate';
}

export function isRoleAllowedOnPortal(role: UserRole, portal: LoginPortal): boolean {
  return role === portal;
}

export function dashboardPathForRole(role: UserRole): string {
  switch (role) {
    case 'admin':
      return '/dashboard/admin';
    case 'exam_officer':
      return '/dashboard/assessments';
    case 'lecturer':
      return '/dashboard/questions';
    case 'invigilator':
      return '/dashboard/monitoring';
    case 'candidate':
      return '/dashboard';
  }
}

export function canAccessDashboardPath(role: unknown, pathname: unknown): boolean {
  if (!isUserRole(role) || typeof pathname !== 'string' || pathname.length === 0) return false;
  if (pathname === '/dashboard') return true;

  return DASHBOARD_ROUTES[role].some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}
