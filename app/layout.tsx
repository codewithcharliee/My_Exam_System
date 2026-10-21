import { DM_Sans, Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { SiteFooter } from '@/components/layouts/site-footer';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });
const jakartaSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-display', preload: false });
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono', preload: false });

export const metadata = {
  metadataBase: new URL(process.env.NEXTAUTH_URL || 'http://localhost:3000'),
  title: 'Bingham University — Faculty of Law Examination System',
  description: 'Secure online examination platform for Bingham University Faculty of Law',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
  openGraph: {
    title: 'Bingham University — Faculty of Law Examination System',
    description: 'Secure online examination platform for Bingham University Faculty of Law',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${dmSans.variable} ${jakartaSans.variable} ${jetbrainsMono.variable} font-sans`}>
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
