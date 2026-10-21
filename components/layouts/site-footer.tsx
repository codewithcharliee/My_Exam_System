import { COPYRIGHT_NOTICE, SYSTEM_NAME, SYSTEM_VERSION, UNIVERSITY_NAME } from '@/lib/system-info';

const footerLinks = [
  { href: '/privacy-policy', label: 'Privacy Policy' },
  { href: '/terms-of-use', label: 'Terms of Use' },
  { href: '/support', label: 'Support' },
];

export function SiteFooter({ compact = false }: { compact?: boolean }) {
  return (
    <footer className={`border-t border-border bg-muted/40 ${compact ? 'px-3 py-1' : 'px-4 py-4 sm:px-6 lg:px-8'}`} aria-label="Site information">
      {compact ? (
        <div className="mx-auto max-w-7xl text-[10px] leading-[11px] text-muted-foreground">
          <p>{COPYRIGHT_NOTICE}</p>
          <p>{SYSTEM_NAME}</p>
        </div>
      ) : (
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="font-medium text-foreground">{UNIVERSITY_NAME}</p>
            <p className="text-muted-foreground">{SYSTEM_NAME}</p>
            <p className="text-muted-foreground">{COPYRIGHT_NOTICE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <nav aria-label="Footer navigation" className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {footerLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <p className="text-muted-foreground">Version {SYSTEM_VERSION}</p>
          </div>
        </div>
      )}
    </footer>
  );
}