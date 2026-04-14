import Link from 'next/link';
import DocsContent from '../../components/docs/DocsContent';
import { LogoIcon } from '../../components/Logo';
import { siteConfig } from '../../lib/siteConfig';

export const metadata = {
  title: `Docs — ${siteConfig.brand.name}`,
  description:
    'AsyncOps documentation — install the SDK, run a worker, create jobs, and debug failures.',
};

// Public /docs route. Source of truth is <DocsContent />, which is also
// rendered inside /dashboard/docs. No auth required.
export default function PublicDocsPage() {
  const { brand, nav, footer } = siteConfig;

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0b]">
      {/* NAV */}
      <header className="sticky top-0 inset-x-0 z-50 backdrop-blur-lg bg-[#0a0a0b]/60 border-b border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 font-semibold">
            <LogoIcon size={24} />
            <span className="text-sm tracking-tight">{brand.name}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-7 text-sm text-zinc-400">
            {nav.links.map((l) => {
              const isInternal = l.href.startsWith('/');
              return isInternal ? (
                <Link key={l.label} href={l.href} className="hover:text-white transition-colors">
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href} className="hover:text-white transition-colors">
                  {l.label}
                </a>
              );
            })}
          </nav>
          <div className="flex items-center gap-2">
            <Link href={nav.signInHref} className="text-sm text-zinc-400 hover:text-white px-3 py-1.5">
              Sign in
            </Link>
            <Link
              href={nav.ctaHref}
              className="text-sm px-3 py-1.5 rounded-lg bg-white text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
            >
              {nav.ctaLabel}
            </Link>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-6 py-10 relative">
        <div className="absolute inset-0 bg-grid radial-fade pointer-events-none opacity-30" />
        <div className="relative max-w-6xl mx-auto">
          {/* Public visitors don't have a key yet — send them to signup for one */}
          <DocsContent apiKey="ak_live_…" keysHref="/signup" />
        </div>
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
