'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import LibraryPicker from '@/components/LibraryPicker';
import PhotoSourceChooser from '@/components/PhotoSourceChooser';
import { planIsPhotoLed, resolveLandingPhotoOutcome } from '@/lib/photo-source-policy.mjs';

// (D1 item 7) First-run suggestions ROTATE and vary in KIND so the empty state
// teaches the RANGE of what you can say — whole posts AND small changes. On each
// load we show a fresh mix (some of each kind) so no two visits look identical
// and the blank-prompt freeze is broken.
const EXAMPLE_POOL = {
  // Whole-post outcomes.
  posts: [
    'An open house invite for 18 July',
    'A quote of the week post',
    "We're hiring educators",
    'A warm welcome-back-to-school post',
    'A holiday closure notice for the parents',
    'A photo post celebrating our art week',
    'A gentle reminder that fees are due Friday',
    'A thank-you post for our volunteers',
  ],
  // Small-change asks (teach that you can nudge, not just start over).
  tweaks: [
    'Make it warmer',
    'Change the photo to children painting',
    'Try another layout',
    'Make the background wisteria',
    'Add a date line',
    'Make the title bigger',
  ],
};
// Pick `n` random items from an array without repeats.
function sample(arr, n) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy.slice(0, n);
}
// A rotating mix: three whole-post ideas + one small change, reshuffled per load.
function rotatingExamples() {
  return [...sample(EXAMPLE_POOL.posts, 3), ...sample(EXAMPLE_POOL.tweaks, 1)];
}
// A STABLE default (no randomness) for the server render + first client paint, so
// there's no hydration mismatch; the client reshuffles after mount (see effect).
const DEFAULT_EXAMPLES = [...EXAMPLE_POOL.posts.slice(0, 3), EXAMPLE_POOL.tweaks[0]];

// Handoff key consumed by Generator on mount to seed the floating chat + apply
// the starting design. Keep in sync with components/Generator.jsx.
const HANDOFF_KEY = 'wo-landing-plan';

