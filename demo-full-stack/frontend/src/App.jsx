import { useEffect, useMemo, useRef, useState } from 'react';

const STATUS_LABELS = {
  pending: 'pending',
  queued: 'queued',
  running: 'running',
  completed: 'completed',
  failed: 'failed',
  retrying: 'retrying',
};

function fmtTime(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  } catch {
    return iso;
  }
}

export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [selected, setSelected] = useState(null);
  const [job, setJob] = useState(null);
  const [status, setStatus] = useState(null);
  const [statusHistory, setStatusHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [running, setRunning] = useState(false);
  const esRef = useRef(null);
  const seenLogIds = useRef(new Set());

  useEffect(() => {
    fetch('/api/scenarios')
      .then((r) => r.json())
      .then((d) => {
        setScenarios(d.scenarios || []);
        if (!selected && d.scenarios?.length) setSelected(d.scenarios[0]);
      })
      .catch((e) => setErrorMsg(`failed to load scenarios: ${e.message}`));
    return () => esRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectScenario = (s) => {
    if (running) return;
    setSelected(s);
    resetJobState();
  };

  const resetJobState = () => {
    esRef.current?.close();
    esRef.current = null;
    seenLogIds.current = new Set();
    setJob(null);
    setStatus(null);
    setStatusHistory([]);
    setLogs([]);
    setResult(null);
    setErrorMsg('');
  };

  const appendLog = (entry) => {
    if (!entry) return;
    const key = entry.id || `${entry.created_at || ''}|${entry.message || ''}`;
    if (seenLogIds.current.has(key)) return;
    seenLogIds.current.add(key);
    setLogs((prev) => [...prev, entry]);
  };

  const onStatus = (next) => {
    setStatus(next);
    setStatusHistory((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.status === next.status) return prev;
      return [...prev, { status: next.status, at: new Date().toISOString() }];
    });
    if (next.result !== undefined && next.result !== null) setResult(next.result);
    if (next.status === 'completed' || next.status === 'failed') {
      setRunning(false);
    }
  };

  const runJob = async () => {
    if (!selected || running) return;
    resetJobState();
    setRunning(true);
    try {
      const r = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: selected.id }),
      });
      if (!r.ok) throw new Error((await r.json()).error || `HTTP ${r.status}`);
      const { job: created } = await r.json();
      setJob(created);
      onStatus(created);

      const es = new EventSource(
        `/api/jobs/${encodeURIComponent(created.id)}/stream?scenario=${encodeURIComponent(selected.id)}`
      );
      esRef.current = es;

      es.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.type === 'status' && msg.data) onStatus(msg.data);
        else if (msg.type === 'log' && msg.data) appendLog(msg.data);
        else if (msg.type === 'snapshot' && msg.data) {
          if (msg.data.job) onStatus(msg.data.job);
          if (Array.isArray(msg.data.logs)) msg.data.logs.forEach(appendLog);
        } else if (msg.type === 'error' && msg.data) {
          setErrorMsg(msg.data.message || 'stream error');
        }
      };
      es.onerror = () => {
        // EventSource auto-reconnects; treat as informational.
      };
    } catch (e) {
      setErrorMsg(e.message);
      setRunning(false);
    }
  };

  const statusBadgeClass = useMemo(() => {
    if (!status) return 'badge badge-idle';
    const s = status.status;
    if (s === 'completed') return 'badge badge-ok';
    if (s === 'failed') return 'badge badge-err';
    if (s === 'running') return 'badge badge-run';
    return 'badge badge-pending';
  }, [status]);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <div className="brand-title">AsyncOps Demo</div>
            <div className="brand-sub">pain-point dashboard</div>
          </div>
        </div>
        <div className="sidebar-label">Scenarios</div>
        <ul className="scenarios">
          {scenarios.map((s) => (
            <li
              key={s.id}
              className={
                'scenario-item' + (selected?.id === s.id ? ' active' : '') + (running ? ' disabled' : '')
              }
              onClick={() => selectScenario(s)}
            >
              <div className="scenario-title">{s.title}</div>
              <div className="scenario-sub">{s.painPoint}</div>
            </li>
          ))}
        </ul>
        <div className="sidebar-footer">
          powered by <code>asyncops-sdk</code>
        </div>
      </aside>

      <main className="main">
        {!selected ? (
          <div className="empty">Loading scenarios...</div>
        ) : (
          <>
            <header className="main-header">
              <div>
                <div className="pain-label">Pain point</div>
                <h1>{selected.title}</h1>
                <p className="description">{selected.description}</p>
              </div>
              <div className="actions">
                <button className="run" onClick={runJob} disabled={running || !selected}>
                  {running ? 'Running…' : 'Run Job'}
                </button>
              </div>
            </header>

            <section className="status-card">
              <div className="status-row">
                <div>
                  <div className="muted">Job ID</div>
                  <div className="mono">{job?.id || '—'}</div>
                </div>
                <div>
                  <div className="muted">Status</div>
                  <div className={statusBadgeClass}>{STATUS_LABELS[status?.status] || status?.status || 'idle'}</div>
                </div>
                <div>
                  <div className="muted">Transitions</div>
                  <div className="transitions">
                    {statusHistory.length === 0
                      ? <span className="muted">none yet</span>
                      : statusHistory.map((h, i) => (
                          <span key={i} className="chip">{h.status}</span>
                        ))}
                  </div>
                </div>
              </div>
              {errorMsg && <div className="error-inline">⚠ {errorMsg}</div>}
            </section>

            <section className="logs-card">
              <div className="logs-header">
                <h2>Live log stream</h2>
                <span className="muted">{logs.length} entries</span>
              </div>
              <div className="logs">
                {logs.length === 0 ? (
                  <div className="muted padded">
                    {running ? 'waiting for first log...' : 'run the job to see live logs from the worker'}
                  </div>
                ) : (
                  logs.map((l, i) => (
                    <div className="log-line" key={l.id || i}>
                      <span className="log-time">{fmtTime(l.created_at)}</span>
                      <span className="log-msg">{l.message}</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {result !== null && (
              <section className="result-card">
                <div className="logs-header">
                  <h2>Result</h2>
                </div>
                <pre className="result-pre">{JSON.stringify(result, null, 2)}</pre>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
