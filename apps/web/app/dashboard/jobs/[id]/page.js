'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, subscribeJob } from '../../../../lib/api';
import StatusBadge from '../../../../components/StatusBadge';

const TABS = ['Data', 'Result', 'Logs', 'Error'];

export default function JobDetailPage() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [logs, setLogs] = useState([]);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('Data');
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch(`/jobs/${id}`);
      setJob(data.job);
      setLogs(data.logs || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    let stop = null;

    load();

    if (typeof subscribeJob === 'function') {
      stop = subscribeJob(id, (event) => {
        if (cancelled || !event) return;
        if (event.type === 'status') {
          setJob((prev) => (prev ? { ...prev, ...event.data } : prev));
        } else if (event.type === 'log') {
          setLogs((prev) => {
            if (event.data?.id && prev.some((l) => l.id === event.data.id)) {
              return prev;
            }
            return [...prev, event.data];
          });
        }
      });
    } else {
      const t = setInterval(load, 2000);
      stop = () => clearInterval(t);
    }

    return () => {
      cancelled = true;
      if (stop) stop();
    };
  }, [id, load]);

  useEffect(() => {
    if (job?.status === 'completed' || job?.status === 'failed') {
      load();
    }
  }, [job?.status, load]);

  useEffect(() => {
    if (job?.status === 'failed' && tab === 'Data') setTab('Error');
    if (job?.status === 'completed' && tab === 'Data') setTab('Result');
  }, [job?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const duration = useMemo(() => {
    if (!job) return null;
    const start = new Date(job.createdAt).getTime();
    const end = new Date(job.updatedAt).getTime();
    return Math.max(0, end - start);
  }, [job]);

  async function doRetry() {
    setRetrying(true);
    setErr('');
    try {
      await apiFetch(`/jobs/${id}/retry`, { method: 'POST' });
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
          <><span className="text-emerald-400">$</span> inspecting job {id?.slice(0, 8)}…<span className="term-cursor" /></>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <Link href="/dashboard/jobs" className="inline-flex items-center gap-1 font-mono text-xs text-zinc-500 hover:text-emerald-400 transition-colors">
        <span>←</span> cd ../jobs
      </Link>

      {/* Header panel */}
      <div className="term-panel-glow overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-[#161616] border-b border-white/[0.06] select-none">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="flex-1 text-center font-mono text-[11px] text-zinc-500">
            inspect@asyncops — {job.id.slice(0, 12)}
          </span>
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h1 className="font-mono text-base text-zinc-100 truncate">{job.id}</h1>
                <CopyButton text={job.id} />
              </div>
              <div className="mt-2 flex items-center gap-4 font-mono text-xs flex-wrap">
                <StatusBadge status={job.status} />
                <span className="text-zinc-500">
                  type: <span className="text-sky-400">{job.type}</span>
                </span>
                <span className="text-zinc-500">
                  attempts: <span className="text-zinc-200">{job.attempts ?? 0}</span>
                </span>
                {job.idempotencyKey && (
                  <span className="text-zinc-500">
                    idem: <span className="text-zinc-300">{job.idempotencyKey}</span>
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={doRetry}
              disabled={retrying || job.status === 'processing' || job.status === 'pending'}
              className="term-btn text-xs shrink-0"
            >
              {retrying ? 'retrying…' : '$ retry'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-4 gap-4 pt-4 border-t border-white/[0.06]">
            <Meta label="created" value={new Date(job.createdAt).toLocaleString()} />
            <Meta label="last_event" value={new Date(job.updatedAt).toLocaleString()} />
            <Meta label="duration" value={duration != null ? formatDuration(duration) : '—'} />
            <Meta label="log_events" value={logs.length} />
          </div>
        </div>
      </div>

      {err && (
        <div className="font-mono text-sm text-rose-400 border border-rose-500/20 bg-rose-500/5 rounded-md p-3">
          <span className="text-rose-500 font-semibold">[ERROR]</span> {err}
        </div>
      )}

      <div className="grid grid-cols-3 gap-5">
        {/* Log timeline */}
        <div className="col-span-1 term-panel p-4">
          <div className="font-mono text-xs text-zinc-500 mb-3">
            <span className="text-emerald-400">$</span> logs --tail
          </div>
          {logs.length === 0 ? (
            <div className="font-mono text-xs text-zinc-600">no log entries yet.</div>
          ) : (
            <ol className="relative space-y-4">
              <div className="absolute left-[5px] top-1 bottom-1 w-px bg-white/[0.06]" />
              {logs.map((l, i) => (
                <li key={l.id || i} className="relative pl-5 animate-log-enter" style={{ animationDelay: `${i * 50}ms` }}>
                  <span className={
                    'absolute left-0 top-1 w-2.5 h-2.5 rounded-full border-2 border-[#0b0b0b] ' +
                    dotFor(l.message)
                  } />
                  <div className="font-mono text-xs text-zinc-300 break-words">{l.message}</div>
                  <div className="font-mono text-[11px] text-zinc-600 mt-0.5 tabular-nums">
                    [{new Date(l.timestamp).toLocaleTimeString()}]
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* Tabs + content */}
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
              job.data != null
                ? <Json value={job.data} />
                : <Empty text="no input data for this job." />
            )}
            {tab === 'Result' && (
              job.result != null
                ? <Json value={job.result} />
                : <Empty text={
                    job.status === 'completed'
                      ? 'handler returned no result.'
                      : 'no result yet — job has not completed.'
                  } />
            )}
            {tab === 'Logs' && (
              logs.length === 0 ? <Empty text="no trace events yet." /> : (
                <div className="font-mono text-xs bg-[#080808] border border-white/[0.06] rounded-lg p-4 max-h-96 overflow-auto space-y-1">
                  {logs.map((l, i) => (
                    <div key={l.id || i} className="flex gap-3 animate-log-enter" style={{ animationDelay: `${i * 30}ms` }}>
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
                    <div className="text-rose-500 font-semibold mb-2">[FAILURE]</div>
                    <pre className="text-rose-300 whitespace-pre-wrap">{job.error}</pre>
                  </div>
                )
                : <Empty text="no failures traced." />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <div className="font-mono text-[11px] text-zinc-600 uppercase tracking-wider mb-1.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div>
      <div className="font-mono text-[11px] text-zinc-600">{label}:</div>
      <div className="font-mono text-xs text-zinc-300 mt-0.5">{value}</div>
    </div>
  );
}

function Json({ value }) {
  return (
    <pre className="font-mono text-xs bg-[#080808] border border-white/[0.06] rounded-lg p-4 overflow-auto max-h-96 text-zinc-300 whitespace-pre-wrap">
      {safeStringify(value)}
    </pre>
  );
}

function safeStringify(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function Empty({ text }) {
  return (
    <div className="font-mono text-xs text-zinc-600">
      <span className="text-zinc-500">$</span> {text}
    </div>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      className="font-mono text-[11px] text-zinc-600 hover:text-emerald-400 px-1.5 py-0.5 rounded border border-white/[0.08] hover:border-emerald-500/30 transition-all"
      title="Copy"
    >
      {copied ? 'copied!' : 'copy'}
    </button>
  );
}

function dotFor(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('fail') || m.includes('error')) return 'bg-rose-400';
  if (m.includes('complet') || m.includes('success') || m.includes('succeeded')) return 'bg-emerald-400';
  if (m.includes('retry') || m.includes('replay')) return 'bg-amber-400';
  if (m.includes('execut') || m.includes('process') || m.includes('start') || m.includes('running')) return 'bg-sky-400';
  return 'bg-zinc-500';
}

function logColor(message) {
  const m = (message || '').toLowerCase();
  if (m.includes('fail') || m.includes('error')) return 'text-rose-400';
  if (m.includes('complet') || m.includes('success') || m.includes('succeeded')) return 'text-emerald-400';
  if (m.includes('retry') || m.includes('replay')) return 'text-amber-400';
  if (m.includes('execut') || m.includes('process') || m.includes('start') || m.includes('running')) return 'text-sky-400';
  return 'text-zinc-300';
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.floor(s % 60);
  return `${m}m ${rest}s`;
}
