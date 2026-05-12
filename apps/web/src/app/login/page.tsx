'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

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
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="card p-8 w-full max-w-sm space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">Sheet Agent</h1>
          <p className="text-sm text-lavender-700 mt-1">Enter your password to continue</p>
        </div>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full rounded-pill bg-white border border-lavender-200 px-4 py-2.5 outline-none focus:border-lavender-400"
          required
        />
        <button type="submit" disabled={loading} className="pill-primary w-full">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
