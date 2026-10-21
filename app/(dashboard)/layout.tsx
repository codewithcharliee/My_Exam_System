import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/shell';
import { Providers } from '@/components/providers';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect('/login');
  }

  return (
    <Providers>
      <DashboardShell user={session.user}>{children}</DashboardShell>
    </Providers>
  );
}
