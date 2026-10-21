import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTHORIZATION_POLICIES,
  AUTHORIZATION_POLICY_KEYS,
} from '@/lib/roles';
import { USER_ROLES, type UserRole } from '@/lib/role-access';

const { routeState } = vi.hoisted(() => ({
  routeState: {
    session: null as { user: { id: string; role: string } } | null,
    auth: vi.fn(),
  },
}));

vi.mock('@/auth', () => ({ auth: routeState.auth }));
vi.mock('@/lib/audit', () => ({ createAuditEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy<Record<string, unknown>>({}, {
    get: () => new Proxy<Record<string, unknown>>({}, {
      get: () => vi.fn(async () => null),
    }),
  }),
}));

const API_ROUTE_MODULES = import.meta.glob(
  '../../../app/api/**/route.ts',
) as Record<string, () => Promise<unknown>>;

describe('API route authorization enforcement', () => {
  beforeEach(() => {
    routeState.session = null;
    routeState.auth.mockImplementation(async () => routeState.session);
  });

  it('rejects an unauthorized request in every protected API handler', async () => {
    for (const policy of AUTHORIZATION_POLICY_KEYS) {
      const [method, ...routeSegments] = policy.split(' ');
      const routePath = routeSegments.join(' ');
      const modulePath = `../../../app${routePath}/route.ts`;
      const loadRoute = API_ROUTE_MODULES[modulePath];
      expect(loadRoute, `Missing route module for ${policy}`).toBeDefined();
      if (!loadRoute) continue;

      const routeModule = await loadRoute();
      expect(typeof routeModule, `Could not load route module for ${policy}`).toBe('object');
      if (typeof routeModule !== 'object' || routeModule === null) continue;

      const handler = Reflect.get(routeModule, method);
      expect(typeof handler, `Missing ${method} handler for ${policy}`).toBe('function');
      if (typeof handler !== 'function') continue;

      const allowedRoles: readonly UserRole[] = AUTHORIZATION_POLICIES[policy];
      const deniedRole = USER_ROLES.find((role) => !allowedRoles.includes(role));
      routeState.session = deniedRole
        ? { user: { id: 'wrong-role-user', role: deniedRole } }
        : null;

      const concretePath = routePath.replace(/\[([^\]]+)\]/g, 'test-$1');
      const request = new NextRequest(`http://localhost${concretePath}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify({}),
      });
      const params = Object.fromEntries(
        Array.from(routePath.matchAll(/\[([^\]]+)\]/g), (match) => [match[1], `test-${match[1]}`]),
      );
      const result: unknown = await Reflect.apply(handler, undefined, [
        request,
        { params: Promise.resolve(params) },
      ]);

      expect(result instanceof Response, `${policy} did not return an HTTP response`).toBe(true);
      if (!(result instanceof Response)) continue;
      expect(
        deniedRole ? 403 : 401,
        `${policy} should reject ${deniedRole ?? 'an unauthenticated request'}`,
      ).toBe(result.status);
    }
  }, 60000);
});
