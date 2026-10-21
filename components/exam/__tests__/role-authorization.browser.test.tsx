import { createElement } from 'react';
import { page } from 'vitest/browser';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import {
  AUTHORIZATION_POLICY_KEYS,
  canRoleAccessRoute,
  type AuthorizationPolicyKey,
} from '@/lib/roles';
import {
  canAccessDashboardPath,
  DASHBOARD_ROUTES,
  USER_ROLES,
  type UserRole,
} from '@/lib/role-access';
import { GET as getAttempt } from '@/app/api/attempts/[id]/route';
import { POST as resetAttempt } from '@/app/api/admin/reset-attempt/route';

const { authorization } = vi.hoisted(() => ({
  authorization: {
    role: 'candidate',
    userId: 'candidate-owner',
    auth: vi.fn<() => Promise<{ user: { id: string; role: string } }>>(),
    createAuditEvent: vi.fn(async () => undefined),
    attemptFindUnique: vi.fn(async () => ({})),
  },
}));

vi.mock('@/auth', () => ({ auth: authorization.auth }));
vi.mock('@/lib/audit', () => ({ createAuditEvent: authorization.createAuditEvent }));
vi.mock('@/lib/prisma', () => ({
  prisma: { attempt: { findUnique: authorization.attemptFindUnique } },
}));
vi.mock('@/lib/session-integrity', () => ({
  ATTEMPT_SESSION_STALE_AFTER_MS: 120000,
  DUPLICATE_ACTIVE_SESSION_CODE: 'DUPLICATE_ACTIVE_SESSION',
  DUPLICATE_ACTIVE_SESSION_MESSAGE: 'A duplicate active session cannot be opened',
  INTERRUPTED_SESSION_REQUIRES_STAFF_CODE: 'INTERRUPTED_SESSION_REQUIRES_STAFF',
  createSessionToken: () => 'synthetic-session-token',
  hashSessionToken: () => 'synthetic-session-hash',
  validateAttemptSession: vi.fn(),
}));
vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
  },
}));

const h = createElement;
const ROLE_INDEX: Record<UserRole, number> = {
  admin: 0,
  exam_officer: 1,
  lecturer: 2,
  invigilator: 3,
  candidate: 4,
};
type PermissionTuple = readonly [boolean, boolean, boolean, boolean, boolean];
let authorizationReportRows: string[] = [];

const EXPECTED_API_ACCESS = {
  'GET /api/admin/reactivation-requests': [true, true, false, false, false],
  'POST /api/admin/reopen-attempt': [true, true, false, false, false],
  'POST /api/admin/reset-attempt': [true, false, false, false, false],
  'POST /api/admin/time-adjustment': [true, true, false, false, false],
  'GET /api/admin/time-adjustment': [true, true, false, false, false],
  'POST /api/ai/assess': [false, false, true, false, false],
  'POST /api/ai/generate-questions': [false, false, true, false, false],
  'GET /api/assessments/[id]': [true, true, true, true, true],
  'PATCH /api/assessments/[id]': [true, false, true, false, false],
  'GET /api/assessments': [true, true, true, true, true],
  'POST /api/assessments': [false, false, true, false, false],
  'POST /api/attempts/[id]/exit': [false, false, false, false, true],
  'POST /api/attempts/[id]/reactivation-request': [false, false, false, false, true],
  'POST /api/attempts/[id]/recover-session': [false, false, false, false, true],
  'GET /api/attempts/[id]': [true, true, true, true, true],
  'POST /api/attempts/[id]/submit': [false, false, false, false, true],
  'POST /api/attempts/[id]/sync': [false, false, false, false, true],
  'POST /api/attempts/[id]/time-events': [false, false, false, false, true],
  'POST /api/attempts/[id]/unlock': [false, false, false, false, true],
  'GET /api/attempts/active': [false, false, false, false, true],
  'POST /api/attempts/start': [false, false, false, false, true],
  'GET /api/audit': [true, true, false, false, false],
  'GET /api/audit/verify': [true, true, false, false, false],
  'POST /api/courses/[id]/assign': [true, false, false, false, false],
  'GET /api/courses': [true, true, true, true, true],
  'POST /api/courses': [true, false, false, false, false],
  'POST /api/exports': [true, false, true, false, false],
  'PATCH /api/grading/[attemptId]/[questionId]': [false, false, true, false, false],
  'GET /api/grading': [true, true, true, false, false],
  'GET /api/health': [true, true, true, true, true],
  'POST /api/issue-reports': [false, false, false, false, true],
  'GET /api/issue-reports': [true, true, false, true, false],
  'PATCH /api/issue-reports': [true, true, true, true, true],
  'GET /api/monitoring/active-sessions': [true, true, false, true, false],
  'POST /api/monitoring/events': [true, true, true, true, true],
  'PATCH /api/monitoring/events': [true, true, true, true, true],
  'GET /api/monitoring/events': [true, true, true, true, true],
  'POST /api/monitoring/snapshots/cleanup': [true, true, false, false, false],
  'POST /api/monitoring/snapshots': [true, true, true, true, true],
  'DELETE /api/monitoring/snapshots': [true, true, true, true, true],
  'GET /api/monitoring/snapshots': [true, true, true, true, true],
  'POST /api/practice': [false, false, false, false, true],
  'PATCH /api/practice': [false, false, false, false, true],
  'GET /api/practice': [false, false, false, false, true],
  'PATCH /api/questions/[id]': [true, false, true, false, false],
  'GET /api/questions': [true, true, true, false, false],
  'POST /api/questions': [false, false, true, false, false],
  'POST /api/readiness': [false, false, false, false, true],
  'GET /api/reports': [true, true, true, false, false],
  'POST /api/results/release': [true, false, true, false, false],
  'GET /api/results': [true, true, true, true, true],
  'PATCH /api/users/[id]': [true, false, false, false, false],
  'GET /api/users': [true, true, false, false, false],
  'POST /api/users': [true, false, false, false, false],
} as const satisfies Record<AuthorizationPolicyKey, PermissionTuple>;

