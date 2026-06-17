import Link from 'next/link';

export default function Nav({ section }) {
  return (
    <nav style={{ background: 'var(--bg-deep)', padding: '0 32px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--line-on-deep)', position: 'sticky', top: 0, zIndex: 100 }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', borderBottom: 'none' }}>
        <img src="/assets/logos/ds/logo-circle.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain', filter: 'brightness(0) invert(0.92) sepia(0.2) saturate(0.4)' }} />
        <span style={{ fontFamily: 'var(--font-wordmark)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--fg-on-deep)', textTransform: 'uppercase' }}>
          The White Orchid
        </span>
      </Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        {[
          { href: '/generate', label: 'Create' },
          { href: '/upload', label: 'Upload' },
          { href: '/library', label: 'Library' },
          { href: '/admin/brand', label: 'Brand kit' },
        ].map(({ href, label }) => (
          <Link key={href} href={href} style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: section === label.toLowerCase() ? 600 : 400,
            color: section === label.toLowerCase() ? 'var(--tw-celadon)' : 'color-mix(in srgb, var(--tw-smoke) 70%, transparent)',
            borderBottom: 'none',
            letterSpacing: 0,
            transition: 'color 140ms',
          }}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
