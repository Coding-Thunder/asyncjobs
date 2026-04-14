import { siteConfig } from '../../lib/siteConfig';

const statusStyles = {
  completed:  { dot: 'bg-emerald-400', text: 'text-emerald-300', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  processing: { dot: 'bg-sky-400',     text: 'text-sky-300',     bg: 'bg-sky-400/10 border-sky-400/20' },
  failed:     { dot: 'bg-rose-400',    text: 'text-rose-300',    bg: 'bg-rose-400/10 border-rose-400/20' },
  pending:    { dot: 'bg-amber-400',   text: 'text-amber-300',   bg: 'bg-amber-400/10 border-amber-400/20' },
};

const statPillColors = {
  emerald: 'text-emerald-300 border-emerald-400/20 bg-emerald-400/5',
  rose:    'text-rose-300 border-rose-400/20 bg-rose-400/5',
  sky:     'text-sky-300 border-sky-400/20 bg-sky-400/5',
};

export default function DashboardPreview() {
  const { url, sidebar, stats, jobs } = siteConfig.dashboardPreview;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-[#0b0b0f] glow">
      {/* Mac-style title bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08] bg-white/[0.02]">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <div className="ml-4 flex-1 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[11px] text-zinc-400 font-mono">
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
            {url}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-[200px_1fr] h-[440px]">
        {/* Sidebar */}
        <div className="border-r border-white/[0.06] bg-white/[0.015] p-4 space-y-1 text-sm">
          {sidebar.map((item) => (
            <SidebarItem key={item.label} label={item.label} active={item.active} />
          ))}
        </div>

        {/* Main */}
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-medium text-white">Jobs</div>
              <div className="text-xs text-zinc-500">Live · last 24h</div>
            </div>
            <div className="flex items-center gap-2">
              {stats.map((s) => (
                <div key={s.sub} className={`px-2.5 py-1 rounded-md border text-[11px] ${statPillColors[s.color]}`}>
                  <span className="font-semibold">{s.label}</span> <span className="opacity-70">{s.sub}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] overflow-hidden bg-black/20">
            <div className="grid grid-cols-[1.4fr_1.6fr_1fr_0.8fr] px-4 py-2.5 text-[10px] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06] bg-white/[0.02]">
              <div>Job ID</div><div>Type</div><div>Status</div><div className="text-right">Age</div>
            </div>
            {jobs.map((job, i) => {
              const s = statusStyles[job.status];
              return (
                <div
                  key={job.id}
                  className="grid grid-cols-[1.4fr_1.6fr_1fr_0.8fr] items-center px-4 py-3 border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors animate-fade-up"
                  style={{ animationDelay: `${0.3 + i * 0.06}s` }}
                >
                  <div className="font-mono text-xs text-zinc-300">{job.id}</div>
                  <div className="text-xs text-zinc-400">{job.type}</div>
                  <div>
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border ${s.bg} ${s.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot} ${job.status === 'processing' ? 'animate-pulse-dot' : ''}`} />
                      {job.status}
                    </span>
                  </div>
                  <div className="text-right text-xs text-zinc-500 font-mono">{job.time}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarItem({ label, active }) {
  return (
    <div className={`px-3 py-2 rounded-md text-sm cursor-default ${active ? 'bg-white/[0.06] text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
      {label}
    </div>
  );
}