const EXPECTED_DASHBOARD_ACCESS: Record<string, PermissionTuple> = {
  '/dashboard': [true, true, true, true, true],
  '/dashboard/users': [true, false, false, false, false],
  '/dashboard/courses': [true, false, true, false, false],
  '/dashboard/assessments': [true, true, true, false, false],
  '/dashboard/monitoring': [true, false, false, true, false],
  '/dashboard/reports': [true, true, true, false, false],
  '/dashboard/audit': [true, true, false, false, false],
  '/dashboard/admin': [true, true, false, false, false],
  '/dashboard/questions': [false, false, true, false, false],
  '/dashboard/grading': [false, false, true, false, false],
  '/dashboard/ai-tools': [false, false, true, false, false],
  '/dashboard/my-exams': [false, false, false, false, true],
  '/dashboard/readiness': [false, false, false, false, true],
  '/dashboard/practice': [false, false, false, false, true],
  '/dashboard/my-results': [false, false, false, false, true],
};

const API_ROUTE_SOURCES = import.meta.glob(
  '../../../app/api/**/route.ts',
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>;
const NON_ROLE_API_METHODS = [
  'GET /api/monitoring/snapshots/cleanup',
  'POST /api/auth/login',
  'POST /api/signup',
] as const;

function MatrixEvidence() {
  const rows = [
    ...AUTHORIZATION_POLICY_KEYS.map((policy) => ({
      name: policy,
      permissions: USER_ROLES.map((role) => canRoleAccessRoute(role, policy)),
    })),
    ...Object.keys(EXPECTED_DASHBOARD_ACCESS).map((path) => ({
      name: `dashboard ${path}`,
      permissions: USER_ROLES.map((role) => canAccessDashboardPath(role, path)),
    })),
  ];

  return h('main', { className: 'unit-test-2-evidence', style: { background: '#fff', color: '#000', fontFamily: '"Times New Roman", Times, serif', padding: '24px' } },
    h('style', null, '.unit-test-2-evidence, .unit-test-2-evidence * { background-color: #fff !important; color: #000 !important; font-family: "Times New Roman", Times, serif !important; }'),
    h('h1', { style: { background: '#fff', color: '#000' } }, 'Role authorization permission matrix'),
    h('table', { style: { background: '#fff', borderCollapse: 'collapse', color: '#000', width: '100%' } },
      h('thead', null, h('tr', null,
        h('th', { style: { background: '#fff', border: '1px solid #000', color: '#000', padding: '2px', textAlign: 'left' } }, 'Function or route'),
        ...USER_ROLES.map((role) => h('th', { key: role, style: { background: '#fff', border: '1px solid #000', color: '#000', padding: '2px' } }, role)),
      )),
      h('tbody', null, ...rows.map((row) => h('tr', { key: row.name },
        h('th', { style: { background: '#fff', border: '1px solid #000', color: '#000', padding: '1px', textAlign: 'left' } }, row.name),
        ...row.permissions.map((allowed, index) => h('td', {
          key: USER_ROLES[index],
          style: { background: '#fff', border: '1px solid #000', color: '#000', padding: '1px', textAlign: 'center' },
        }, allowed ? 'Allowed' : 'Denied')),
      ))),
    ),
  );
}

function AccessDeniedEvidence() {
  return h('main', {
    className: 'unit-test-2-evidence',
    style: {
      alignItems: 'center',
      background: '#fff',
      color: '#000',
      display: 'flex',
      fontFamily: '"Times New Roman", Times, serif',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '48px',
    },
  }, h('style', null, '.unit-test-2-evidence, .unit-test-2-evidence * { background-color: #fff !important; color: #000 !important; font-family: "Times New Roman", Times, serif !important; }'),
  h('section', { style: { border: '1px solid #000', padding: '36px', width: '520px' } },
    h('h1', null, 'Access denied'),
    h('p', null, 'Signed-in role: candidate'),
    h('p', null, 'Requested function: POST /api/admin/reset-attempt'),
    h('p', null, 'Your account does not have permission to perform this action.'),
  ));
}

function policyKeysFromRouteSources(): string[] {
  return Object.entries(API_ROUTE_SOURCES).flatMap(([, source]) =>
    Array.from(source.matchAll(/requireRouteAuthorization\(\s*['"]([^'"]+)['"]\s*\)/g), (match) => match[1]),
  );
}

function apiHandlerKeysFromSources(): string[] {
  return Object.entries(API_ROUTE_SOURCES).flatMap(([filePath, source]) => {
    const routePath = filePath.replace('../../../app/api', '/api').replace(/\/route\.ts$/, '');
    return Array.from(
      source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g),
      (match) => `${match[1] ?? match[2]} ${routePath}`,
    );
  });
}

