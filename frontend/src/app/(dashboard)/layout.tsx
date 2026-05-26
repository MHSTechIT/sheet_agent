'use client';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { RefreshCw, LogOut, Plus, Sparkles } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="min-h-screen flex items-center justify-center text-lavender-700">
        Loading…
      </div>
    );
  }

  const isActive = (p: string) => (p === '/' ? pathname === '/' : pathname?.startsWith(p));
  const userInitial = (session?.user?.email ?? 'A').slice(0, 1).toUpperCase();

  return (
    <div className="min-h-screen p-4 md:p-6">
      <div className="shell max-w-6xl mx-auto p-6 md:p-8 overflow-hidden">
        {/* Top bar — brand · tabs · actions · avatar */}
        <header className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="grid place-items-center size-9 rounded-2xl bg-gradient-to-br from-coral-400 to-coral-600 text-white shadow-tile">
              <Sparkles className="size-5" />
            </div>
            <span className="font-semibold tracking-tight">Sheet Agent</span>
          </Link>

          <nav className="flex items-center gap-1.5 flex-wrap">
            <Link href="/" className={isActive('/') ? 'pill-tab-active' : 'pill-tab'}>
              Dashboard
            </Link>
            <Link href="/settings" className={isActive('/settings') ? 'pill-tab-active' : 'pill-tab'}>
              Settings
            </Link>
            <span className="pill-tab opacity-50 cursor-not-allowed" title="Coming soon">Leads</span>
            <span className="pill-tab opacity-50 cursor-not-allowed" title="Coming soon">Logs</span>
          </nav>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('flow:create'))}
              className="pill-ghost gap-1.5"
              title="New automation"
            >
              <Plus className="size-4" />
              <span className="hidden sm:inline">New automation</span>
            </button>
            <button
              onClick={() => router.refresh()}
              className="pill-ghost !px-2.5"
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw className="size-4" />
            </button>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="pill-ghost !px-2.5"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut className="size-4" />
            </button>
            <div
              className="grid place-items-center size-9 rounded-full bg-gradient-to-br from-coral-400 to-coral-600 text-white text-sm font-semibold shadow-tile ml-1"
              title={session?.user?.email ?? undefined}
            >
              {userInitial}
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="min-h-[560px]">{children}</main>
      </div>

      {/* Floating action button */}
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('flow:create'))}
        className="fab"
        title="New automation"
        aria-label="New automation"
      >
        <Sparkles className="size-6" />
      </button>
    </div>
  );
}
