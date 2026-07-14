import { useCallback, useEffect, useRef } from "react";
import {
  ackFingerprint,
  extractAuditFindings,
  mergeAuditIntoChecklist,
  normalizeAuditFinding,
  withoutAuditFindings,
} from "@/lib/audit-local";
import { logFeedback as logFeedbackClient, newTurnId } from "@/lib/sessions";

const ELEMENT_TO_TOKEN = {
  headline: "text",
  caption: "text",
  logo: "logo",
  photo: "photo",
  background: "background",
  canvas: "canvas",
};

const emptyRun = (state, note = "") => ({
  state,
  summary: "",
  passes: null,
  note,
  newCount: 0,
  ackedCount: 0,
});

/** Owns the user-triggered AI audit, canonical ledger merge, and audit test drivers. */
export function useAiAuditLedger({
  runLocalAudit,
  captureAuditImage,
  assistantDesignState,
  dimensionId,
  designFingerprint,
  elementBoxOf,
  findingAckPinned,
  computeReadyAll,
  sessionId,
  acknowledgementsRef,
  setReadyCheck,
  setAuditRun,
  devHooks,
  ledgerRef,
  auditFindingsRef,
  pinnedPropertiesRef,
}) {
  const runIdRef = useRef(0);
  const runAiAudit = useCallback(async () => {
    const runId = ++runIdRef.current;
    setAuditRun(emptyRun("loading"));
    let localFindings = [];
    try { localFindings = runLocalAudit() || []; } catch {}
    const acknowledgedNotes = Array.from(new Set(
      Object.values(acknowledgementsRef.current || {})
        .map(acknowledgement => acknowledgement?.message)
        .filter(Boolean),
    )).slice(0, 12);
    const imageDataUrl = captureAuditImage();
    if (!imageDataUrl) {
      if (runIdRef.current === runId) {
        setAuditRun(emptyRun("error", "Couldn't capture the preview for the AI pass. Your local checks still ran."));
      }
      return;
    }

    const auditFingerprint = designFingerprint;
    const auditDimension = dimensionId;
    let data = null;
    let status = 0;
    try {
      const response = await fetch("/api/design-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageDataUrl,
          designState: assistantDesignState(),
          dimensionId: auditDimension,
          localFindings: localFindings.map(finding =>
            `[${finding.severity}] ${finding.category}: ${finding.message}`),
          ackedNotes: acknowledgedNotes,
        }),
      });
      status = response.status;
      data = await response.json().catch(() => ({}));
    } catch {
      if (runIdRef.current === runId) {
        setAuditRun(emptyRun("error", "Couldn't reach the AI just now. Your local checks still ran."));
      }
      return;
    }
    if (runIdRef.current !== runId) return;
    if (status === 503) {
      setAuditRun(emptyRun("unavailable", data?.error || "The AI polish pass is unavailable. Your local checks still ran."));
      return;
    }
    if (status < 200 || status >= 300) {
      setAuditRun(emptyRun("error", data?.error || "The AI polish pass ran into a problem. Your local checks still ran."));
      return;
    }

    const rawFindings = Array.isArray(data?.findings) ? data.findings : [];
    const normalized = rawFindings.map((finding, index) => {
      const element = ELEMENT_TO_TOKEN[finding.element] || "canvas";
      const box = elementBoxOf(element);
      return normalizeAuditFinding(finding, {
        dimensionId: auditDimension,
        element,
        fingerprint: ackFingerprint(box),
        designFP: auditFingerprint,
        index,
      });
    }).filter(Boolean);
    const acknowledgedCount = normalized.filter(findingAckPinned).length;
    const newCount = normalized.length - acknowledgedCount;

    setReadyCheck(previous => {
      const current = previous || computeReadyAll();
      const retained = extractAuditFindings(current).filter(finding =>
        finding.anchor?.dimensionId !== auditDimension);
      return mergeAuditIntoChecklist(withoutAuditFindings(current), [...retained, ...normalized]);
    });
    try {
      for (const finding of normalized) {
        logFeedbackClient({
          turn_id: newTurnId(),
          session_id: sessionId || null,
          kind: findingAckPinned(finding) ? "ledger_acked" : "ledger_raised",
          ledger: {
            id: finding.id,
            category: finding.category,
            element: finding.anchor.element,
            format: auditDimension,
            source: "ai-audit",
            severity: finding.severity,
            merged: false,
          },
        });
      }
    } catch {}
    setAuditRun({
      state: "done",
      summary: typeof data?.summary === "string" ? data.summary : "",
      passes: typeof data?.passes === "boolean" ? data.passes : null,
      note: "",
      newCount,
      ackedCount: acknowledgedCount,
    });
  }, [
    acknowledgementsRef,
    assistantDesignState,
    captureAuditImage,
    computeReadyAll,
    designFingerprint,
    dimensionId,
    elementBoxOf,
    findingAckPinned,
    runLocalAudit,
    sessionId,
    setAuditRun,
    setReadyCheck,
  ]);

  useEffect(() => {
    if (typeof window === "undefined" || !devHooks) return;
    window.__woLedger = () => ({
      formats: (ledgerRef.current?.formats || []).map(format => ({
        dimensionId: format.dimensionId,
        ready: format.ready,
        issues: (format.issues || []).map(issue => ({
          id: issue.id,
          category: issue.category,
          sources: issue.sources || ["local"],
          severity: issue.severity,
          merged: !!issue.merged,
          audit: !!issue._audit,
          hasFix: !!issue.fix,
          message: issue.message,
        })),
      })),
      auditFindings: auditFindingsRef.current.map(finding => ({
        id: finding.id,
        key: finding.key,
        category: finding.category,
        element: finding.anchor?.element,
        dimensionId: finding.anchor?.dimensionId,
        designFP: (finding.designFP || "").slice(0, 24),
      })),
    });
    window.__woRunAiAudit = () => runAiAudit();
    window.__woPins = () => ({ ...(pinnedPropertiesRef.current || {}) });
    window.__woInjectAudit = (raw, requestedElement) => {
      const element = requestedElement || "text";
      const box = elementBoxOf(element);
      const normalized = normalizeAuditFinding(raw, {
        dimensionId,
        element,
        fingerprint: ackFingerprint(box),
        designFP: designFingerprint,
        index: 0,
      });
      setReadyCheck(previous => {
        const current = previous || computeReadyAll();
        const retained = extractAuditFindings(current).filter(finding => finding.id !== normalized.id);
        return mergeAuditIntoChecklist(withoutAuditFindings(current), [...retained, normalized]);
      });
      return normalized;
    };
    window.__woClearAudit = () => setReadyCheck(previous => withoutAuditFindings(previous));
    return () => {
      try {
        delete window.__woLedger;
        delete window.__woRunAiAudit;
        delete window.__woInjectAudit;
        delete window.__woClearAudit;
      } catch {}
    };
  }, [
    auditFindingsRef,
    computeReadyAll,
    designFingerprint,
    devHooks,
    dimensionId,
    elementBoxOf,
    ledgerRef,
    pinnedPropertiesRef,
    runAiAudit,
    setReadyCheck,
  ]);

  return runAiAudit;
}
