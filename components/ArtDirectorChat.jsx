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

/* The Art Director — THE PRIMARY RAIL (WP-V Stage 3, ux-architecture §2.1).

   No longer a floating overlay: the chat is a permanent docked column.
   Desktop: docked LEFT beside the canvas (a flex sibling — it can NEVER
   overlap the canvas in any state). Mobile (<768px): docked UNDER the canvas.

   The landing (generate) flow and the editor are ONE continuous conversation:
   the landing exchange is appended to the per-tab history (never replaces it),
   so nothing the user said is discarded.

   Props:
   - designState(): () => compact, blob-free current design snapshot
   - onApplyPatch(patch): apply a patch, returns array of applied change keys
   - onGenerateImage(dataUrl): ingest a generated background photo
   - onUndo(): undo the most recent change (LIFO)
   - seed: { originalMessage, reply } | null — landing handoff exchange
   - chipCtx: { hasImage, hasCaption, hasDate } — drives the DYNAMIC quick chips
   - onChangePhoto(): deterministic photo refresh (same scene / Library rotation)
   - onNewPost(): reset the canvas to a fresh design (chat history stays)
*/

const HISTORY_KEY = 'wo-editor-chat';

/* ── (WP-W0) CLAIM-VS-RESULT HONESTY CHECK ─────────────────────────────────────
   After a chat patch applies, the AI's narration is verified against RENDER
   TRUTH (what the canvas actually drew — via the renderTruth prop), never
   against the patch it emitted. Two live client specimens drove this:
   1. "i want full image post" → AI claimed a layout switch, archetype never
      changed. 2. "move logo to the centre" → patch said logo position changed,
      the drawn mark never moved; "add title" → field applied, nothing rendered.
   On a mismatch the chat SELF-CORRECTS in the same conversation: a layout
   intent retries deterministically through archetypeId; anything else gets an
   honest admission — the AI never again reports success the render contradicts.
   (Logging/capture is WP-W proper; this is the minimal trust fix.) */
const LAYOUT_CLAIM = /\b(layout|full[- ]?(image|bleed)|switch(ed)?|redesign(ed)?|composition|new look)\b/i;
// Mirrors FULL_IMAGE_INTENT in app/api/assistant/route.js (kept in sync by hand).
const FULL_IMAGE_INTENT = new RegExp([
  'full[- ]?(image|photo|picture|bleed)',
  'whole (image|photo|picture|post|frame)',
  '(photo|image|picture)[^.!?]{0,24}(fills?|filling|covers?|covering)',
  'fill (the )?(whole |entire |full )?(frame|post|canvas|screen)',
  'edge[- ]to[- ]edge',
  '(remove|get rid of|delete|drop|lose|no more|without) (the |that |this )?(green |colou?red |color |solid |big )*(solid|panel|block|band|column|slab)',
  'green (solid|panel|block|band|column|slab)',
].map(s => `\\b(${s})\\b`).join('|'), 'i');
const TINTED_INTENT = /\b(duotone|tint\w*|wash(ed)?|moody|darker|green look)\b/i;
const ROLE_OF_FIELD = { headline: 'hero', subtext: 'support', microLabel: 'eyebrow', dateText: 'date', pillText: 'pill' };
const ROLE_LABELS = { hero: 'the title', support: 'the small text', eyebrow: 'the little label', date: 'the date', pill: 'the button' };
const settle = (ms) => new Promise(r => setTimeout(r, ms));
const logoCenter = (b) => b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : null;

