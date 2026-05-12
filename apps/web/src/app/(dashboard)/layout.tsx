'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { RefreshCw, LogOut, Plus } from 'lucide-react';
import { cn } from '@/lib/cn';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return <div className="min-h-screen flex items-center justify-center text-lavender-700">Loading…</div>;
  }

  const isActive = (p: string) => (p === '/' ? pathname === '/' : pathname?.startsWith(p));

  return (
    <div className="min-h-screen">
      <header className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <nav className="heading-pill !p-1 flex items-center gap-1">
            <Link
              href="/"
              className={cn(
                isActive('/')
                  ? 'pill-primary !px-4 !py-1.5'
                  : 'pill px-4 py-1.5 text-lavender-900 hover:bg-lavender-100',
              )}
            >
              Automations
            </Link>
            <Link
              href="/settings"
              className={cn(
                isActive('/settings')
                  ? 'pill-primary !px-4 !py-1.5'
                  : 'pill px-4 py-1.5 text-lavender-900 hover:bg-lavender-100',
              )}
            >
              Settings
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-1.5">
          {isActive('/') && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('flow:create'))}
              className="pill-ghost gap-1.5"
              title="Create a new automation"
            >
              <Plus className="size-3.5" />
              Create
            </button>
          )}
          {isActive('/settings') && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('settings:validate'))}
              className="pill-ghost gap-1.5"
              title="Re-check Meta / Google / WATI credentials"
            >
              <RefreshCw className="size-3.5" />
              Validate
            </button>
          )}
          <button
            onClick={() => router.refresh()}
            className="pill-ghost gap-1.5"
            title="Refresh"
          >
            <RefreshCw className="size-3.5" />
            Refresh
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="pill-ghost gap-1.5">
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 pb-16">{children}</main>
    </div>
  );
}
