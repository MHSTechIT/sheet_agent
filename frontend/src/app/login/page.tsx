'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const r = await signIn('credentials', { password, redirect: false });
    setLoading(false);
    if (r?.ok) {
      router.push('/');
    } else {
      toast.error('Wrong password');
    }
  }

  return (
    <div className="min-h-screen p-4 md:p-6 flex items-center justify-center">
      <div className="shell w-full max-w-md p-8">
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center size-10 rounded-2xl bg-gradient-to-br from-coral-400 to-coral-600 text-white shadow-tile">
              <Sparkles className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Sheet Agent</h1>
              <p className="text-xs text-lavender-700">Sign in to continue</p>
            </div>
          </div>

          <label className="block">
            <span className="text-xs font-medium text-lavender-700">Password</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              className="mt-1.5 w-full rounded-pill bg-lavender-50 border border-lavender-100 px-4 py-2.5 outline-none focus:border-coral-300 placeholder:text-lavender-400"
              required
            />
          </label>

          <button type="submit" disabled={loading} className="pill-primary w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
