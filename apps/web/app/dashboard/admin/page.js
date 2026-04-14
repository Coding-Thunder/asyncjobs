'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [err, setErr] = useState('');
  const [updating, setUpdating] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/admin/users');
      setUsers(data.users || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function togglePlan(userId, currentPlan) {
    const newPlan = currentPlan === 'pro' ? 'free' : 'pro';
    setUpdating(userId);
    try {
      await apiFetch(`/admin/users/${userId}/plan`, {
        method: 'POST',
        body: JSON.stringify({ plan: newPlan }),
      });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-mono text-lg text-zinc-100">
          <span className="text-emerald-400">$</span> admin <span className="text-zinc-500">--users</span>
        </h1>
        <p className="font-mono text-xs text-zinc-500 mt-1">{users.length} registered users</p>
      </div>

      {err && (
        <div className="font-mono text-sm text-rose-400 border border-rose-500/20 bg-rose-500/5 rounded-md p-3">
          <span className="text-rose-500 font-semibold">[ERROR]</span> {err}
        </div>
      )}

      <div className="term-panel overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-[#161616] border-b border-white/[0.06] select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="flex-1 text-center font-mono text-[11px] text-zinc-500">
            admin@asyncops — users
          </span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_80px_80px_100px_120px_160px] gap-0 px-4 py-2 border-b border-white/[0.04] font-mono text-[11px] text-zinc-600 uppercase tracking-wider">
          <div>email</div>
          <div>role</div>
          <div>plan</div>
          <div>jobs/month</div>
          <div>joined</div>
          <div>actions</div>
        </div>

        <div className="divide-y divide-white/[0.04]">
          {users.map((u) => (
            <div key={u.id} className="grid grid-cols-[1fr_80px_80px_100px_120px_160px] gap-0 px-4 py-2.5 items-center hover:bg-white/[0.02] transition-colors">
              <div className="font-mono text-xs text-zinc-200">{u.email}</div>
              <div>
                <span className={
                  'font-mono text-[11px] px-1.5 py-0.5 rounded border ' +
                  (u.role === 'admin'
                    ? 'border-purple-500/20 bg-purple-500/5 text-purple-400'
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-500')
                }>
                  {u.role}
                </span>
              </div>
              <div>
                <span className={
                  'font-mono text-[11px] px-1.5 py-0.5 rounded border ' +
                  (u.plan === 'pro'
                    ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400'
                    : 'border-white/[0.08] bg-white/[0.02] text-zinc-500')
                }>
                  {u.plan}
                </span>
              </div>
              <div className="font-mono text-xs text-zinc-400 tabular-nums">{u.jobCountMonthly}</div>
              <div className="font-mono text-xs text-zinc-600">
                {new Date(u.createdAt).toLocaleDateString()}
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/dashboard/admin/users/${u.id}/jobs`}
                  className="term-btn-ghost text-[11px]"
                >
                  jobs
                </Link>
                <button
                  onClick={() => togglePlan(u.id, u.plan)}
                  disabled={updating === u.id}
                  className="term-btn text-[11px]"
                >
                  {updating === u.id ? '...' : u.plan === 'pro' ? '$ downgrade' : '$ upgrade'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
