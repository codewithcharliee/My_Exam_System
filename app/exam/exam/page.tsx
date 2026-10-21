import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import ExamClient from './exam-client';

export const dynamic = 'force-dynamic';

export default async function ExamPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const { attemptId } = await params;
  return <ExamClient attemptId={attemptId} />;
}
