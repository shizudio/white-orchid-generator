'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { patchHasChanges, PATCH_KEY_LABELS } from '@/lib/design-patch';
import { logFeedback, enrichVerdict, newTurnId } from '@/lib/sessions';

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

   WP-W — the conversation is now bound to a SESSION (one session = one post):
   - sessionId: current session id (tags capture events)
   - initialMessages / restoreKey: when a session is opened the parent hands its
     stored conversation in; restoreKey changes → we swap the visible thread.
   - onConversationChange(messages): every message change is lifted so the
     parent can auto-save it into the session (design + conversation together).
   - onNewPostMessages(): the assistant line to seed a fresh session's thread.
*/

const HISTORY_KEY = 'wo-editor-chat';

// (WP-X §3) Empty-state example prompts, rendered as TAPPABLE chips (they send on
// tap) — not prose the user mistakes for an inert label.
const EMPTY_EXAMPLES = [
  'An open house invite for 18 July',
  'make the background wisteria',
  'add small text at the bottom that says pickup is at 3pm',
];

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

/* ── (WP-W) CAPTURE HELPERS ──────────────────────────────────────────────────
   isReask: the user rephrasing / repeating the same ask means the previous turn
   didn't land — an implicit "failure" signal (self-improvement-loop §1). A crude
   token-overlap heuristic; the learning pass interprets it, so false positives
   are cheap. compactDiff: a small before/after of just the design fields that
   actually changed (no blobs) — the training-grade evidence for each turn. */
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
function isReask(prevMsg, nextMsg) {
  const a = new Set(norm(prevMsg)), b = norm(nextMsg);
  if (!a.size || !b.length) return false;
  const overlap = b.filter(w => a.has(w)).length;
  return overlap / b.length >= 0.6; // ≥60% of the new ask's words echo the last one
}
function compactDiff(before, after) {
  if (!before || !after) return null;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const diff = {};
  for (const k of keys) {
    const bv = before[k], av = after[k];
    // Skip large blobs (imageSrc dataURLs) — capture is text/JSON only.
    if (typeof av === 'string' && av.length > 400) { if (bv !== av) diff[k] = { changed: true }; continue; }
    let bs, as;
    try { bs = JSON.stringify(bv); as = JSON.stringify(av); } catch { continue; }
    if (bs !== as) diff[k] = { from: bv ?? null, to: av ?? null };
  }
  return Object.keys(diff).length ? diff : null;
}

