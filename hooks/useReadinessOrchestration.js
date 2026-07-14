import { useCallback, useEffect, useRef } from "react";
import {
  computeReadyChecklist,
  extractAuditFindings,
  mergeAuditIntoChecklist,
  reconcileAuditFindings,
  runLocalAudit as computeLocalAudit,
  withoutAuditFindings,
} from "@/lib/audit-local";

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

  return {
    runLocalAudit,
    auditAllFormats,
    computeReadyAll,
    refreshReadyCheck,
    currentDesignFP: designFingerprint,
    ledgerCheck: readyCheck,
  };
}
