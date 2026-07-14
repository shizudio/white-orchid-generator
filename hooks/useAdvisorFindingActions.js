import { useCallback } from "react";

const FIELD_TO_ROLE = {
  headline: "hero",
  subtext: "support",
  attribution: "support",
  microLabel: "eyebrow",
  dateText: "date",
};

const FIELD_LABEL = {
  headline: "headline",
  subtext: "caption",
  attribution: "supporting line",
  microLabel: "little label",
  dateText: "date",
};

const COPY_FIELDS = ["headline", "subtext", "attribution", "dateText"];

/** Owns the executable action policy for readiness and AI-audit findings. */
export function useAdvisorFindingActions({
  dimensionId,
  copy,
  copyBudgets,
  assistantDesignState,
  applyPatch,
  renderTruth,
  fitCopy,
  acknowledgeIssue,
  applyReadyFix,
  setAdvisorDot,
  focusTextField,
  selectElement,
  resetTextLayout,
}) {
  const tightenCopyForFinding = useCallback(async (issue) => {
    const primary = Array.isArray(issue?.dropped) ? issue.dropped[0] : null;
    const field = primary?.field;
    if (!field || !COPY_FIELDS.includes(field)) return;
    const role = FIELD_TO_ROLE[field];
    const budget = copyBudgets[field] || 60;
    const current = copy[field] || String(primary.text || "");
    if (!current) return;

    let aiValue = null;
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: "editor",
          stream: false,
          messages: [{
            role: "user",
            content: `Rewrite the ${FIELD_LABEL[field] || "text"} so it is at most ${budget} characters and still fits this design. Keep the meaning and the brand voice. Current ${FIELD_LABEL[field] || "text"}: "${String(current).slice(0, 200)}"`,
          }],
          designState: assistantDesignState(),
        }),
      });
      if (response.ok) {
        const data = await response.json().catch(() => null);
        const candidate = data?.patch && typeof data.patch[field] === "string"
          ? data.patch[field].trim()
          : "";
        if (candidate) aiValue = candidate;
      }
    } catch {}

    let usedAi = false;
    if (aiValue && aiValue.length <= budget && aiValue !== current) {
      applyPatch({ [field]: aiValue }, { source: "ui" });
      usedAi = true;
    }

    const painted = await new Promise(resolve => {
      const raf = typeof requestAnimationFrame === "function"
        ? requestAnimationFrame
        : callback => setTimeout(callback, 16);
      raf(() => raf(() => {
        const truth = renderTruth();
        resolve(!!truth.roleBounds?.[role] && !(truth.deadRoles || []).includes(role));
      }));
    });

    if (painted) return;
    const trimmed = fitCopy(current, budget);
    if (trimmed && trimmed !== current) {
      applyPatch({ [field]: trimmed }, { source: "ui" });
    } else if (usedAi) {
      const shorter = fitCopy(aiValue, Math.max(8, Math.floor(budget * 0.8)));
      if (shorter && shorter !== aiValue) applyPatch({ [field]: shorter }, { source: "ui" });
    }
  }, [applyPatch, assistantDesignState, copy, copyBudgets, fitCopy, renderTruth]);

  const findingActions = useCallback((issue, onAck) => {
    if (!issue) return [];
    const actions = [];
    const acknowledge = label => ({
      label,
      kind: "ack",
      run: () => onAck ? onAck(issue) : acknowledgeIssue(issue, dimensionId),
    });

    if (issue.id === "copy-dropped" || issue.id === "degradation-drops") {
      const primary = Array.isArray(issue.dropped) ? issue.dropped[0] : null;
      const budget = primary ? copyBudgets[primary.field] : null;
      if (primary && COPY_FIELDS.includes(primary.field)) {
        actions.push({
          label: "Tighten it for me",
          kind: "ai-fix",
          run: () => { tightenCopyForFinding(issue); },
        });
      }
      if (primary && FIELD_TO_ROLE[primary.field]) {
        actions.push({
          label: "Edit it myself",
          kind: "deep-link",
          hint: Number.isFinite(budget) ? `Fits about ${budget} characters here` : undefined,
          run: () => {
            setAdvisorDot(null);
            focusTextField(FIELD_TO_ROLE[primary.field]);
          },
        });
      }
      actions.push(acknowledge("Leave it off"));
      return actions;
    }

    if (issue.id === "pinned-placement") {
      const roles = Array.isArray(issue.pinnedRoles) && issue.pinnedRoles.length
        ? issue.pinnedRoles
        : [issue.element].filter(Boolean);
      const roleLabel = { date: "date", eyebrow: "eyebrow", pill: "badge" };
      for (const role of roles) {
        actions.push({
          label: roles.length === 1 ? "Put it back for me" : `Put the ${roleLabel[role] || role} back`,
          kind: "patch",
          run: () => applyReadyFix({
            dimensionId: issue.dimensionId || dimensionId,
            roleOffset: { role, clear: true },
          }),
        });
      }
      const firstRole = roles[0];
      if (firstRole) {
        actions.push({
          label: "Move it myself",
          kind: "deep-link",
          run: () => {
            setAdvisorDot(null);
            focusTextField(firstRole);
          },
        });
      }
      actions.push(acknowledge("Keep it this way"));
      return actions;
    }

    if (issue.id === "logo-legibility") {
      if (issue.logoMoveTo) {
        actions.push({
          label: "Move to a clearer spot",
          kind: "patch",
          run: () => applyReadyFix({ logoPosition: issue.logoMoveTo }),
        });
      }
      actions.push({
        label: "Edit it myself",
        kind: "deep-link",
        run: () => {
          setAdvisorDot(null);
          selectElement("logo");
        },
      });
      actions.push(acknowledge("Keep it this way"));
      return actions;
    }

    if (issue.id === "archetype-margin-crop" || issue.id === "safe-zone-violation") {
      actions.push({
        label: "Reset placement",
        kind: "patch",
        run: () => {
          setAdvisorDot(null);
          resetTextLayout();
        },
      });
      actions.push({
        label: "Edit the text",
        kind: "deep-link",
        run: () => {
          setAdvisorDot(null);
          focusTextField(issue.element || "hero");
        },
      });
      actions.push(acknowledge("Keep it this way"));
      return actions;
    }

    if (issue.fix) {
      actions.push({ label: "Fix", kind: "patch", run: () => applyReadyFix(issue.fix) });
    } else {
      const element = issue.anchor?.element;
      const editable = element === "headline" || element === "caption" || element === "text" ||
        issue.category === "type-size" || issue.category === "copy-limit";
      if (editable) {
        actions.push({
          label: "Edit it myself",
          kind: "deep-link",
          run: () => {
            setAdvisorDot(null);
            focusTextField("support");
          },
        });
      }
    }
    actions.push(acknowledge(issue.lossClass ? "Leave it off" : "Keep it this way"));
    return actions;
  }, [
    acknowledgeIssue,
    applyReadyFix,
    copyBudgets,
    dimensionId,
    focusTextField,
    resetTextLayout,
    selectElement,
    setAdvisorDot,
    tightenCopyForFinding,
  ]);

  return findingActions;
}
