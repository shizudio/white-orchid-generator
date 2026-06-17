import Link from 'next/link';

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--burnham)', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 4, color: 'var(--celadon)', textTransform: 'uppercase', marginBottom: 12 }}>The White Orchid</div>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 48, fontWeight: 400, color: 'var(--ivory)', lineHeight: 1.1 }}>Content Studio</h1>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link href="/generate" style={btnStyle('var(--tangerine)', '#fff')}>Create Post</Link>
        <Link href="/library" style={btnStyle('transparent', 'var(--ivory)', '1px solid rgba(245,240,232,0.3)')}>Library</Link>
        <Link href="/admin/brand" style={btnStyle('transparent', 'var(--celadon)', '1px solid rgba(135,196,160,0.4)')}>Brand Kit</Link>
      </div>
    </main>
  );
}

function btnStyle(bg, color, border = 'none') {
  return {
    padding: '12px 28px',
    background: bg,
    color,
    border,
    borderRadius: 40,
    fontFamily: 'var(--font-ui)',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 2,
    textTransform: 'uppercase',
    display: 'inline-block',
  };
}
