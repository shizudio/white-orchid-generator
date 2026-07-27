import { useCallback, useEffect, useRef } from "react";
import {
  computeReadyChecklist,
  extractAuditFindings,
  mergeAuditIntoChecklist,
  reconcileAuditFindings,
  runLocalAudit as computeLocalAudit,
  withoutAuditFindings,
} from "@/lib/audit-local";
import { shouldDeferFreshnessWork } from "@/lib/readiness-policy.mjs";

/** Owns deterministic local audit caching and the six-format readiness ledger. */
export function useReadinessOrchestration({
  dimensions,
  renderScene,
  draw,
  canvasRef,
  auditRef,
  auditSignature,
  designFingerprint,
  readyCheck,
  setReadyCheck,
  devHooks,
  // (Typing lag, 2026-07-27) The role currently being typed into, or null. The sweep
  // below is advisory freshness, never something the owner is waiting on, so it must
  // not spend six offscreen renders between two keystrokes — the editing grace that
  // already governs the live draw extends to it.
  editing = false,
}) {
  const localAuditCacheRef = useRef({ sig: null, findings: null });
  const currentDesignFingerprintRef = useRef(designFingerprint);
  currentDesignFingerprintRef.current = designFingerprint;

  const runLocalAudit = useCallback(() => {
    const cache = localAuditCacheRef.current;
    if (cache.sig === auditSignature && cache.findings) return cache.findings;
    const canvas = canvasRef.current;
    let result = null;
    if (canvas) {
      try { result = draw("audit-live"); } catch {}
    }
    const signal = result?.auditSignal || auditRef.current;
    const findings = result?.findings || computeLocalAudit(signal);
    if (canvas && signal) localAuditCacheRef.current = { sig: auditSignature, findings };
    if (devHooks && typeof window !== "undefined") window.__woAudit = { signal, findings };
    return findings;
  }, [auditRef, auditSignature, canvasRef, devHooks, draw]);

  const auditAllFormats = useCallback(() => {
    const results = [];
    for (const dimension of dimensions) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = dimension.w;
        canvas.height = dimension.h;
        const result = renderScene(canvas.getContext("2d"), dimension.w, dimension.h, {
          dimensionId: dimension.id,
          live: false,
          captureAudit: true,
        });
        const signal = result?.auditSignal || null;
        results.push({
          dimensionId: dimension.id,
          findings: result?.findings || computeLocalAudit(signal),
          signal,
        });
      } catch {
        // One unavailable format must not prevent the remaining readiness sweep.
      }
    }
    return results;
  }, [dimensions, renderScene]);

  const computeReadyAll = useCallback(() => {
    const swept = auditAllFormats();
    return computeReadyChecklist(swept.map(item => ({
      dimensionId: item.dimensionId,
      signal: item.signal,
    })));
  }, [auditAllFormats]);

  const refreshReadyCheck = useCallback(() => {
    try {
      const local = computeReadyAll();
      setReadyCheck(previous => mergeAuditIntoChecklist(
        local,
        reconcileAuditFindings(
          extractAuditFindings(previous),
          currentDesignFingerprintRef.current,
        ),
      ));
    } catch {
      setReadyCheck(null);
    }
  }, [computeReadyAll, setReadyCheck]);

  useEffect(() => {
    setReadyCheck(previous => {
      if (!previous) return previous;
      return mergeAuditIntoChecklist(
        withoutAuditFindings(previous),
        reconcileAuditFindings(extractAuditFindings(previous), designFingerprint),
      );
    });
  }, [designFingerprint, setReadyCheck]);

  // (Item 3 — the readiness ledger must track content edits) refreshReadyCheck otherwise
  // runs only on export-panel open / blocked-export click / applyReadyFix, so the format
  // strip's "N blocked" count (Generator.jsx) and createExportAuthorization read a STALE
  // six-format ledger after a content edit — a format the edit just broke (or fixed) is not
  // reflected until the export panel is opened. Recompute the sweep DEBOUNCED on
  // designFingerprint change (~2s after the last edit) so the strip and the export gate both
  // track edits. The sweep is entirely offscreen (auditAllFormats builds its own canvases),
  // reuses the same machinery export-open already uses, and writes only React state — it
  // never touches the live canvas and never writes to cloud (harness-safe by construction).
  const refreshReadyCheckRef = useRef(refreshReadyCheck);
  refreshReadyCheckRef.current = refreshReadyCheck;
  // While a text field is focused the sweep is suspended entirely; blur re-runs this
  // effect, so the ledger still lands ~2s after the owner stops typing — the same
  // freshness, none of the mid-keystroke cost.
  useEffect(() => {
    if (shouldDeferFreshnessWork({ editingRole: editing })) return undefined;
    const timer = setTimeout(() => {
      try { refreshReadyCheckRef.current(); } catch { /* the sweep is advisory; never block edits */ }
    }, 2000);
    return () => clearTimeout(timer);
  }, [designFingerprint, editing]);

  return {
    runLocalAudit,
    auditAllFormats,
    computeReadyAll,
    refreshReadyCheck,
    currentDesignFP: designFingerprint,
    ledgerCheck: readyCheck,
  };
}
