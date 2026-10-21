'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import {
  Users, BookOpen, ClipboardList, GraduationCap, BarChart3,
  FileText, Monitor, Brain, Shield, CheckCircle, ScrollText, Loader2
} from 'lucide-react';

const roleCards: Record<string, Array<{ title: string; desc: string; href: string; icon: React.ReactNode; color: string }>> = {
  admin: [
    { title: 'User Management', desc: 'Create, edit, and manage users across all roles', href: '/dashboard/users', icon: <Users className="h-6 w-6" />, color: 'bg-blue-500/10 text-blue-600' },
    { title: 'Course Management', desc: 'Manage courses and lecturer assignments', href: '/dashboard/courses', icon: <BookOpen className="h-6 w-6" />, color: 'bg-emerald-500/10 text-emerald-600' },
    { title: 'Assessments', desc: 'Oversee all examination assessments', href: '/dashboard/assessments', icon: <ClipboardList className="h-6 w-6" />, color: 'bg-amber-500/10 text-amber-600' },
    { title: 'Live Monitoring', desc: 'Monitor active examination sessions', href: '/dashboard/monitoring', icon: <Monitor className="h-6 w-6" />, color: 'bg-red-500/10 text-red-600' },
    { title: 'Reports & Analytics', desc: 'View examination results and statistics', href: '/dashboard/reports', icon: <BarChart3 className="h-6 w-6" />, color: 'bg-purple-500/10 text-purple-600' },
    { title: 'Audit Trail', desc: 'Review all system activity logs', href: '/dashboard/audit', icon: <ScrollText className="h-6 w-6" />, color: 'bg-slate-500/10 text-slate-600' },
  ],
  exam_officer: [
    { title: 'Assessments', desc: 'View all examination assessments', href: '/dashboard/assessments', icon: <ClipboardList className="h-6 w-6" />, color: 'bg-amber-500/10 text-amber-600' },
    { title: 'Reports & Analytics', desc: 'Faculty-wide examination reports', href: '/dashboard/reports', icon: <BarChart3 className="h-6 w-6" />, color: 'bg-purple-500/10 text-purple-600' },
    { title: 'Audit Trail', desc: 'Review system activity logs', href: '/dashboard/audit', icon: <ScrollText className="h-6 w-6" />, color: 'bg-slate-500/10 text-slate-600' },
  ],
  lecturer: [
    { title: 'Question Bank', desc: 'Create and manage exam questions', href: '/dashboard/questions', icon: <FileText className="h-6 w-6" />, color: 'bg-blue-500/10 text-blue-600' },
    { title: 'Assessments', desc: 'Configure and publish examinations', href: '/dashboard/assessments', icon: <ClipboardList className="h-6 w-6" />, color: 'bg-amber-500/10 text-amber-600' },
    { title: 'Grading', desc: 'Grade submitted examination scripts', href: '/dashboard/grading', icon: <ClipboardList className="h-6 w-6" />, color: 'bg-emerald-500/10 text-emerald-600' },
    { title: 'AI Tools', desc: 'AI-powered question generation and assessment', href: '/dashboard/ai-tools', icon: <Brain className="h-6 w-6" />, color: 'bg-purple-500/10 text-purple-600' },
    { title: 'Reports', desc: 'View assessment results and analytics', href: '/dashboard/reports', icon: <BarChart3 className="h-6 w-6" />, color: 'bg-red-500/10 text-red-600' },
  ],
  invigilator: [
    { title: 'Live Monitoring', desc: 'Supervise active examination sessions', href: '/dashboard/monitoring', icon: <Monitor className="h-6 w-6" />, color: 'bg-red-500/10 text-red-600' },
  ],
  candidate: [
    { title: 'My Examinations', desc: 'View and take available examinations', href: '/dashboard/my-exams', icon: <GraduationCap className="h-6 w-6" />, color: 'bg-blue-500/10 text-blue-600' },
    { title: 'Readiness Check', desc: 'Test your browser before an examination', href: '/dashboard/readiness', icon: <CheckCircle className="h-6 w-6" />, color: 'bg-emerald-500/10 text-emerald-600' },
    { title: 'Practice Mode', desc: 'Run non-official practice assessments', href: '/dashboard/practice', icon: <FileText className="h-6 w-6" />, color: 'bg-amber-500/10 text-amber-600' },
    { title: 'My Results', desc: 'View released examination results', href: '/dashboard/my-results', icon: <BarChart3 className="h-6 w-6" />, color: 'bg-purple-500/10 text-purple-600' },
  ],
};

export function DashboardContent({ user }: { user: any }) {
  const role = user?.role ?? 'candidate';
  const cards = roleCards[role] ?? [];
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (['admin', 'exam_officer', 'lecturer'].includes(role)) {
      fetch('/api/reports')
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {})
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [role]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-bold tracking-tight">Welcome back, {user?.name?.split(' ')?.[0] ?? 'User'}</h1>
        <p className="text-muted-foreground mt-1">Bingham University — Faculty of Law Examination System</p>
      </div>

      {stats && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-mono">{stats?.totalAssessments ?? 0}</div>
              <p className="text-sm text-muted-foreground">Assessments</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-mono">{stats?.submittedAttempts ?? 0}</div>
              <p className="text-sm text-muted-foreground">Submissions</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-mono">{stats?.totalUsers ?? 0}</div>
              <p className="text-sm text-muted-foreground">Users</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold font-mono">{stats?.totalQuestions ?? 0}</div>
              <p className="text-sm text-muted-foreground">Questions</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.href} href={card.href}>
            <Card className="hover:shadow-lg transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-3">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${card.color}`}>
                  {card.icon}
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-lg mb-1">{card.title}</CardTitle>
                <CardDescription>{card.desc}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
