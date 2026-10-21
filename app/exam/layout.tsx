import { SiteFooter } from '@/components/layouts/site-footer';

export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <SiteFooter compact />
    </>
  );
}
