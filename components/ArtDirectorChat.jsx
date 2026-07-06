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
// (D1 item 7) They ROTATE and vary in KIND — a whole post AND small changes — so
// the empty state teaches the RANGE of what you can say, consistent with the
// landing suggestions. Reshuffled per mount.
const EMPTY_POOL = {
  posts: [
    'An open house invite for 18 July',
    "We're hiring educators",
    'A warm welcome-back-to-school post',
    'A thank-you post for our volunteers',
  ],
  tweaks: [
    'make the background wisteria',
    'add small text at the bottom that says pickup is at 3pm',
    'make it warmer',
    'try another layout',
    'change the photo to children painting',
  ],
};
function sampleOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sampleN(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0, n);
}
function rotatingEmptyExamples() {
  return [sampleOne(EMPTY_POOL.posts), ...sampleN(EMPTY_POOL.tweaks, 2)];
}
// Stable default for SSR + first client paint (no hydration mismatch); the client
// reshuffles after mount.
const DEFAULT_EMPTY_EXAMPLES = [EMPTY_POOL.posts[0], EMPTY_POOL.tweaks[0], EMPTY_POOL.tweaks[1]];

/* A few early sessions were titled with the internal Higgsfield photographer
   prompt (the title fix now uses the user's brief). Defensively scrub those
   leaked titles at display time so old sessions read cleanly in the list. */
const SCENE_PROMPT_LEAK = /ten[- ]year[- ]old|medium format|negative space|warm terracotta|natural warm|full[- ]frame photograph|no text, no/i;
function cleanTitle(t) {
  const s = String(t || '').trim();
  if (!s) return 'Untitled post';
  if (SCENE_PROMPT_LEAK.test(s)) return 'Untitled post';
  return s;
}

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

/* ── (WP-Z) THE /feedback COMMAND ──────────────────────────────────────────────
   A client-ratified escape hatch: any message starting with "/feedback" (also
   "/feedback:" or a bare "/feedback" with no text) is intercepted DETERMINISTICALLY
   in send() and NEVER goes to the model. It captures a rich context bundle (design
   snapshot, recent turns, advisor findings, a downscaled canvas thumbnail) through
   the SAME capture pipe the honesty loop uses, tagged kind:'user_feedback' so the
   learning pass ranks it highest-grade. Orchid replies warmly + instantly,
   disclosing the snapshot. A synthetic tester can't spoof this tag: its utterances
   are intercepted client-side and its cloud writes are blocked anyway.

   Everything in the bundle is BEST-EFFORT — a missing piece never blocks the note. */
const FEEDBACK_CMD = /^\/feedback\b:?\s*/i;
function isFeedbackCommand(text) {
  const t = String(text || '').trim();
  return /^\/feedback\b/i.test(t) || t === '/feedback';
}
function stripFeedbackCommand(text) {
  return String(text || '').trim().replace(FEEDBACK_CMD, '').trim();
}
// A light heuristic for the addendum path: a next message that opens with "I
// expected" / "it should" is treated as an elaboration of the just-filed feedback.
const ADDENDUM_HINT = /^(i expected|it should|it shoud|i wanted|i'?d expected|expected)\b/i;
function looksLikeAddendum(text) { return ADDENDUM_HINT.test(String(text || '').trim()); }

// Best-effort build commit: NEXT_PUBLIC_COMMIT if wired, else the app version.
function buildCommit() {
  try {
    if (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_COMMIT) {
      return String(process.env.NEXT_PUBLIC_COMMIT);
    }
  } catch { /* ignore */ }
  return null;
}

// Downscale the live canvas to a small JPEG dataURL (~480px wide) via an offscreen
// canvas so the inline thumbnail stays well under ~150KB. Returns null on any
// failure (tainted canvas, no context, etc.) — the note ships without it.
function captureCanvasThumb() {
  try {
    if (typeof document === 'undefined') return null;
    const src = document.querySelector('.generator-canvas-shell canvas') || document.querySelector('canvas');
    if (!src || !src.width || !src.height) return null;
    const targetW = 480;
    const scale = Math.min(1, targetW / src.width);
    const w = Math.max(1, Math.round(src.width * scale));
    const h = Math.max(1, Math.round(src.height * scale));
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, w, h);
    const url = off.toDataURL('image/jpeg', 0.6);
    // Guard the payload ceiling — drop the thumb rather than bloat the note.
    return (typeof url === 'string' && url.length <= 150 * 1024) ? url : null;
  } catch { return null; }
}

