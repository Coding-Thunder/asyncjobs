import Link from 'next/link';
import Hero from '../components/landing/Hero';
import Terminal from '../components/landing/Terminal';
import SystemActivity from '../components/landing/SystemActivity';
import { JobTrackingCard, LogsTimelineCard, RetryCard } from '../components/landing/FeatureCards';
import { LogoIcon } from '../components/Logo';
import { siteConfig } from '../lib/siteConfig';

const logToneColors = {
  default: 'text-zinc-300',
  sky: 'text-sky-300',
  rose: 'text-rose-300',
};

export default function LandingPage() {
  const { brand, nav, terminal, systemActivity, problem, features, ctaSection, footer } = siteConfig;

  return (
    <div className="min-h-screen flex flex-col">
      {/* NAV */}
      <header className="fixed top-0 inset-x-0 z-50 backdrop-blur-lg bg-[#0a0a0b]/60 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <LogoIcon size={24} />
            <span className="text-sm tracking-tight">{brand.name}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-zinc-400">
            {nav.links.map((l) => {
              // Real routes use next/link for client-side nav; pure on-page
              // anchors ("#foo") still use <a> so they jump to the section.
              const isAnchor = l.href.startsWith('#');
              return isAnchor ? (
                <a key={l.label} href={l.href} className="hover:text-white transition-colors">
                  {l.label}
                </a>
              ) : (
                <Link key={l.label} href={l.href} className="hover:text-white transition-colors">
                  {l.label}
                </Link>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Link href={nav.signInHref} className="text-sm text-zinc-400 hover:text-white px-3 py-1.5">Sign in</Link>
            <Link
              href={nav.ctaHref}
              className="text-sm px-3 py-1.5 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
            >
              {nav.ctaLabel}
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* HERO */}
        <Hero />

        {/* LIVE SYSTEM ACTIVITY */}
        <section id="system-activity" className="relative px-6 py-24 border-t border-white/[0.05]">
          <div className="max-w-4xl mx-auto">
            <SectionLabel>{systemActivity.label}</SectionLabel>
            <SectionTitle>{systemActivity.title}</SectionTitle>
            <p className="mt-3 text-zinc-400 max-w-xl">{systemActivity.subtitle}</p>
            <div className="mt-10">
              <SystemActivity />
            </div>
          </div>
        </section>

        {/* TERMINAL */}
        <section id="terminal" className="relative px-6 py-24">
          <div className="max-w-4xl mx-auto">
            <SectionLabel>{terminal.label}</SectionLabel>
            <SectionTitle>{terminal.title}</SectionTitle>
            <p className="mt-3 text-zinc-400 max-w-xl">{terminal.subtitle}</p>
            {terminal.languageNote && (
              <div className="mt-4 flex items-start gap-2.5 max-w-2xl rounded-lg border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5">
                <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 font-mono text-[9px] text-amber-300">!</span>
                <p className="font-mono text-[11px] leading-relaxed text-amber-200/90">
                  {terminal.languageNote}
                </p>
              </div>
            )}
            <div className="mt-10">
              <Terminal />
            </div>
          </div>
        </section>

        {/* PAIN → SOLUTION */}
        <section className="relative px-6 py-24 border-t border-white/[0.05]">
          <div className="max-w-6xl mx-auto">
            <SectionLabel>{problem.label}</SectionLabel>
            <SectionTitle>{problem.title}</SectionTitle>

            <div className="mt-14 grid lg:grid-cols-2 gap-10 items-center">
              {/* Pain points */}
              <div className="space-y-4">
                {problem.painPoints.map((text) => (
                  <PainRow key={text} text={text} />
                ))}
              </div>

              {/* Solution UI */}
              <div className="soft-card rounded-2xl p-5 glow">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="text-xs text-zinc-500">Job details</div>
                    <div className="font-mono text-sm text-white">{problem.solutionJob.id}</div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] border bg-rose-400/10 border-rose-400/20 text-rose-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                    {problem.solutionJob.status}
                  </span>
                </div>

                <div className="rounded-lg bg-black/40 border border-white/[0.06] p-3 font-mono text-[11px] leading-relaxed">
                  {problem.solutionJob.logs.map((log, i) => (
                    <div key={i} className="text-zinc-500">
                      [{log.time}] <span className={logToneColors[log.tone] || logToneColors.default}>{log.msg}</span>
                    </div>
                  ))}
                  {problem.solutionJob.stack.map((line, i) => (
                    <div key={i} className="pl-4 text-zinc-600">{line}</div>
                  ))}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button className="flex-1 py-2 rounded-lg bg-white text-zinc-900 text-xs font-semibold hover:bg-zinc-200 transition-colors">
                    ↻  Retry job
                  </button>
                  <button className="py-2 px-3 rounded-lg border border-white/10 bg-white/[0.03] text-xs text-zinc-300 hover:bg-white/[0.06] transition-colors">
                    Inspect job
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="relative px-6 py-24 border-t border-white/[0.05]">
          <div className="max-w-6xl mx-auto">
            <SectionLabel>{features.label}</SectionLabel>
            <SectionTitle>{features.title}</SectionTitle>

            <div className="mt-14 grid md:grid-cols-3 gap-5">
              <JobTrackingCard />
              <LogsTimelineCard />
              <RetryCard />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative px-6 py-28 border-t border-white/[0.05]">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[300px] bg-gradient-to-r from-emerald-500/15 via-cyan-500/12 to-emerald-500/10 blur-3xl rounded-full" />
          </div>
          <div className="relative max-w-3xl mx-auto text-center">
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-gradient">
              {ctaSection.title}
            </h2>
            <p className="mt-4 text-zinc-400">{ctaSection.subtitle}</p>
            <div className="mt-8 flex items-center justify-center gap-3">
              <Link
                href={ctaSection.button.href}
                className="group px-7 py-3.5 rounded-lg bg-white text-zinc-900 font-semibold text-sm hover:bg-zinc-200 transition-all shadow-[0_0_60px_-10px_rgba(255,255,255,0.5)]"
              >
                {ctaSection.button.label}
                <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">→</span>
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.05] px-6 py-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <LogoIcon size={20} />
            {footer.copyright}
          </div>
          <div className="flex items-center gap-5">
            {footer.links.map((l) => {
              const isInternal = l.href.startsWith('/');
              return isInternal ? (
                <Link key={l.label} href={l.href} className="hover:text-zinc-300 transition-colors">
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href} className="hover:text-zinc-300 transition-colors">
                  {l.label}
                </a>
              );
            })}
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
      <span className="h-px w-6 bg-zinc-700" />
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight text-gradient max-w-2xl">
      {children}
    </h2>
  );
}

function PainRow({ text }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] transition-colors">
      <div className="mt-0.5 h-5 w-5 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-300 text-xs">✕</div>
      <div className="text-zinc-200 text-[15px]">{text}</div>
    </div>
  );
}