// (B2) HONEST staged progress — each line is tied to a REAL pipeline phase, not a
// blind timer: writing the brief → generating the photo (the long one, said so) →
// composing. The photo phase adds a gentle in-phase reassurance line on a slow timer
// because that single request genuinely runs ~20–45s.
const GEN_PHASE = {
  brief:   'Writing your copy…',
  photo:   'Finding your photo — this takes a few moments',
  photoWait: 'Still finding the right photo…',
  compose: 'Composing your design…',
};
// Poll budget for the photo generation before we hand off text-only: ~70s of GET
// polls at a 3s cadence. Higgsfield photo gens run ~20–45s.
const GEN_POLL_INTERVAL_MS = 3_000;
const GEN_POLL_MAX_MS = 75_000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export default function Home() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  // (D1 item 7) Rotating suggestion mix. SSR + first client paint use a stable
  // default (no hydration mismatch); after mount we swap in a fresh random mix,
  // computed once so it doesn't reshuffle mid-typing.
  const [examples, setExamples] = useState(DEFAULT_EXAMPLES);
  useEffect(() => { setExamples(rotatingExamples()); }, []);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');        // staged progress line during photo gen
  const [note, setNote] = useState('');
  // (Task #69 — photo source chooser) A PHOTO-LED plan pauses here for ONE tap:
  // Let AI decide (default, primary) / Pick from my library / Upload. Text-only
  // plans never set this — they hand off straight through (no photo to choose).
  const [pendingPlan, setPendingPlan] = useState(null); // { data, patch, content }
  const [libOpen, setLibOpen] = useState(false);
  const textareaRef = useRef(null);
  const stageTimerRef = useRef(null);
  const uploadRef = useRef(null);

  // Generate the post's background PHOTO from a scenePrompt via the start-job/poll
  // pipeline. Returns a photo data URL, or null to signal the caller to fall back
  // (Library photo / solid-field). NEVER throws.
  async function generateScenePhoto(scene, dimensionId = 'ig_square') {
    // (WP-U #4) QC + AUTO RE-ROLL: a completed generation that fails the server's
    // vision QC (rendered text / poster-layout) is re-rolled ONCE with a fresh
    // seed — max 2 attempts — then the caller falls back to Library/samples.
    const MAX_ATTEMPTS = 2;
    const deadline = Date.now() + GEN_POLL_MAX_MS;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && Date.now() < deadline; attempt++) {
      let start;
      try {
        const res = await fetch('/api/design-generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scene, dimensionId }),
        });
        start = await res.json().catch(() => ({}));
        if (!res.ok) return null;
      } catch { return null; }
      if (start.unconfigured || start.failed || !start.jobId) return null;

      // The LAST attempt skips QC — keep whatever the roll produced over nothing.
      const qs = new URLSearchParams({ jobId: start.jobId, ...(attempt >= MAX_ATTEMPTS ? { qc: '0' } : {}) }).toString();
      let reroll = false;
      while (Date.now() < deadline) {
        await sleep(GEN_POLL_INTERVAL_MS);
        let poll;
        try {
          const res = await fetch(`/api/design-generate?${qs}`);
          poll = await res.json().catch(() => ({}));
        } catch { continue; } // transient — keep polling within the budget
        if (poll.status === 'pending') continue;
        if (poll.status === 'done' && poll.imageDataUrl) return poll.imageDataUrl;
        if (poll.status === 'qc_failed') { reroll = true; break; } // fresh seed next loop
        return null; // failed / nsfw → fall back
      }
      if (!reroll) return null; // timed out → fall back
    }
    return null;
  }

  // (B2) The photo phase is one long request (~20–45s); after ~12s in it, soften
  // the wait with a second reassurance line so it never reads as a hang. Cleared on
  // any phase change.
  function enterPhotoPhase() {
    setStage(GEN_PHASE.photo);
    if (stageTimerRef.current) clearTimeout(stageTimerRef.current);
    stageTimerRef.current = setTimeout(() => setStage(GEN_PHASE.photoWait), 12_000);
  }
  function stopStageTicker() {
    if (stageTimerRef.current) { clearTimeout(stageTimerRef.current); stageTimerRef.current = null; }
    setStage('');
  }

  async function submit(text) {
    const content = String(text ?? message).trim();
    if (!content || loading) return;
    setLoading(true);
    setNote('');
    // PHASE 1 — brief/copy. Honest label for the first (fast) request.
    setStage(GEN_PHASE.brief);
    try {
      // 1. Get the design PLAN (archetype + copy + optional scenePrompt) — our
      //    engine composes the post; the photo (if any) is generated next.
      const response = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: 'landing', messages: [{ role: 'user', content }], designState: {} }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        stopStageTicker();
        setNote(data.error || "AI isn't set up yet. You can still open the studio below.");
        setLoading(false);
        return;
      }
      // DEFAULT FORMAT — IG Portrait (4:5). The client's staff start here and it's
      // Instagram's preferred feed ratio. Respect a format the plan explicitly chose
      // for intent (e.g. a banner/twitter brief); otherwise land the new design in
      // portrait. This drives both the generated photo's aspect and the editor view.
      const patch = { ...(data.patch || {}) };
      if (!patch.dimensionId) patch.dimensionId = 'ig_portrait';
      // 2. PHOTO-LED plans pause for the ONE-TAP photo-source choice (task #69,
      //    client ruling 2026-08-17). Text-only plans hand off straight through.
      if (planIsPhotoLed(data)) {
        stopStageTicker();
        setPendingPlan({ data, patch, content });
        return; // loading stays true — the chooser renders in the status area
      }
      finishGeneration({ data, patch, content }, { imageUrl: null, imageOrigin: null, removeImage: false, note: null });
    } catch {
      stopStageTicker();
      setNote("I couldn't reach the AI just now. You can still open the studio below.");
      setLoading(false);
    }
  }

  // PHASE 3 — composing + handing off to the editor. `outcome` is the resolved
  // photo-source result (lib/photo-source-policy.mjs): a landed image + origin, or
  // the HONEST degraded path (removeImage + the fallback note appended to the chat
  // seed) — never a silently repeated stock image (law 6).
  function finishGeneration(pending, outcome) {
    stopStageTicker();
    setStage(GEN_PHASE.compose);
    const patch = {
      ...pending.patch,
      // Only a photo-led plan that ended photo-less clears the media — the studio's
      // default scratch photo must never masquerade as this generation's photo.
      ...(outcome.removeImage && planIsPhotoLed(pending.data) ? { removeImage: true } : {}),
    };
    const reply = [pending.data.reply || '', outcome.note || ''].filter(Boolean).join('\n\n');
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({
        patch,
        reply,
        originalMessage: pending.content,
        scenePrompt: pending.data.scenePrompt || null,
        imageUrl: outcome.imageUrl,
        // 'uploaded' origin → the editor persists it to the Library with session
        // lineage (the #64 machinery) via useLandingHandoff.
        imageOrigin: outcome.imageOrigin,
      }));
    } catch { /* private mode — the studio still opens, just without seeding */ }
    router.push('/generate');
  }

  // One tap on the chooser: AI decide runs the generation pipeline (with the
  // graceful solid-field fallback); Library opens the picker; Upload opens the
  // file input. Library/Upload keep pendingPlan until an image actually lands so
  // closing the picker returns to the choice instead of losing the generation.
  async function chooseSource(source) {
    const pending = pendingPlan;
    if (!pending) return;
    if (source === 'library') { setLibOpen(true); return; }
    if (source === 'upload') { uploadRef.current?.click(); return; }
    setPendingPlan(null);
    enterPhotoPhase();
    const photo = await generateScenePhoto(pending.data.scenePrompt, pending.patch.dimensionId);
    finishGeneration(pending, resolveLandingPhotoOutcome({ source: 'ai', aiPhotoDataUrl: photo }));
  }

  function onLibraryPick(img) {
    const pending = pendingPlan;
    setLibOpen(false);
    if (!pending) return;
    if (!img?.url) return; // stay on the chooser — nothing was picked
    setPendingPlan(null);
    finishGeneration(pending, resolveLandingPhotoOutcome({ source: 'library', libraryUrl: img.url }));
  }

  // Compress an uploaded file to a bounded JPEG data URL (≤1080px) so the
  // sessionStorage handoff stays small; the editor persists it to the Library
  // (source_type 'uploaded' + session lineage) once the session exists.
  function compressFileToDataUrl(file, maxSize = 1080, quality = 0.7) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode failed'));
        img.onload = () => {
          try {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
          } catch (err) { reject(err); }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function onUploadFile(file) {
    const pending = pendingPlan;
    if (!pending || !file) return;
    setPendingPlan(null);
    setStage('Preparing your photo…');
    const dataUrl = await compressFileToDataUrl(file).catch(() => null);
    finishGeneration(pending, resolveLandingPhotoOutcome({ source: 'upload', uploadDataUrl: dataUrl }));
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

          {/* (Task #69) PHOTO SOURCE — a photo-led plan pauses here for one tap:
              AI decide (default, primary) / library / upload — then moves on.
              Inline in the status area, never a blocking modal. */}
          {pendingPlan && (
            <div style={{ marginTop: 18 }}>
              <PhotoSourceChooser
                hint="One tap for the photo — where should it come from?"
                onChoose={chooseSource}
              />
            </div>
          )}

          {/* In-place generating state: the ~2–5s wait reads as intentional rather
              than a dead click. The brand orchid pulses beside a status line; the
              input above is disabled while loading. On response we navigate as before. */}
          {loading && !pendingPlan && (
            <div role="status" aria-live="polite" style={{
              marginTop: 18, display: 'inline-flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--fg, #3a3f3a)',
            }}>
              <img src="/assets/logos/ds/logo-circle.png" alt="" className="wo-generating-orchid"
                style={{ width: 24, height: 24, objectFit: 'contain' }} />
              <span>{stage || 'Designing your starting point'}<span className="wo-dots" aria-hidden="true">…</span></span>
            </div>
          )}

          {/* (Task #69) Library picker + hidden upload input for the chooser. The
              picker is the studio's own LibraryPicker (one component, both flows);
              closing it without a pick returns to the chooser. */}
          {libOpen && <LibraryPicker onSelect={onLibraryPick} onClose={() => setLibOpen(false)} />}
          <input ref={uploadRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) onUploadFile(f); e.target.value = ''; }} />

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
            {examples.map(text => (
              <button key={text} type="button" className="wo-landing-chip" onClick={() => useExample(text)} disabled={loading}
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
