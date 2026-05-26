import './globals.css';
import type { Metadata } from 'next';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/components/AuthProvider';
import { ErrorReporter } from '@/components/ErrorReporter';

export const metadata: Metadata = {
  title: 'Sheet Agent',
  description: 'Meta Leads → Google Sheets → WATI automation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
        <ErrorReporter />
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
