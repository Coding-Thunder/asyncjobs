import Link from 'next/link';
import DashboardPreview from './DashboardPreview';
import { siteConfig } from '../../lib/siteConfig';

export default function Hero() {
  const { hero, brand } = siteConfig;

  return (
    <section className="relative pt-28 pb-24 px-6 overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-grid radial-fade pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-gradient-to-b from-emerald-500/15 via-cyan-500/8 to-transparent blur-3xl rounded-full pointer-events-none" />

      <div className="relative max-w-6xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.03] text-xs text-zinc-400 animate-fade-in">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-dot" />
          {brand.version}
        </div>

        <p className="mt-4 text-sm font-mono text-emerald-400/80 tracking-wide animate-fade-in">
          {hero.tagline}
        </p>

        <h1 className="mt-6 text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-gradient leading-[1.05] animate-fade-up">
          {hero.headline.map((line, i) => (
            <span key={i}>
              {line}
              {i < hero.headline.length - 1 && <br />}
            </span>
          ))}
        </h1>

        <p className="mt-6 max-w-2xl mx-auto text-lg text-zinc-400 animate-fade-up delay-100">
          {hero.subtext}
        </p>

        <div className="mt-10 flex items-center justify-center gap-3 animate-fade-up delay-200">
          <Link
            href={hero.primaryCta.href}
            className="group px-6 py-3 rounded-lg bg-white text-zinc-900 font-medium text-sm hover:bg-zinc-200 transition-all shadow-[0_0_40px_-10px_rgba(255,255,255,0.4)]"
          >
            {hero.primaryCta.label}
            <span className="inline-block ml-1 transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <Link
            href={hero.secondaryCta.href}
            className="px-6 py-3 rounded-lg border border-white/15 bg-white/[0.03] text-zinc-200 font-medium text-sm hover:bg-white/[0.06] hover:border-white/25 transition-all"
          >
            {hero.secondaryCta.label}
          </Link>
        </div>

        {hero.languageNote && (
          <div className="mt-5 flex justify-center animate-fade-up delay-300">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] text-[11px] font-mono text-emerald-300/90">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {hero.languageNote}
            </div>
          </div>
        )}

        <div className="mt-20 animate-fade-up delay-400">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}