// Active advisor findings, best-effort, via the console-verifiable ready check.
// Returns a compact, blob-free digest (never the whole verdict tree).
function readAdvisorFindings() {
  try {
    if (typeof window === 'undefined' || typeof window.__woReadyCheck !== 'function') return null;
    const r = window.__woReadyCheck();
    const formats = Array.isArray(r?.formats) ? r.formats : [];
    const digest = formats
      .filter(f => f && (f.status === 'attention' || (Array.isArray(f.issues) && f.issues.length)))
      .map(f => ({
        dimensionId: f.dimensionId ?? null,
        status: f.status ?? null,
        issues: (Array.isArray(f.issues) ? f.issues : [])
          .slice(0, 6)
          .map(i => (typeof i === 'string' ? i : (i?.category || i?.label || i?.message || null)))
          .filter(Boolean),
      }));
    return digest.length ? digest : null;
  } catch { return null; }
}

// Recent console errors, ONLY if some buffer already exists (we do NOT install an
// interceptor for this — best-effort per the design).
function readConsoleErrors() {
  try {
    if (typeof window === 'undefined') return null;
    const buf = window.__woConsoleErrors;
    if (typeof buf === 'function') { const v = buf(); return Array.isArray(v) ? v.slice(-6) : null; }
    if (Array.isArray(buf)) return buf.slice(-6);
    return null;
  } catch { return null; }
}

/* ── (WP-W1) "NEVER OFFER WHAT YOU CAN'T EXECUTE" ────────────────────────────────
   Client specimen: the assistant ended a turn with "Want me to switch to a layout
   that shows it?"; the user typed "yes"; that affirmative went to the MODEL as a
   fresh message and it fumbled (wrong patch, false claim, honesty self-correction).
   The offer was words with no wired execution.

   THE LAW: any assistant turn that ENDS WITH AN OFFER must attach a concrete,
   SERIALIZABLE pending-action payload (pendingOffer) — the same grammar as the
   actionable-findings actions[]: patch | ai-fix | deep-link. It is stored on the
   assistant message (so it survives in the session record exactly like messages
   do). An affirmative next user turn ("yes", "ok", "do it") executes the payload
   DIRECTLY through the patch pipeline — no model round-trip. A non-affirmative
   reply clears it and flows to the model normally. The payload is ALSO rendered as
   a one-tap chip so the user need not even type yes. */

// Deterministic affirmative matcher (NOT the model). Whole-message affirmations
// only — "yes", "ok", "sure", "do it", "go ahead", "yes please", "please do".
// A message that ALSO carries a fresh instruction ("yes but make it blue") is NOT
// treated as a bare accept — it flows to the model so the new instruction lands.
const AFFIRMATIVE = /^(?:yes|yep|yeah|yup|ok|okay|sure|please|do it|go ahead|go for it|switch it|switch|let'?s do it|sounds good|that works|yes please|please do|yes do it|do that|change it)\b[\s.!,]*$/i;
function isAffirmative(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 24) return false; // a long reply is an instruction, not a bare "yes"
  return AFFIRMATIVE.test(t);
}

// (Law #4) BANNED OFFER PHRASING. An offer the MODEL writes on its own ("Want me
// to switch the layout?") has NO wired execution — the affirmative would go back to
// the model and fumble (the exact specimen). So a model reply that ENDS with such
// an offer is rewritten client-side to state the honest, tappable alternative
// (deterministic offers we attach ourselves in the honesty pass are unaffected —
// they carry a real pendingOffer + chip). The banned trailing clause:
const MODEL_OFFER_TAIL = /\s*(?:—\s*)?(?:so\s+)?(?:do you\s+)?(?:want me to|would you like me to|shall i|should i|want me to switch|do you want me to)\b[^.?!]*\??\s*$/i;
function hasBannedOffer(reply) { return MODEL_OFFER_TAIL.test(String(reply || '')); }
function stripBannedOffer(reply) {
  return String(reply || '').replace(MODEL_OFFER_TAIL, '').replace(/[\s,;:—-]+$/, '').trim();
}

// A pendingOffer descriptor is SERIALIZABLE (no closures) so it round-trips through
// the session record. kind:'patch' carries a design patch applied through the same
// pipeline the inspector's one-tap "switch to a layout that shows it" uses. The
// chip label + a truthful confirm line travel with it. Executed identically whether
// the user types "yes" or taps the chip.
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

