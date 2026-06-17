import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, position: 'relative', overflow: 'hidden' }}>
      {/* Decorative pattern overlay */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url(/assets/patterns/ds-pattern-1.svg)', backgroundSize: '480px', backgroundRepeat: 'repeat', opacity: 0.08, pointerEvents: 'none' }} />

      {/* Content */}
      <div style={{ position: 'relative', textAlign: 'center', padding: '0 32px', maxWidth: 560 }}>
        {/* Logo */}
        <img src="/assets/logos/ds/logo-2-ivory.png" alt="The White Orchid" style={{ width: 200, height: 'auto', objectFit: 'contain', marginBottom: 32 }} />

        {/* Headline */}
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(2.5rem, 5vw, 4rem)', fontWeight: 400, color: 'var(--fg-on-deep)', lineHeight: 1.05, letterSpacing: '-0.01em', marginBottom: 16 }}>
          Content Studio
        </h1>

        {/* Lede */}
        <p style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 18, color: 'color-mix(in srgb, var(--tw-smoke) 70%, transparent)', lineHeight: 1.6, marginBottom: 48 }}>
          On-brand social content, without a designer.
        </p>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/generate" style={btn('filled')}>Create post</Link>
          <Link href="/upload" style={btn('ghost')}>Upload images</Link>
          <Link href="/library" style={btn('ghost')}>Library</Link>
        </div>

        {/* Admin link */}
        <div style={{ marginTop: 40, paddingTop: 40, borderTop: '1px solid var(--line-on-deep)' }}>
          <Link href="/admin/brand" style={{ fontFamily: 'var(--font-syne)', fontSize: 11, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-on-deep-soft)', opacity: 0.7 }}>
            Brand kit →
          </Link>
        </div>
      </div>
    </main>
  );
}

function btn(variant) {
  const base = {
    display: 'inline-flex', alignItems: 'center',
    fontFamily: 'var(--font-syne)',
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    padding: '14px 32px',
    borderRadius: 'var(--radius-2xl)',
    transition: 'background 140ms, color 140ms, box-shadow 140ms',
    whiteSpace: 'nowrap',
  };
  if (variant === 'filled') return { ...base, background: 'var(--tw-tangerine)', color: '#fff', border: 'none' };
  return { ...base, background: 'transparent', color: 'var(--tw-smoke)', border: 'none', boxShadow: 'inset 0 0 0 1.5px color-mix(in srgb, var(--tw-smoke) 40%, transparent)' };
}
