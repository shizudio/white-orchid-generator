'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { patchHasChanges, summarizePatch, stripCopyFromPatch } from '@/lib/design-patch';

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

export default function AuditPanel({ open, setOpen, runLocalAudit, captureImage, designState, dimensionId, applyPatch, undoOnce }) {
  const [local, setLocal] = useState([]);        // local findings (Commit 1)
  const [vision, setVision] = useState(null);    // { passes, summary, findings } | null
  const [visionState, setVisionState] = useState('idle'); // idle | loading | done | unavailable | error
  const [note, setNote] = useState('');          // graceful-degradation note (503/no-key)
  const [appliedCount, setAppliedCount] = useState(0); // how many fixes applied this session (for revert)
  const [phase, setPhase] = useState('findings'); // findings | preview
  const [appliedIds, setAppliedIds] = useState([]); // finding ids already applied
  const runIdRef = useRef(0);

  // Run the audit whenever the panel opens.
  const start = useCallback(async () => {
    const myRun = ++runIdRef.current;
    // Reset per-run state; local findings render immediately.
    setVision(null); setNote(''); setAppliedCount(0); setAppliedIds([]); setPhase('findings');
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

  // All findings with an applicable fix, in display order (local first).
  const visionFindings = (vision?.findings || []).map((f, i) => ({ ...f, id: `vision-${i}`, layer: 'ai' }));
  const allFindings = [...local, ...visionFindings];
  const fixable = allFindings.filter(f => f.fix && patchHasChanges(stripCopyFromPatch(f.fix)) && !appliedIds.includes(f.id));

  const applyOne = (finding) => {
    if (!finding.fix) return;
    const clean = stripCopyFromPatch(finding.fix);
    if (!patchHasChanges(clean)) return;
    const applied = applyPatch(clean) || [];
    if (applied.length) {
      setAppliedCount(c => c + 1);
      setAppliedIds(ids => [...ids, finding.id]);
      setPhase('preview');
    }
  };

  const applyAll = () => {
    // Apply each in order; each pushes its own undo entry (LIFO revert unwinds all).
    const toApply = fixable.slice();
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
              <Finding key={f.id} f={f} applied={appliedIds.includes(f.id)} onApply={() => applyOne(f)} chipLabel={fmtChip} />
            ))}

            {/* AI polish findings */}
            <div className="audit-group-label">AI polish pass</div>
            {loading && <div className="audit-loading"><span className="audit-spin" /> Reviewing the design…</div>}
            {showNote && <p className="audit-note">{note}</p>}
            {visionState === 'done' && visionFindings.length === 0 && <p className="audit-empty">Nothing else to flag.</p>}
            {visionFindings.map(f => (
              <Finding key={f.id} f={f} applied={appliedIds.includes(f.id)} onApply={() => applyOne(f)} chipLabel={fmtChip} />
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

function Finding({ f, applied, onApply, chipLabel }) {
  const hasFix = !!f.fix && patchHasChanges(stripCopyFromPatch(f.fix));
  return (
    <div className={`audit-finding audit-finding--${f.severity}`}>
      <span className={`audit-sev audit-sev--${f.severity}`} title={SEV_LABEL[f.severity] || ''}>{SEV_ICON[f.severity] || '•'}</span>
      <div className="audit-finding-body">
        <span className="audit-finding-cat">{f.layer === 'ai' ? f.category : f.category}</span>
        <p className="audit-finding-msg">{f.message}</p>
        {hasFix && !applied && (
          <button type="button" className="audit-apply-chip" onClick={onApply}>{chipLabel(f.fix)}</button>
        )}
        {applied && <span className="audit-applied">✓ applied</span>}
      </div>
    </div>
  );
}
