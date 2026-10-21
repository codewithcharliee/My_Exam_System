import type { NextAuthConfig } from 'next-auth';
import { createAuditEvent } from '@/lib/audit';
import {
  canAccessDashboardPath,
  dashboardPathForRole,
  isUserRole,
} from './lib/role-access';

export const authConfig = {
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const role = (user as typeof user & { role?: unknown }).role;
        token.id = user.id;
        if (isUserRole(role)) token.role = role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && isUserRole(token.role)) {
        session.user.id = token.id as string;
        (session.user as typeof session.user & { role: string }).role = token.role;
      }
      return session;
    },
    async authorized({ auth, request }) {
      const pathname = request.nextUrl.pathname;
      const isDashboardRoute = pathname.startsWith('/dashboard');
      const isExamRoute = pathname.startsWith('/exam/');

      if (!isDashboardRoute && !isExamRoute) return true;

      const loginUrl = new URL('/login', request.url);
      if (!auth?.user) {
        await createAuditEvent({
          actorId: null,
          actionType: 'authorization_denied',
          entityType: 'page',
          metadata: { action: pathname, outcome: 'denied', reason: 'unauthenticated' },
        });
        loginUrl.searchParams.set('callbackUrl', `${pathname}${request.nextUrl.search}`);
        return Response.redirect(loginUrl);
      }

      const role = (auth.user as typeof auth.user & { role?: unknown }).role;
      if (!isUserRole(role)) {
        await createAuditEvent({
          actorId: auth.user.id ?? null,
          actionType: 'authorization_denied',
          entityType: 'page',
          metadata: { action: pathname, outcome: 'denied', reason: 'invalid_role' },
        });
        return Response.redirect(loginUrl);
      }

      if (isExamRoute) {
        if (role === 'candidate') return true;
        await createAuditEvent({
          actorId: auth.user.id ?? null,
          actionType: 'authorization_denied',
          entityType: 'page',
          metadata: { action: pathname, outcome: 'denied', role, reason: 'candidate_only' },
        });
        return Response.redirect(new URL(dashboardPathForRole(role), request.url));
      }

      if (!canAccessDashboardPath(role, pathname)) {
        await createAuditEvent({
          actorId: auth.user.id ?? null,
          actionType: 'authorization_denied',
          entityType: 'page',
          metadata: { action: pathname, outcome: 'denied', role, reason: 'role_not_allowed' },
        });
        return Response.redirect(new URL(dashboardPathForRole(role), request.url));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
