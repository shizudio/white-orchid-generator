import { useCallback, useRef } from "react";
import { ackFingerprint, ackKey } from "@/lib/audit-local";
import { logFeedback as logFeedbackClient, newTurnId } from "@/lib/sessions";

const LOGO_ISSUE_IDS = new Set([
  "logo-overlap-text",
  "logo-focal-band",
  "logo-action-band",
  "safe-area-logo",
  "logo-legibility",
]);

/**
 * Owns readiness-fix scheduling and the advisor ledger's geometry, acknowledgement,
 * pinning, and popover lifecycle. Finding action policy stays with the editor
 * orchestrator because those actions also coordinate copy, chat, and inspectors.
 */
export function useAdvisorLedger({
  width,
  height,
  dimensionId,
  setDimensionId,
  refreshReadyCheck,
  applyDesignPatch,
  logoBoxRef,
  textBoundsRef,
  roleBoundsRef,
  renderResultRef,
  acknowledgements,
  setAcknowledgements,
  sessionId,
  setTopMenu,
  closeInspector,
  setAuditOpen,
  setAdvisorDot,
}) {
  const applyDesignPatchRef = useRef(applyDesignPatch);
  applyDesignPatchRef.current = applyDesignPatch;

  const applyReadyFix = useCallback((fix) => {
    if (!fix) return;
    const raf = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : callback => setTimeout(callback, 16);
    const done = () => raf(() => raf(() => setTimeout(() => refreshReadyCheck(), 60)));
    const needsSwitch = fix.dimensionId && fix.dimensionId !== dimensionId &&
      (fix.textLayout || fix.logoPosition || fix.logoSize || fix.roleOffset || fix.overlayUpdate || fix.photoTransform);

    if (needsSwitch) {
      setDimensionId(fix.dimensionId);
      const remainingFix = { ...fix };
      delete remainingFix.dimensionId;
      raf(() => raf(() => {
        try { applyDesignPatchRef.current(remainingFix, { uiSource: true }); } catch {}
        done();
      }));
      return;
    }

    try { applyDesignPatchRef.current(fix, { uiSource: true }); } catch {}
    done();
  }, [dimensionId, refreshReadyCheck, setDimensionId]);

  const elementBoxOf = useCallback((element) => {
    const normalize = box => box && width && height
      ? { x: box.x / width, y: box.y / height, w: box.w / width, h: box.h / height }
      : null;
    if (element === "logo") return normalize(logoBoxRef.current);
    if (String(element||"").startsWith("shape:")) {
      return normalize(renderResultRef?.current?.sceneElements?.find(item=>item.id===element)?.bounds);
    }
    if (element === "headline" || element === "caption" || element === "text") {
      return normalize(textBoundsRef.current);
    }
    return null;
  }, [height, logoBoxRef, renderResultRef, textBoundsRef, width]);

  const issueBoxOf = useCallback((issue) => {
    if (!issue) return null;
    if (issue.anchor?.element) return elementBoxOf(issue.anchor.element);

    const normalize = box => box && width && height
      ? { x: box.x / width, y: box.y / height, w: box.w / width, h: box.h / height }
      : null;
    if (issue.id === "pinned-placement" && issue.element && roleBoundsRef.current?.[issue.element]) {
      return normalize(roleBoundsRef.current[issue.element]);
    }
    if (LOGO_ISSUE_IDS.has(issue.id) || issue.category === "overlap") {
      return normalize(logoBoxRef.current);
    }
    return normalize(textBoundsRef.current);
  }, [elementBoxOf, height, logoBoxRef, roleBoundsRef, textBoundsRef, width]);

  const acknowledgeIssue = useCallback((issue, targetDimensionId) => {
    if (!issue) return;
    const target = targetDimensionId || dimensionId;
    const box = issueBoxOf(issue);
    const geometryFingerprint = issue.geometryFingerprint || ackFingerprint(box);
    const key = ackKey(target, issue, box);
    setAcknowledgements(previous => ({
      ...previous,
      [key]: {
        issueId: issue.id,
        category: issue.category,
        dimensionId: target,
        message: issue.message,
        fingerprint: issue.fingerprint || geometryFingerprint,
        geometryFingerprint,
        at: Date.now(),
      },
    }));
    try {
      logFeedbackClient({
        turn_id: newTurnId(),
        session_id: sessionId || null,
        kind: "ack",
        ack: {
          issueId: issue.id,
          category: issue.category,
          format: target,
          message: issue.message,
        },
      });
    } catch {}
  }, [dimensionId, issueBoxOf, sessionId, setAcknowledgements]);

  const acknowledgementsRef = useRef(acknowledgements);
  acknowledgementsRef.current = acknowledgements;
  const findingAckPinned = useCallback((finding) => {
    const map = acknowledgementsRef.current;
    if (!finding || !map || typeof map !== "object") return false;
    const box = issueBoxOf(finding);
    const geometryFingerprint = finding.geometryFingerprint || ackFingerprint(box);
    const propertyFingerprint = finding.fingerprint || geometryFingerprint;
    const isAuditFinding = !!finding._audit || finding.sources?.includes("ai-audit");

    for (const acknowledgement of Object.values(map)) {
      if (!acknowledgement) continue;
      const sameConcern = acknowledgement.issueId === finding.id ||
        (acknowledgement.category && acknowledgement.category === finding.category);
      const acknowledgedGeometry = acknowledgement.geometryFingerprint ||
        String(acknowledgement.fingerprint || "").split(":")[0];
      const sameElement = isAuditFinding && geometryFingerprint !== "nogeo" &&
        acknowledgedGeometry === geometryFingerprint;
      const sameProperty = acknowledgement.fingerprint === propertyFingerprint ||
        acknowledgement.fingerprint === geometryFingerprint;
      if (sameElement || (sameConcern && sameProperty)) return true;
    }
    return false;
  }, [issueBoxOf]);

  const openAdvisorPopover = useCallback((payload) => {
    setTopMenu(null);
    closeInspector();
    setAuditOpen(false);
    setAdvisorDot(payload);
  }, [closeInspector, setAdvisorDot, setAuditOpen, setTopMenu]);

  const closeAdvisorPopover = useCallback(() => setAdvisorDot(null), [setAdvisorDot]);

  const acknowledgePopoverIssue = useCallback((issue) => {
    if (!issue) return;
    acknowledgeIssue(issue, dimensionId);
    setAdvisorDot(previous => {
      if (!previous) return previous;
      const remaining = (previous.issues || []).filter(candidate =>
        (candidate.id || candidate) !== (issue.id || issue));
      return remaining.length ? { ...previous, issues: remaining } : null;
    });
  }, [acknowledgeIssue, dimensionId, setAdvisorDot]);

  return {
    applyReadyFix,
    elementBoxOf,
    issueBoxOf,
    acknowledgeIssue,
    findingAckPinned,
    openAdvisorPopover,
    closeAdvisorPopover,
    acknowledgePopoverIssue,
  };
}
