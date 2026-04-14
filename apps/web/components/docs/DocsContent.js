'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { API_URL } from '../../lib/api';

// Single source of truth for AsyncOps documentation. Rendered unchanged on the
// public /docs page and inside /dashboard/docs. The only difference between
// the two is which `apiKey` / keysHref we thread through, which is cosmetic
// (pre-filled env sample + the "grab an API key" link target).

const SECTIONS = [
  { id: 'overview', label: 'overview' },
  { id: 'install', label: 'install sdk' },
  { id: 'worker', label: 'run a worker' },
  { id: 'create', label: 'create a job' },
  { id: 'inspect', label: 'inspect a job' },
  { id: 'retry', label: 'retry a job' },
  { id: 'errors', label: 'errors' },
];

export default function DocsContent({ apiKey = 'ak_live_…', keysHref = '/dashboard/keys' }) {
  const [active, setActive] = useState('overview');

  useEffect(() => {
    const onScroll = () => {
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top > 0 && top < 200) {
          setActive(s.id);
          break;
        }
      }
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, []);

  return (
    <div className="flex gap-8 max-w-6xl">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 sticky top-6 self-start">
        <div className="font-mono text-[11px] text-zinc-600 mb-2">
          <span className="text-emerald-400">$</span> cat docs --toc
        </div>
        <nav className="space-y-0.5 font-mono text-sm">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActive(s.id)}
              className={
                'block px-3 py-1.5 rounded-md transition-all duration-200 ' +
                (active === s.id
                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] border border-transparent')
              }
            >
              {active === s.id ? '> ' : '  '}{s.label}
            </a>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-10 pb-20">
        <div>
          <h1 className="font-mono text-lg text-zinc-100">
            <span className="text-emerald-400">$</span> man asyncops
          </h1>
          <p className="font-mono text-xs text-zinc-500 mt-1">
            run your own workers, let asyncops orchestrate.
          </p>
        </div>

        {/* LANGUAGE SUPPORT NOTICE */}
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/[0.05] p-4">
          <div className="font-mono text-[11px] text-amber-300 mb-1">
            <span className="text-amber-400">!</span> language support
          </div>
          <p className="font-mono text-xs text-amber-100/90 leading-relaxed">
            the asyncops sdk is <span className="text-amber-300">node.js only</span>{' '}
            (node 18+). workers must run in a node process. more language sdks
            are on the roadmap — in the meantime, apps in any language can
            create and inspect jobs via the <a href="#create" className="text-sky-400 hover:text-sky-300">rest api</a>.
          </p>
        </div>

        {/* QUICK START FLOW — visible at the top of every render */}
        <div className="term-panel p-5">
          <div className="font-mono text-[11px] text-zinc-600 mb-3">
            <span className="text-emerald-400">$</span> asyncops --quickstart
          </div>
          <ol className="font-mono text-xs text-zinc-300 list-none space-y-2">
            <FlowStep
              n={1}
              title="get an api key"
              href={keysHref}
              desc="grab a key from your dashboard — one click, shown once."
            />
            <FlowStep
              n={2}
              title="run a worker"
              href="#worker"
              desc="a single node process registering handlers by job type."
            />
            <FlowStep
              n={3}
              title="create a job"
              href="#create"
              desc="call createJob from your app — it flows through the worker."
            />
          </ol>
        </div>

        <Section id="overview" title="overview">
          <p className="font-mono text-xs text-zinc-400 leading-relaxed">
            asyncops is a hosted job orchestration service. your app creates jobs
            via the api, and a worker process you run (anywhere — laptop, vm,
            kubernetes) pulls jobs, executes your handler, and reports back.
            asyncops stores state, retries on failure, and gives you a live
            dashboard of every job.
          </p>
          <p className="font-mono text-xs text-zinc-500 leading-relaxed mt-3">
            the sdk has two entry points: <InlineCode>createWorker</InlineCode>{' '}
            for the process that executes handlers, and{' '}
            <InlineCode>client</InlineCode> for creating and inspecting jobs
            from your application code. call{' '}
            <InlineCode>asyncops.init()</InlineCode> once at startup and both
            reuse the same api key.
          </p>
        </Section>

        <Section id="install" title="install sdk">
          <p className="font-mono text-xs text-zinc-400 mb-3">
            the sdk is a single npm package. node.js 18+ required — no other
            runtimes are supported yet.
          </p>
          <CodeTabs
            tabs={[
              { label: 'npm', code: 'npm install asyncops-sdk' },
              { label: 'yarn', code: 'yarn add asyncops-sdk' },
              { label: 'pnpm', code: 'pnpm add asyncops-sdk' },
            ]}
          />
        </Section>

        <Section id="worker" title="run a worker">
          <p className="font-mono text-xs text-zinc-400 mb-3">
            a worker is a long-running process. it polls asyncops for jobs whose
            type matches one of its registered handlers, executes the handler
            in-process, and reports the result. run as many workers as you like —
            they coordinate automatically.
          </p>
          <CodeTabs
            tabs={[
              {
                label: 'worker.js',
                code: `const { init, createWorker } = require('asyncops-sdk');

init({ apiKey: process.env.ASYNCOPS_API_KEY });

createWorker({
  handlers: {
    'send-email': async (job, ctx) => {
      await ctx.log(\`sending to \${job.data.to}\`);
      // ... your logic
      return { messageId: 'm_abc123' };
    },

    'process-data': async (job, ctx) => {
      await ctx.log(\`processing \${job.data.items.length} items\`);
      // ... your logic
      return { processed: job.data.items.length };
    },
  },
}).start();`,
              },
              {
                label: 'env',
                code: `ASYNCOPS_API_KEY=${apiKey}
ASYNCOPS_URL=${API_URL}`,
              },
              {
                label: 'run',
                code: `node worker.js
# [asyncops-worker] started; types=send-email,process-data
# [asyncops-worker] running send-email (b4e8…)
# [asyncops-worker] completed b4e8…`,
              },
            ]}
          />
          <p className="font-mono text-xs text-zinc-500 mt-3">
            inside a handler, <InlineCode>job.data</InlineCode> is whatever you
            passed to <InlineCode>createJob</InlineCode>. the return value becomes
            the job's <InlineCode>result</InlineCode>. throw an error to fail the
            job — asyncops will automatically retry up to 3 times with exponential backoff.
          </p>
        </Section>

        <Section id="create" title="create a job">
          <p className="font-mono text-xs text-zinc-400 mb-3">
            the <InlineCode>sdk</InlineCode> tab below is node.js only. if your
            app is in another language, use the <InlineCode>curl</InlineCode>{' '}
            or <InlineCode>http</InlineCode> tabs — the endpoint is plain rest
            and works from anywhere. the job <InlineCode>type</InlineCode> must
            match a handler registered on one of your (node.js) workers.
          </p>
          <CodeTabs
            tabs={[
              {
                label: 'sdk (node.js)',
                code: `const { init, client } = require('asyncops-sdk');

init({ apiKey: process.env.ASYNCOPS_API_KEY });

const { id } = await client.createJob({
  type: 'send-email',
  data: { to: 'you@example.com' },
});`,
              },
              {
                label: 'curl',
                code: `curl -X POST ${API_URL}/jobs \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: order-42-confirmation" \\
  -d '{
    "type": "send-email",
    "data": { "to": "you@example.com" }
  }'`,
              },
              {
                label: 'http',
                code: `POST /jobs HTTP/1.1
Host: ${API_URL.replace(/^https?:\/\//, '')}
Authorization: Bearer ${apiKey}
Content-Type: application/json
Idempotency-Key: order-42-confirmation

{
  "type": "send-email",
  "data": { "to": "you@example.com" }
}

# → 201 Created
# {
#   "id": "65f8a41b…",
#   "type": "send-email",
#   "status": "pending"
# }`,
              },
              {
                label: 'idempotency',
                code: `// pass idempotencyKey to safely retry createJob calls.
// the second call with the same key returns the original job.
//
// over rest, send the same value as the "Idempotency-Key" header.
await client.createJob({
  type: 'send-email',
  data: { to: 'you@example.com' },
  idempotencyKey: 'order-42-confirmation',
});`,
              },
            ]}
          />
        </Section>

        <Section id="inspect" title="inspect a job">
          <p className="font-mono text-xs text-zinc-400 mb-3">
            get the full state of a job plus every log your worker emitted.
            works from node.js via the sdk, or from any language via rest.
          </p>
          <CodeTabs
            tabs={[
              {
                label: 'sdk (node.js)',
                code: `const { job, logs } = await client.getJob(id);

console.log(job.status); // 'pending' | 'processing' | 'completed' | 'failed'
console.log(job.result); // return value of your handler
console.log(job.error);  // error message if failed
console.log(logs);       // [{ message, timestamp }, ...]`,
              },
              {
                label: 'curl',
                code: `curl ${API_URL}/jobs/<job-id> \\
  -H "Authorization: Bearer ${apiKey}"`,
              },
              {
                label: 'http',
                code: `GET /jobs/<job-id> HTTP/1.1
Host: ${API_URL.replace(/^https?:\/\//, '')}
Authorization: Bearer ${apiKey}`,
              },
              {
                label: 'response',
                code: `{
  "job": {
    "id": "65f8a41b…",
    "type": "send-email",
    "status": "completed",
    "data": { "to": "you@example.com" },
    "result": { "messageId": "m_abc123" },
    "error": null,
    "attempts": 1,
    "createdAt": "…",
    "updatedAt": "…"
  },
  "logs": [
    { "id": "…", "message": "Job created", "timestamp": "…" },
    { "id": "…", "message": "Worker picked up job", "timestamp": "…" },
    { "id": "…", "message": "sending to you@example.com", "timestamp": "…" },
    { "id": "…", "message": "Job completed", "timestamp": "…" }
  ]
}`,
              },
            ]}
          />
        </Section>

        <Section id="retry" title="retry a job">
          <p className="font-mono text-xs text-zinc-400 mb-3">
            replay any job — failed or successful. clears the previous{' '}
            <InlineCode>result</InlineCode> / <InlineCode>error</InlineCode>, re-queues it,
            and the next idle worker picks it up.
          </p>
          <CodeTabs
            tabs={[
              {
                label: 'sdk (node.js)',
                code: 'await client.retryJob(id);',
              },
              {
                label: 'curl',
                code: `curl -X POST ${API_URL}/jobs/<job-id>/retry \\
  -H "Authorization: Bearer ${apiKey}"`,
              },
              {
                label: 'http',
                code: `POST /jobs/<job-id>/retry HTTP/1.1
Host: ${API_URL.replace(/^https?:\/\//, '')}
Authorization: Bearer ${apiKey}`,
              },
            ]}
          />
        </Section>

        <Section id="errors" title="errors">
          <p className="font-mono text-xs text-zinc-400 mb-3">
            every sdk method throws on non-2xx responses. the error carries{' '}
            <InlineCode>err.message</InlineCode> (human-readable, includes path
            + method) and <InlineCode>err.status</InlineCode> (http status code).
          </p>
          <div className="space-y-2 mt-4">
            <ErrorRow code="400" msg="missing or invalid `type` field in body." />
            <ErrorRow code="401" msg="missing, expired, or invalid api key." />
            <ErrorRow code="403" msg="admin-only route accessed without the admin role." />
            <ErrorRow code="404" msg="job does not exist or belongs to another account." />
            <ErrorRow code="413" msg="request body exceeds the 1 MB payload limit." />
            <ErrorRow code="429" msg="monthly job limit reached for your plan." />
            <ErrorRow code="500" msg="server error — check the dashboard and retry." />
          </div>
        </Section>
      </div>
    </div>
  );
}

