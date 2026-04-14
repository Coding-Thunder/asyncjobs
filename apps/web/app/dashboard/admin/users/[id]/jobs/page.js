'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../../../../lib/api';
import StatusBadge from '../../../../../../components/StatusBadge';

export default function AdminUserJobsPage() {
  const { id } = useParams();
  const [jobs, setJobs] = useState([]);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/admin/users/${id}/jobs`);
      setJobs(data.jobs || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 font-mono text-xs">
        <Link href="/dashboard/admin" className="text-zinc-500 hover:text-emerald-400 transition-colors">
          ← admin/users
        </Link>
      </div>

      <div>
        <h1 className="font-mono text-lg text-zinc-100">
          <span className="text-emerald-400">$</span> jobs <span className="text-zinc-500">--user={id?.slice(0, 8)}</span>
        </h1>
        <p className="font-mono text-xs text-zinc-600 mt-1">{id}</p>
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
            admin/user-jobs@asyncops — {jobs.length} jobs
          </span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[1fr_1fr_120px_160px_40px] gap-0 px-4 py-2 border-b border-white/[0.04] font-mono text-[11px] text-zinc-600 uppercase tracking-wider">
          <div>id</div>
          <div>type</div>
          <div>status</div>
          <div>created</div>
          <div />
        </div>

        <div className="divide-y divide-white/[0.04]">
          {jobs.length === 0 && (
            <div className="px-4 py-10 text-center font-mono text-sm text-zinc-600">
              <span className="text-zinc-500">$</span> no jobs found for this user.
            </div>
          )}
          {jobs.map((job) => (
            <div key={job.id} className="grid grid-cols-[1fr_1fr_120px_160px_40px] gap-0 px-4 py-2.5 items-center hover:bg-white/[0.02] transition-colors group">
              <div className="font-mono text-xs">
                <Link
                  href={`/dashboard/admin/jobs/${job.id}`}
                  className="text-zinc-300 hover:text-emerald-300 transition-colors"
                >
                  {job.id.slice(0, 8)}…
                </Link>
              </div>
              <div className="font-mono text-xs text-zinc-400">{job.type}</div>
              <div><StatusBadge status={job.status} /></div>
              <div className="font-mono text-xs text-zinc-600">
                {new Date(job.createdAt).toLocaleString()}
              </div>
              <div className="text-right">
                <Link
                  href={`/dashboard/admin/jobs/${job.id}`}
                  className="text-zinc-600 group-hover:text-emerald-400 transition-colors font-mono text-sm"
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
