import Link from 'next/link';
import { ArrowRight, BookOpenCheck, BookOpen, ClipboardList, GraduationCap, Monitor, Shield } from 'lucide-react';

const rolePortals = [
  {
    href: '/login/student',
    title: 'Student Portal',
    description: 'Examinations, readiness checks, practice and results.',
    icon: GraduationCap,
    accent: 'bg-[#fff6dd] text-[#a47708]',
  },
  {
    href: '/login/admin',
    title: 'Admin Portal',
    description: 'User accounts, system settings and administration.',
    icon: Shield,
    accent: 'bg-[#eef2fa] text-[#1a2e5a]',
  },
  {
    href: '/login/exam-officer',
    title: 'Exam Officer Portal',
    description: 'Assessment scheduling, examination reports and audit records.',
    icon: ClipboardList,
    accent: 'bg-[#eef2fa] text-[#1a2e5a]',
  },
  {
    href: '/login/lecturer',
    title: 'Lecturer Portal',
    description: 'Courses, question banks, grading and teaching tools.',
    icon: BookOpen,
    accent: 'bg-[#eef2fa] text-[#1a2e5a]',
  },
  {
    href: '/login/invigilator',
    title: 'Invigilator Portal',
    description: 'Exam monitoring and candidate session review.',
    icon: Monitor,
    accent: 'bg-[#eef2fa] text-[#1a2e5a]',
  },
];

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-[#f5f7fb] text-slate-900">
      <div className="pointer-events-none absolute -right-40 -top-48 h-[32rem] w-[32rem] rounded-full bg-[#d4a017]/10 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-56 -left-40 h-[32rem] w-[32rem] rounded-full bg-[#1a2e5a]/[0.06] blur-3xl" aria-hidden="true" />

      <header className="relative border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a017]">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#1a2e5a] shadow-sm">
              <Shield className="h-5 w-5 text-[#e1b33c]" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-tight text-[#1a2e5a] sm:text-base">Bingham University</span>
              <span className="block text-xs text-slate-500">Faculty of Law</span>
            </span>
          </Link>
          <Link href="/" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-[#1a2e5a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a017]">
            Back to home
          </Link>
        </div>
      </header>

      <section className="relative mx-auto flex w-full max-w-7xl flex-1 items-center px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto w-full max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#d4a017]/25 bg-[#d4a017]/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#765509]">
              <BookOpenCheck className="h-3.5 w-3.5" />
              Examination System
            </span>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-[#1a2e5a] sm:text-4xl lg:text-5xl">
              Welcome back
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              Choose the secure portal assigned to your account to continue.
            </p>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 md:mt-12 lg:grid-cols-3">
            {rolePortals.map(({ href, title, description, icon: Icon, accent }) => (
              <Link
                key={href}
                href={href}
                className="group flex min-h-52 flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_12px_32px_-20px_rgba(15,29,61,0.35)] transition duration-200 hover:-translate-y-1 hover:border-[#d4a017]/60 hover:shadow-[0_20px_40px_-20px_rgba(15,29,61,0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a017] focus-visible:ring-offset-2"
              >
                <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${accent}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-lg font-bold text-[#1a2e5a]">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-[#1a2e5a]">
                  Sign in
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-4 rounded-xl border border-slate-200/80 bg-white/70 px-5 py-4 text-center sm:flex-row sm:text-left">
            <div>
              <p className="text-sm font-semibold text-[#1a2e5a]">New student?</p>
              <p className="mt-0.5 text-sm text-slate-600">Create your account to get started.</p>
            </div>
            <Link href="/signup" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-[#1a2e5a] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#243e73] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4a017] focus-visible:ring-offset-2">
              Register
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

    </main>
  );
}