describe('Unit Test 2 — role authorization', () => {
  beforeEach(() => {
    authorization.role = 'candidate';
    authorization.userId = 'candidate-owner';
    authorization.auth.mockImplementation(async () => ({
      user: { id: authorization.userId, role: authorization.role },
    }));
    authorization.createAuditEvent.mockClear();
    authorization.attemptFindUnique.mockReset();
  });

  afterAll(() => {
    console.info([
      'Role\tFunction\tExpected\tActual\tStatus',
      ...authorizationReportRows,
      `Overall result\t${authorizationReportRows.every((row) => row.endsWith('\tPASS')) ? 'PASS' : 'FAIL'}`,
    ].join('\n'));
  });

  it('allows a candidate to use POST /api/attempts/start', () => {
    expect(canRoleAccessRoute('candidate', 'POST /api/attempts/start')).toBe(true);
  });

  it('denies a candidate access to POST /api/admin/reset-attempt', () => {
    expect(canRoleAccessRoute('candidate', 'POST /api/admin/reset-attempt')).toBe(false);
  });

  it('allows an administrator to use POST /api/admin/reset-attempt', () => {
    expect(canRoleAccessRoute('admin', 'POST /api/admin/reset-attempt')).toBe(true);
  });

  it('allows lecturer grading and refuses candidate and administration actions', () => {
    expect(canRoleAccessRoute('lecturer', 'GET /api/grading')).toBe(true);
    expect(canRoleAccessRoute('lecturer', 'PATCH /api/grading/[attemptId]/[questionId]')).toBe(true);
    expect(canRoleAccessRoute('lecturer', 'POST /api/attempts/start')).toBe(false);
    expect(canRoleAccessRoute('lecturer', 'POST /api/admin/reset-attempt')).toBe(false);
  });

  it('allows invigilator monitoring while refusing grading and administration', () => {
    expect(canRoleAccessRoute('invigilator', 'GET /api/monitoring/active-sessions')).toBe(true);
    expect(canRoleAccessRoute('invigilator', 'PATCH /api/grading/[attemptId]/[questionId]')).toBe(false);
    expect(canRoleAccessRoute('invigilator', 'POST /api/admin/reset-attempt')).toBe(false);
  });

  it('keeps administrators out of lecturer-only grading and candidate-only attempt actions', () => {
    expect(canRoleAccessRoute('admin', 'POST /api/admin/reset-attempt')).toBe(true);
    expect(canRoleAccessRoute('admin', 'PATCH /api/grading/[attemptId]/[questionId]')).toBe(false);
    expect(canRoleAccessRoute('admin', 'POST /api/attempts/start')).toBe(false);
  });

  it('matches a literal expected result for every role and protected API policy', () => {
    authorizationReportRows = [];
    const resultRows: string[] = [];

    for (const policy of AUTHORIZATION_POLICY_KEYS) {
      for (const role of USER_ROLES) {
        const expected = EXPECTED_API_ACCESS[policy][ROLE_INDEX[role]];
        const actual = canRoleAccessRoute(role, policy);
        const status = actual === expected ? 'PASS' : 'FAIL';
        resultRows.push(`${role}\t${policy}\t${expected}\t${actual}\t${status}`);
        expect(actual, `${role} access to ${policy}`).toBe(expected);
        expect(typeof actual, `${role} access to ${policy} must return a boolean`).toBe('boolean');
      }
    }

    for (const [path, expectedByRole] of Object.entries(EXPECTED_DASHBOARD_ACCESS)) {
      for (const role of USER_ROLES) {
        const expected = expectedByRole[ROLE_INDEX[role]];
        const actual = canAccessDashboardPath(role, path);
        const status = actual === expected ? 'PASS' : 'FAIL';
        resultRows.push(`${role}\tdashboard ${path}\t${expected}\t${actual}\t${status}`);
        expect(actual, `${role} access to dashboard ${path}`).toBe(expected);
        expect(typeof actual, `${role} dashboard access to ${path} must return a boolean`).toBe('boolean');
      }
    }

    authorizationReportRows = resultRows;
  });

  it('fails clearly if an API policy or dashboard route is missing from the expected matrix', () => {
    const missingPolicies = AUTHORIZATION_POLICY_KEYS.filter((policy) => !(policy in EXPECTED_API_ACCESS));
    const unexpectedPolicies = Object.keys(EXPECTED_API_ACCESS).filter(
      (policy) => !AUTHORIZATION_POLICY_KEYS.includes(policy as AuthorizationPolicyKey),
    );
    const sourceDashboardRoutes = [...new Set([
      '/dashboard',
      ...USER_ROLES.flatMap((role) => DASHBOARD_ROUTES[role]),
    ])];
    const missingDashboardRoutes = sourceDashboardRoutes.filter((path) => !(path in EXPECTED_DASHBOARD_ACCESS));
    const unexpectedDashboardRoutes = Object.keys(EXPECTED_DASHBOARD_ACCESS).filter(
      (path) => !sourceDashboardRoutes.includes(path),
    );

    expect(missingPolicies, `Missing expected API policies: ${missingPolicies.join(', ')}`).toEqual([]);
    expect(unexpectedPolicies, `Unexpected API matrix entries: ${unexpectedPolicies.join(', ')}`).toEqual([]);
    expect(missingDashboardRoutes, `Missing dashboard routes: ${missingDashboardRoutes.join(', ')}`).toEqual([]);
    expect(unexpectedDashboardRoutes, `Unexpected dashboard routes: ${unexpectedDashboardRoutes.join(', ')}`).toEqual([]);
  });

  it('confirms every catalogued API policy is wired to a route guard and rejects legacy inline guards', () => {
    const referencedPolicyKeys = [...new Set(policyKeysFromRouteSources())].sort();
    const cataloguedPolicyKeys = [...AUTHORIZATION_POLICY_KEYS].sort();
    const handlerKeys = apiHandlerKeysFromSources().sort();
    const classifiedApiMethods = [...AUTHORIZATION_POLICY_KEYS, ...NON_ROLE_API_METHODS].sort();
    const legacyGuardFiles = Object.entries(API_ROUTE_SOURCES)
      .filter(([, source]) => /\brequireAuth\s*\(|\brequireRole(?:ForAction)?\s*\(/.test(source))
      .map(([path]) => path);

    expect(referencedPolicyKeys).toEqual(cataloguedPolicyKeys);
    expect(handlerKeys).toEqual(classifiedApiMethods);
    expect(legacyGuardFiles, `Routes still using inline guards: ${legacyGuardFiles.join(', ')}`).toEqual([]);
    expect(
      API_ROUTE_SOURCES['../../../app/api/monitoring/snapshots/cleanup/route.ts'],
    ).toContain('isAuthorizedCronRequest(request)');
  });

  it('denies invalid roles and unknown function names without throwing or returning non-booleans', () => {
    const invalidRoles: unknown[] = ['unknown', undefined, null, '', 'Admin', 'admin ', 12, { role: 'admin' }];
    const invalidPolicies: unknown[] = ['POST /api/not-real', undefined, null, '', 12, {}];

    for (const role of invalidRoles) {
      for (const policy of ['POST /api/attempts/start', 'POST /api/admin/reset-attempt']) {
        expect(() => canRoleAccessRoute(role, policy)).not.toThrow();
        const actual = canRoleAccessRoute(role, policy);
        expect(actual).toBe(false);
        expect(typeof actual).toBe('boolean');
      }
    }

    for (const policy of invalidPolicies) {
      expect(() => canRoleAccessRoute('admin', policy)).not.toThrow();
      const actual = canRoleAccessRoute('admin', policy);
      expect(actual).toBe(false);
      expect(typeof actual).toBe('boolean');
      for (const role of invalidRoles) {
        expect(() => canRoleAccessRoute(role, policy)).not.toThrow();
        expect(canRoleAccessRoute(role, policy)).toBe(false);
      }
    }

    for (const role of invalidRoles) {
      expect(() => canAccessDashboardPath(role, '/dashboard/admin')).not.toThrow();
      expect(canAccessDashboardPath(role, '/dashboard/admin')).toBe(false);
    }
    expect(canAccessDashboardPath('admin', undefined)).toBe(false);
    expect(canAccessDashboardPath('admin', '')).toBe(false);
  });

  it('does not change authorization after repeated calls or mutation of an invalid role object', () => {
    const mutableRole: { role: string } = { role: 'admin' };

    expect(canRoleAccessRoute(mutableRole, 'POST /api/admin/reset-attempt')).toBe(false);
    mutableRole.role = 'candidate';
    expect(canRoleAccessRoute(mutableRole, 'POST /api/admin/reset-attempt')).toBe(false);
    expect(canRoleAccessRoute('candidate', 'POST /api/attempts/start')).toBe(true);
    expect(canRoleAccessRoute('candidate', 'POST /api/attempts/start')).toBe(true);
  });

  it('refuses an administrator-only route when a candidate request body claims the admin role', async () => {
    authorization.role = 'candidate';
    const request = new Request('http://localhost/api/admin/reset-attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', attemptId: 'attempt-1', reason: 'test' }),
    });

    const response = await resetAttempt(request as Parameters<typeof resetAttempt>[0]);

    expect(response.status).toBe(403);
    expect(authorization.attemptFindUnique).not.toHaveBeenCalled();
  });

  it('allows an attempt owner and refuses a different candidate in the real attempt handler', async () => {
    authorization.attemptFindUnique.mockResolvedValue({
      candidateId: 'candidate-owner',
      status: 'submitted',
      expiresAt: null,
      assessment: { items: [] },
    });
    const request = new Request('http://localhost/api/attempts/attempt-1');
    const ownerResponse = await getAttempt(
      request as Parameters<typeof getAttempt>[0],
      { params: Promise.resolve({ id: 'attempt-1' }) },
    );
    expect(ownerResponse.status).toBe(200);

    authorization.userId = 'another-candidate';
    const otherCandidateResponse = await getAttempt(
      request as Parameters<typeof getAttempt>[0],
      { params: Promise.resolve({ id: 'attempt-1' }) },
    );
    expect(otherCandidateResponse.status).toBe(403);
  });

  it('renders the complete permission matrix and candidate access-denied view', async () => {
    await page.viewport(1700, 2300);
    const matrixRender = await render(h(MatrixEvidence));
    await expect.element(page.getByRole('heading', { name: 'Role authorization permission matrix' })).toBeVisible();
    await expect(page).toMatchScreenshot('unit-test-2-authorization/scenario-specific-ui-screenshots/permission-matrix');

    await matrixRender.unmount();
    await page.viewport(1440, 1000);
    await render(h(AccessDeniedEvidence));
    await expect.element(page.getByRole('heading', { name: 'Access denied' })).toBeVisible();
    await expect(page).toMatchScreenshot('unit-test-2-authorization/scenario-specific-ui-screenshots/access-denied');
  });
});
