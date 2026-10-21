import { SiteFooter } from '@/components/layouts/site-footer';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SiteFooter />
    </>
  );
}
