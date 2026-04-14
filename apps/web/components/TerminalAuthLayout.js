'use client';

import { useState, useEffect, useRef } from 'react';

export function TerminalAuthLayout({ bootLines, children }) {
  const [bootIdx, setBootIdx] = useState(0);

  useEffect(() => {
    if (bootIdx >= bootLines.length) return;
    const t = setTimeout(() => setBootIdx((i) => i + 1), 220);
    return () => clearTimeout(t);
  }, [bootIdx, bootLines.length]);

  const bootDone = bootIdx >= bootLines.length;

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-10 overflow-hidden">
      <div className="absolute inset-0 bg-grid radial-fade pointer-events-none" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% 0%, rgba(52,211,153,0.06), transparent 60%), radial-gradient(ellipse 60% 40% at 50% 100%, rgba(99,102,241,0.05), transparent 60%)',
        }}
      />

      <div className="relative w-full max-w-xl rounded-xl border border-white/10 bg-[#0b0b0b]/95 backdrop-blur-sm shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)] overflow-hidden font-mono text-[13.5px] leading-relaxed">
        {/* Title bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[#161616] border-b border-white/10 select-none">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <span className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 text-center text-[12px] text-zinc-400 tracking-tight">
            session@asyncops:~
          </div>
          <div className="w-[54px]" />
        </div>

        {/* Body */}
        <div className="px-5 py-5 text-zinc-300 min-h-[380px]">
          {bootLines.slice(0, bootIdx).map((l, i) => (
            <div key={i} className="text-zinc-500">
              <span className="text-emerald-400">$ </span>
              {l}
            </div>
          ))}

          {!bootDone && (
            <div className="inline-flex items-center">
              <span className="text-emerald-400">$&nbsp;</span>
              <Caret />
            </div>
          )}

          {bootDone && children}
        </div>
      </div>

    </div>
  );
}

export function TerminalField({ command, label, value, onClick, focused, placeholder, mask }) {
  const display = mask ? '\u2022'.repeat(value.length) : value;
  const showPlaceholder = value.length === 0;
  return (
    <div
      className="flex items-baseline gap-2 cursor-text select-none"
      onClick={onClick}
    >
      <span className="text-emerald-400">$</span>
      <span className="text-sky-400">{command}</span>
      <span className="text-zinc-500">{label}</span>
      <span className="flex-1 min-w-0 break-all">
        {showPlaceholder ? (
          <>
            {focused && <Caret />}
            <span className="text-zinc-700 ml-1">{placeholder}</span>
          </>
        ) : (
          <>
            <span className={mask ? 'text-zinc-100 tracking-widest' : 'text-zinc-100'}>
              {display}
            </span>
            {focused && <Caret />}
          </>
        )}
      </span>
    </div>
  );
}

export function TerminalSubmitButton({ loading, done, loadingText, doneText, defaultText }) {
  return (
    <button
      type="submit"
      disabled={loading || done}
      className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10 hover:border-emerald-400/70 hover:shadow-[0_0_28px_-4px_rgba(52,211,153,0.55)] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="text-emerald-500">&rsaquo;</span>
      <span className="tracking-wide">
        {loading ? loadingText : done ? doneText : defaultText}
      </span>
      <span className="text-zinc-600 group-hover:text-emerald-400 transition-colors text-[11px]">
        [ENTER]
      </span>
    </button>
  );
}

export function TerminalError({ message }) {
  if (!message) return null;
  return (
    <div className="pt-3 text-rose-400">
      <span className="text-rose-500 font-semibold">[ERROR]</span> {message}
    </div>
  );
}

export function TerminalSuccess({ message }) {
  if (!message) return null;
  return (
    <div className="pt-3 text-emerald-400">
      <span className="font-semibold">[OK]</span> {message}
    </div>
  );
}

export function Caret() {
  return <span className="term-caret" aria-hidden="true" />;
}

export function useTerminalForm({ fieldNames }) {
  const [focused, setFocused] = useState(fieldNames[0]);
  const refs = useRef({});

  fieldNames.forEach((name) => {
    if (!refs.current[name]) refs.current[name] = { current: null };
  });

  function setRef(name) {
    return (el) => {
      refs.current[name].current = el;
    };
  }

  function focusField(name) {
    setFocused(name);
    refs.current[name]?.current?.focus();
  }

  function focusNext(currentName) {
    const idx = fieldNames.indexOf(currentName);
    if (idx < fieldNames.length - 1) {
      focusField(fieldNames[idx + 1]);
    }
  }

  function autoFocusFirst() {
    refs.current[fieldNames[0]]?.current?.focus();
  }

  return { focused, setFocused, focusField, focusNext, autoFocusFirst, setRef };
}
