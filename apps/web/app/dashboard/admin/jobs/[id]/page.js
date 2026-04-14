'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../../../../lib/api';
import StatusBadge from '../../../../../components/StatusBadge';

export default function AdminJobDetailPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [tab, setTab] = useState('Data');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/admin/jobs/${id}`);
      setJob(data.job);
      setLogs(data.logs || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (job?.status === 'failed' && tab === 'Data') setTab('Error');
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function retry() {
    setRetrying(true);
    try {
      await apiFetch(`/admin/jobs/${id}/retry`, { method: 'POST' });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setRetrying(false);
    }
  }

  if (!job) {
    return (
      <div className="font-mono text-sm text-zinc-500">
        {err ? (
          <span className="text-rose-400"><span className="text-rose-500">[ERROR]</span> {err}</span>
        ) : (
          <><span className="text-emerald-400">$</span> fetching job…<span className="term-cursor" /></>
        )}
      </div>
    );
  }

  const TABS = ['Data', 'Result', 'Logs', 'Error'];

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center gap-3 font-mono text-xs">
        <Link href="/dashboard/admin" className="text-zinc-500 hover:text-emerald-400 transition-colors">
          ← admin
        </Link>
        {job.userId && (
          <>
            <span className="text-zinc-700">/</span>
            <Link
              href={`/dashboard/admin/users/${job.userId}/jobs`}
              className="text-zinc-500 hover:text-emerald-400 transition-colors"
            >
              user jobs
            </Link>
          </>
        )}
      </div>

      {/* Header */}
      <div className="term-panel-glow overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-[#161616] border-b border-white/[0.06] select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="flex-1 text-center font-mono text-[11px] text-zinc-500">
            admin/job@asyncops — {job.id.slice(0, 12)}
          </span>
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="font-mono text-base text-zinc-100 truncate">{job.id}</h1>
              <div className="mt-2 flex items-center gap-4 font-mono text-xs">
                <StatusBadge status={job.status} />
                <span className="text-zinc-500">
                  type: <span className="text-sky-400">{job.type}</span>
                </span>
                <span className="text-zinc-500">
                  attempts: <span className="text-zinc-200">{job.attempts ?? 0}</span>
                </span>
              </div>
              {job.userId && (
                <div className="mt-1 font-mono text-[11px] text-zinc-600">
                  owner: <span className="text-zinc-400">{job.userId}</span>
                </div>
              )}
            </div>
            <button
              onClick={retry}
              disabled={retrying || job.status === 'processing'}
              className="term-btn text-xs"
            >
              {retrying ? 'retrying…' : '$ retry'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-4 pt-4 border-t border-white/[0.06]">
            <div>
              <div className="font-mono text-[11px] text-zinc-600">created:</div>
              <div className="font-mono text-xs text-zinc-300 mt-0.5">{new Date(job.createdAt).toLocaleString()}</div>
            </div>
            <div>
              <div className="font-mono text-[11px] text-zinc-600">updated:</div>
              <div className="font-mono text-xs text-zinc-300 mt-0.5">{new Date(job.updatedAt).toLocaleString()}</div>
            </div>
            <div>
              <div className="font-mono text-[11px] text-zinc-600">log_count:</div>
              <div className="font-mono text-xs text-zinc-300 mt-0.5">{logs.length}</div>
            </div>
          </div>
        </div>
      </div>

      {err && (
        <div className="font-mono text-sm text-rose-400 border border-rose-500/20 bg-rose-500/5 rounded-md p-3">
          <span className="text-rose-500 font-semibold">[ERROR]</span> {err}
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Timeline */}
        <div className="col-span-1 term-panel p-4">
          <div className="font-mono text-xs text-zinc-500 mb-3">
            <span className="text-emerald-400">$</span> timeline
          </div>
          {logs.length === 0 ? (
            <div className="font-mono text-xs text-zinc-600">no events yet.</div>
          ) : (
            <ol className="relative space-y-4">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/[0.06]" />
              {logs.map((l) => (
                <li key={l.id} className="relative pl-5">
                  <span className={
                    'absolute left-0 top-1 w-2.5 h-2.5 rounded-full border-2 border-[#0b0b0b] ' +
                    dotFor(l.message)
                  } />
                  <div className="font-mono text-xs text-zinc-300">{l.message}</div>
                  <div className="font-mono text-[11px] text-zinc-600 mt-0.5 tabular-nums">
                    [{new Date(l.timestamp).toLocaleTimeString()}]
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Tabs */}
        <div className="col-span-2 term-panel overflow-hidden">
          <div className="flex border-b border-white/[0.06]">
            {TABS.map((t) => {
              const hasError = t === 'Error' && job.error;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={
                    'px-4 py-2.5 font-mono text-xs border-b-2 -mb-px transition-colors ' +
                    (tab === t
                      ? 'border-emerald-400 text-emerald-300'
                      : 'border-transparent text-zinc-600 hover:text-zinc-300')
                  }
                >
                  {t.toLowerCase()}
                  {hasError && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-rose-400" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="p-4">
            {tab === 'Data' && (
              job.data != null ? <Json value={job.data} /> : <Empty text="no input data." />
            )}
            {tab === 'Result' && (
              job.result != null ? <Json value={job.result} /> : <Empty text="no result yet." />
            )}
            {tab === 'Logs' && (
              logs.length === 0 ? <Empty text="no logs yet." /> : (
                <div className="font-mono text-xs bg-[#080808] border border-white/[0.06] rounded-lg p-4 max-h-96 overflow-auto space-y-1">
                  {logs.map((l) => (
                    <div key={l.id} className="flex gap-3">
                      <span className="text-zinc-600 shrink-0">
                        [{new Date(l.timestamp).toLocaleTimeString()}]
                      </span>
                      <span className={logColor(l.message)}>{l.message}</span>
                    </div>
                  ))}
                </div>
              )
            )}
            {tab === 'Error' && (
              job.error
                ? (
                  <div className="font-mono text-xs bg-rose-500/5 border border-rose-500/20 rounded-lg p-4 max-h-96 overflow-auto">
                    <div className="text-rose-500 font-semibold mb-2">[ERROR]</div>
                    <pre className="text-rose-300 whitespace-pre-wrap">{job.error}</pre>
                  </div>
                )
                : <Empty text="no error." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Json({ value }) {
  return (
    <pre className="font-mono text-xs bg-[#080808] border border-white/[0.06] rounded-lg p-4 overflow-auto max-h-96 text-zinc-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Empty({ text }) {
  return (
    <div className="font-mono text-xs text-zinc-600">
      <span className="text-zinc-500">$</span> {text}
    </div>
  );
}

function dotFor(message) {
  const m = message.toLowerCase();
  if (m.includes('fail') || m.includes('error')) return 'bg-rose-400';
  if (m.includes('complet') || m.includes('success')) return 'bg-emerald-400';
  if (m.includes('retry')) return 'bg-amber-400';
  if (m.includes('process') || m.includes('start')) return 'bg-sky-400';
  return 'bg-zinc-500';
}

function logColor(message) {
  const m = message.toLowerCase();
  if (m.includes('fail') || m.includes('error')) return 'text-rose-400';
  if (m.includes('complet') || m.includes('success')) return 'text-emerald-400';
  if (m.includes('retry')) return 'text-amber-400';
  if (m.includes('process') || m.includes('start')) return 'text-sky-400';
  return 'text-zinc-300';
}
