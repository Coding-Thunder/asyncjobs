'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiFetch } from '../../../lib/api';
import StatusBadge from '../../../components/StatusBadge';
import UsageCard from '../../../components/UsageCard';

const STATUS_ORDER = ['failed', 'processing', 'pending', 'completed'];
const STATUS_LABEL = {
  pending: 'pending',
  processing: 'processing',
  completed: 'completed',
  failed: 'failed',
};
const STALE_PENDING_MS = 15_000;
const STATUS_COLOR = {
  pending: 'text-zinc-400',
  processing: 'text-sky-400',
  completed: 'text-emerald-400',
  failed: 'text-rose-400',
};
const STATUS_DOT = {
  pending: 'bg-zinc-400',
  processing: 'bg-sky-400 animate-pulse',
  completed: 'bg-emerald-400',
  failed: 'bg-rose-400',
};

export default function JobsPage() {
  const [jobs, setJobs] = useState([]);
  const [err, setErr] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [lastSynced, setLastSynced] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch('/jobs');
      setJobs(data.jobs || []);
      setLastSynced(new Date());
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [load]);

  const counts = useMemo(() => {
    const c = { pending: 0, processing: 0, completed: 0, failed: 0 };
    jobs.forEach((j) => { if (c[j.status] != null) c[j.status] += 1; });
    return c;
  }, [jobs]);

  // A job that has been pending longer than STALE_PENDING_MS almost always
  // means there is no worker registered for its type. AsyncOps only
  // orchestrates — it never runs handlers — so pending jobs need a worker
  // polling /jobs/next to move forward.
  const stalePendingTypes = useMemo(() => {
    const now = Date.now();
    const types = new Set();
    jobs.forEach((j) => {
      if (j.status !== 'pending') return;
      const createdAt = new Date(j.createdAt).getTime();
      if (!Number.isFinite(createdAt)) return;
      if (now - createdAt >= STALE_PENDING_MS) types.add(j.type);
    });
    return Array.from(types);
  }, [jobs, lastSynced]);

  const types = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.type))).sort(),
    [jobs]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return jobs.filter((j) => {
      if (statusFilter !== 'all' && j.status !== statusFilter) return false;
      if (typeFilter !== 'all' && j.type !== typeFilter) return false;
      if (q && !j.id.toLowerCase().includes(q) && !j.type.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [jobs, statusFilter, typeFilter, search]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((j) => selected.has(j.id));

  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allVisibleSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map((j) => j.id)));
  }

  async function bulkRetry() {
    setBulkBusy(true);
    try {
      const ids = Array.from(selected);
      for (const id of ids) {
        await apiFetch(`/jobs/${id}/retry`, { method: 'POST' });
      }
      setSelected(new Set());
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <UsageCard />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-mono text-lg text-zinc-100">
            <span className="text-emerald-400">$</span> jobs <span className="text-zinc-500">--view=all</span>
          </h1>
          <p className="font-mono text-xs text-zinc-500 mt-1">
            {lastSynced ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                live — synced {timeAgo(lastSynced)}
              </span>
            ) : (
              'connecting…'
            )}
          </p>
        </div>
        <Link href="/dashboard/docs" className="term-btn text-xs">
          $ how to create jobs
        </Link>
      </div>

      {/* Status strip */}
      <div className="grid grid-cols-4 gap-3">
        {STATUS_ORDER.map((s) => {
          const active = statusFilter === s;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(active ? 'all' : s)}
              className={
                'text-left term-panel px-4 py-3 transition-all duration-200 cursor-pointer ' +
                (active
                  ? 'border-emerald-500/30 shadow-[0_0_20px_-6px_rgba(52,211,153,0.2)]'
                  : s === 'failed' && counts.failed > 0
                    ? 'border-rose-500/20 hover:border-rose-500/30'
                    : 'hover:border-white/[0.15]')
              }
            >
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />
                <span className={`font-mono text-xs ${STATUS_COLOR[s]}`}>
                  {STATUS_LABEL[s]}
                </span>
              </div>
              <div className={`mt-1.5 text-2xl font-mono font-semibold tabular-nums ${STATUS_COLOR[s]}`}>
                {counts[s]}
              </div>
            </button>
          );
        })}
      </div>

      {err && (
        <div className="font-mono text-sm text-rose-400 border border-rose-500/20 bg-rose-500/5 rounded-md p-3">
          <span className="text-rose-500 font-semibold">[ERROR]</span> {err}
        </div>
      )}

      {stalePendingTypes.length > 0 && (
        <div className="font-mono text-xs border border-amber-500/30 bg-amber-500/5 rounded-md p-4">
          <div className="flex items-start gap-3">
            <span className="text-amber-400 font-semibold shrink-0">[WARN]</span>
            <div className="flex-1 space-y-2">
              <div className="text-amber-300">
                No worker registered for this job type.
              </div>
              <div className="text-zinc-400">
                {stalePendingTypes.length === 1 ? (
                  <>Jobs of type <span className="text-amber-300">{stalePendingTypes[0]}</span> have been pending for more than 15s. </>
                ) : (
                  <>Jobs of types <span className="text-amber-300">{stalePendingTypes.join(', ')}</span> have been pending for more than 15s. </>
                )}
                AsyncOps only orchestrates — your handler runs in a worker process you start.
              </div>
              <div className="text-zinc-500">
                Start a worker that registers a handler for {stalePendingTypes.length === 1 ? 'this type' : 'these types'}:{' '}
                <Link href="/dashboard/docs#worker" className="text-emerald-400 hover:text-emerald-300">
                  run a worker →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters + list */}
      <div className="term-panel overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-[#161616] border-b border-white/[0.06] select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="flex-1 text-center font-mono text-[11px] text-zinc-500">
            jobs@asyncops — {filtered.length} of {jobs.length} jobs
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <span className="font-mono text-xs text-zinc-600">filter:</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="search by id or type…"
              className="term-input flex-1 py-1.5"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-600">state:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="term-select py-1.5"
            >
              <option value="all">all</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-600">type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="term-select py-1.5"
            >
              <option value="all">all</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          {(search || statusFilter !== 'all' || typeFilter !== 'all') && (
            <button
              onClick={() => { setSearch(''); setStatusFilter('all'); setTypeFilter('all'); }}
              className="font-mono text-xs text-zinc-500 hover:text-emerald-400 transition-colors"
            >
              [clear]
            </button>
          )}
        </div>

        {selected.size > 0 && (
          <div className="flex items-center justify-between px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/10 font-mono text-sm">
            <span className="text-emerald-300">{selected.size} selected</span>
            <div className="flex gap-2">
              <button
                onClick={bulkRetry}
                disabled={bulkBusy}
                className="term-btn text-xs"
              >
                {bulkBusy ? 'retrying…' : `$ retry --count=${selected.size}`}
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="term-btn-ghost text-xs"
              >
                cancel
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[40px_1fr_1fr_120px_80px_60px_40px] gap-0 px-4 py-2 border-b border-white/[0.04] font-mono text-[11px] text-zinc-600 uppercase tracking-wider">
          <div className="flex items-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleAll}
              className="rounded border-zinc-700 bg-transparent"
            />
          </div>
          <div>job id</div>
          <div>type</div>
          <div>state</div>
          <div>age</div>
          <div>tries</div>
          <div />
        </div>

        <div className="divide-y divide-white/[0.04]">
          {filtered.length === 0 && (
            jobs.length === 0 ? (
              <EmptyStateGuide />
            ) : (
              <div className="px-4 py-10 text-center font-mono text-sm text-zinc-600">
                <span className="text-zinc-500">$</span> no jobs match current filters.
              </div>
            )
          )}
          {filtered.map((job) => (
            <div
              key={job.id}
              className={
                'grid grid-cols-[40px_1fr_1fr_120px_80px_60px_40px] gap-0 px-4 py-2.5 items-center hover:bg-white/[0.02] transition-colors group' +
                (job.status === 'failed' ? ' bg-rose-500/[0.03]' : '')
              }
            >
              <div>
                <input
                  type="checkbox"
                  checked={selected.has(job.id)}
                  onChange={() => toggleOne(job.id)}
                  className="rounded border-zinc-700 bg-transparent"
                />
              </div>
              <div className="font-mono text-xs">
                <Link
                  href={`/dashboard/jobs/${job.id}`}
                  className="text-zinc-300 hover:text-emerald-300 transition-colors"
                >
                  {job.id.slice(0, 8)}…
                </Link>
              </div>
              <div className="font-mono text-xs text-zinc-400">{job.type}</div>
              <div><StatusBadge status={job.status} /></div>
              <div className="font-mono text-xs text-zinc-600 tabular-nums">
                {timeAgo(new Date(job.createdAt))}
              </div>
              <div className="font-mono text-xs text-zinc-500 tabular-nums">
                {job.attempts ?? 0}
              </div>
              <div className="text-right">
                <Link
                  href={`/dashboard/jobs/${job.id}`}
                  className="text-zinc-600 group-hover:text-emerald-400 transition-colors font-mono text-sm"
                  title="Inspect job"
                >
                  →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyStateGuide() {
  return (
    <div className="px-6 py-8 space-y-5">
      <div className="font-mono text-sm text-zinc-400">
        <span className="text-emerald-400">$</span> no jobs yet. AsyncOps orchestrates jobs —
        your worker executes them. Two steps:
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <GuideStep
          num="1"
          title="Run a worker"
          subtitle="A long-running process in your environment that polls for jobs and runs your handlers."
          code={`// worker.js
const { createWorker } = require('asyncops-sdk');

createWorker({
  apiKey: process.env.ASYNCOPS_API_KEY,
  handlers: {
    'send-email': async (job) => {
      await sendMail(job.data);
      return { sent: true };
    },
  },
}).start();

// $ node worker.js`}
        />
        <GuideStep
          num="2"
          title="Create a job"
          subtitle="From your app, call createJob with a type matching one of your worker's handlers."
          code={`// app.js
const { JobsClient } = require('asyncops-sdk');

const client = new JobsClient({
  apiKey: process.env.ASYNCOPS_API_KEY,
});

await client.createJob({
  type: 'send-email',
  data: { to: 'you@example.com' },
});`}
        />
      </div>

      <div className="font-mono text-[11px] text-zinc-500">
        <span className="text-emerald-400">▸</span> AsyncOps never executes your code. Your worker does.{' '}
        <Link href="/dashboard/docs#worker" className="text-emerald-400 hover:text-emerald-300">
          full worker guide →
        </Link>
      </div>
    </div>
  );
}

function GuideStep({ num, title, subtitle, code }) {
  return (
    <div className="term-panel p-4">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-mono text-[11px] text-emerald-400">step {num}</span>
        <span className="font-mono text-sm text-zinc-100">{title}</span>
      </div>
      <p className="font-mono text-[11px] text-zinc-500 mb-3">{subtitle}</p>
      <pre className="font-mono text-[11px] text-zinc-300 bg-[#080808] border border-white/[0.06] rounded-md p-3 overflow-auto whitespace-pre">
        {code}
      </pre>
    </div>
  );
}

function timeAgo(date) {
  if (!date) return '';
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}
