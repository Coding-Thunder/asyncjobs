import { siteConfig } from '../../lib/siteConfig';

const dotColors = {
  emerald: 'bg-emerald-400',
  sky: 'bg-sky-400',
  amber: 'bg-amber-400',
  rose: 'bg-rose-400',
  zinc: 'bg-zinc-400',
};

const textColors = {
  emerald: 'text-emerald-300',
  sky: 'text-sky-300',
  amber: 'text-amber-300',
  rose: 'text-rose-300',
  zinc: 'text-zinc-300',
};

const ringColors = {
  emerald: 'ring-emerald-400/10',
  sky: 'ring-sky-400/10',
  amber: 'ring-amber-400/10',
  rose: 'ring-rose-400/10',
  zinc: 'ring-zinc-400/10',
};

export function JobTrackingCard() {
  const { title, subtitle, jobs } = siteConfig.features.jobTracking;
  return (
    <FeatureShell title={title} subtitle={subtitle}>
      <div className="space-y-2">
        {jobs.map((j) => (
          <div key={j.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${dotColors[j.color]} ${j.status === 'processing' ? 'animate-pulse-dot' : ''}`} />
              <span className="font-mono text-[11px] text-zinc-300">{j.id}</span>
              <span className="text-[11px] text-zinc-500">{j.label}</span>
            </div>
            <span className={`text-[10px] ${textColors[j.color]}`}>{j.status}</span>
          </div>
        ))}
      </div>
    </FeatureShell>
  );
}

export function LogsTimelineCard() {
  const { title, subtitle, events } = siteConfig.features.logsTimeline;
  return (
    <FeatureShell title={title} subtitle={subtitle}>
      <div className="relative pl-4">
        <div className="absolute left-[7px] top-1 bottom-1 w-px bg-white/10" />
        {events.map((e, i) => (
          <div key={i} className="relative mb-3 last:mb-0">
            <div className={`absolute -left-[13px] top-1 h-2.5 w-2.5 rounded-full ${dotColors[e.color]} ring-4 ${ringColors[e.color]}`} />
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[10px] text-zinc-500">{e.t}</span>
              <span className="text-[12px] text-zinc-300">{e.msg}</span>
            </div>
          </div>
        ))}
      </div>
    </FeatureShell>
  );
}

export function RetryCard() {
  const { title, subtitle, failedJob } = siteConfig.features.retry;
  return (
    <FeatureShell title={title} subtitle={subtitle}>
      <div className="rounded-lg border border-rose-400/20 bg-rose-400/5 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[11px] text-rose-300">{failedJob.id}</div>
            <div className="text-[11px] text-zinc-400 mt-0.5">{failedJob.type} · failed</div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-400/30 text-rose-300 bg-rose-400/10">attempts: 3/3</span>
        </div>
        <div className="mt-2 text-[11px] text-zinc-500 font-mono">{failedJob.error}</div>
      </div>
      <button className="mt-3 w-full py-2 rounded-lg bg-white text-zinc-900 text-xs font-semibold hover:bg-zinc-200 transition-colors">
        ↻  Retry job
      </button>
    </FeatureShell>
  );
}

function FeatureShell({ title, subtitle, children }) {
  return (
    <div className="soft-card rounded-2xl p-5 hover:border-white/[0.14] hover:bg-white/[0.04] transition-all duration-300 hover:-translate-y-1">
      <div className="mb-4">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="text-[12px] text-zinc-500 mt-0.5">{subtitle}</div>
      </div>
      {children}
    </div>
  );
}
