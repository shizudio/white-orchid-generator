import { useEffect, useRef } from "react";
import { computeReadyChecklist, resolveDroppedContent } from "@/lib/audit-local";
import {
  layoutVarietyRing,
  pickVerifiedLayoutCandidate,
  roomierNeedsFromFindings,
  roomierGainMatchesNeeds,
} from "@/lib/layout-switch-verification.mjs";

// The blocker-class finding ids a candidate must not add (the firstShotGate set —
// hooks/useFirstShotGate.js — kept in lockstep: both gates judge "clean" identically).
const BLOCKER_IDS = new Set([
  "contrast-fail",
  "logo-overlap-text",
  "logo-focal-band",
  "safe-zone-violation",
  "archetype-margin-crop",
  "archetype-box-overlap",
  "logo-legibility",
]);

// FNV-1a over a fixed-size downscale of the candidate render — the render-truth
// "actually differs" evidence (the fingerprint guard's hashCell pattern, smaller).
const HASH_MAX = 96;
function hashCanvas(sourceCanvas, width, height) {
  try {
    const scale = Math.min(1, HASH_MAX / Math.max(width, height));
    const hw = Math.max(1, Math.round(width * scale));
    const hh = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = hw; canvas.height = hh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(sourceCanvas, 0, 0, hw, hh);
    const data = ctx.getImageData(0, 0, hw, hh).data;
    let hash = 0x811c9dc5;
    for (let i = 0; i < data.length; i++) {
      hash ^= data[i];
      hash = Math.imul(hash, 0x01000193);
    }
    return ((hash >>> 0).toString(16)).padStart(8, "0") + ":" + hw + "x" + hh;
  } catch { return null; }
}

/** Owns the offscreen solver-verification behind every layout-switch offer
    (lib/layout-switch-verification.mjs is the pure contract; this is the render half —
    the firstShotGate scoreCandidate pattern generalized). Returns a REF-STABLE api:
    { pickLayoutRotation, pickLayoutReveal, roomierAuditRef }. */
