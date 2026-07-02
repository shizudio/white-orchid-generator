'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/* Caption writer (Commit 1) — brand-voice post caption + hashtags + alt-text.

   Mounted at the TOP LEVEL of the Generator tree (never inside a transformed
   ancestor) so its fixed panel anchors to the viewport, matching AuditPanel.

   Flow: open → POST /api/assistant { context:"caption", designState, dimensionId }
   → loading → editable caption + hashtags + alt-text. Copy buttons put the text
   on the clipboard with a "copied ✓" confirmation. "Rewrite" re-calls with a
   variation nudge. Graceful 503 → friendly note; nothing here blocks export.

   Props:
   - open / setOpen: controlled open state
   - designState(): () => compact, blob-free snapshot (chatDesignState)
   - dimensionId: string (the active format → implied platform)
*/

const B = {
  burnham: '#254E48', whiteSmoke: '#F5F6E7', tangerine: '#F6644E',
  ash: '#8A8080', jet: '#282B28', line: '#E3DCDC',
};
const F = {
  subtitle: "'Syne','Helvetica Neue',sans-serif",
  body: "'Fira Sans','Helvetica Neue',sans-serif",
};

const PLATFORM_LABEL = {
  x: 'X (Twitter)', instagram: 'Instagram', facebook: 'Facebook', generic: 'Website / banner',
};

