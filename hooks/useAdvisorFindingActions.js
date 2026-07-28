import { useCallback } from "react";
import { isConstraintRemedyCommand } from "@/lib/constraint-remedies.mjs";
import { fallbackAdvisorEditTarget, hasNonAcknowledgementAction } from "@/lib/advisor-action-policy.mjs";

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
    // The field to shorten comes from a dropped-copy hint (copy-dropped) OR directly
    // from the finding's own `field` (thumb-legibility / type-size-floor name the
    // fit-shrunk role's copy field), so one shortener serves every size/overflow dot.
    const primary = Array.isArray(issue?.dropped) ? issue.dropped[0] : null;
    const field = primary?.field || issue?.field;
    if (!field || !COPY_FIELDS.includes(field)) return;
    const role = FIELD_TO_ROLE[field];
    const budget = copyBudgets[field] || 60;
    const current = copy[field] || String(primary?.text || "");
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
    // (task #59 — spec §4 remedy 3) The roomier-layout remedy exists ONLY when the
    // deferred layout-switch verification attached a solver-verified candidate to the
    // finding (issue.roomier.archetypeId) — never a blind switch, never a dead label.
    // One undoable patch through the same applyReadyFix pipeline as every fix.
    const roomierAction = issue.roomier && issue.roomier.archetypeId ? {
      label: "Try a roomier layout",
      kind: "patch",
      hint: "Solver-verified — your content fits the new layout",
      run: () => applyReadyFix({ archetypeId: issue.roomier.archetypeId }),
    } : null;

    const remedyCommands=Array.isArray(issue.remedyCommands)
      ? issue.remedyCommands.filter(isConstraintRemedyCommand)
      : [];
    if(remedyCommands.length){
      for(const command of remedyCommands){
        actions.push({
          label:command.label,
          kind:"patch",
          hint:"Applies as one undoable repair",
          run:()=>applyReadyFix(command.patch),
        });
      }
      const role=remedyCommands[0]?.target?.role;
      if(role){
        actions.push({
          label:"Move it myself",
          kind:"deep-link",
          run:()=>{setAdvisorDot(null);focusTextField(role);},
        });
      }else if(remedyCommands[0]?.target?.zoneId?.startsWith("mark:")){
        actions.push({
          label:"Edit logo myself",
          kind:"deep-link",
          run:()=>{setAdvisorDot(null);selectElement("logo");},
        });
      }else if(remedyCommands[0]?.target?.uid){
        const uid=remedyCommands[0].target.uid;
        actions.push({
          label:"Edit decoration",
          kind:"deep-link",
          run:()=>{setAdvisorDot(null);selectElement("shape",uid);},
        });
      }
      return actions;
    }

    if(issue.ruleId==="media.protected-subject"||issue.ruleId==="structural.no-seam-straddle"){
      const role=issue.element==="headline"?"hero":issue.element==="caption"?"support":issue.element||"hero";
      actions.push({
        label:"Edit placement",
        kind:"deep-link",
        run:()=>{setAdvisorDot(null);focusTextField(role);},
      });
      return actions;
    }

    // (copy-stump · 2026-07-15 stored-stump cleanup) A stored AI-authored fragment too
    // thin for the load-time repair gets the SAME standard copy action row — its
    // `dropped` hint carries {role, field, text} exactly like a dropped-copy finding.
    if (issue.id === "copy-dropped" || issue.id === "degradation-drops" || issue.id === "copy-stump") {
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

    if(issue.id==="logo-clear-space"){
      actions.push({
        label:"Return to safe position",
        kind:"patch",
        run:()=>applyReadyFix({logoFree:null}),
      });
      actions.push({
        label:"Move it myself",
        kind:"deep-link",
        run:()=>{setAdvisorDot(null);selectElement("logo");},
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

    // Size/capacity findings whose primary remedy is shorter copy (the render
    // fit-shrank the role, so a bigger font step can't grow it). The honest, one-tap
    // primary is "Shorten it for me" — an ai-fix that reduces the copy so the fitter
    // renders it larger — plus a deep-link to edit by hand, plus (task #59, copy-fit
    // Tier 0b) the SOLVER-VERIFIED roomier-layout switch when the deferred pass
    // attached one. copy-over-capacity carries the same ratified action row
    // (Tighten / roomier layout / Edit it myself). (advice-ledger one-tap-fix law.)
    if ((issue.id === "thumb-legibility" || issue.id === "type-size-floor" || issue.id === "copy-over-capacity") && issue.field && COPY_FIELDS.includes(issue.field)) {
      actions.push({
        label: issue.id === "copy-over-capacity" ? "Tighten it for me" : "Shorten it for me",
        kind: "ai-fix",
        run: () => { tightenCopyForFinding(issue); },
      });
      if (roomierAction) actions.push(roomierAction);
      const role = FIELD_TO_ROLE[issue.field];
      if (role) {
        actions.push({
          label: "Edit it myself",
          kind: "deep-link",
          hint: Number.isFinite(copyBudgets[issue.field]) ? `Fits about ${copyBudgets[issue.field]} characters here` : undefined,
          run: () => { setAdvisorDot(null); focusTextField(role); },
        });
      }
      actions.push(acknowledge("Keep it this way"));
      return actions;
    }

    // (task #59) The crowding advisory + unplaced-element findings: the roomier
    // remedy appears only solver-verified (issue.roomier); everything else on these
    // findings keeps its existing voice (ack; the chat owns simplify/remove).
    if (roomierAction && (issue.id === "crowding-advisory" || String(issue.id).startsWith("element-unplaced:"))) {
      actions.push(roomierAction);
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
    if((issue.severity==="fail"||String(issue.ruleId||"").startsWith("decoration."))&&!hasNonAcknowledgementAction(actions)){
      const target=fallbackAdvisorEditTarget(issue);
      if(target?.kind==="text")actions.push({label:target.label,kind:"deep-link",run:()=>{setAdvisorDot(null);focusTextField(target.role);}});
      else if(target?.kind==="element")actions.push({label:target.label,kind:"deep-link",run:()=>{setAdvisorDot(null);selectElement(target.element);}});
      else if(target?.kind==="shape"&&target.uid)actions.push({label:target.label,kind:"deep-link",run:()=>{setAdvisorDot(null);selectElement("shape",target.uid);}});
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
