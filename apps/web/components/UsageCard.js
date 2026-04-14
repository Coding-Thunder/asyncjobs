'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../lib/api';

export default function UsageCard() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [justUpgraded, setJustUpgraded] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/me');
      setUsage(data);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  async function handleUpgrade() {
    setUpgrading(true);
    try {
      const updated = await apiFetch('/upgrade', { method: 'POST' });
      setUsage((prev) => ({ ...(prev || {}), ...updated }));
      setJustUpgraded(true);
      setTimeout(() => setJustUpgraded(false), 3000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setUpgrading(false);
    }
  }

  if (loading || !usage) {
    return (
      <div className="term-panel px-5 py-4 font-mono text-xs text-zinc-500">
        <span className="text-emerald-400">$</span> usage --fetch<span className="term-cursor" />
      </div>
    );
  }

  if (err) return null;

  const used = usage.jobCountMonthly || 0;
  const limit = usage.limit || 1;
  const pct = Math.min(100, (used / limit) * 100);
  const remaining = Math.max(0, limit - used);
  const usageRatio = used / limit;
  const isPro = usage.plan === 'pro';
  const high = !isPro && usageRatio > 0.8;
  const critical = !isPro && usageRatio > 0.95;

  const barColor = critical
    ? 'bg-rose-500/80'
    : high
    ? 'bg-amber-500/80'
    : isPro
    ? 'bg-emerald-400/70'
    : 'bg-emerald-500/60';

  const ringGlow = critical
    ? 'shadow-[0_0_60px_-20px_rgba(244,63,94,0.4)] border-rose-500/30'
    : high
    ? 'shadow-[0_0_60px_-20px_rgba(245,158,11,0.35)] border-amber-500/25'
    : isPro
    ? 'shadow-[0_0_50px_-18px_rgba(34,197,94,0.4)] border-emerald-500/25'
    : 'border-white/[0.08]';

  return (
    <div
      className={
        'rounded-xl p-5 bg-[#0b0b0b] border transition-all duration-300 ' + ringGlow
      }
    >
      <div className="flex items-start justify-between gap-6 flex-wrap">
        {/* Left: usage numbers + bar */}
        <div className="flex-1 min-w-[260px]">
          <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 uppercase tracking-wider">
            <span className="text-emerald-400">$</span>
            usage --plan={usage.plan}
            {isPro && (
              <span className="ml-2 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px]">
                PRO
              </span>
            )}
            {justUpgraded && (
              <span className="ml-2 text-emerald-400 animate-pulse">✓ upgraded</span>
            )}
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold text-zinc-100 tabular-nums">
              {used.toLocaleString()}
            </span>
            <span className="font-mono text-sm text-zinc-600">/</span>
            <span className="font-mono text-sm text-zinc-400 tabular-nums">
              {limit.toLocaleString()}
            </span>
            <span className="font-mono text-xs text-zinc-500 ml-1">jobs this month</span>
          </div>

          <div className="mt-3 h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
            <div
              className={'h-full rounded-full transition-all duration-700 ease-out ' + barColor}
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between font-mono text-[11px]">
            <span className="text-zinc-500">
              {remaining.toLocaleString()} remaining · {Math.round(pct)}% used
            </span>
            {critical && (
              <span className="text-rose-400">[CRIT] limit imminent</span>
            )}
            {!critical && high && (
              <span className="text-amber-400">[WARN] approaching limit</span>
            )}
          </div>
        </div>

        {/* Right: plan action */}
        <div className="flex flex-col items-end gap-2 min-w-[200px]">
          {isPro ? (
            <>
              <div className="font-mono text-[11px] text-emerald-400/80 uppercase tracking-wider">
                pro plan
              </div>
              <div className="font-mono text-[11px] text-zinc-500 text-right max-w-[220px]">
                50,000 jobs / month · resets on the 1st (UTC)
              </div>
              <Link
                href="/dashboard/jobs"
                className="term-btn-ghost text-xs mt-1"
              >
                $ view jobs
              </Link>
            </>
          ) : (
            <>
              <div className="font-mono text-[11px] text-zinc-500 uppercase tracking-wider">
                need more headroom?
              </div>
              <div className="font-mono text-[11px] text-zinc-500 text-right max-w-[240px] leading-relaxed">
                Pro bumps your monthly cap from<br />
                1,000 to 50,000 jobs. Same features.
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Link
                  href="/pricing"
                  className="term-btn-ghost text-xs"
                >
                  $ compare
                </Link>
                <button
                  onClick={handleUpgrade}
                  disabled={upgrading}
                  className={
                    'inline-flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-xs font-semibold transition-all duration-200 ' +
                    (critical || high
                      ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300 shadow-[0_0_30px_-8px_rgba(245,158,11,0.6)]'
                      : 'bg-white text-zinc-900 hover:bg-zinc-100 shadow-[0_0_30px_-10px_rgba(255,255,255,0.4)]') +
                    ' disabled:opacity-50'
                  }
                >
                  {upgrading ? 'upgrading…' : '$ upgrade --pro'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
