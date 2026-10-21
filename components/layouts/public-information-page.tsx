import Link from 'next/link';

export function PublicInformationPage({
  title,
  summary,
  children,
}: {
  title: string;
  summary: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 md:py-12">
      <div className="mb-8 flex items-center justify-between gap-4 border-b border-border pb-5">
        <Link href="/" className="rounded-sm text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Bingham University · Faculty of Law
        </Link>
        <Link href="/login" className="rounded-sm text-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          Sign in
        </Link>
      </div>
      <header className="max-w-3xl">
        <p className="text-sm font-semibold text-primary">Faculty of Law Online Examination System</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">{summary}</p>
      </header>
      <article className="mt-8 max-w-3xl space-y-6 text-sm leading-7 text-foreground sm:text-base">
        {children}
      </article>
    </main>
  );
}