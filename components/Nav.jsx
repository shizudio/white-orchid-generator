import Link from 'next/link';
import QuickGuide from './QuickGuide';

export default function Nav({ section }) {
  return (
    <nav className="app-nav" style={{ background: 'var(--bg-deep)', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line-on-deep)', position: 'sticky', top: 0, zIndex: 100 }}>
      <Link className="app-nav-brand" href="/" aria-label="The White Orchid home" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', borderBottom: 'none' }}>
        {/* The real circle mark (ivory orchid on brand green) — the old CSS
            filter washed it into a blank disc (client feedback 2026-07-10). */}
        <img src="/assets/logos/ds/logo-circle.png" alt="" style={{ width: 30, height: 30, objectFit: 'contain' }} />
        <span className="app-nav-wordmark" style={{ fontFamily: 'var(--font-wordmark)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--fg-on-deep)', textTransform: 'uppercase' }}>
          The White Orchid
        </span>
      </Link>
      <div className="app-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {[
          { href: '/generate', label: 'Create' },
          { href: '/upload', label: 'Upload' },
          { href: '/library', label: 'Library' },
          { href: '/admin/brand', label: 'Brand kit' },
        ].map(({ href, label }) => (
          <Link className={`app-nav-link${section === label.toLowerCase() ? ' is-active' : ''}`} key={href} href={href}
            aria-current={section === label.toLowerCase() ? 'page' : undefined} style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: section === label.toLowerCase() ? 600 : 400,
            color: section === label.toLowerCase() ? 'var(--tw-celadon)' : 'color-mix(in srgb, var(--tw-smoke) 70%, transparent)',
            borderBottom: 'none',
            letterSpacing: 0,
            transition: 'color 140ms',
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '0 4px',
          }}>
            {label}
          </Link>
        ))}
        {/* (Pipeline map — client ask 2026-07-12) A quiet reference link to the
            living map of how the studio builds a post (the claude.ai artifact
            twin of docs/asset-pipeline.md). Private to the owner's account —
            staff without access simply see a login page. */}
        <a className="app-nav-link" href="https://claude.ai/code/artifact/dce8aa7b-378b-4ab2-b91c-37b5873dda90"
          target="_blank" rel="noopener noreferrer" title="How the studio builds a post — the pipeline map"
          style={{
            fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 400,
            color: 'color-mix(in srgb, var(--tw-smoke) 70%, transparent)',
            borderBottom: 'none', letterSpacing: 0, transition: 'color 140ms',
            display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44, padding: '0 4px',
          }}>
          How it works<span aria-hidden="true" style={{ fontSize: 10, opacity: 0.7 }}>↗</span>
        </a>
        <QuickGuide />
      </div>
    </nav>
  );
}
