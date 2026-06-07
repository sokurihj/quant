'use client';

import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setError('이메일 또는 비밀번호가 올바르지 않습니다.'); setLoading(false); return; }
    router.push('/');
    router.refresh();
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-xl p-8">
        <h1 className="text-base font-semibold mb-1">Quant</h1>
        <p className="text-xs text-muted-foreground mb-6">레버리지 ETF 계산기</p>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">이메일</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="bg-input border border-border rounded px-3 py-2 text-sm outline-none focus:border-ring" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">비밀번호</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
              className="bg-input border border-border rounded px-3 py-2 text-sm outline-none focus:border-ring" />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button type="submit" disabled={loading}
            className="bg-primary text-primary-foreground py-2.5 rounded text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  );
}