export function useLayoutSwitchVerification({
  renderScene,
  dimensions,
  dimensionId,
  archetypeId,
  archetypesById,
  hasImage,
  copy,
  designDocument,
  renderResultRef,
  drawRef,
  roomierAuditRef,
}) {
  // Fresh inputs for the ref-stable api closures (the chip handler runs from stale
  // React closures — the M1 discipline: route late reads through refs).
  const inputsRef = useRef({});
  inputsRef.current = { renderScene, dimensions, dimensionId, archetypeId, archetypesById, hasImage, copy, designDocument };

  // Per-design-state evaluation cache (offscreen renders are cheap but not free; a
  // chip tap and the roomier pass share candidate evaluations for one design state).
  // roomierAuditRef is OWNED by Generator (it also rides the renderScene runtime bag,
  // where the live audit block reads it): null = not checked for the current design
  // state; { value } = checked, value is {archetypeId,gains} or null.
  const cacheRef = useRef({ key: null, evals: new Map() });

  const signatureOf = () => {
    const { dimensionId: dim, archetypeId: arch, hasImage: img, copy: c, designDocument: doc } = inputsRef.current;
    const elements = (doc?.content?.elements || [])
      .map(el => el && `${el.uid}:${el.class}:${el.sourceRole || ""}:${String(el.text || "").length}:${el.priority || 0}`)
      .join("|");
    return JSON.stringify([dim, arch || null, !!img, c?.headline || "", c?.subtext || "", c?.attribution || "", c?.dateText || "", elements]);
  };

  const ensureCache = () => {
    const key = signatureOf();
    if (cacheRef.current.key !== key) cacheRef.current = { key, evals: new Map() };
    return cacheRef.current;
  };

  // One offscreen captureAudit render → a candidate summary (the pure module's shape).
  // id === the live archetype evaluates the CURRENT design under the SAME override
  // semantics so hashes/ledgers compare apples-to-apples. Returns null on any failure
  // (fail closed — an unverifiable candidate is never offered).
  const evaluateCandidate = (id) => {
    const { renderScene: render, dimensions: dims, dimensionId: dim, archetypesById, copy: c } = inputsRef.current;
    if (typeof document === "undefined" || typeof render !== "function") return null;
    const isCurrentLegacy = id == null;
    if (!isCurrentLegacy && !archetypesById?.[id]) return null;
    const cache = ensureCache();
    const cacheKey = isCurrentLegacy ? "@live" : id;
    if (cache.evals.has(cacheKey)) return cache.evals.get(cacheKey);
    let summary = null;
    try {
      const dm = (dims || []).find(d => d.id === dim) || (dims || [])[0];
      if (!dm) return null;
      const canvas = document.createElement("canvas");
      canvas.width = dm.w; canvas.height = dm.h;
      const result = render(canvas.getContext("2d", { willReadFrequently: true }), dm.w, dm.h, {
        dimensionId: dm.id,
        live: false,
        captureAudit: true,
        // elementProbe: added content.elements PAINT in this override render so the
        // candidate's placement ledger is real (the guard batteries never pass it,
        // keeping their fixtures pixel-identical).
        elementProbe: true,
        ...(isCurrentLegacy ? {} : { archOverride: id }),
      });
      const signal = result?.auditSignal || null;
      const drift = signal?.archetypeDrift || {};
      const fontPx = signal?.ready?.fontPx || {};
      const verdict = computeReadyChecklist([{ dimensionId: dm.id, signal }]).formats[0];
      const blockers = (verdict?.issues || [])
        .filter(issue => issue.severity === "fail" && BLOCKER_IDS.has(issue.id)).length;
      const droppedFields = resolveDroppedContent(signal).map(d => d.field);
      const contentElements = result?.contentElements || [];
      summary = {
        archetypeId: isCurrentLegacy ? null : id,
        renderHash: hashCanvas(canvas, dm.w, dm.h),
        heroPainted: (fontPx.headline || 0) > 0 && !droppedFields.includes("headline"),
        logoPainted: !!signal?.ready?.logoBox,
        fontPx: { headline: fontPx.headline || 0, subtext: fontPx.subtext || 0, date: fontPx.date || 0 },
        droppedFields,
        blockers,
        placedUids: contentElements.filter(el => el.placed !== false).map(el => el.uid),
        unplacedUids: contentElements.filter(el => el.placed === false).map(el => el.uid),
        whitespaceTarget: typeof drift.whitespaceTarget === "number" ? drift.whitespaceTarget : null,
        heroExpected: !!String(c?.headline || "").trim(),
      };
    } catch { summary = null; }
    cache.evals.set(cacheKey, summary);
    return summary;
  };

  const evaluateCurrent = () => {
    const { archetypeId: arch, archetypesById } = inputsRef.current;
    // A live archetype evaluates via the SAME override path; a legacy (archetypeId
    // null / "none") design evaluates its live render (hash comparison is skipped by
    // the predicate when semantics differ — archetype identity carries the change).
    const summary = arch && archetypesById?.[arch] ? evaluateCandidate(arch) : evaluateCandidate(null);
    return summary ? { ...summary, archetypeId: arch || null } : null;
  };

  const apiRef = useRef({});
  // (Chip / chat-belt rotation — task #59, M2) The verified next-layout pick: walks
  // the suited ring after the current archetype, first qualifying candidate wins.
  // Returns { archetypeId } | null (checked, none qualifies — the belt answers
  // honestly) | undefined (verification unavailable — the belt keeps its legacy pick).
  apiRef.current.pickLayoutRotation = () => {
    try {
      const current = evaluateCurrent();
      if (!current) return undefined;
      const picked = pickVerifiedLayoutCandidate({
        current,
        ring: layoutVarietyRing(!!inputsRef.current.hasImage),
        evaluate: evaluateCandidate,
      });
      return picked ? { archetypeId: picked.archetypeId } : null;
    } catch { return undefined; }
  };
  // (Dead-role / logo pendingOffers) A verified candidate that additionally REVEALS
  // the named content: paints every `fields` entry (not dropped, painted where the
  // ledger measures it) and, with needsLogo, draws a logo. preferred seeds keep the
  // art-directed targets first. Returns { archetypeId } | null | undefined.
  apiRef.current.pickLayoutReveal = ({ fields = [], needsLogo = false, preferred = [] } = {}) => {
    try {
      const current = evaluateCurrent();
      if (!current) return undefined;
      const FIELD_PX = { headline: "headline", subtext: "subtext", dateText: "date" };
      const picked = pickVerifiedLayoutCandidate({
        current,
        ring: layoutVarietyRing(!!inputsRef.current.hasImage),
        preferred,
        evaluate: evaluateCandidate,
        require: candidate => {
          if (needsLogo && !candidate.logoPainted) return false;
          for (const field of fields) {
            if (candidate.droppedFields.includes(field)) return false;
            const pxKey = FIELD_PX[field];
            if (pxKey && !(candidate.fontPx[pxKey] > 0)) return false;
          }
          return true;
        },
      });
      return picked ? { archetypeId: picked.archetypeId } : null;
    } catch { return undefined; }
  };
  apiRef.current.roomierAuditRef = roomierAuditRef;

  /* ── The deferred roomier pass (docs/text-elements-spec.md §4 remedy 3) ──────────
     The live audit never renders recursively; instead, when the CURRENT findings
     carry a roomier-mentioning need (crowding / unplaced element / over-capacity /
     at-floor copy), verify a candidate offscreen here, store the verdict on
     roomierAuditRef, and repaint ONCE so audit-local reads signal.roomierLayout on
     the next pass. Born-clean designs have none of these findings, so this never
     runs (and costs nothing) on a fresh generation. */
  const signature = signatureOf();
  useEffect(() => {
    if (!roomierAuditRef) return undefined;
    roomierAuditRef.current = null;     // design changed → the stored verdict is stale
    if (typeof document === "undefined") return undefined;
    const timer = setTimeout(() => {
      try {
        const findings = renderResultRef?.current?.findings || [];
        const needs = roomierNeedsFromFindings(findings);
        if (!needs) return;              // no roomier-class finding → nothing to verify
        const current = evaluateCurrent();
        if (!current) return;
        const picked = pickVerifiedLayoutCandidate({
          current,
          ring: layoutVarietyRing(!!inputsRef.current.hasImage),
          evaluate: evaluateCandidate,
          require: (candidate, gains) => roomierGainMatchesNeeds(gains, needs),
        });
        roomierAuditRef.current = { value: picked ? { archetypeId: picked.archetypeId, gains: picked.gains } : null };
        // Repaint so the advisory's remedy row reflects the verdict (M1: the deferred
        // call goes through drawRef.current, never a captured draw).
        if (drawRef && typeof drawRef.current === "function") drawRef.current();
      } catch { /* verification is best-effort; the advisory stays remedy-less (honest) */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  return apiRef.current;
}
