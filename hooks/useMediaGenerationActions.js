import { useRef, useState } from "react";

/** Upload, generated-photo ingestion, refresh polling, and library selection. */
export function useMediaGenerationActions({
  AI_UNDO_DEPTH,
  applyPatch,
  dimensionId,
  genBrief,
  harmonizeRef,
  image,
  mediaObj,
  library,
  setAiUndoStack,
  setLibrary,
  setRedoStack,
  setShowLibPicker,
  setVideoObj,
  setVideoPlaying,
  snapshotApplyableState,
  videoObj,
  compressImage,
  MAX_LIB,
  SAMPLE_IMAGES,
  // (Media organization 2026-07-29) Activity lineage: the current session id is
  // threaded in so every generated/uploaded image records which post it belongs
  // to (images.session_id → the Library's "By activity" grouping). This hook is
  // deliberately un-memoized (see the Generator call-site note), so the plain
  // value is always current — no ref needed.
  sessionId,
}) {
const loadImage = async (dataUrl) => {
  applyPatch({ imageSrc: dataUrl }, { source: "ui" });   // WP-V: through THE pipeline
  // Compress and save to library
  const thumb = await compressImage(dataUrl, 120, 0.5);
  const full = await compressImage(dataUrl, 1080, 0.7);
  const id = Date.now().toString(36);
  setLibrary(prev => {
    const next = [{id, thumb, full}, ...prev.filter(x => x.full !== full)];
    return next.slice(0, MAX_LIB);
  });
};

// Apply an AI-generated image (Commit 4). Ingests through the SAME path as an
// upload — remove any video, set the canvas photo + save to the local library —
// and persists to the Supabase library so it appears in Library like any upload.
// Snapshots onto the AI undo stack (photo source + transform are in the snapshot)
// so undo restores the previous photo, and re-arms the silent harmonizer so text
// stays legible on the new background. `harmonize` is honoured like applyDesignPatch.
const applyGeneratedImage = async (dataUrl, opts = {}) => {
  if (!dataUrl) return;
  // Snapshot BEFORE changing the photo so undo restores the prior background.
  setAiUndoStack(prev => [snapshotApplyableState(), ...prev].slice(0, AI_UNDO_DEPTH));
  setRedoStack([]);   // (WP-W0) a new change invalidates the redo branch
  if (videoObj) { videoObj.pause(); setVideoObj(null); setVideoPlaying(false); }
  await loadImage(dataUrl);   // canvas + local library (same as an upload)
  // Persist to the Supabase library so it lands in Library (same endpoint uploads use).
  try {
    const blob = await (await fetch(dataUrl)).blob();
    const file = new File([blob], `ai-generated-${Date.now()}.png`, { type: blob.type || 'image/png' });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('source_type', 'generated');   // (taxonomy 2026-07-29) AI pipeline output → no consent gate
    if (sessionId) fd.append('session_id', sessionId);          // activity lineage
    if (genBrief?.scene) fd.append('scene', genBrief.scene);    // the prompt that produced it
    await fetch('/api/images', { method: 'POST', body: fd });
  } catch { /* non-blocking — canvas + local library still work if upload fails */ }
  // Re-arm the harmonizer so the just-applied AI photo gets accessibility passes
  // (the folded fixes join this same undo entry via amendUndo).
  if (opts.harmonize === true) harmonizeRef.current = { armed: true, rounds: 0, applied: [] };
};

// Shared start/poll photo pipeline with QC + auto re-roll (WP-U #4): a completed
// generation that fails the server's vision QC (rendered text / poster-layout)
// re-rolls ONCE with a fresh seed — max 2 attempts; the last attempt skips QC so
// the user gets a photo over nothing. Returns a data URL or null (caller falls
// back to Library/solid-field). NEVER throws.
const fetchScenePhoto = async (scene, { maxAttempts = 2, budgetMs = 75_000 } = {}) => {
  const deadline = Date.now() + budgetMs;
  try {
    for (let attempt = 1; attempt <= maxAttempts && Date.now() < deadline; attempt++) {
      const startRes = await fetch('/api/design-generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene, dimensionId }),
      });
      const start = await startRes.json().catch(() => ({}));
      if (start.unconfigured || start.failed || !start.jobId) return null;
      const qs = new URLSearchParams({ jobId: start.jobId, ...(attempt >= maxAttempts ? { qc: '0' } : {}) }).toString();
      let reroll = false;
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 3000));
        let poll;
        try { poll = await (await fetch(`/api/design-generate?${qs}`)).json(); } catch { continue; }
        if (poll.status === 'pending') continue;
        if (poll.status === 'done' && poll.imageDataUrl) return poll.imageDataUrl;
        if (poll.status === 'qc_failed') { reroll = true; break; } // fresh seed next attempt
        return null;
      }
      if (!reroll) return null; // timed out
    }
    return null;
  } catch {
    return null;
  }
};

