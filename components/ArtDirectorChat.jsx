'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { patchHasChanges, PATCH_KEY_LABELS } from '@/lib/design-patch';

// Build the "changed: …" line from the keys the editor ACTUALLY changed
// (true diffs), not the raw patch — the model sometimes echoes unchanged fields.
function summarizeKeys(keys) {
  const labels = [];
  for (const key of keys) {
    const label = PATCH_KEY_LABELS[key] || key;
    if (!labels.includes(label)) labels.push(label);
  }
  return labels.join(', ');
}

/* Floating conversational Art Director for the editor.

   Mounted at the TOP LEVEL of the Generator tree (never inside a Sec / any
   transformed ancestor) so its position:fixed panel anchors to the viewport
   rather than being trapped in the ~400px controls column.

   Props:
   - designState(): () => compact, blob-free current design snapshot
   - onApplyPatch(patch): apply a patch, returns array of applied change keys
   - onUndo(): undo the most recent AI change (LIFO)
   - undoDepth: number — how many AI changes can still be undone (for chip gating)
   - open / setOpen: controlled open state (landing handoff can force-open)
   - seed: { originalMessage, reply } | null — seeds history once on open
*/

const HISTORY_KEY = 'wo-editor-chat';

export default function ArtDirectorChat({ designState, onApplyPatch, onUndo, open, setOpen, seed }) {
  const [messages, setMessages] = useState([]); // {role, content, patch?, changeKeys?, undoIndex?}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const launcherRef = useRef(null);
  const seededRef = useRef(false);

  // Restore per-tab history once.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (raw) setMessages(JSON.parse(raw));
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  // Persist history (per-tab).
  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(messages.slice(-40))); } catch { /* ignore */ }
  }, [messages, hydrated]);

  // Seed from the landing handoff exactly once when it arrives.
  useEffect(() => {
    if (!seed || seededRef.current) return;
    seededRef.current = true;
    setMessages(prev => {
      // Avoid duplicating if history already restored the same exchange.
      if (prev.length) return prev;
      const seeded = [];
      if (seed.originalMessage) seeded.push({ role: 'user', content: seed.originalMessage });
      if (seed.reply) seeded.push({ role: 'assistant', content: seed.reply });
      return seeded;
    });
  }, [seed]);

  // Scroll to bottom on new messages / loading.
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  // Focus management + Escape to close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      const onKey = e => { if (e.key === 'Escape') { setOpen(false); } };
      document.addEventListener('keydown', onKey);
      return () => { clearTimeout(t); document.removeEventListener('keydown', onKey); };
    }
    // Return focus to the launcher when closing.
    launcherRef.current?.focus();
  }, [open, setOpen]);

  const send = useCallback(async () => {
    const content = input.trim();
    if (!content || loading) return;
    setError('');
    const nextHistory = [...messages, { role: 'user', content }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'editor',
          messages: nextHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
          designState: designState(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "AI isn't set up yet.");
        setLoading(false);
        return;
      }
      const patch = data.patch || {};
      let changeKeys = [];
      if (patchHasChanges(patch)) {
        changeKeys = onApplyPatch(patch) || [];
      }
      // Only attach an undo chip when a real change actually landed.
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || 'Done.',
        summary: changeKeys.length ? summarizeKeys(changeKeys) : '',
        undoIndex: changeKeys.length ? Date.now() : null,
      }]);
    } catch {
      setError("I couldn't reach the AI just now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, designState, onApplyPatch]);

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // An undo chip is valid only while its change is still on top of the LIFO
  // stack. After apply, stack depth increments; the newest message's undoIndex
  // equals the depth just before it landed. It's undoable iff no newer AI
  // change has landed since — i.e. it's the most recent assistant message that
  // carried a patch.
  const lastPatchedMsgIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant' && messages[i].undoIndex !== null && messages[i].undoIndex !== undefined) return i;
    }
    return -1;
  })();

  function handleUndo(idx) {
    onUndo();
    // Mark this message's chip as spent and clear any newer undo markers.
    setMessages(prev => prev.map((m, i) => i >= idx ? { ...m, undoIndex: null } : m));
  }

  return (
    <>
      <button
        ref={launcherRef}
        type="button"
        className="ad-launcher"
        aria-label={open ? 'Close Art Director' : 'Open Art Director'}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span aria-hidden="true">{open ? '×' : '✦'}</span>
      </button>

      {open && (
        <section className="ad-panel" role="dialog" aria-label="Art Director" aria-modal="false">
          <header className="ad-panel-head">
            <span className="ad-panel-title">Art Director</span>
            <button type="button" className="ad-panel-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
          </header>

          <div className="ad-panel-list" ref={listRef}>
            {messages.length === 0 && !loading && (
              <p className="ad-empty">Tell me what to change — “make the background wisteria”, “switch to a story format”, “add the orchid frame”.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ad-msg ad-msg--${m.role}`}>
                <div className="ad-bubble">{m.content}</div>
                {m.role === 'assistant' && m.summary && (
                  <div className="ad-changed">changed: {m.summary}</div>
                )}
                {m.role === 'assistant' && m.undoIndex !== null && m.undoIndex !== undefined && (
                  <button
                    type="button"
                    className="ad-undo-chip"
                    disabled={i !== lastPatchedMsgIdx}
                    title={i === lastPatchedMsgIdx ? 'Undo this change' : 'Only the latest change can be undone'}
                    onClick={() => handleUndo(i)}
                  >
                    ↶ Undo
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div className="ad-msg ad-msg--assistant">
                <div className="ad-bubble ad-typing"><span /><span /><span /></div>
              </div>
            )}
            {error && <p className="ad-error" role="alert">{error}</p>}
          </div>

          <form className="ad-input-row" onSubmit={e => { e.preventDefault(); send(); }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Ask for a change…"
              aria-label="Message the Art Director"
              disabled={loading}
            />
            <button type="submit" aria-label="Send" disabled={loading || !input.trim()}>↑</button>
          </form>
        </section>
      )}
    </>
  );
}