export default function ArtDirectorChat({ designState, onApplyPatch, onGenerateImage, onUndo, seed, chipCtx, onChangePhoto, onNewPost, renderTruth, sessionId, initialMessages, restoreKey, onConversationChange, sessionTitle, posts, onOpenSession, onRefreshPosts, sendRef }) {
  const [messages, setMessages] = useState([]); // {role, content, patch?, changeKeys?, undoIndex?, turnId?, feedback?}
  // (D1 item 7) Rotating empty-state examples. Stable default for SSR + first
  // paint; reshuffled to a fresh mix after mount (see effect below).
  const [emptyExamples, setEmptyExamples] = useState(DEFAULT_EMPTY_EXAMPLES);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // (B4) Never a dead end: when a turn fails (network / 500 / empty), we keep the
  // exact message the user sent so the warm error can offer a one-tap Retry.
  const [retryText, setRetryText] = useState('');
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
  // (WP-Z) The last /feedback event filed this session — so a next "I expected…"
  // reply can be appended as an addendum that references it.
  const lastFeedbackRef = useRef(null); // { turnId, sessionId }
  const chipCtxRef = useRef(chipCtx);
  chipCtxRef.current = chipCtx;

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
    setEmptyExamples(rotatingEmptyExamples()); // (D1 item 7) fresh mix after mount
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
    const slim = messages.slice(-60).map(({ thumb, streaming, ...rest }) => rest);
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

  // (WP-W1) Execute a pendingOffer's payload DIRECTLY through the patch pipeline —
  // no model round-trip. Records the user's acceptance as a message, applies the
  // patch, verifies render truth (dead-role must now be gone / archetype changed),
  // and confirms TRUTHFULLY. Logs offer-accepted + offer-executed (+ outcome).
  // Used by BOTH the typed-"yes" path and the one-tap chip.
  const executeOffer = useCallback(async (offer, acceptText) => {
    if (!offer || loading) return;
    setError(''); setRetryText('');
    const turnId = newTurnId();
    // Record the acceptance as a user line (unless the chip supplied its own label
    // — the chip path shows the button, not a typed message).
    const accepted = String(acceptText || '').trim();
    setMessages(prev => {
      const base = accepted ? [...prev, { role: 'user', content: accepted, turnId }] : prev.slice();
      return base;
    });
    logFeedback({
      turn_id: turnId, session_id: sessionIdRef.current || null,
      user_message: accepted || '[chip] accept offer',
      verdict: { event: 'offer-accepted', offerKind: offer.kind, offerEvent: offer.event || null,
        via: accepted ? 'typed' : 'chip' },
    });
    setLoading(true);
    const apply = applyRef.current || onApplyPatch;
    const truthFn = typeof truthRef.current === 'function' ? truthRef.current : null;
    const truthBefore = truthFn ? truthFn() : null;
    try {
      let changeKeys = [];
      if (offer.kind === 'patch' && offer.patch && patchHasChanges(offer.patch)) {
        changeKeys = apply(offer.patch) || [];
      } else if (offer.kind === 'ai-fix' && offer.prompt) {
        // ai-fix routes a targeted prompt through the normal assistant pipeline
        // (undoable, honesty-checked) — exactly as the finding's ai-fix action does.
        setLoading(false);
        return send(offer.prompt, { chip: 'offer-ai-fix', offerEvent: offer.event });
      }
      // Verify render truth: did the offer actually land? (Same honesty discipline
      // as a normal turn — we NEVER confirm a switch the canvas contradicts.)
      let landed = changeKeys.length > 0;
      let truthAfter = truthBefore;
      if (truthFn && truthBefore) {
        const expectArch = offer.patch && typeof offer.patch.archetypeId === 'string';
        const roles = Array.isArray(offer.revealRoles) ? offer.revealRoles : [];
        // Poll render truth over a short window — a layout switch triggers a
        // re-materialize + reflow + redraw, which can settle after the first frame.
        for (let i = 0; i < 4; i++) {
          await settle(400);
          truthAfter = truthFn();
          const archChanged = !expectArch || truthAfter.archetypeId !== truthBefore.archetypeId;
          const stillDead = roles.some(r => (truthAfter.deadRoles || []).includes(r));
          if (archChanged && !stillDead) { landed = true; break; }
          landed = expectArch ? (archChanged && !stillDead) : landed;
        }
      }
      logFeedback({
        turn_id: turnId, session_id: sessionIdRef.current || null,
        verdict: { event: 'offer-executed', offerKind: offer.kind, offerEvent: offer.event || null,
          renderTruth: landed ? 'landed' : 'not-landed',
          archetypeBefore: truthBefore?.archetypeId ?? null, archetypeAfter: truthAfter?.archetypeId ?? null },
      });
      // Mark this offer spent on the message that carried it so its chip disappears
      // (match by reference OR by the offer's stable id, which survives a restore).
      setMessages(prev => prev.map(m =>
        (m.pendingOffer === offer || (m.pendingOffer && offer.id && m.pendingOffer.id === offer.id))
          ? { ...m, pendingOffer: null, offerSpent: true } : m));
      setMessages(prev => [...prev, landed
        ? { role: 'assistant', content: offer.confirm || 'Done — that switch is on the canvas now.',
            summary: changeKeys.length ? summarizeKeys(changeKeys) : 'archetype',
            undoIndex: Date.now(), turnId, undoTurnId: turnId, feedbackable: true }
        // Truthful failure — never claim a switch the canvas contradicts.
        : { role: 'assistant', content: "I tried that just now, but the canvas didn't take the switch. Try the “Try another layout” chip, or tap the element to edit it directly." }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "I couldn't apply that just now. Try the “Try another layout” chip, or tap the element to edit it." }]);
    } finally {
      setLoading(false);
    }
  }, [loading, onApplyPatch]); // eslint-disable-line react-hooks/exhaustive-deps

  // (WP-Z) File a /feedback note. DETERMINISTIC + instant — never touches the model.
  // Builds the best-effort context bundle, stores it through the existing capture
  // pipe (tagged kind:'user_feedback', so the learning pass ranks it highest), and
  // shows a warm confirmation that discloses the snapshot. Fire-and-forget storage;
  // the pipe already mirrors to a localStorage ring buffer, so this works with the
  // cloud configured AND unreachable.
  const fileFeedback = useCallback((rawText) => {
    const text = stripFeedbackCommand(rawText);
    const turnId = newTurnId();
    const sid = sessionIdRef.current || null;
    // Record the user's line verbatim (with the command) so the thread reads true.
    setMessages(prev => [...prev, { role: 'user', content: String(rawText).trim(), turnId }]);
    // ── Context bundle (every piece best-effort; a miss never blocks the note) ──
    let design = null;
    try { const read = designStateRef.current || designState; design = read(); } catch { /* ignore */ }
    let lastTurns = [];
    try {
      lastTurns = messages.slice(-6).map(m => ({ role: m.role, content: String(m.content || '').slice(0, 800) }));
    } catch { /* ignore */ }
    const bundle = {
      kind: 'user_feedback',
      text,
      ts: new Date().toISOString(),
      sessionId: sid,
      commit: buildCommit(),
      dimensionId: design?.dimensionId ?? null,
      format: design?.dimensionId ?? null,
      designState: design || null,
      lastTurns,
      advisorFindings: readAdvisorFindings(),
      thumbnail: captureCanvasThumb(),
      consoleErrors: readConsoleErrors(),
    };
    // Store through the capture pipe. user_message stays top-level (verbatim);
    // the whole bundle rides in the verdict jsonb column (kind marks it).
    logFeedback({
      turn_id: turnId,
      session_id: sid,
      user_message: text || '[/feedback]',
      verdict: bundle,
    });
    lastFeedbackRef.current = { turnId, sessionId: sid };
    prevTurnRef.current = { turnId, content: text };
    // Warm, instant, deterministic confirmation that discloses the snapshot.
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: "Thank you — I've noted this along with a snapshot of your current design and sent it to the team. If you like, tell me what you expected instead — I'll add it to the note.",
    }]);
    setInput('');
    inputRef.current?.focus();
  }, [designState, messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // (WP-Z) Append an elaboration to the most recent /feedback event as an addendum
  // (same pipe, kind:'user_feedback_addendum', ref back to the feedback turn id).
  const fileFeedbackAddendum = useCallback((rawText) => {
    const ref = lastFeedbackRef.current;
    if (!ref) return false;
    const text = String(rawText || '').trim();
    const turnId = newTurnId();
    setMessages(prev => [...prev, { role: 'user', content: text, turnId }]);
    logFeedback({
      turn_id: turnId,
      session_id: ref.sessionId || sessionIdRef.current || null,
      user_message: text,
      verdict: { kind: 'user_feedback_addendum', ref: ref.turnId, text, ts: new Date().toISOString() },
    });
    setMessages(prev => [...prev, {
      role: 'assistant',
      content: "Got it — I've added that to your note. Thank you for the detail.",
    }]);
    setInput('');
    inputRef.current?.focus();
    return true;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (textOverride, meta = {}) => {
    const content = String(textOverride ?? input).trim();
    if (!content || loading) return;
    // (WP-Z) THE /feedback INTERCEPT — deterministic, first, never to the model.
    if (isFeedbackCommand(content)) { fileFeedback(content); return; }
    // (WP-Z) ADDENDUM — a light "I expected…"/"it should…" reply right after a
    // /feedback note is appended to it rather than sent to the model. When in doubt
    // (no recent note, or the heuristic doesn't match) the message flows on normally.
    if (!meta.chip && lastFeedbackRef.current && looksLikeAddendum(content)) {
      if (fileFeedbackAddendum(content)) return;
    }
    // (WP-W1) A pendingOffer on the most recent assistant message + an affirmative
    // reply → execute the offer DIRECTLY (no model round-trip). A non-affirmative
    // reply CLEARS the pending offer and flows to the model as normal.
    if (!meta.skipOfferCheck) {
      const lastOfferMsg = [...messages].reverse().find(m => m.role === 'assistant' && m.pendingOffer);
      if (lastOfferMsg && lastOfferMsg.pendingOffer) {
        if (isAffirmative(content)) {
          return executeOffer(lastOfferMsg.pendingOffer, content);
        }
        // Non-affirmative: clear the pending offer, then fall through to the model.
        setMessages(prev => prev.map(m => m === lastOfferMsg ? { ...m, pendingOffer: null } : m));
      }
    }
    setError('');
    setRetryText('');   // (B4) clear any prior failed-turn retry affordance
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
    // (B1) A placeholder assistant bubble we stream tokens into. `streaming:true`
    // swaps the typing dots for the live text as it arrives. Its index is captured
    // so reply_delta events append to exactly this message.
    let streamIdx = -1;
    const startStreamingBubble = () => {
      setMessages(prev => {
        streamIdx = prev.length;
        return [...prev, { role: 'assistant', content: '', streaming: true, turnId }];
      });
    };
    const appendDelta = (text) => {
      setMessages(prev => {
        if (streamIdx < 0 || !prev[streamIdx]) return prev;
        const copy = prev.slice();
        copy[streamIdx] = { ...copy[streamIdx], content: (copy[streamIdx].content || '') + text };
        return copy;
      });
    };
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: 'editor',
          stream: true,
          messages: nextHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
          designState: designState(),
        }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "AI isn't set up yet.");
        setRetryText(content);
        setLoading(false);
        return;
      }
      // ── (B1) Read the SSE stream: render reply tokens live, collect the final
      //    { done } payload, then apply the patch atomically once the stream ends. ──
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '', data = null, streamErr = null;
      for (;;) {
        const { done: rdDone, value } = await reader.read();
        if (rdDone) break;
        buf += decoder.decode(value, { stream: true });
        const events = buf.split('\n\n');
        buf = events.pop() || '';
        for (const evt of events) {
          const line = evt.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let msg; try { msg = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (msg.type === 'reply_delta') {
            if (streamIdx < 0) startStreamingBubble();
            appendDelta(msg.text);
          } else if (msg.type === 'done') {
            data = msg;
          } else if (msg.type === 'error') {
            streamErr = msg.error || "I ran into a problem just now. Please try again.";
          }
          // 'status' events (thinking/applying) are advisory — the typing dots +
          // streamed text already communicate progress; no extra UI needed here.
        }
      }
      if (streamErr) {
        // Drop the (possibly empty) streaming bubble and surface a warm, retryable error.
        if (streamIdx >= 0) setMessages(prev => prev.filter((_, i) => i !== streamIdx));
        setError(streamErr);
        setRetryText(content);
        setLoading(false);
        return;
      }
      if (!data) {
        if (streamIdx >= 0) setMessages(prev => prev.filter((_, i) => i !== streamIdx));
        setError("That response came through incomplete. Please try again.");
        setRetryText(content);
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
      // (B1) FINALIZE the streamed bubble in place (don't append a second one): keep
      // the tokens already shown, reconcile with the authoritative final reply, and
      // attach the summary/undo/thumb chrome. Falls back to appending if — somehow —
      // no streaming bubble exists (e.g. a zero-token reply).
      // (Law #4) If the model wrote its OWN offer ("…want me to switch?") it has no
      // wired execution — strip that trailing clause and append the honest,
      // tappable alternative so an affirmative can't fumble back to the model.
      let replyText = data.reply || 'Done.';
      if (hasBannedOffer(replyText)) {
        const stripped = stripBannedOffer(replyText);
        replyText = (stripped ? stripped + ' ' : '')
          + 'Tap the “Try another layout” chip, or tap the element on the canvas to edit it directly.';
        verdict.contradictions = verdict.contradictions || [];
        verdict.contradictions.push('model-offer-rewritten-no-payload');
        logFeedback({ turn_id: turnId, session_id: sessionIdRef.current || null,
          verdict: { event: 'offer-rewritten', reason: 'model-offer-no-payload' } });
      }
      const finalMsg = {
        role: 'assistant',
        content: replyText,
        summary: summaryParts.join(', '),
        thumb,
        providerLabel,
        undoIndex: didChange ? Date.now() : null,
        turnId,
        undoTurnId: didChange ? turnId : null,
        feedbackable: true,
        streaming: false,
      };
      setMessages(prev => {
        if (streamIdx >= 0 && prev[streamIdx]) {
          const copy = prev.slice();
          copy[streamIdx] = { ...copy[streamIdx], ...finalMsg };
          return copy;
        }
        return [...prev, finalMsg];
      });
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

        // 2. TEXT ROLES: a field the patch filled that the layout genuinely can't
        // draw. The common legacy case — a caption on a photo_logo / texture_text —
        // now RENDERS in the legacy path (see renderScene), so it no longer trips
        // here. What remains are roles no legacy layout paints on this post type
        // (e.g. an eyebrow, or a date on photo_logo). For those, AUTO-PROMOTE to a
        // layout that shows the role (materialize — copy travels) so it's visible,
        // then confirm; fall back to an honest offer only if the promotion doesn't
        // cover it. This replaces the old dead-end "didn't change anything" no-op.
        const deadFields = Object.entries(ROLE_OF_FIELD)
          .filter(([field, role]) => typeof patch[field] === 'string' && patch[field].trim()
            && (truthAfter.deadRoles || []).includes(role));
        const deadHits = deadFields.map(([, role]) => ROLE_LABELS[role] || role);
        if (deadHits.length) {
          verdict.honesty = 'corrected';
          verdict.corrected = true;
          verdict.contradictions.push('field-filled-role-not-drawn');
          verdict.deadRoles = deadHits;
          const onLegacy = !truthAfter.archetypeId;
          const promoteTarget = designState?.hasImage ? 'editorial_split' : 'manifesto';
          let promoted = false;
          if (onLegacy && truthAfter.archetypeId !== promoteTarget) {
            const retryKeys = applyRef.current({ archetypeId: promoteTarget }) || [];
            promoted = retryKeys.includes('archetypeId');
          }
          if (promoted) {
            await settle(650);
            const t2 = truthRef.current();
            const stillDead = deadFields.some(([, role]) => (t2.deadRoles || []).includes(role));
            if (!stillDead) {
              verdict.retryTarget = promoteTarget;
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: `The previous layout couldn't show ${deadHits.join(' or ')}, so I moved you to a layout that does — it's on the canvas now. Tap Undo if you'd rather keep the old one.`,
                summary: 'archetype',
                undoIndex: Date.now(),
              }]);
              setLoading(false);
              return;
            }
          }
          // (WP-W1) The offer is NO LONGER bare words. It carries a concrete,
          // serializable pendingOffer payload — the SAME deterministic layout-switch
          // the inspector's one-tap "switch to a layout that shows it" applies
          // (mediaObj ? editorial_split : label_headline). Typing "yes" or tapping
          // the chip executes THIS patch directly (no model round-trip); the
          // executor re-verifies render truth before confirming.
          const hasImage = !!(stateBefore && stateBefore.hasImage);
          const offerTarget = hasImage ? 'editorial_split' : 'label_headline';
          const revealRoles = deadFields.map(([, role]) => role);
          // COPY TRAVELS: carry the just-filled copy fields into the switch patch so
          // materialization writes them into the NEW layout's roles deterministically
          // (an archetype-only patch relies on closure copy, which can be stale in the
          // async continuation — passing the values makes the reveal reliable).
          const carryCopy = {};
          for (const [field] of deadFields) {
            const v = typeof patch[field] === 'string' ? patch[field] : undefined;
            if (typeof v === 'string') carryCopy[field] = v;
          }
          const offer = offerTarget !== truthAfter.archetypeId
            ? { id: newTurnId(), kind: 'patch', patch: { archetypeId: offerTarget, ...carryCopy }, revealRoles,
                label: 'Yes — switch layout',
                confirm: `Done — I moved you to a layout that shows ${deadHits.join(' or ')}. It's on the canvas now; tap Undo to keep the old one.`,
                event: 'dead-role' }
            : null;
          verdict.offerMade = !!offer;
          if (offer) {
            logFeedback({ turn_id: turnId, session_id: sessionIdRef.current || null,
              verdict: { event: 'offer-made', offerKind: 'patch', offerEvent: 'dead-role', target: offerTarget } });
          }
          setMessages(prev => [...prev, offer ? {
            role: 'assistant',
            content: `One honest note — this layout doesn't actually show ${deadHits.join(' or ')}, so it isn't visible on the canvas. Want me to switch to a layout that shows it?`,
            pendingOffer: offer,
          } : {
            // No executable switch (already on the target) — the offer PHRASING is
            // banned; state the honest alternative instead.
            role: 'assistant',
            content: `One honest note — this layout doesn't show ${deadHits.join(' or ')}. Tap the “Try another layout” chip, or tap the element to edit it directly.`,
          }]);
          setLoading(false);
          return;
        }

        // 3. LOGO: an explicit placement patch. Explicit user placement ALWAYS
        // wins now — the render draws the logo where the user named it (the
        // safe-area/collision guards may not veto or relocate an explicit
        // instruction; they only surface an advisor dot on the canvas). So the
        // placement is HONORED when the drawn box's position matches the request
        // OR the box moved. It only counts as "not rendered" when neither holds —
        // which with explicit-placement-wins is rare (e.g. no logo drawn at all on
        // a photo-restraint layout). In that genuine case we name WHY and offer a
        // concrete next move (never the banned generic "didn't change anything").
        if (changeKeys.includes('logoPosition')) {
          const requested = patch.logoPosition;
          const drawnPos = truthAfter.logoBox?.position || null;
          const cB = logoCenter(truthBefore.logoBox), cA = logoCenter(truthAfter.logoBox);
          const eps = (truthAfter.canvas?.w || 1080) * 0.01;
          const moved = (!cB && cA) || (cB && cA && (Math.abs(cA.x - cB.x) > eps || Math.abs(cA.y - cB.y) > eps));
          const honored = (drawnPos && requested && drawnPos === requested) || moved;
          if (!honored) {
            verdict.honesty = 'corrected';
            verdict.corrected = true;
            verdict.contradictions.push('logo-move-not-rendered');
            // Name the reason when the layout draws no logo at all (photo-restraint
            // archetypes / logoUse:"none"); otherwise offer the concrete next move.
            const noLogo = !truthAfter.logoBox;
            if (noLogo) {
              // (WP-W1) The "switch to one that shows your mark, then put it there"
              // offer now carries a real payload: a layout that draws the logo PLUS
              // the requested placement, executed as one patch on accept.
              const hasImage = !!(stateBefore && stateBefore.hasImage);
              const logoTarget = hasImage ? 'editorial_split' : 'label_headline';
              const offer = { id: newTurnId(), kind: 'patch',
                patch: { archetypeId: logoTarget, ...(requested ? { logoPosition: requested } : {}) },
                label: 'Yes — switch and place it',
                confirm: "Done — switched to a layout that carries your mark, and placed it where you asked. Tap Undo to go back.",
                event: 'logo-no-layout' };
              verdict.offerMade = true;
              logFeedback({ turn_id: turnId, session_id: sessionIdRef.current || null,
                verdict: { event: 'offer-made', offerKind: 'patch', offerEvent: 'logo-no-layout', target: logoTarget } });
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: "This layout doesn't place a logo on its own — want me to switch to one that shows your mark, then put it there?",
                pendingOffer: offer,
              }]);
            } else {
              setMessages(prev => [...prev, {
                role: 'assistant',
                content: "Checking the canvas — the logo didn't land there on this layout. Try naming a corner (“put the logo top-left”), or drag it on the canvas and it'll stick.",
              }]);
            }
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
      if (streamIdx >= 0) setMessages(prev => prev.filter((_, i) => i !== streamIdx));
      setError("I couldn't reach the AI just now — that's on the connection, not you.");
      setRetryText(content);
    } finally {
      commitLog();
      setLoading(false);
    }
  }, [input, loading, messages, designState, onApplyPatch, onGenerateImage, renderTruth, fileFeedback, fileFeedbackAddendum]);

  // (findings actions-model law) Expose an imperative send so a finding's "Shorten it
  // for me" ai-fix action can route a targeted prompt through the SAME assistant +
  // patch + honesty pipeline (undoable), exactly as if the user typed it.
  useEffect(() => {
    if (sendRef) sendRef.current = (text, meta) => send(text, meta);
    return () => { if (sendRef) sendRef.current = null; };
  }, [sendRef, send]);

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
    <section className="wo-chat" aria-label="Orchid, your design helper">
      <header className="wo-chat-head">
        {/* (D1 item 9) A warm, named helper — not tracked-caps "ART DIRECTOR",
            which reads as intimidating designer-speak to a preschool teacher. */}
        <span className="wo-chat-title">
          <span className="wo-chat-name">Orchid</span>
          <span className="wo-chat-sub">your design helper</span>
        </span>
        {canHistory && (
          <div className="ad-hist">
            {sessionTitle ? <span className="ad-hist-cur" title={cleanTitle(sessionTitle)}>{cleanTitle(sessionTitle)}</span> : null}
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
            {historyOpen && (
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
                      <span className="ad-hist-label">{cleanTitle(p.title)}</span>
                      {p.id === sessionId && <span className="ad-hist-dot" aria-hidden="true" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </header>

      <div className="wo-chat-list" ref={listRef}>
        {messages.length === 0 && !loading && (
          /* (WP-X §3) TAPPABLE EXAMPLES — the client read these as plain text and
             tried to interact with them. They are now real chips that SEND on tap,
             consistent with the landing suggestions. */
          <div className="ad-empty">
            <p className="ad-empty-lead">Tell me what to make — or what to change. Tap one to try it:</p>
            <div className="ad-empty-chips">
              {emptyExamples.map(ex => (
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
            {/* (WP-W1) PENDING-OFFER CHIP — one tap does the identical deterministic
                thing typing "yes" does: executes the offer payload directly, no
                model round-trip. Only shown while the offer is still live. */}
            {m.role === 'assistant' && m.pendingOffer && (
              <div className="ad-offer-actions">
                <button
                  type="button"
                  className="ad-offer-chip"
                  disabled={loading}
                  onClick={() => executeOffer(m.pendingOffer, '')}
                >
                  {m.pendingOffer.label || 'Yes — do it'}
                </button>
              </div>
            )}
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
        {/* (B1) Typing dots only until the first token streams in — once a streaming
            bubble is rendering live text, it IS the progress indicator. */}
        {loading && !messages.some(m => m.streaming) && (
          <div className="ad-msg ad-msg--assistant">
            <div className="ad-bubble ad-typing"><span /><span /><span /></div>
          </div>
        )}
        {/* (B4) NEVER A DEAD END — a failed turn shows a warm line AND a one-tap
            Retry (re-sends the exact message), so the user is never stranded on a
            bare error. Falls back to just the line if we somehow lost the text. */}
        {error && (
          <div className="ad-error-block" role="alert">
            <p className="ad-error">{error}</p>
            {retryText && (
              <button type="button" className="ad-retry-chip"
                onClick={() => { const t = retryText; setError(''); setRetryText(''); send(t); }}>
                ↻ Try again
              </button>
            )}
          </div>
        )}
      </div>

      <div className="wo-chat-chips" role="toolbar" aria-label="Quick actions">
        {chips.map(c => (
          <button key={c.label} type="button" className="wo-chat-chip" disabled={loading}
            onClick={() => (c.act ? c.act() : send(c.msg))}>
            {c.label}
          </button>
        ))}
      </div>

      {/* (WP-Z) Slash discoverability — typing "/" alone reveals the one command we
          have. Airy, on-brand, one line; disappears the moment the input grows. */}
      {input.trim() === '/' && (
        <div className="ad-slash-hint" role="status">
          <button type="button" className="ad-slash-cmd" onClick={() => { setInput('/feedback '); inputRef.current?.focus(); }}>
            <span className="ad-slash-name">/feedback</span>
            <span className="ad-slash-desc">report something that isn’t working right</span>
          </button>
        </div>
      )}

      <form className="ad-input-row" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Say it to change it…"
          aria-label="Message Orchid, your design helper"
          disabled={loading}
        />
        <button type="submit" aria-label="Send" disabled={loading || !input.trim()}>↑</button>
      </form>
    </section>
  );
}
