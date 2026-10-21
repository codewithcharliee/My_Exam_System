'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  Shield, LayoutDashboard, Users, BookOpen, FileText, ClipboardList,
  Eye, BarChart3, ScrollText, Settings, LogOut, Menu, X,
  GraduationCap, Brain, CheckCircle, Monitor, ChevronDown
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  roles: string[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: <LayoutDashboard className="h-4 w-4" />, roles: ['admin', 'exam_officer', 'lecturer', 'invigilator', 'candidate'] },
  { label: 'Users', href: '/dashboard/users', icon: <Users className="h-4 w-4" />, roles: ['admin'] },
  { label: 'Courses', href: '/dashboard/courses', icon: <BookOpen className="h-4 w-4" />, roles: ['admin', 'lecturer'] },
  { label: 'Question Bank', href: '/dashboard/questions', icon: <FileText className="h-4 w-4" />, roles: ['lecturer'] },
  { label: 'Assessments', href: '/dashboard/assessments', icon: <ClipboardList className="h-4 w-4" />, roles: ['admin', 'lecturer', 'exam_officer'] },
  { label: 'My Exams', href: '/dashboard/my-exams', icon: <GraduationCap className="h-4 w-4" />, roles: ['candidate'] },
  { label: 'Readiness Check', href: '/dashboard/readiness', icon: <CheckCircle className="h-4 w-4" />, roles: ['candidate'] },
  { label: 'Grading', href: '/dashboard/grading', icon: <ClipboardList className="h-4 w-4" />, roles: ['lecturer'] },
  { label: 'Monitoring', href: '/dashboard/monitoring', icon: <Monitor className="h-4 w-4" />, roles: ['admin', 'invigilator'] },
  { label: 'Reports', href: '/dashboard/reports', icon: <BarChart3 className="h-4 w-4" />, roles: ['admin', 'exam_officer', 'lecturer'] },
  { label: 'Audit Trail', href: '/dashboard/audit', icon: <ScrollText className="h-4 w-4" />, roles: ['admin', 'exam_officer'] },
  { label: 'AI Tools', href: '/dashboard/ai-tools', icon: <Brain className="h-4 w-4" />, roles: ['lecturer'] },
  { label: 'Admin Controls', href: '/dashboard/admin', icon: <Settings className="h-4 w-4" />, roles: ['admin'] },
  { label: 'My Results', href: '/dashboard/my-results', icon: <BarChart3 className="h-4 w-4" />, roles: ['candidate'] },
];

const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  exam_officer: 'Exam Officer',
  lecturer: 'Lecturer',
  invigilator: 'Invigilator',
  candidate: 'Candidate',
};

export function DashboardShell({ user, children }: { user: any; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const role = user?.role ?? 'candidate';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key !== 'Backspace' ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]'))
      ) {
        return;
      }

      event.preventDefault();
      router.replace('/login');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  const filteredNav = navItems.filter((item) => item.roles.includes(role));

  return (
    <div className="min-h-screen flex bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        id="dashboard-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-[#1a2e5a] text-white transform transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 border-b border-white/10 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#d4a017]/20 flex items-center justify-center">
                <Shield className="h-5 w-5 text-[#d4a017]" />
              </div>
              <div className="min-w-0">
                <h2 className="font-display font-bold text-sm">Bingham University</h2>
                <p className="text-xs text-white/60">Faculty of Law</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto text-white hover:bg-white/10 hover:text-white lg:hidden"
              aria-label="Close navigation menu"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {filteredNav.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-white/15 text-[#d4a017] font-medium'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-white/10">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-[#d4a017]/30 flex items-center justify-center text-xs font-bold text-[#d4a017]">
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name ?? 'User'}</p>
                <p className="text-xs text-white/50">{roleLabels[role] ?? role}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-white/70 hover:text-white hover:bg-white/10"
              onClick={() => signOut({ redirectTo: '/login' })}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation menu"
            aria-controls="dashboard-sidebar"
            aria-expanded={sidebarOpen}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="hidden sm:inline">{user?.email ?? ''}</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#1a2e5a]/10 text-[#1a2e5a]">
              {roleLabels[role] ?? role}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
