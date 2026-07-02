'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { summarizePatch, stripCopyFromPatch, fixHasEffect, diffPatchAgainstState } from '@/lib/design-patch';

/* AI Audit panel (Commit 3) — advisory-only design review.

   Mounted at the TOP LEVEL of the Generator tree (never inside a transformed
   ancestor) so its fixed panel anchors to the viewport. Brand-styled as a
   sibling of ArtDirectorChat (shares the .ad-* visual language via .audit-*).

   Flow: open → run local checks instantly (render immediately) → call the vision
   route with the current-dimension render → show findings (local-first) → each
   fix has an "Apply" chip + a global "Preview all fixes" → applying goes through
   applyDesignPatch (undo stack) and switches to a before/after bar with
   "Keep changes" / "Revert". Export/Save are never blocked — this is advisory.

   Props:
   - open / setOpen: controlled open state
   - runLocalAudit(): () => findings[]           (Commit 1, free/instant)
   - captureImage(): () => jpeg dataURL | null    (current-dimension render)
   - designState(): () => compact, blob-free snapshot
   - dimensionId: string
   - applyPatch(patch): apply, returns applied change keys[]
   - undoOnce(): undo the most recent AI change (LIFO)
*/

const SEV_ICON = { fail: '✕', warn: '!', info: 'i' };
const SEV_LABEL = { fail: 'Needs attention', warn: 'Worth a look', info: 'Heads-up' };

