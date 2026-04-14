'use client';

import { useEffect, useRef, useState } from 'react';

const TONE_CLASS = {
  error:   'text-rose-400',
  warn:    'text-amber-300',
  info:    'text-sky-300',
  sys:     'text-zinc-200',
  success: 'text-emerald-400',
  dim:     'text-zinc-500',
};

const TONE_GLOW = {
  error:   'bg-rose-500/[0.06]   border-l-rose-500/60',
  warn:    'bg-amber-500/[0.05]  border-l-amber-400/60',
  info:    'bg-sky-500/[0.05]    border-l-sky-400/60',
  sys:     'bg-zinc-400/[0.05]   border-l-zinc-300/50',
  success: 'bg-emerald-500/[0.06] border-l-emerald-400/60',
  dim:     'bg-transparent       border-l-transparent',
};

// Realistic, developer-facing log sequence.
// pauseAfter = extra dwell time before the next line (tension).
const SEQUENCE = [
  { tone: 'dim',     text: '[worker] connected · handlers=send-email,generate-report',           dt: 0 },
  { tone: 'info',    text: '[worker] claimed job 65f8a41b send-email',                           dt: 420 },
  { tone: 'success', text: '[worker] job 65f8a41b completed in 412ms',                           dt: 610 },
  { tone: 'info',    text: '[worker] claimed job 65f8a3c7 generate-report',                      dt: 380 },
  { tone: 'error',   text: '[worker] job 65f8a3c7 failed: timeout after 30s', dt: 700, pulse: true },
  { tone: 'warn',    text: '[asyncops] retry scheduled (attempt 2/3) — backoff 4000ms',          dt: 640, pauseAfter: 900 },
  { tone: 'info',    text: '[worker] claimed job 65f8a3c7 generate-report',                      dt: 620 },
  { tone: 'info',    text: '[worker] fetching payload (12 kB)',                                  dt: 480 },
  { tone: 'success', text: '[worker] job 65f8a3c7 completed in 1.8s',                            dt: 720 },
];

// Simulated clock start: 12:01:23
const BASE_SECONDS = 12 * 3600 + 1 * 60 + 23;

function formatTs(totalSeconds) {
  const s = Math.floor(totalSeconds) % 86400;
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export default function SystemActivity() {
  const [lines, setLines] = useState([]);
  const [typing, setTyping] = useState(true);
  const scrollRef = useRef(null);
  const reducedMotion = useRef(false);

  // Respect prefers-reduced-motion: render the full sequence statically.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedMotion.current = mq.matches;
    if (mq.matches) {
      setLines(
        SEQUENCE.map((entry, i) => ({
          ...entry,
          typed: entry.text,
          ts: formatTs(BASE_SECONDS + i * 2),
        }))
      );
      setTyping(false);
    }
  }, []);

  useEffect(() => {
    if (reducedMotion.current) return;

    let cancelled = false;
    let timer;
    let lineIdx = 0;
    let charIdx = 0;
    let elapsed = 0; // simulated seconds since BASE

    const schedule = (fn, ms) => {
      timer = setTimeout(fn, ms);
    };

    const tick = () => {
      if (cancelled) return;

      // End of sequence → pause then loop.
      if (lineIdx >= SEQUENCE.length) {
        setTyping(false);
        schedule(() => {
          if (cancelled) return;
          setLines([]);
          setTyping(true);
          lineIdx = 0;
          charIdx = 0;
          elapsed = 0;
          tick();
        }, 2600);
        return;
      }

      const entry = SEQUENCE[lineIdx];

      // Begin a new line — commit timestamp + tone.
      if (charIdx === 0) {
        elapsed += (entry.dt || 400) / 1000;
        const ts = formatTs(BASE_SECONDS + elapsed);
        setLines((prev) => [...prev, { ...entry, ts, typed: '' }]);
        charIdx = 1;
        schedule(tick, 30);
        return;
      }

      // Stream characters.
      if (charIdx <= entry.text.length) {
        const nextSlice = entry.text.slice(0, charIdx);
        setLines((prev) => {
          if (prev.length === 0) return prev;
          const copy = prev.slice();
          copy[copy.length - 1] = { ...copy[copy.length - 1], typed: nextSlice };
          return copy;
        });
        charIdx++;
        // ~10-18ms per char feels like streaming stdout, not typing.
        schedule(tick, 9 + Math.random() * 9);
        return;
      }

      // Line complete → brief dwell before next.
      const dwell = entry.pauseAfter ?? 240 + Math.random() * 260;
      lineIdx++;
      charIdx = 0;
      schedule(tick, dwell);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // Auto-scroll to bottom whenever a line grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  const lastIdx = lines.length - 1;

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#07070a] shadow-2xl shadow-black/50">
      {/* Mac-style window chrome */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08] bg-white/[0.02]">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <div className="ml-3 text-[11px] text-zinc-500 font-mono">
          asyncops · system.log
        </div>
        <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          live
        </div>
      </div>

      {/* Log stream */}
      <div
        ref={scrollRef}
        className="relative h-[340px] overflow-hidden px-5 py-4 font-mono text-[12.5px] leading-[1.65] bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.06),_transparent_60%)]"
      >
        {lines.map((line, i) => {
          const isLast = i === lastIdx;
          const cls = TONE_CLASS[line.tone] || TONE_CLASS.dim;
          const glow = TONE_GLOW[line.tone] || TONE_GLOW.dim;

          return (
            <div
              key={i}
              className={`flex items-start gap-3 -mx-2 px-2 py-[1px] border-l-2 transition-colors duration-200 ${
                isLast ? glow : 'border-l-transparent'
              }`}
            >
              <span className="shrink-0 text-zinc-600 select-none">
                [{line.ts}]
              </span>
              <span
                className={`${cls} ${
                  line.pulse && isLast ? 'animate-log-pulse' : ''
                }`}
              >
                {line.typed}
                {isLast && typing && (
                  <span className="inline-block w-[7px] h-[13px] translate-y-[2px] ml-[1px] bg-zinc-300 animate-blink-cursor align-baseline" />
                )}
              </span>
            </div>
          );
        })}

        {/* Idle cursor after sequence finishes (before loop restart) */}
        {!typing && lines.length > 0 && (
          <div className="mt-1 flex items-center gap-3 -mx-2 px-2 text-zinc-600">
            <span className="select-none">[{lines[lastIdx]?.ts}]</span>
            <span className="text-zinc-500">$</span>
            <span className="inline-block w-[7px] h-[13px] translate-y-[2px] bg-zinc-400 animate-blink-cursor" />
          </div>
        )}

        {/* Top fade so scrolled-out lines feel like they're drifting off */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#07070a] to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#07070a] to-transparent" />
      </div>
    </div>
  );
}
