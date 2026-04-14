'use client';

import { useState } from 'react';
import { siteConfig } from '../../lib/siteConfig';

const outputTones = {
  success: 'text-emerald-400/80',
  muted: 'text-zinc-600',
  default: 'text-zinc-400',
};

export default function Terminal() {
  const t = siteConfig.terminal;
  const { jobType, dataKey, dataValue, workerFile, appFile } = t;
  const [activeTab, setActiveTab] = useState('worker');

  return (
    <div className="rounded-2xl overflow-hidden border border-white/10 bg-[#0b0b0f] shadow-2xl shadow-black/40">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08] bg-white/[0.02]">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <div className="ml-3 text-[11px] text-zinc-500 font-mono">{t.path}</div>
      </div>

      <div className="p-6 font-mono text-[13px] leading-relaxed">
        <div className="text-zinc-500">$ <span className="text-zinc-300">{t.installCommand}</span></div>
        {t.installOutput.map((line, i) => (
          <div key={i} className={`mt-${i === 0 ? '2' : '0'} ${outputTones[line.tone] || outputTones.default}`}>
            {line.text}
          </div>
        ))}

        {/* File tabs */}
        <div className="mt-6 flex items-center gap-1 border-b border-white/[0.06]">
          <TabButton
            active={activeTab === 'worker'}
            onClick={() => setActiveTab('worker')}
            label={`1. ${workerFile}`}
          />
          <TabButton
            active={activeTab === 'app'}
            onClick={() => setActiveTab('app')}
            label={`2. ${appFile}`}
          />
          <span className="ml-auto text-[10px] text-zinc-600 pb-2 pr-1">
            run both · worker first
          </span>
        </div>

        {activeTab === 'worker' ? (
          <pre className="mt-4 whitespace-pre-wrap text-zinc-200">
<span className="text-zinc-600">// worker.js — runs in your environment</span>
{'\n'}<span className="text-purple-300">const</span> {'{ '}<span className="text-sky-300">init</span>, <span className="text-sky-300">createWorker</span>{' }'} = <span className="text-yellow-200">require</span>(<span className="text-emerald-300">'asyncops-sdk'</span>)
{'\n'}
{'\n'}<span className="text-yellow-200">init</span>({'{ '}<span className="text-rose-300">apiKey</span>: process.env.<span className="text-sky-300">ASYNCOPS_API_KEY</span>{' }'})
{'\n'}
{'\n'}<span className="text-yellow-200">createWorker</span>({'{'}
{'\n  '}<span className="text-rose-300">handlers</span>: {'{'}
{'\n    '}<span className="text-emerald-300">"{jobType}"</span>: <span className="text-purple-300">async</span> (job, ctx) {'=>'} {'{'}
{'\n      '}<span className="text-purple-300">await</span> ctx.<span className="text-yellow-200">log</span>(<span className="text-emerald-300">`writing about ${'${'}job.data.{dataKey}{'}'}`</span>)
{'\n      '}<span className="text-purple-300">return</span> <span className="text-purple-300">await</span> <span className="text-yellow-200">generateArticle</span>(job.data.{dataKey})
{'\n    '}{'}'},
{'\n  '}{'}'},
{'\n'}{'}'}).<span className="text-yellow-200">start</span>()
          </pre>
        ) : (
          <pre className="mt-4 whitespace-pre-wrap text-zinc-200">
<span className="text-zinc-600">// app.js — runs wherever your app runs</span>
{'\n'}<span className="text-purple-300">const</span> {'{ '}<span className="text-sky-300">init</span>, <span className="text-sky-300">client</span>{' }'} = <span className="text-yellow-200">require</span>(<span className="text-emerald-300">'asyncops-sdk'</span>)
{'\n'}
{'\n'}<span className="text-yellow-200">init</span>({'{ '}<span className="text-rose-300">apiKey</span>: process.env.<span className="text-sky-300">ASYNCOPS_API_KEY</span>{' }'})
{'\n'}
{'\n'}<span className="text-purple-300">const</span> <span className="text-sky-300">job</span> = <span className="text-purple-300">await</span> <span className="text-sky-300">client</span>.<span className="text-yellow-200">createJob</span>({'{'}
{'\n  '}<span className="text-rose-300">type</span>: <span className="text-emerald-300">"{jobType}"</span>,
{'\n  '}<span className="text-rose-300">data</span>: {'{ '}<span className="text-rose-300">{dataKey}</span>: <span className="text-emerald-300">"{dataValue}"</span>{' }'}
{'\n'}{'}'})
          </pre>
        )}

        <div className="mt-5 flex items-center gap-2 text-[12px]">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-400/10 border border-zinc-400/20 text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-pulse-dot" />
            {t.resultBadge.status}
          </span>
          <span className="text-zinc-500">{t.resultBadge.jobId} · created {t.resultBadge.createdAt}</span>
        </div>

        <div className="mt-5 pt-4 border-t border-white/[0.06]">
          <p className="text-[12px] text-zinc-400">
            <span className="text-emerald-400">▸</span> {t.caption}
          </p>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={
        'px-3 py-2 text-[11px] -mb-px border-b-2 transition-colors ' +
        (active
          ? 'border-emerald-400 text-emerald-300'
          : 'border-transparent text-zinc-500 hover:text-zinc-300')
      }
    >
      {label}
    </button>
  );
}
