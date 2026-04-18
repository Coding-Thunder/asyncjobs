'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiFetch, getToken } from '../../lib/api';
import { LogoIcon } from '../../components/Logo';

const CONTACT_EMAIL = 'hello@asyncops.com';
const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}?subject=AsyncOps%20Pro%20upgrade`;

const sharedFeatures = [
  'Dashboard with real-time SSE updates',
  'Automatic retries with exponential backoff',
  'Idempotency keys + stalled-job recovery',
  'One-click replay of any job',
  'Per-job logs, inputs, outputs, errors',
];

const tiers = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: '/mo',
    tagline: 'For side projects and first incidents.',
    features: [
      '1,000 jobs / month',
      ...sharedFeatures,
    ],
    cta: 'Start Free',
    href: '/signup',
    highlighted: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$49',
    period: '/mo',
    tagline: 'When production volume outgrows the free tier.',
    badge: 'More headroom',
    features: [
      '50,000 jobs / month',
      ...sharedFeatures,
    ],
    cta: 'Contact us',
    action: 'contact',
    highlighted: true,
  },
];

const pains = [
  {
    glyph: '◷',
    title: 'Async failures are invisible',
    body:
      'A job silently dies at 3am. Your user complains at 9am. Logs are rotated. You have nothing to go on except a stack trace from six hours ago — if you even have that.',
  },
  {
    glyph: '⌁',
    title: 'Debugging takes hours',
    body:
      'You grep logs, correlate request IDs, ssh into a worker, rerun the job by hand, and pray the bug repros. Every async incident costs half a day you didn\'t plan for.',
  },
  {
    glyph: '↻',
    title: 'Retries are risky',
    body:
      'Did the failed charge actually go through? Was that email sent twice? Without durable state and idempotent retries, every \u201cjust rerun it\u201d feels like rolling dice.',
  },
];

const solutions = [
  {
    glyph: '▣',
    title: 'Every job, fully inspectable',
    body:
      'Status, attempts, inputs, outputs, and every log line — durable, searchable, and streamed live to the dashboard. Nothing rotates out mid-incident.',
  },
  {
    glyph: '⟲',
    title: 'Retries you can trust',
    body:
      'Idempotency keys, exponential backoff, stalled-job detection. Replay any job from the dashboard with one click. Your handlers stay in your code — your retry logic stays out of it.',
  },
  {
    glyph: '◎',
    title: 'Control plane, not a black box',
    body:
      'Workers run in your environment and talk to AsyncOps over HTTPS. No shared Redis, no mystery infra, no support ticket to see what your own job did.',
  },
];

const comparisonRows = [
  { label: 'Jobs per month', free: '1,000', pro: '50,000' },
  { label: 'Automatic retries + backoff', free: '✓', pro: '✓' },
  { label: 'Idempotency keys', free: '✓', pro: '✓' },
  { label: 'Stalled-job recovery', free: '✓', pro: '✓' },
  { label: 'One-click replay', free: '✓', pro: '✓' },
  { label: 'Real-time log streaming', free: '✓', pro: '✓' },
  { label: 'Per-job logs & inputs/outputs', free: '✓', pro: '✓' },
];

export default function PricingPage() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch('/me').then(setMe).catch(() => {});
  }, []);

  const isLoggedIn = !!me;
  const currentPlan = me?.plan;

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0b] text-zinc-100">
      {/* Nav */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-lg bg-[#0a0a0b]/70 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <LogoIcon size={24} />
            <span className="text-sm tracking-tight">AsyncOps</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 font-mono text-[12px] text-zinc-500">
            <Link href="/#features" className="hover:text-zinc-200 transition-colors">features</Link>
            <Link href="/pricing" className="text-zinc-200">pricing</Link>
            <Link href="/docs" className="hover:text-zinc-200 transition-colors">docs</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="text-sm text-zinc-400 hover:text-white px-3 py-1.5 transition-colors">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="text-sm px-3 py-1.5 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-28 pb-24 px-6 relative">
        <div className="absolute inset-x-0 top-0 h-[480px] bg-grid radial-fade opacity-40 pointer-events-none" />

        {/* ─── Hero ─── */}
        <section className="relative max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">
            <span className="h-px w-6 bg-zinc-700" />
            pricing
            <span className="h-px w-6 bg-zinc-700" />
          </div>
          <h1 className="mt-5 text-4xl sm:text-6xl font-semibold tracking-tight text-gradient leading-[1.05]">
            Start free.<br />
            Stop guessing in production.
          </h1>
          <p className="mt-6 text-lg text-zinc-400 max-w-xl mx-auto">
            Debug, control, and trust your async workflows.
          </p>
          <p className="mt-3 text-sm text-zinc-500 font-mono">
            <span className="text-emerald-400">$</span> pricing is insurance, not a feature unlock.
          </p>
        </section>

        {/* ─── Pricing cards ─── */}
        <section className="relative mt-16 max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
          {tiers.map((tier) => {
            const isCurrent = isLoggedIn && currentPlan === tier.id;
            return (
              <div
                key={tier.name}
                className={
                  'group relative rounded-2xl p-7 flex flex-col transition-all duration-300 ' +
                  (tier.highlighted
                    ? 'bg-gradient-to-b from-emerald-500/[0.07] to-white/[0.02] border border-emerald-500/30 shadow-[0_0_80px_-20px_rgba(34,197,94,0.35)] hover:shadow-[0_0_100px_-15px_rgba(34,197,94,0.45)] hover:-translate-y-0.5'
                    : 'bg-white/[0.03] border border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.04]')
                }
              >
                {tier.badge && (
                  <span className="absolute -top-3 left-7 bg-emerald-500 text-zinc-950 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full shadow-[0_0_20px_-4px_rgba(34,197,94,0.6)]">
                    {tier.badge}
                  </span>
                )}
                {isCurrent && (
                  <span className="absolute -top-3 right-7 bg-zinc-800 border border-white/10 text-zinc-300 text-[10px] font-mono uppercase tracking-wider px-3 py-1 rounded-full">
                    current plan
                  </span>
                )}

                <div>
                  <h3 className="text-xl font-semibold text-white">{tier.name}</h3>
                  <p className="mt-1.5 text-sm text-zinc-400">{tier.tagline}</p>
                </div>

                <div className="mt-6 flex items-baseline">
                  <span className="text-5xl font-bold text-white tracking-tight">{tier.price}</span>
                  <span className="text-zinc-500 ml-1.5 text-sm">{tier.period}</span>
                </div>

                <ul className="mt-7 space-y-3.5 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-3 text-sm text-zinc-300">
                      <span
                        className={
                          'mt-0.5 shrink-0 ' +
                          (tier.highlighted ? 'text-emerald-400' : 'text-zinc-500')
                        }
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                {tier.action === 'contact' ? (
                  isCurrent ? (
                    <button
                      disabled
                      className="mt-8 w-full py-3 rounded-lg text-sm font-semibold bg-white/[0.04] border border-white/[0.08] text-zinc-500 cursor-not-allowed"
                    >
                      ✓ You&apos;re on Pro
                    </button>
                  ) : (
                    <a
                      href={CONTACT_MAILTO}
                      className="mt-8 block w-full py-3 rounded-lg text-sm font-semibold text-center bg-white text-zinc-900 hover:bg-zinc-100 shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)] hover:shadow-[0_0_50px_-8px_rgba(255,255,255,0.55)] hover:-translate-y-px transition-all duration-200"
                    >
                      {tier.cta}
                    </a>
                  )
                ) : (
                  <Link
                    href={tier.href}
                    className={
                      'mt-8 block w-full py-3 rounded-lg text-sm font-semibold text-center transition-all duration-200 ' +
                      (isCurrent
                        ? 'bg-white/[0.04] border border-white/[0.08] text-zinc-500 pointer-events-none'
                        : 'border border-white/[0.1] text-zinc-200 hover:bg-white/[0.06] hover:border-white/[0.2]')
                    }
                  >
                    {isCurrent ? '✓ Current plan' : tier.cta}
                  </Link>
                )}
              </div>
            );
          })}
        </section>

        {/* ─── Value / pain → solution ─── */}
        <section className="relative mt-32 max-w-5xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">
              <span className="h-px w-6 bg-zinc-700" />
              why it matters
            </div>
            <h2 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
              Async bugs don&apos;t page you. <br className="hidden sm:block" />They just silently break things.
            </h2>
            <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
              Every async system has the same three failure modes. AsyncOps exists because grepping log files at 2am isn&apos;t a debugging strategy.
            </p>
          </div>

          <div className="mt-14 grid md:grid-cols-3 gap-5">
            {pains.map((p) => (
              <div
                key={p.title}
                className="rounded-xl p-6 bg-rose-500/[0.04] border border-rose-500/[0.12] transition-all duration-300 hover:border-rose-400/30 hover:bg-rose-500/[0.06]"
              >
                <div className="text-2xl text-rose-400/80">{p.glyph}</div>
                <h3 className="mt-3 text-base font-semibold text-zinc-100">{p.title}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>

          {/* Transition arrow */}
          <div className="mt-12 flex items-center justify-center gap-3 font-mono text-xs text-zinc-500">
            <span className="h-px w-16 bg-gradient-to-r from-transparent to-emerald-500/40" />
            <span className="text-emerald-400">AsyncOps turns every one of these into a solved problem</span>
            <span className="h-px w-16 bg-gradient-to-l from-transparent to-emerald-500/40" />
          </div>

          <div className="mt-10 grid md:grid-cols-3 gap-5">
            {solutions.map((s) => (
              <div
                key={s.title}
                className="rounded-xl p-6 bg-emerald-500/[0.04] border border-emerald-500/[0.15] transition-all duration-300 hover:border-emerald-400/40 hover:bg-emerald-500/[0.07] hover:shadow-[0_0_40px_-12px_rgba(34,197,94,0.3)]"
              >
                <div className="text-2xl text-emerald-400">{s.glyph}</div>
                <h3 className="mt-3 text-base font-semibold text-zinc-100">{s.title}</h3>
                <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── Comparison table ─── */}
        <section className="relative mt-32 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-mono">
              <span className="h-px w-6 bg-zinc-700" />
              side by side
            </div>
            <h2 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient">
              Free vs Pro
            </h2>
            <p className="mt-4 text-sm text-zinc-500 font-mono">
              <span className="text-emerald-400">$</span> diff --plan=free --plan=pro
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-white/[0.08] bg-white/[0.02] overflow-hidden backdrop-blur-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-zinc-500 px-6 py-4">
                    Feature
                  </th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-zinc-500 px-6 py-4 w-40">
                    Free
                  </th>
                  <th className="text-left font-mono text-[11px] uppercase tracking-wider text-emerald-400 px-6 py-4 w-52">
                    Pro
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, idx) => (
                  <tr
                    key={row.label}
                    className={
                      'transition-colors hover:bg-white/[0.02] ' +
                      (idx !== comparisonRows.length - 1 ? 'border-b border-white/[0.04]' : '')
                    }
                  >
                    <td className="px-6 py-4 text-zinc-200 font-medium">{row.label}</td>
                    <td className="px-6 py-4 text-zinc-500 font-mono text-[13px]">{row.free}</td>
                    <td className="px-6 py-4 text-emerald-300 font-mono text-[13px]">{row.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ─── Final CTA ─── */}
        <section className="relative mt-32 max-w-3xl mx-auto text-center">
          <div className="rounded-2xl p-12 bg-gradient-to-b from-emerald-500/[0.08] to-white/[0.01] border border-emerald-500/25 shadow-[0_0_100px_-30px_rgba(34,197,94,0.35)]">
            <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-emerald-400/80 font-mono">
              <span className="h-px w-6 bg-emerald-500/40" />
              ready?
            </div>
            <h2 className="mt-5 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient leading-tight">
              Ship async systems with confidence.
            </h2>
            <p className="mt-4 text-zinc-400 max-w-lg mx-auto">
              Stop grepping logs. Start trusting your background jobs. Upgrade anytime — your incidents won&apos;t wait for you to be ready.
            </p>
            <div className="mt-8 flex items-center justify-center gap-3">
              {currentPlan === 'pro' ? (
                <button
                  disabled
                  className="px-6 py-3 rounded-lg text-sm font-semibold bg-white/[0.04] border border-white/[0.08] text-zinc-500 cursor-not-allowed"
                >
                  ✓ You&apos;re on Pro
                </button>
              ) : isLoggedIn ? (
                <a
                  href={CONTACT_MAILTO}
                  className="px-6 py-3 rounded-lg text-sm font-semibold bg-white text-zinc-900 hover:bg-zinc-100 shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)] transition-all duration-200 hover:-translate-y-px"
                >
                  Contact us
                </a>
              ) : (
                <Link
                  href="/signup"
                  className="px-6 py-3 rounded-lg text-sm font-semibold bg-white text-zinc-900 hover:bg-zinc-100 shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)] transition-all duration-200 hover:-translate-y-px"
                >
                  Start free
                </Link>
              )}
              <Link
                href="/docs"
                className="px-6 py-3 rounded-lg text-sm font-semibold border border-white/[0.1] text-zinc-200 hover:bg-white/[0.05] hover:border-white/[0.2] transition-all duration-200"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.05] px-6 py-8 relative">
        <div className="max-w-6xl mx-auto flex items-center justify-center text-xs text-zinc-500 font-mono">
          <span className="text-emerald-400/60">$</span>&nbsp;async peace of mind &mdash; &copy;{' '}
          {new Date().getFullYear()} AsyncOps
        </div>
      </footer>
    </div>
  );
}
