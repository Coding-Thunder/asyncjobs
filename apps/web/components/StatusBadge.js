export default function StatusBadge({ status }) {
  const config = {
    pending: { color: 'text-zinc-400', dot: 'bg-zinc-400', label: 'pending' },
    processing: { color: 'text-sky-400', dot: 'bg-sky-400 animate-pulse', label: 'processing' },
    completed: { color: 'text-emerald-400', dot: 'bg-emerald-400', label: 'completed' },
    failed: { color: 'text-rose-400', dot: 'bg-rose-400', label: 'failed' },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-xs ${c.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}
