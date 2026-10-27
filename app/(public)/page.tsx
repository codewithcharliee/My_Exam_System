import { BookOpenCheck, GraduationCap, LogIn, Shield, Users } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="./" className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1a2e5a]">
              <Shield className="h-6 w-6 text-[#d4a017]" />
            </span>
            <span>
              <span className="block font-bold text-[#1a2e5a]">Bingham University</span>
              <span className="block text-xs text-slate-600">Faculty of Law</span>
            </span>
          </a>
          <a href="/login" className="text-sm font-semibold text-[#1a2e5a] hover:underline">Sign in</a>
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
              <a href="/login" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-white px-6 text-base font-medium text-[#1a2e5a] transition-all duration-fast hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]">
                <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
              </a>
              <a href="/login/student" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-[#d4a017] px-6 text-base font-medium text-[#1a2e5a] transition-all duration-fast hover:bg-[#e2b43b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]">
                <GraduationCap className="h-4 w-4" aria-hidden="true" /> Student Portal
              </a>
              <a href="/login/admin" className="inline-flex h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-white/40 bg-white/5 px-6 text-base font-medium text-white transition-all duration-fast hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]">
                <Shield className="h-4 w-4" aria-hidden="true" /> Admin Portal
              </a>
            </div>
            <p className="mt-5 text-sm text-white/60">Profiles are created by authorized university staff. The Admin Portal is for authorized administrators and staff.</p>
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
