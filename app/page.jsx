'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';

const EXAMPLES = [
  'An open house invite for 18 July',
  'Quote of the week post',
  "We're hiring educators",
  'A warm welcome-back-to-school post',
];

// Handoff key consumed by Generator on mount to seed the floating chat + apply
// the starting design. Keep in sync with components/Generator.jsx.
const HANDOFF_KEY = 'wo-landing-plan';

export default function Home() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const textareaRef = useRef(null);

  async function submit(text) {
    const content = String(text ?? message).trim();
    if (!content || loading) return;
    setLoading(true);
    setNote('');
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'landing',
          messages: [{ role: 'user', content }],
          designState: {},
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // 503 / any error → friendly note, skip link still works.
        setNote(data.error || "AI isn't set up yet. You can still open the studio below.");
        setLoading(false);
        return;
      }
      try {
        sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
          patch: data.patch || {},
          reply: data.reply || '',
          originalMessage: content,
        }));
      } catch { /* private mode — the studio still opens, just without seeding */ }
      router.push('/generate');
    } catch {
      setNote("I couldn't reach the AI just now. You can still open the studio below.");
      setLoading(false);
    }
  }

  function onKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  }

  function useExample(text) {
    setMessage(text);
    submit(text);
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <Nav />

      <section style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '48px 24px', position: 'relative',
      }}>
        <div style={{ width: '100%', maxWidth: 640, textAlign: 'center' }}>
          <img src="/assets/logos/ds/logo-circle.png" alt="The White Orchid"
            style={{ width: 56, height: 56, objectFit: 'contain', marginBottom: 24, opacity: 0.9 }} />

          <h1 style={{
            fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.9rem, 5vw, 3rem)',
            fontWeight: 400, color: 'var(--fg-strong)', lineHeight: 1.1,
            letterSpacing: '-0.01em', margin: '0 0 32px',
          }}>
            What do you want to create today?
          </h1>

          {/* Chat bar */}
          <form onSubmit={e => { e.preventDefault(); submit(); }}
            style={{
              display: 'flex', alignItems: 'flex-end', gap: 8, width: '100%',
              background: 'var(--bg-raised, #fff)', borderRadius: 24,
              border: '1.5px solid var(--line, rgba(37,78,72,0.16))',
              boxShadow: '0 8px 30px rgba(37,78,72,0.08)', padding: '10px 10px 10px 18px',
            }}>
            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              disabled={loading}
              placeholder="Describe the post you need — a topic, an event, a vibe…"
              aria-label="Describe the post you want to create"
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: 16, lineHeight: 1.5,
                color: 'var(--fg-strong)', minHeight: 28, maxHeight: 160, padding: '6px 0',
              }}
            />
            <button type="submit" disabled={loading || !message.trim()} aria-label="Send"
              style={{
                flex: '0 0 auto', width: 44, height: 44, borderRadius: 16, border: 'none',
                background: message.trim() && !loading ? 'var(--tw-tangerine)' : 'color-mix(in srgb, var(--tw-tangerine) 40%, transparent)',
                color: '#fff', cursor: message.trim() && !loading ? 'pointer' : 'default',
                display: 'grid', placeItems: 'center', fontSize: 18, transition: 'background 140ms',
              }}>
              {loading ? '…' : '↑'}
            </button>
          </form>

          {/* In-place generating state: the ~2–5s wait reads as intentional rather
              than a dead click. The brand orchid pulses beside a status line; the
              input above is disabled while loading. On response we navigate as before. */}
          {loading && (
            <div role="status" aria-live="polite" style={{
              marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--fg, #3a3f3a)',
            }}>
              <img src="/assets/logos/ds/logo-circle.png" alt="" className="wo-generating-orchid"
                style={{ width: 24, height: 24, objectFit: 'contain' }} />
              <span>Designing your starting point<span className="wo-dots" aria-hidden="true">…</span></span>
            </div>
          )}

          {note && !loading && (
            <p role="status" style={{
              marginTop: 14, fontFamily: 'var(--font-body)', fontSize: 14,
              color: 'var(--fg-muted, #6b6f6b)', lineHeight: 1.5,
            }}>
              {note}
            </p>
          )}

          {/* Example chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20 }}>
            {EXAMPLES.map(text => (
              <button key={text} type="button" onClick={() => useExample(text)} disabled={loading}
                style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--fg)',
                  background: 'color-mix(in srgb, var(--tw-celadon) 22%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--tw-celadon-deep) 40%, transparent)',
                  borderRadius: 20, padding: '8px 14px', cursor: loading ? 'default' : 'pointer',
                  transition: 'background 140ms',
                }}>
                {text}
              </button>
            ))}
          </div>

          {/* Always-present skip link */}
          <div style={{ marginTop: 40 }}>
            <Link href="/generate" style={{
              fontFamily: 'var(--font-syne)', fontSize: 13, fontWeight: 500,
              letterSpacing: '0.04em', color: 'var(--fg-muted, #6b6f6b)',
              display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44,
            }}>
              Skip to the studio →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