export default function ArtDirectorChat({ designState, onApplyPatch, onGenerateImage, onUndo, seed, chipCtx, onChangePhoto, onNewPost, renderTruth, sessionId, initialMessages, restoreKey, onConversationChange, sessionTitle, posts, onOpenSession, onRefreshPosts }) {
  const [messages, setMessages] = useState([]); // {role, content, patch?, changeKeys?, undoIndex?, turnId?, feedback?}
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);
  const seededRef = useRef(false);
  // (WP-W0) The claim-vs-result verification runs in an ASYNC continuation —
  // by then the parent has re-rendered and the props captured in send()'s
  // closure are stale. Route the late calls through refs (always fresh).
  const applyRef = useRef(onApplyPatch);
  const truthRef = useRef(renderTruth);
  const sessionIdRef = useRef(sessionId);
  // designState is called AGAIN in commitLog() from an async continuation to get
  // the AFTER snapshot; the send() closure's own designState is stale by then, so
  // route the after-read through a ref (always the freshest prop) like truthRef.
  const designStateRef = useRef(designState);
  applyRef.current = onApplyPatch;
  truthRef.current = renderTruth;
  sessionIdRef.current = sessionId;
  designStateRef.current = designState;
  // The previous turn's id + user message — for implicit verdict enrichment
  // (a rephrase/re-ask of the same thing marks the previous turn a "failure").
  const prevTurnRef = useRef(null);

  // WP-W: is the parent driving sessions? (one session = one post — the
  // conversation belongs to the session, not the tab.)
  const sessionMode = typeof onConversationChange === 'function';

  // Restore the conversation once. Session mode → from the parent's stored
  // conversation; legacy → per-tab sessionStorage (kept so nothing regresses if
  // the parent hasn't wired sessions).
  useEffect(() => {
    if (sessionMode) {
      setMessages(Array.isArray(initialMessages) ? initialMessages : []);
    } else {
      try {
        const raw = sessionStorage.getItem(HISTORY_KEY);
        if (raw) setMessages(JSON.parse(raw));
      } catch { /* ignore */ }
    }
    setHydrated(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Session SWAP: opening another post (restoreKey changes) replaces the visible
  // thread with that session's stored conversation. seededRef resets so a fresh
  // landing handoff can still append.
  const lastRestoreKey = useRef(restoreKey);
  useEffect(() => {
    if (!sessionMode || !hydrated) return;
    if (restoreKey === lastRestoreKey.current) return;
    lastRestoreKey.current = restoreKey;
    setMessages(Array.isArray(initialMessages) ? initialMessages : []);
  }, [restoreKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist the conversation. Session mode → lift to the parent (auto-saved into
  // the session). Legacy → per-tab sessionStorage. Either way strip the large
  // base64 thumb (transient chat chrome, not state — would blow the quota).
  useEffect(() => {
    if (!hydrated) return;
    const slim = messages.slice(-60).map(({ thumb, ...rest }) => rest);
    if (sessionMode) {
      onConversationChange(slim);
    } else {
      try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(slim.slice(-40))); } catch { /* ignore */ }
    }
  }, [messages, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const send = useCallback(async (textOverride, meta = {}) => {
    const content = String(textOverride ?? input).trim();
    if (!content || loading) return;
    setError('');
    // WP-W capture: one turn id per exchange; a rephrase/re-ask of the just-said
    // thing marks the PREVIOUS turn a failure (implicit verdict enrichment §1).
    const turnId = newTurnId();
    const prev = prevTurnRef.current;
    if (prev && prev.turnId && isReask(prev.content, content)) {
      enrichVerdict(prev.turnId, { implicit: 'failure', implicitSignal: 'reask' });
    }
    const stateBefore = (() => { try { return designState(); } catch { return null; } })();
    const nextHistory = [...messages, { role: 'user', content, turnId }];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    // Accumulate the honesty verdict as the check runs; logged once at the end.
    const verdict = { honesty: 'ok', corrected: false, contradictions: [], implicit: null };
    if (meta.chip) verdict.chip = meta.chip;
    let loggedPatch = null, loggedChangeKeys = [], loggedReply = '';
    const commitLog = () => {
      const readAfter = designStateRef.current || designState;
      const stateAfter = (() => { try { return readAfter(); } catch { return null; } })();
      logFeedback({
        turn_id: turnId,
        session_id: sessionIdRef.current || null,
        user_message: content,
        patch: loggedPatch,
        change_keys: loggedChangeKeys,
        state_diff: compactDiff(stateBefore, stateAfter),
        verdict,
        reply: loggedReply,
      });
      prevTurnRef.current = { turnId, content };
    };
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
      loggedPatch = patch;
      loggedReply = String(data.reply || '');
      // (WP-W0) capture render truth BEFORE applying, for claim-vs-result below.
      const truthBefore = typeof truthRef.current === 'function' ? truthRef.current() : null;
      let changeKeys = [];
      if (patchHasChanges(patch)) {
        changeKeys = onApplyPatch(patch) || [];
      }
      loggedChangeKeys = changeKeys;
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
      // Only attach an undo chip when a real change actually landed. The turnId +
      // feedbackable flag let the thumbs-down chip enrich THIS turn's verdict, and
      // undoTurnId ties an Undo click back to the turn it reverts (implicit reject).
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply || 'Done.',
        summary: summaryParts.join(', '),
        thumb,
        providerLabel,
        undoIndex: didChange ? Date.now() : null,
        turnId,
        undoTurnId: didChange ? turnId : null,
        feedbackable: true,
      }]);
      verdict.didChange = didChange;
      verdict.archetypeBefore = truthBefore?.archetypeId ?? null;

      // ── (WP-W0) CLAIM-VS-RESULT VERIFICATION (render truth) ──────────────────
      if (truthBefore && typeof truthRef.current === 'function') {
        await settle(650); // let the patched state render (draw effect commits)
        const truthAfter = truthRef.current();
        const reply = String(data.reply || '');
        const archChanged = truthAfter.archetypeId !== truthBefore.archetypeId;

        // 0. INVERSE CONTRADICTION (specimen 5): the reply claims INABILITY while
        //    a patch actually applied ("I can't do that yet" + changed: overlay).
        //    Both directions of dishonesty are corrected: here, own the change.
        if (didChange && /\b(can'?t|cannot|couldn'?t|unable|not (able|possible))\b/i.test(reply)) {
          verdict.honesty = 'corrected';
          verdict.corrected = true;
          verdict.contradictions.push('claimed-inability-but-changed'); // false-negative direction
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Correction — that actually worked: I changed the ${summaryParts.join(', ') || 'design'}. Tap Undo if that isn't what you wanted.`,
          }]);
          setLoading(false);
          return;
        }

        // 1. LAYOUT: the user asked for (or the AI claimed) a layout change, but
        //    the archetype never changed → deterministic retry, else admission.
        const layoutIntent = FULL_IMAGE_INTENT.test(content);
        // A CLAIM is past-tense ("I switched the layout"), never an OFFER or a
        // question ("would you like to switch to a layout that can?").
        const layoutClaim = LAYOUT_CLAIM.test(reply)
          && /\b(switched|changed|updated|moved you|now (a|uses|on))\b/i.test(reply)
          && !/\b(would you like|want me to|shall i|can'?t|couldn'?t|does not|doesn'?t)\b/i.test(reply);
        if ((layoutIntent || (layoutClaim && changeKeys.length > 0)) && !archChanged) {
          let corrected = false;
          if (layoutIntent) {
            const target = TINTED_INTENT.test(content) ? 'full_bleed_duotone' : 'documentary';
            if (truthAfter.archetypeId !== target) {
              const retryKeys = applyRef.current({ archetypeId: target }) || [];
              if (retryKeys.includes('archetypeId')) {
                verdict.honesty = 'corrected';
                verdict.corrected = true;
                verdict.contradictions.push('claimed-layout-switch-archetype-unchanged'); // false-positive direction
                verdict.retryTarget = target;
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
            verdict.honesty = 'corrected';
            verdict.corrected = true;
            verdict.contradictions.push('claimed-layout-switch-archetype-unchanged');
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
          verdict.honesty = 'corrected';
          verdict.corrected = true;
          verdict.contradictions.push('field-filled-role-not-drawn');
          verdict.deadRoles = deadHits;
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
            verdict.honesty = 'corrected';
            verdict.corrected = true;
            verdict.contradictions.push('logo-move-not-rendered');
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
          verdict.honesty = 'corrected';
          verdict.corrected = true;
          verdict.contradictions.push('narrated-change-none-landed');
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: "Honestly — that didn't change anything visible. Could you say it another way, or tap the element on the canvas to edit it directly?",
          }]);
        }
      }
    } catch {
      setError("I couldn't reach the AI just now. Please try again.");
    } finally {
      commitLog();
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
    // (WP-W §1) An Undo click is an IMPLICIT REJECTION of the turn it reverts —
    // the highest-signal negative we get for free. Enrich that turn's verdict.
    const undoTurnId = messages[idx]?.undoTurnId;
    if (undoTurnId) enrichVerdict(undoTurnId, { implicit: 'rejection', implicitSignal: 'undo' });
    // Mark this message's chip as spent and clear any newer undo markers.
    setMessages(prev => prev.map((m, i) => i >= idx ? { ...m, undoIndex: null } : m));
  }

  /* ── (WP-W §3) FEEDBACK CHIP — "not what I meant" ── A subtle thumbs-down on
     each AI reply. Tapping logs an explicit rejection for that turn and reveals a
     skippable one-line "what did you want?" input — the highest-grade training
     pair (intent-in-user's-words × wrong-patch). */
  const [fbOpen, setFbOpen] = useState(null);    // message index whose "what did you want?" is open
  const [fbText, setFbText] = useState('');

  /* ── (WP-X §2) CHAT-RAIL HISTORY ── The client kept hunting for her past
     conversations INSIDE the chatbox; the Posts top-bar button alone wasn't
     discoverable. A slim header line shows THIS session's title with a "History"
     affordance; opening it drops a compact list of recent chats — the SAME
     sessions store the Posts popover reads (title + thumbnail), so there is no
     second source of truth. Clicking one switches sessions exactly like Posts. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const canHistory = typeof onOpenSession === 'function';
  function toggleHistory() {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next && typeof onRefreshPosts === 'function') onRefreshPosts();
  }
  function pickSession(id) {
    setHistoryOpen(false);
    if (id && id !== sessionId && typeof onOpenSession === 'function') onOpenSession(id);
  }
  const recentPosts = Array.isArray(posts) ? posts.slice(0, 8) : [];
  function handleThumbsDown(idx) {
    const turnId = messages[idx]?.turnId;
    if (turnId) enrichVerdict(turnId, { explicit: 'rejection', explicitSignal: 'thumbs_down' });
    setMessages(prev => prev.map((m, i) => i === idx ? { ...m, feedback: 'down' } : m));
    setFbOpen(idx); setFbText('');
  }
  function submitFbNote(idx) {
    const note = fbText.trim();
    const turnId = messages[idx]?.turnId;
    if (note && turnId) enrichVerdict(turnId, { explicit: 'rejection', wanted: note.slice(0, 400) });
    setFbOpen(null); setFbText('');
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
  // "Try another layout" is itself a rejection of the current layout — log the
  // rejected archetype+variant (self-improvement-loop §1) before asking for a new one.
  chips.push({ label: 'Try another layout', act: () => {
    let rejected = null;
    try { const s = designState(); rejected = { archetypeId: s?.archetypeId ?? null, archVariant: s?.archVariant ?? null }; } catch { /* ignore */ }
    if (rejected && rejected.archetypeId) {
      logFeedback({ turn_id: newTurnId(), session_id: sessionIdRef.current || null,
        user_message: '[chip] Try another layout', verdict: { implicit: 'layout_rejection', rejected } });
    }
    send('Try another layout for this design — keep my words.', { chip: 'try_another_layout' });
  } });
  chips.push({ label: 'New post', act: handleNewPost });

  return (
    <section className="wo-chat" aria-label="Art Director">
      <header className="wo-chat-head">
        <span className="wo-chat-title">Art Director</span>
        {canHistory && (
          <div className="ad-hist">
            {sessionTitle ? <span className="ad-hist-cur" title={sessionTitle}>{sessionTitle}</span> : null}
            <button
              type="button"
              className={`ad-hist-toggle${historyOpen ? ' ad-hist-toggle--on' : ''}`}
              aria-expanded={historyOpen}
              aria-haspopup="true"
              title="Recent chats"
              onClick={toggleHistory}
            >
              History <span className="ad-hist-chev" aria-hidden="true">⌄</span>
            </button>
          </div>
        )}
      </header>

      {historyOpen && canHistory && (
        <>
          <div className="ad-hist-backdrop" onClick={() => setHistoryOpen(false)} aria-hidden="true" />
          <div className="ad-hist-menu" role="menu" aria-label="Recent chats">
            {recentPosts.length === 0 && (
              <p className="ad-hist-empty">No other chats yet.</p>
            )}
            {recentPosts.map(p => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className={`ad-hist-item${p.id === sessionId ? ' ad-hist-item--current' : ''}`}
                onClick={() => pickSession(p.id)}
              >
                {p.thumb
                  ? <img className="ad-hist-thumb" src={p.thumb} alt="" />
                  : <span className="ad-hist-thumb ad-hist-thumb--blank" aria-hidden="true" />}
                <span className="ad-hist-label">{p.title || 'Untitled post'}</span>
                {p.id === sessionId && <span className="ad-hist-dot" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="wo-chat-list" ref={listRef}>
        {messages.length === 0 && !loading && (
          /* (WP-X §3) TAPPABLE EXAMPLES — the client read these as plain text and
             tried to interact with them. They are now real chips that SEND on tap,
             consistent with the landing suggestions. */
          <div className="ad-empty">
            <p className="ad-empty-lead">Tell me what to make — or what to change. Tap one to try it:</p>
            <div className="ad-empty-chips">
              {EMPTY_EXAMPLES.map(ex => (
                <button key={ex} type="button" className="ad-empty-chip" disabled={loading}
                  onClick={() => send(ex)}>
                  {ex}
                </button>
              ))}
            </div>
          </div>
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
            <div className="ad-row-actions">
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
              {/* (WP-W §3) FEEDBACK CHIP — thumbs-down only. Subtle, on-brand. */}
              {m.role === 'assistant' && m.feedbackable && (
                <button
                  type="button"
                  className={`ad-fb-chip${m.feedback === 'down' ? ' ad-fb-chip--on' : ''}`}
                  aria-pressed={m.feedback === 'down'}
                  title="Not what I meant"
                  onClick={() => handleThumbsDown(i)}
                >
                  <span aria-hidden="true">⌄</span> Not what I meant
                </button>
              )}
            </div>
            {/* Skippable "what did you want?" — the highest-grade training pair. */}
            {m.role === 'assistant' && fbOpen === i && (
              <form className="ad-fb-note" onSubmit={e => { e.preventDefault(); submitFbNote(i); }}>
                <input
                  type="text"
                  value={fbText}
                  onChange={e => setFbText(e.target.value)}
                  placeholder="What did you want? (optional)"
                  aria-label="What did you want instead?"
                  autoFocus
                />
                <button type="submit" title="Send">Send</button>
                <button type="button" title="Skip" onClick={() => setFbOpen(null)}>Skip</button>
              </form>
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