export default function ArtDirectorChat({ designState, onApplyPatch, onGenerateImage, onUndo, seed, chipCtx, onChangePhoto, onNewPost, renderTruth }) {
  const [messages, setMessages] = useState([]); // {role, content, patch?, changeKeys?, undoIndex?}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const seededRef = useRef(false);

  // Restore per-tab history once — the same conversation continues across the
  // landing page, the editor, and any number of posts in this tab.
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
    // Strip the (large base64) thumb before persisting — it would blow the
    // sessionStorage quota. The thumbnail is transient chat chrome, not state.
    try {
      const slim = messages.slice(-40).map(({ thumb, ...rest }) => rest);
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(slim));
    } catch { /* ignore */ }
  }, [messages, hydrated]);

  // APPEND the landing handoff exchange exactly once when it arrives — one
  // continuous conversation (§2.1): existing history is never discarded.
  useEffect(() => {
    if (!seed || !hydrated || seededRef.current) return;
    seededRef.current = true;
    setMessages(prev => {
      const last = prev[prev.length - 1];
      // Dedupe: a tab refresh restores the same exchange from history.
      if (last && seed.reply && last.role === 'assistant' && last.content === seed.reply) return prev;
      const seeded = [...prev];
      if (seed.originalMessage) seeded.push({ role: 'user', content: seed.originalMessage });
      if (seed.reply) seeded.push({ role: 'assistant', content: seed.reply });
      return seeded;
    });
  }, [seed, hydrated]);

  // Scroll to bottom on new messages / loading.
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading]);

  const send = useCallback(async (textOverride) => {
    const content = String(textOverride ?? input).trim();
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
      // (WP-W0) capture render truth BEFORE applying, for claim-vs-result below.
      const truthBefore = typeof renderTruth === 'function' ? renderTruth() : null;
      let changeKeys = [];
      if (patchHasChanges(patch)) {
        changeKeys = onApplyPatch(patch) || [];
      }
      // Image generation (Commit 4): if the server returned a generated image, ingest
      // it as the background (same path as an upload) and show a thumbnail bubble +
      // "changed: photo". A generated image is one undoable action even alongside a
      // patch — it snapshots the photo onto the same undo stack.
      let thumb = null;
      let photoLanded = false;
      if (data.imageB64 && typeof onGenerateImage === 'function') {
        const dataUrl = `data:image/png;base64,${data.imageB64}`;
        thumb = dataUrl;
        try { await onGenerateImage(dataUrl); photoLanded = true; } catch { /* keep the reply */ }
      }
      const summaryParts = [];
      if (changeKeys.length) summaryParts.push(summarizeKeys(changeKeys));
      if (photoLanded) summaryParts.push('photo');
      const didChange = changeKeys.length > 0 || photoLanded;
      // Which provider made the photo (Higgsfield primary, gpt-image-1 fallback).
      const providerLabel = photoLanded
        ? (data.imageProvider === 'higgsfield' ? 'Higgsfield' : data.imageProvider === 'openai' ? 'gpt-image-1' : null)
        : null;
      // Only attach an undo chip when a real change actually landed.
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || 'Done.',
        summary: summaryParts.join(', '),
        thumb,
        providerLabel,
        undoIndex: didChange ? Date.now() : null,
      }]);

      // ── (WP-W0) CLAIM-VS-RESULT VERIFICATION (render truth) ──────────────────
      if (truthBefore && typeof renderTruth === 'function') {
        await settle(650); // let the patched state render (draw effect commits)
        const truthAfter = renderTruth();
        const reply = String(data.reply || '');
        const archChanged = truthAfter.archetypeId !== truthBefore.archetypeId;

        // 1. LAYOUT: the user asked for (or the AI claimed) a layout change, but
        //    the archetype never changed → deterministic retry, else admission.
        const layoutIntent = FULL_IMAGE_INTENT.test(content);
        const layoutClaim = LAYOUT_CLAIM.test(reply) && /\b(switch(ed)?|chang(ed|ing)|moved to|now (uses|a|the)|done)\b/i.test(reply);
        if ((layoutIntent || (layoutClaim && changeKeys.length > 0)) && !archChanged) {
          let corrected = false;
          if (layoutIntent) {
            const target = TINTED_INTENT.test(content) ? 'full_bleed_duotone' : 'documentary';
            if (truthAfter.archetypeId !== target) {
              const retryKeys = onApplyPatch({ archetypeId: target }) || [];
              if (retryKeys.includes('archetypeId')) {
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: "That first change didn't actually switch the layout — my mistake. I've moved you to the full-image layout now, photo edge to edge.",
                  summary: 'archetype',
                  undoIndex: Date.now(),
                }]);
                corrected = true;
              }
            }
          }
          if (!corrected && layoutClaim) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: "Actually — checking the canvas, the layout didn't change just now. I couldn't do that yet. Try the “Try another layout” chip, or name a layout (full image, split, quote card).",
            }]);
          }
          setLoading(false);
          return;
        }

        // 2. TEXT ROLES: a field the patch filled that the layout never drew.
        const deadHits = Object.entries(ROLE_OF_FIELD)
          .filter(([field, role]) => typeof patch[field] === 'string' && patch[field].trim()
            && (truthAfter.deadRoles || []).includes(role))
          .map(([, role]) => ROLE_LABELS[role] || role);
        if (deadHits.length) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `One honest note — this layout doesn't actually show ${deadHits.join(' or ')}, so it isn't visible on the canvas. Want me to switch to a layout that shows it?`,
          }]);
          setLoading(false);
          return;
        }

        // 3. LOGO: a placement patch that the render ignored (specimen B).
        if (changeKeys.includes('logoPosition')) {
          const cB = logoCenter(truthBefore.logoBox), cA = logoCenter(truthAfter.logoBox);
          const eps = (truthAfter.canvas?.w || 1080) * 0.01;
          const moved = (!cB && cA) || (cB && cA && (Math.abs(cA.x - cB.x) > eps || Math.abs(cA.y - cB.y) > eps));
          if (!moved) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: "Checking the canvas — the logo didn't actually move there on this layout. I couldn't do that yet.",
            }]);
            setLoading(false);
            return;
          }
        }

        // 4. COMPLETE NO-OP: the AI narrated a change but nothing visible landed.
        if (!didChange && !/\b(can'?t|couldn'?t|unable|sorry|already)\b/i.test(reply) && !/\?\s*$/.test(content)) {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: "Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit it directly?",
          }]);
        }
      }
    } catch {
      setError("I couldn't reach the AI just now. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, designState, onApplyPatch, onGenerateImage, renderTruth]);

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // An undo chip is valid only while its change is still on top of the LIFO
  // stack — i.e. it's the most recent assistant message that carried a patch.
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

  function handleNewPost() {
    if (typeof onNewPost !== 'function') return;
    onNewPost();
    setMessages(prev => [...prev, { role: 'assistant', content: 'Fresh canvas — tell me what the next post is about.' }]);
    inputRef.current?.focus();
  }

  function handleChangePhoto() {
    if (typeof onChangePhoto !== 'function') return;
    onChangePhoto();
    setMessages(prev => [...prev, { role: 'assistant', content: 'Swapping in a fresh photo — your words and layout stay put.' }]);
  }

  /* ── DYNAMIC QUICK-ACTION CHIPS (§2.1) ──
     The top asks, one tap away. Chips adapt to the design: when the design
     LACKS a caption/date, the chip becomes "+ Add …" (vocabulary-free adding —
     the AI maps it to the right role and teaches the term back). */
  const ctx = chipCtx || {};
  const chips = [];
  if (ctx.hasImage && typeof onChangePhoto === 'function') chips.push({ label: 'Change photo', act: handleChangePhoto });
  chips.push(ctx.hasCaption
    ? { label: 'Rewrite caption', msg: 'Rewrite the caption — keep it short and warm.' }
    : { label: '+ Add caption', msg: 'Add a small line of caption text under the headline.' });
  if (!ctx.hasDate) chips.push({ label: '+ Add date', msg: 'Add a date line to this design.' });
  chips.push({ label: 'Try another layout', msg: 'Try another layout for this design — keep my words.' });
  chips.push({ label: 'New post', act: handleNewPost });

  return (
    <section className="wo-chat" aria-label="Art Director">
      <header className="wo-chat-head">
        <span className="wo-chat-title">Art Director</span>
      </header>

      <div className="wo-chat-list" ref={listRef}>
        {messages.length === 0 && !loading && (
          <p className="ad-empty">Tell me what to make — or what to change. “An open house invite for 18 July”, “make the background wisteria”, “add small text at the bottom that says pickup is at 3pm”.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ad-msg ad-msg--${m.role}`}>
            <div className="ad-bubble">{m.content}</div>
            {m.role === 'assistant' && m.thumb && (
              <img className="ad-thumb" src={m.thumb} alt="Generated image applied to the design" />
            )}
            {m.role === 'assistant' && m.providerLabel && (
              <div className="ad-provider" style={{ fontSize: 10, opacity: 0.5, marginTop: 2, letterSpacing: '0.02em' }}>
                photo · {m.providerLabel}
              </div>
            )}
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

      <div className="wo-chat-chips" role="toolbar" aria-label="Quick actions">
        {chips.map(c => (
          <button key={c.label} type="button" className="wo-chat-chip" disabled={loading}
            onClick={() => (c.act ? c.act() : send(c.msg))}>
            {c.label}
          </button>
        ))}
      </div>

      <form className="ad-input-row" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Say it to change it…"
          aria-label="Message the Art Director"
          disabled={loading}
        />
        <button type="submit" aria-label="Send" disabled={loading || !input.trim()}>↑</button>
      </form>
    </section>
  );
}