// (WP-U #8) "Refresh photo" chip — re-run ONLY the photo fetch on a photo-bearing
// design: Higgsfield with the SAME scenePrompt when the design came from a landing/
// chat generation (genBrief), else a Library/sample rotation. Copy + layout are
// untouched; the generated path reuses the Try-another plumbing (fetchScenePhoto +
// applyGeneratedImage) so undo and the silent harmonizer behave identically.
const [refreshingPhoto, setRefreshingPhoto] = useState(false);
// (B2) Honest staged label for the in-editor photo wait: a generated (Higgsfield)
// refresh genuinely runs ~20s, so after a beat we say so rather than a bare spinner.
const [refreshStage, setRefreshStage] = useState("");
// (B1 · never a dead end) A warm, retryable line shown when a refresh finds NO
// replacement — the current photo is kept untouched (swap-on-success only), never
// cleared, and the user is invited to try again rather than left with a silent no-op.
const [refreshNotice, setRefreshNotice] = useState("");
const refreshStageTimer = useRef(null);
const refreshNoticeTimer = useRef(null);
const refreshPhoto = async () => {
  if (refreshingPhoto || !mediaObj) return;
  setRefreshingPhoto(true);
  setRefreshNotice("");
  if (refreshNoticeTimer.current) { clearTimeout(refreshNoticeTimer.current); refreshNoticeTimer.current = null; }
  // SWAP-ON-SUCCESS ONLY: we mutate the canvas photo ONLY once we hold a replacement.
  // A failed/empty fetch (mocked keys, host blocked, no candidate) leaves the existing
  // photo in place — a failed refresh must never clear the media before it has a swap.
  let swapped = false;
  try {
    const scene = genBrief?.scene || "";
    if (scene) {
      setRefreshStage("Finding a fresh photo…");
      if (refreshStageTimer.current) clearTimeout(refreshStageTimer.current);
      refreshStageTimer.current = setTimeout(() => setRefreshStage("Still looking — a few more seconds…"), 10_000);
      const url = await fetchScenePhoto(scene);
      if (url) { await applyGeneratedImage(url, { harmonize: true }); swapped = true; return; }
    }
    // Library rotation fallback: any local-library or sample photo that isn't
    // the current one. Deterministic-ish walk: first non-current candidate.
    const pool = [...library.map(l => l.full), ...SAMPLE_IMAGES.map(s => s.full)]
      .filter(u => u && u !== image);
    if (pool.length) {
      const url = pool[Math.floor(Math.random() * pool.length)];
      applyPatch({ imageSrc: url }, { source: "ui" });   // WP-V: through THE pipeline
      swapped = true;
    }
  } finally {
    if (refreshStageTimer.current) { clearTimeout(refreshStageTimer.current); refreshStageTimer.current = null; }
    setRefreshStage("");
    setRefreshingPhoto(false);
    if (!swapped) {
      setRefreshNotice("Couldn't find a different photo just now — your photo's unchanged. Tap Refresh photo to try again.");
      refreshNoticeTimer.current = setTimeout(() => setRefreshNotice(""), 6000);
    }
  }
};

const loadFile = async (file) => {
  if (!file) return;
  // Load onto canvas immediately
  const r = new FileReader();
  r.onload = (e) => loadImage(e.target.result);
  r.readAsDataURL(file);
  // Auto-save to Supabase library in background. (taxonomy 2026-07-29) A file a
  // person brings in through the generator is 'uploaded' — activity-based, not
  // provenance-guessing; consent stays an orthogonal dimension (the /upload page
  // is where a real-people photo gets its consent status).
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('source_type', 'uploaded');
    if (sessionId) fd.append('session_id', sessionId);   // activity lineage
    await fetch('/api/images', { method: 'POST', body: fd });
  } catch(e) { /* non-blocking — canvas still works if upload fails */ }
};

// Load image from Supabase library picker
const selectFromLibrary = async (img) => {
  setShowLibPicker(false);
  if (!img.url) return;
  applyPatch({ imageSrc: img.url }, { source: "ui" });   // WP-V: through THE pipeline
};
  return {
    applyGeneratedImage,
    loadFile,
    refreshPhoto,
    refreshStage,
    refreshNotice,
    refreshingPhoto,
    selectFromLibrary,
  };
}
