'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getToken, getUser, clearAuth, apiFetch, isAdmin } from '../../lib/api';
import { LogoWordmark } from '../../components/Logo';

export default function DashboardLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [usage, setUsage] = useState(null);

  const loadUsage = useCallback(async () => {
    try {
      const data = await apiFetch('/me');
      setUsage(data);
    } catch {
      // ignore — header will just hide the meter
    }
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    setUser(getUser());
    setReady(true);
    loadUsage();
  }, [router, loadUsage]);

  function logout() {
    clearAuth();
    router.replace('/login');
  }

  async function handleUpgrade() {
    try {
      await apiFetch('/upgrade', { method: 'POST' });
      await loadUsage();
    } catch {
      // ignore
    }
  }

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#0a0a0b] flex items-center justify-center font-mono text-zinc-500">
        <span className="text-emerald-400">$</span>&nbsp;loading...
        <span className="term-cursor" />
      </div>
    );
  }

  const navItems = [
    { href: '/dashboard/jobs', label: 'jobs', icon: '▦' },
    { href: '/dashboard/keys', label: 'api-keys', icon: '⚿' },
    { href: '/dashboard/docs', label: 'docs', icon: '✎' },
  ];

  if (usage?.role === 'admin') {
    navItems.push({ href: '/dashboard/admin', label: 'admin', icon: '⛨' });
  }

  const usagePct = usage ? Math.min(100, (usage.jobCountMonthly / usage.limit) * 100) : 0;
  const usageHigh = usage && usage.jobCountMonthly / usage.limit > 0.8;

  return (
    <div className="min-h-screen flex bg-[#0a0a0b]">
      {/* Sidebar */}
      <aside className="w-56 border-r border-white/[0.06] flex flex-col bg-[#0a0a0b]">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-white/[0.06]">
          <Link href="/" className="flex items-center gap-2">
            <LogoWordmark iconSize={22} className="[&_span]:text-zinc-100" />
            <span
              title="The SDK and worker runtime are Node.js only. More languages coming soon."
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-emerald-500/25 bg-emerald-500/[0.08] font-mono text-[9px] uppercase tracking-wide text-emerald-300"
            >
              <span className="h-1 w-1 rounded-full bg-emerald-400" />
              node.js sdk
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 font-mono text-sm">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'flex items-center gap-2.5 px-3 py-2 rounded-md transition-all duration-200 ' +
                  (active
                    ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 shadow-[0_0_12px_-4px_rgba(52,211,153,0.3)]'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent')
                }
              >
                <span className="text-base leading-none w-4 text-center opacity-70">{item.icon}</span>
                <span>{active ? '> ' : '  '}{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Usage */}
        {usage && (
          <div className="m-3 p-3 rounded-lg border border-white/[0.08] bg-white/[0.02]">
            <div className="font-mono text-[11px] text-zinc-500 mb-2">
              <span className="text-emerald-400">$</span> usage --plan={usage.plan}
            </div>
            <div className="font-mono text-sm text-zinc-300 mb-2">
              {usage.jobCountMonthly.toLocaleString()}{' '}
              <span className="text-zinc-600">/</span>{' '}
              {usage.limit.toLocaleString()}{' '}
              <span className="text-zinc-500">jobs</span>
            </div>
            <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
              <div
                className={
                  'h-full rounded-full transition-all duration-500 ' +
                  (usageHigh ? 'bg-amber-500/80' : 'bg-emerald-500/60')
                }
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {usageHigh && (
              <p className="mt-1.5 text-[11px] text-amber-400 font-mono">
                [WARN] approaching limit
              </p>
            )}
            {usage.plan === 'free' && (
              <button
                onClick={handleUpgrade}
                className="term-btn mt-2.5 w-full justify-center text-xs"
              >
                <span>$</span> upgrade --pro
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="border-b border-white/[0.06] px-6 py-2.5 flex items-center justify-end gap-4 bg-[#0a0a0b]/80 backdrop-blur-sm">
          <span className="font-mono text-xs text-zinc-500">
            <span className="text-emerald-400/60">session</span>@{user?.email}
          </span>
          <button
            onClick={logout}
            className="font-mono text-xs px-3 py-1.5 rounded-md border border-white/[0.08] text-zinc-500 hover:text-zinc-200 hover:border-white/[0.15] hover:bg-white/[0.04] transition-all"
          >
            $ logout
          </button>
        </header>

        {/* Content */}
        <main className="flex-1 p-6 relative">
          <div className="absolute inset-0 bg-grid radial-fade pointer-events-none opacity-30" />
          <div className="relative">{children}</div>
        </main>
      </div>
    </div>
  );
}
