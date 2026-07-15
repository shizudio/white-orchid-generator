'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import QuickGuide from './QuickGuide';

// (Mobile audit 2026-07-15 #14) Below 560px the four text links + "How it works"
// overflow the 375px bar (measured scrollWidth 405 > 375) and clip off the right
// edge. They now collapse behind a compact hamburger menu; the QuickGuide "?" and
// the brand stay inline. Desktop (>560px) renders the exact prior inline row — the
// hamburger + dropdown are display:none there (see globals.css), so nothing about
// the desktop nav changes.
const NAV_LINKS = [
  { href: '/generate', label: 'Create' },
  { href: '/upload', label: 'Upload' },
  { href: '/library', label: 'Library' },
  { href: '/admin/brand', label: 'Brand kit' },
];

const PIPELINE_MAP = 'https://claude.ai/code/artifact/dce8aa7b-378b-4ab2-b91c-37b5873dda90';

export default function Nav({ section }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuWrapRef = useRef(null);

  // Close the mobile menu on outside-click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = e => { if (menuWrapRef.current && !menuWrapRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
  }, [menuOpen]);

  const isActive = label => section === label.toLowerCase();

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
      <div className="app-nav-links" ref={menuWrapRef} style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {NAV_LINKS.map(({ href, label }) => (
          <Link className={`app-nav-link${isActive(label) ? ' is-active' : ''}`} key={href} href={href}
            aria-current={isActive(label) ? 'page' : undefined} style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: isActive(label) ? 600 : 400,
            color: isActive(label) ? 'var(--tw-celadon)' : 'color-mix(in srgb, var(--tw-smoke) 70%, transparent)',
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
        <a className="app-nav-link" href={PIPELINE_MAP}
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

        {/* (#14) Mobile-only hamburger — hidden on desktop via globals.css. Lives
            inside the same flex row so it sits beside the QuickGuide "?". */}
        <button type="button" className="app-nav-menu-btn" aria-label="Menu" aria-expanded={menuOpen}
          onClick={() => setMenuOpen(o => !o)}>
          <span aria-hidden="true">{menuOpen ? '✕' : '☰'}</span>
        </button>
        {menuOpen && (
          <div className="app-nav-menu" role="menu">
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} role="menuitem" onClick={() => setMenuOpen(false)}
                aria-current={isActive(label) ? 'page' : undefined}
                style={{ color: isActive(label) ? 'var(--tw-celadon)' : undefined, fontWeight: isActive(label) ? 600 : 400 }}>
                {label}
              </Link>
            ))}
            <a href={PIPELINE_MAP} role="menuitem" target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>
              How it works ↗
            </a>
          </div>
        )}
      </div>
    </nav>
  );
}
