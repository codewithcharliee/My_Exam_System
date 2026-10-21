export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { requireRouteAuthorization } from '@/lib/roles';

export async function GET() {
  const { error } = await requireRouteAuthorization('GET /api/health');
  if (error) return error;
  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