export default function CaptionPanel({ open, setOpen, designState, dimensionId }) {
  const [phase, setPhase] = useState('loading'); // loading | ready | unavailable | error
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState([]);
  const [altText, setAltText] = useState('');
  const [platform, setPlatform] = useState('');
  const [note, setNote] = useState('');
  const [copied, setCopied] = useState(null); // 'caption' | 'withTags' | null
  const runIdRef = useRef(0);
  const copyTimerRef = useRef(null);

  const hashLine = hashtags.length ? hashtags.map(t => `#${t}`).join(' ') : '';
  const captionWithTags = hashLine ? `${caption.trim()}\n\n${hashLine}` : caption.trim();

  const start = useCallback(async (rewrite = false) => {
    const myRun = ++runIdRef.current;
    setPhase('loading'); setNote(''); setCopied(null);
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'caption', designState: designState(), dimensionId, rewrite }),
      });
      if (runIdRef.current !== myRun) return; // superseded
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setPhase('unavailable');
        setNote(data.error || "The caption writer isn't set up yet. You can still write your own caption.");
        return;
      }
      if (res.status === 429) {
        setPhase('error');
        setNote(data.error || 'One moment — please wait a few seconds and try again.');
        return;
      }
      if (!res.ok) {
        setPhase('error');
        setNote(data.error || "I couldn't write that just now. Please try again.");
        return;
      }
      setCaption(typeof data.caption === 'string' ? data.caption : '');
      setHashtags(Array.isArray(data.hashtags) ? data.hashtags : []);
      setAltText(typeof data.altText === 'string' ? data.altText : '');
      setPlatform(data.platform || '');
      setPhase('ready');
    } catch {
      if (runIdRef.current !== myRun) return;
      setPhase('error');
      setNote("Couldn't reach the AI just now. Please try again in a moment.");
    }
  }, [designState, dimensionId]);

  useEffect(() => { if (open) start(false); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current); }, []);

  const copy = async (which) => {
    const text = which === 'withTags' ? captionWithTags : caption.trim();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without the async clipboard API.
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
      } catch { /* give up silently — the textarea is still selectable */ }
    }
    setCopied(which);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(null), 1600);
  };

  if (!open) return null;

  const wrap = {
    position: 'fixed', right: 24, bottom: 24, zIndex: 362, width: 380,
    maxWidth: 'calc(100vw - 32px)', maxHeight: '78vh', display: 'flex', flexDirection: 'column',
    background: '#fff', border: `1px solid ${B.line}`, borderRadius: 18,
    boxShadow: '0 24px 70px rgba(37, 78, 72, 0.24)', overflow: 'hidden',
  };
  const btn = (solid) => ({
    border: solid ? 'none' : `1.5px solid ${B.burnham}66`, borderRadius: 999,
    background: solid ? B.burnham : 'transparent', color: solid ? '#fff' : B.burnham,
    cursor: 'pointer', fontFamily: F.subtitle, fontSize: 11, fontWeight: 700,
    letterSpacing: 0.4, padding: '9px 12px', whiteSpace: 'nowrap',
  });

  return (
    <section className="caption-panel" style={wrap} role="dialog" aria-label="Caption writer" aria-modal="false">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: `1px solid ${B.line}` }}>
        <span style={{ fontFamily: F.subtitle, fontWeight: 700, fontSize: 13, color: B.burnham, letterSpacing: 0.3 }}>
          ✎ Caption{platform ? ` · ${PLATFORM_LABEL[platform] || ''}` : ''}
        </span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close"
          style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, color: B.ash }}>×</button>
      </header>

      <div style={{ padding: '14px 16px', overflowY: 'auto', flex: 1 }}>
        {phase === 'loading' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: B.ash, fontFamily: F.body, fontSize: 13, padding: '12px 0' }}>
            <span className="caption-spin" style={{
              width: 14, height: 14, borderRadius: '50%', border: `2px solid ${B.line}`,
              borderTopColor: B.burnham, display: 'inline-block', animation: 'caption-spin 0.7s linear infinite',
            }} />
            Writing a caption in your brand voice…
          </div>
        )}

        {(phase === 'unavailable' || phase === 'error') && (
          <p style={{ fontFamily: F.body, fontSize: 13, color: B.jet, lineHeight: 1.5, margin: 0, padding: '4px 0' }}>{note}</p>
        )}

        {phase === 'ready' && (
          <>
            <label style={{ display: 'block', fontFamily: F.subtitle, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: B.ash, marginBottom: 6 }}>Caption</label>
            <textarea
              value={caption}
              onChange={e => setCaption(e.target.value)}
              rows={6}
              aria-label="Caption text (editable)"
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 120,
                border: `1px solid ${B.line}`, borderRadius: 10, padding: '10px 12px',
                fontFamily: F.body, fontSize: 13.5, lineHeight: 1.5, color: B.jet, background: B.whiteSmoke }}
            />

            {hashtags.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontFamily: F.subtitle, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: B.ash, marginBottom: 6 }}>Hashtags</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {hashtags.map(t => (
                    <span key={t} style={{ fontFamily: F.body, fontSize: 12, color: B.burnham, background: `${B.burnham}12`, borderRadius: 999, padding: '3px 9px' }}>#{t}</span>
                  ))}
                </div>
              </div>
            )}

            {altText && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontFamily: F.subtitle, fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: B.ash, marginBottom: 4 }}>Alt text (accessibility)</div>
                <p style={{ fontFamily: F.body, fontSize: 12.5, lineHeight: 1.45, color: B.jet, margin: 0 }}>{altText}</p>
              </div>
            )}
          </>
        )}
      </div>

      <footer style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: `1px solid ${B.line}`, flexWrap: 'wrap' }}>
        {phase === 'ready' ? (
          <>
            <button type="button" onClick={() => copy('caption')} style={btn(false)}>
              {copied === 'caption' ? 'Copied ✓' : 'Copy caption'}
            </button>
            {hashtags.length > 0 && (
              <button type="button" onClick={() => copy('withTags')} style={btn(true)}>
                {copied === 'withTags' ? 'Copied ✓' : 'Copy with hashtags'}
              </button>
            )}
            <button type="button" onClick={() => start(true)} style={{ ...btn(false), marginLeft: 'auto' }} title="Write a fresh version">Rewrite</button>
          </>
        ) : (phase === 'unavailable' || phase === 'error') ? (
          <button type="button" onClick={() => start(false)} style={btn(true)}>Try again</button>
        ) : (
          <span style={{ fontFamily: F.body, fontSize: 11, color: B.ash }}>One moment…</span>
        )}
      </footer>

      <style>{`@keyframes caption-spin { to { transform: rotate(360deg); } }
        @media (max-width: 640px) { .caption-panel { right: 8px !important; left: 8px !important; bottom: 8px !important; width: auto !important; max-width: none !important; max-height: 82vh !important; } }`}</style>
    </section>
  );
}
