import Link from 'next/link';
import { BookOpenCheck, GraduationCap, LogIn, Shield, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a2e5a]">
              <Shield className="h-6 w-6 text-[#d4a017]" />
            </span>
            <span>
              <span className="block font-bold text-[#1a2e5a]">Bingham University</span>
              <span className="block text-xs text-slate-600">Faculty of Law</span>
            </span>
          </Link>
          <Link href="/login" className="text-sm font-semibold text-[#1a2e5a] hover:underline">Sign in</Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-br from-[#1a2e5a] via-[#1a2e5a] to-[#0f1d3d] text-white">
        <div className="absolute -right-24 -top-28 h-96 w-96 rounded-full border-[48px] border-white/5" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:grid-cols-[1.2fr_0.8fr] md:items-center md:py-28">
          <div>
            <p className="mb-5 text-sm font-semibold uppercase tracking-[0.2em] text-[#e5bd55]">Faculty of Law</p>
            <h1 className="max-w-3xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Examination System
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/75">
              A secure platform for students and faculty to prepare for, deliver and manage law examinations.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChild size="lg" className="bg-white text-[#1a2e5a] hover:bg-slate-100">
                <Link href="/login">
                  <LogIn className="mr-2 h-5 w-5" /> Sign in
                </Link>
              </Button>
              <Button asChild size="lg" className="bg-[#d4a017] text-[#1a2e5a] hover:bg-[#e2b43b]">
                <Link href="/login/student">
                  <GraduationCap className="mr-2 h-5 w-5" /> Student Portal
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-white/40 bg-white/5 text-white hover:bg-white/15 hover:text-white">
                <Link href="/login/admin">
                  <Shield className="mr-2 h-5 w-5" /> Admin Portal
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="border-[#e5bd55]/60 bg-transparent text-[#e5bd55] hover:bg-[#e5bd55]/10 hover:text-[#e5bd55]">
                <Link href="/signup">
                  <Users className="mr-2 h-5 w-5" /> Register
                </Link>
              </Button>
            </div>
            <p className="mt-5 text-sm text-white/60">The Admin Portal is for authorized administrators and staff.</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-7 shadow-2xl backdrop-blur-sm sm:p-9">
            <h2 className="text-lg font-semibold text-white">One platform, dedicated portals</h2>
            <div className="mt-7 space-y-6">
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <GraduationCap className="h-5 w-5 text-[#e5bd55]" />
                </span>
                <div>
                  <h3 className="font-semibold">For students</h3>
                  <p className="mt-1 text-sm leading-6 text-white/70">Check exam readiness, complete assessments and review released results.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Users className="h-5 w-5 text-[#e5bd55]" />
                </span>
                <div>
                  <h3 className="font-semibold">For faculty and staff</h3>
                  <p className="mt-1 text-sm leading-6 text-white/70">Manage courses, question banks, assessments, grading and exam operations.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <BookOpenCheck className="h-5 w-5 text-[#e5bd55]" />
                </span>
                <div>
                  <h3 className="font-semibold">Secure by role</h3>
                  <p className="mt-1 text-sm leading-6 text-white/70">Portal and dashboard access is checked against each account’s assigned role.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
