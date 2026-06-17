'use client';
import Link from 'next/link';

export default function Library() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--ivory)' }}>
      <nav style={{ background: 'var(--burnham)', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 3, color: 'var(--ivory)', textTransform: 'uppercase' }}>The White Orchid — Library</span>
        <Link href="/" style={{ fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2, color: 'var(--celadon)', textTransform: 'uppercase' }}>← Back</Link>
      </nav>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '60px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-serif)', fontSize: 32, color: 'var(--burnham)', marginBottom: 12 }}>Asset Library</div>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#6B6560', marginBottom: 40 }}>
          All uploaded images and composited exports — searchable, filterable, with full metadata and lineage.
        </p>
        <div style={{ background: '#fff', borderRadius: 16, padding: '60px 40px', border: '1.5px dashed rgba(184,176,168,0.5)' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>📁</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--burnham)', marginBottom: 8 }}>Coming in Phase 2</div>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#6B6560' }}>
            Image ingestion with consent gating, auto-metadata, and searchable library UI is next up after brand kit is wired.
          </p>
          <Link href="/generate" style={{ display: 'inline-block', marginTop: 24, padding: '11px 28px', background: 'var(--tangerine)', color: '#fff', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
            Create a Post →
          </Link>
        </div>
      </div>
    </div>
  );
}
