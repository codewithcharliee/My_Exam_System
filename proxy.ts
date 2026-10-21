import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

export const proxy = auth(() => NextResponse.next());

export const config = {
  matcher: ['/dashboard/:path*', '/exam/:path*'],
};