function FlowStep({ n, title, href, desc }) {
  const isAnchor = href.startsWith('#');
  const Inner = (
    <>
      <span className="text-emerald-400 shrink-0 w-5 tabular-nums">{n}.</span>
      <span className="flex-1">
        <span className="text-sky-400 group-hover:text-sky-300 transition-colors">
          {title}
        </span>
        <span className="text-zinc-500"> — {desc}</span>
      </span>
    </>
  );
  return (
    <li>
      {isAnchor ? (
        <a href={href} className="group flex gap-2 hover:text-zinc-200 transition-colors">
          {Inner}
        </a>
      ) : (
        <Link href={href} className="group flex gap-2 hover:text-zinc-200 transition-colors">
          {Inner}
        </Link>
      )}
    </li>
  );
}

function InlineCode({ children }) {
  return (
    <code className="font-mono px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.08] rounded text-sky-400 text-[11px]">
      {children}
    </code>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="font-mono text-sm text-zinc-200 mb-3">
        <span className="text-emerald-400">#</span> {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CodeTabs({ tabs }) {
  const [active, setActive] = useState(tabs[0].label);
  const [copied, setCopied] = useState(false);
  const current = useMemo(() => tabs.find((t) => t.label === active) || tabs[0], [tabs, active]);

  function copy() {
    navigator.clipboard.writeText(current.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="term-panel overflow-hidden">
      <div className="flex items-center justify-between bg-[#161616] border-b border-white/[0.06] px-2">
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.label}
              onClick={() => setActive(t.label)}
              className={
                'px-3 py-2 font-mono text-[11px] border-b-2 -mb-px transition-colors ' +
                (active === t.label
                  ? 'border-emerald-400 text-emerald-300'
                  : 'border-transparent text-zinc-600 hover:text-zinc-300')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={copy}
          className="font-mono text-[11px] text-zinc-600 hover:text-emerald-400 px-2 py-1 rounded transition-colors"
        >
          {copied ? 'copied!' : 'copy'}
        </button>
      </div>
      <pre className="font-mono text-xs text-zinc-300 p-4 overflow-auto">
        {current.code}
      </pre>
    </div>
  );
}

function ErrorRow({ code, msg }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <span className="font-mono text-[11px] px-2 py-0.5 rounded border border-rose-500/20 bg-rose-500/5 text-rose-400">{code}</span>
      <span className="font-mono text-xs text-zinc-400">{msg}</span>
    </div>
  );
}