// Lightweight canvas signature (Commit 2 post-apply guard). We hash the captured
// JPEG dataURL — its bytes are a deterministic function of the rendered pixels, so
// an unchanged canvas yields an identical hash. Sampling every Nth char keeps it
// cheap on large data URLs while still reflecting any real visual change.
function canvasSignature(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return '0';
  let h = 2166136261 >>> 0; // FNV-1a seed
  const stride = Math.max(1, Math.floor(dataUrl.length / 4096)); // ~4k samples max
  for (let i = 0; i < dataUrl.length; i += stride) {
    h ^= dataUrl.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${dataUrl.length}:${h.toString(36)}`;
}

// Compare two finding lists for NEW severity-fail findings (post-apply regression
// guard). Returns true if applying introduced a fail that wasn't there before.
function introducedNewFail(before, after) {
  const failKey = f => `${f.category}:${f.message}`;
  const beforeFails = new Set((before || []).filter(f => f.severity === 'fail').map(failKey));
  return (after || []).some(f => f.severity === 'fail' && !beforeFails.has(failKey(f)));
}

export default function AuditPanel({ open, setOpen, runLocalAudit, captureImage, designState, dimensionId, applyPatch, undoOnce }) {
  const [local, setLocal] = useState([]);        // local findings (Commit 1)
  const [vision, setVision] = useState(null);    // { passes, summary, findings } | null
  const [visionState, setVisionState] = useState('idle'); // idle | loading | done | unavailable | error
  const [note, setNote] = useState('');          // graceful-degradation note (503/no-key)
  const [appliedCount, setAppliedCount] = useState(0); // how many fixes applied this session (for revert)
  const [phase, setPhase] = useState('findings'); // findings | preview
  const [appliedIds, setAppliedIds] = useState([]); // finding ids already applied
  const [unclean, setUnclean] = useState({});       // finding ids the post-apply guard reverted
  const runIdRef = useRef(0);

  // The post-apply guard reads the canvas + local findings AFTER the applied patch
  // has re-rendered. captureImage / runLocalAudit are useCallbacks in Generator that
  // change identity on every render-affecting state change — so we must call the
  // LATEST versions (closing over post-apply state), not the ones captured when the
  // click handler ran (which still close over the pre-apply state → stale pixels →
  // false "no visual change"). Refs always hold the current props.
  const captureRef = useRef(captureImage);
  const localAuditRef = useRef(runLocalAudit);
  useEffect(() => { captureRef.current = captureImage; }, [captureImage]);
  useEffect(() => { localAuditRef.current = runLocalAudit; }, [runLocalAudit]);

  // Run the audit whenever the panel opens.
  const start = useCallback(async () => {
    const myRun = ++runIdRef.current;
    // Reset per-run state; local findings render immediately.
    setVision(null); setNote(''); setAppliedCount(0); setAppliedIds([]); setUnclean({}); setPhase('findings');
    let localFindings = [];
    try { localFindings = runLocalAudit() || []; } catch { localFindings = []; }
    setLocal(localFindings);

    setVisionState('loading');
    const imageDataUrl = captureImage();
    if (!imageDataUrl) { setVisionState('error'); setNote("Couldn't capture the preview for the AI pass. Local checks still ran."); return; }

    try {
      const res = await fetch('/api/design-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          designState: designState(),
          dimensionId,
          localFindings: localFindings.map(f => `[${f.severity}] ${f.category}: ${f.message}`),
        }),
      });
      if (runIdRef.current !== myRun) return; // superseded by a newer run
      const data = await res.json().catch(() => ({}));
      if (res.status === 503) { setVisionState('unavailable'); setNote(data.error || 'The AI polish pass is unavailable. Your local checks still ran.'); return; }
      if (!res.ok) { setVisionState('error'); setNote(data.error || 'The AI polish pass ran into a problem. Your local checks still ran.'); return; }
      setVision({
        passes: !!data.passes,
        summary: typeof data.summary === 'string' ? data.summary : '',
        findings: Array.isArray(data.findings) ? data.findings : [],
      });
      setVisionState('done');
    } catch {
      if (runIdRef.current !== myRun) return;
      setVisionState('error');
      setNote("Couldn't reach the AI just now. Your local checks still ran.");
    }
  }, [runLocalAudit, captureImage, designState, dimensionId]);

  useEffect(() => { if (open) start(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // All findings with an applicable fix, in display order (local first). A finding
  // is fixable only when its fix would ACTUALLY change the current design state
  // (no-op detection, P2) — an echoed / already-satisfied fix has no Apply chip and
  // renders as advice instead. We diff against the live state each render so a fix
  // that becomes a no-op after an earlier apply drops its chip too.
  const state = (() => { try { return designState() || {}; } catch { return {}; } })();
  const visionFindings = (vision?.findings || []).map((f, i) => ({ ...f, id: `vision-${i}`, layer: 'ai' }));
  const allFindings = [...local, ...visionFindings];
  const hasEffect = (f) => !!f.fix && fixHasEffect(f.fix, state);
  const fixable = allFindings.filter(f => hasEffect(f) && !appliedIds.includes(f.id));

  // Post-apply verification (P2): capture a canvas signature + local findings BEFORE
  // applying, then re-check AFTER the render commits. If the canvas is UNCHANGED (a
  // no-op slipped through) or a NEW severity-fail appeared, auto-revert and mark the
  // affected findings as advice with a subtle "couldn't apply cleanly" note.
  const verifyAfterApply = (ids, beforeSig, beforeFindings) => {
    // Defer past the applied patch's React commit AND its canvas draw. We wait two
    // animation frames (commit → paint) plus a short timeout, and read the LATEST
    // captureImage / runLocalAudit via refs so they reflect post-apply state.
    const run = () => {
      let afterSig = beforeSig;
      let afterFindings = beforeFindings;
      try { afterSig = canvasSignature(captureRef.current()); } catch { /* keep before */ }
      try { afterFindings = localAuditRef.current() || []; } catch { /* keep before */ }
      const noVisualChange = afterSig === beforeSig;
      const regressed = introducedNewFail(beforeFindings, afterFindings);
      if (noVisualChange || regressed) {
        for (let i = 0; i < ids.length; i++) undoOnce(); // LIFO revert of this apply
        setAppliedCount(c => Math.max(0, c - ids.length));
        setAppliedIds(prev => prev.filter(id => !ids.includes(id)));
        setUnclean(prev => { const next = { ...prev }; for (const id of ids) next[id] = true; return next; });
        // If nothing else is applied, drop back to the findings list.
        setPhase(p => (p === 'preview' ? 'findings' : p));
      }
    };
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 16);
    raf(() => raf(() => setTimeout(run, 40))); // commit → paint → settle, then verify
  };

  const applyOne = (finding) => {
    if (!hasEffect(finding)) return;
    const clean = stripCopyFromPatch(finding.fix);
    const beforeSig = (() => { try { return canvasSignature(captureImage()); } catch { return null; } })();
    const beforeFindings = (() => { try { return runLocalAudit() || []; } catch { return []; } })();
    const applied = applyPatch(clean) || [];
    if (applied.length) {
      setAppliedCount(c => c + 1);
      setAppliedIds(ids => [...ids, finding.id]);
      setPhase('preview');
      verifyAfterApply([finding.id], beforeSig, beforeFindings);
    }
  };

  const applyAll = () => {
    // Apply each in order; each pushes its own undo entry (LIFO revert unwinds all).
    const toApply = fixable.slice();
    const beforeSig = (() => { try { return canvasSignature(captureImage()); } catch { return null; } })();
    const beforeFindings = (() => { try { return runLocalAudit() || []; } catch { return []; } })();
    let count = 0;
    const ids = [];
    for (const f of toApply) {
      const clean = stripCopyFromPatch(f.fix);
      const applied = applyPatch(clean) || [];
      if (applied.length) { count++; ids.push(f.id); }
    }
    if (count) {
      setAppliedCount(c => c + count);
      setAppliedIds(prev => [...prev, ...ids]);
      setPhase('preview');
      verifyAfterApply(ids, beforeSig, beforeFindings);
    }
  };

  const keep = () => { setOpen(false); };
  const revert = () => {
    for (let i = 0; i < appliedCount; i++) undoOnce(); // LIFO — unwinds every applied fix
    setAppliedCount(0); setAppliedIds([]); setPhase('findings');
  };

  const fmtChip = (fix) => {
    const s = summarizePatch(stripCopyFromPatch(fix));
    if (!s) return 'Apply';
    // Vision fixes sometimes echo the whole design; keep the chip readable.
    const parts = s.split(', ');
    return parts.length > 3 ? 'Apply suggested tweak' : `Apply — ${s}`;
  };

  if (!open) return null;

  const loading = visionState === 'loading';
  const showNote = (visionState === 'unavailable' || visionState === 'error') && note;

  return (
    <section className="audit-panel" role="dialog" aria-label="AI design audit" aria-modal="false">
      <header className="audit-head">
        <span className="audit-title">✓ AI Audit</span>
        <button type="button" className="audit-close" onClick={() => setOpen(false)} aria-label="Close">×</button>
      </header>

      <div className="audit-body">
        {phase === 'preview' ? (
          <div className="audit-preview">
            <p className="audit-preview-msg">Applied {appliedCount} {appliedCount === 1 ? 'tweak' : 'tweaks'} to the preview. Compare, then keep or revert.</p>
          </div>
        ) : (
          <>
            {/* Overall summary */}
            {visionState === 'done' && vision && (
              <div className={`audit-summary ${vision.passes ? 'audit-summary--pass' : 'audit-summary--attn'}`}>
                <strong>{vision.passes ? 'Looks good' : 'A few suggestions'}</strong>
                {vision.summary && <span>{vision.summary}</span>}
              </div>
            )}

            {/* Local findings (instant) */}
            <div className="audit-group-label">Automatic checks</div>
            {local.length === 0 && <p className="audit-empty">No contrast, size, safe-zone, or layout issues detected.</p>}
            {local.map(f => (
              <Finding key={f.id} f={f} applied={appliedIds.includes(f.id)} unclean={!!unclean[f.id]} canApply={hasEffect(f)} onApply={() => applyOne(f)} chipLabel={fmtChip} />
            ))}

            {/* AI polish findings */}
            <div className="audit-group-label">AI polish pass</div>
            {loading && <div className="audit-loading"><span className="audit-spin" /> Reviewing the design…</div>}
            {showNote && <p className="audit-note">{note}</p>}
            {visionState === 'done' && visionFindings.length === 0 && <p className="audit-empty">Nothing else to flag.</p>}
            {visionFindings.map(f => (
              <Finding key={f.id} f={f} applied={appliedIds.includes(f.id)} unclean={!!unclean[f.id]} canApply={hasEffect(f)} onApply={() => applyOne(f)} chipLabel={fmtChip} />
            ))}
          </>
        )}
      </div>

      {/* Footer actions */}
      <footer className="audit-foot">
        {phase === 'preview' ? (
          <>
            <button type="button" className="audit-btn audit-btn--ghost" onClick={revert}>Revert</button>
            <button type="button" className="audit-btn audit-btn--solid" onClick={keep}>Keep changes</button>
          </>
        ) : (
          <button type="button" className="audit-btn audit-btn--solid" onClick={applyAll} disabled={!fixable.length}>
            {fixable.length ? `Preview all fixes (${fixable.length})` : 'No auto-fixes available'}
          </button>
        )}
      </footer>
    </section>
  );
}

function Finding({ f, applied, unclean, canApply, onApply, chipLabel }) {
  // Advice-only when there's no fix that would actually change the design (no-op
  // detected, composition category, or the post-apply guard couldn't apply it
  // cleanly). Advice findings show a small "advice" tag instead of an Apply chip.
  const showChip = canApply && !applied && !unclean;
  const showAdvice = !applied && !canApply;
  return (
    <div className={`audit-finding audit-finding--${f.severity}`}>
      <span className={`audit-sev audit-sev--${f.severity}`} title={SEV_LABEL[f.severity] || ''}>{SEV_ICON[f.severity] || '•'}</span>
      <div className="audit-finding-body">
        <span className="audit-finding-cat">
          {f.category}
          {showAdvice && <span className="audit-advice-tag"> · advice</span>}
        </span>
        <p className="audit-finding-msg">{f.message}</p>
        {showChip && (
          <button type="button" className="audit-apply-chip" onClick={onApply}>{chipLabel(f.fix)}</button>
        )}
        {applied && <span className="audit-applied">✓ applied</span>}
        {unclean && <span className="audit-applied audit-unclean">couldn’t apply cleanly — advice only</span>}
      </div>
    </div>
  );
}
