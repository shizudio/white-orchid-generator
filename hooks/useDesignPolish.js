import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildPolishSummary,
  collectRepairFindings,
  createPolishRun,
  nextPolishStage,
  planDeclutterStage,
  planRecomposeStage,
  planRepairStage,
  polishApplyOptions,
  recordPolishApply,
  validateAuditFixes,
} from "@/lib/design-polish.mjs";
import { logFeedback as logFeedbackClient, newTurnId } from "@/lib/sessions";

/* ── DESIGN POLISH — the one-tap pass (docs/design-polish-spec.md) ─────────────
   Owns the five-stage run: deterministic repair → de-clutter → composition
   re-solve → ONE AI art-direction call → verification + the one honest summary.
   Every mutation flows through THE one patch pipeline (applyDesignPatch); no new
   mutation paths. ONE undo restores the whole pass (first landed patch commits
   the single history snapshot, later stages fold in with amendUndo — the same
   contract the silent harmonizer rides).

   Timing discipline (trap M1 — stale-closure repaints): each stage runs in its
   OWN effect invocation, one stage per committed render, and reads every piece of
   machinery through per-render-updated refs — never a captured closure from an
   earlier render. A stage audits FIRST (fresh, post-commit state), then applies;
   it never re-audits after applying inside the same invocation.                */
export function useDesignPolish({
  fontsLoaded,
  auditAllFormats,
  runLocalAudit,
  findingAckPinned,
  pinnedPropertiesRef,
  userLogoTouched,
  applyDesignPatch,
  renderResultRef,
  designDocument,
  chatDesignState,
  captureAuditImage,
  dimensionId,
  chatNoteRef,
  refreshReadyCheck,
  sessionId,
  aiUndoDepth,
}) {
  const [polishing, setPolishing] = useState(false);
  const [tick, setTick] = useState(0);
  const runRef = useRef(null);

  // Per-render-fresh machinery (M1: async/staged work must never call a captured
  // closure — route everything through refs the newest render just updated).
  const machineryRef = useRef({});
  machineryRef.current = {
    auditAllFormats,
    runLocalAudit,
    findingAckPinned,
    applyDesignPatch,
    chatDesignState,
    captureAuditImage,
    refreshReadyCheck,
    userLogoTouched,
    designDocument,
    dimensionId,
    sessionId,
    aiUndoDepth,
  };

  const startDesignPolish = useCallback((options = {}) => {
    if (runRef.current) return false; // one pass at a time — the button/belt disable meanwhile
    const machinery = machineryRef.current;
    const run = createPolishRun({
      // Born-clean interplay: a fresh, untouched design should give Polish nothing
      // to do. The landing handoff pushes at most one history entry, so a depth of
      // ≤1 at tap time marks the run as "fresh" for the quality-signal log below.
      freshDesign: (machinery.aiUndoDepth || 0) <= 1,
    });
    // Test/dev injection point ONLY (money law): the live-check driver mocks the
    // audit fetch so no real vision call fires during verification.
    run.auditFetcher = typeof options.auditFetcher === "function" ? options.auditFetcher : null;
    runRef.current = run;
    setPolishing(true);
    setTick(t => t + 1);
    return true;
  }, []);

  useEffect(() => {
    const run = runRef.current;
    if (!run || tick === 0) return;
    if (!fontsLoaded) return; // re-armed by the fontsLoaded dep when fonts land
    if (run.executedTick === tick) return; // StrictMode double-invoke guard
    run.executedTick = tick;
    const machinery = machineryRef.current;
    const advance = (next) => {
      run.stage = next;
      if (next) setTick(t => t + 1);
    };
    const applyTracked = (patch) => {
      const applied = machinery.applyDesignPatch(patch, polishApplyOptions(run)) || [];
      const landed = recordPolishApply(run, applied);
      return { applied, landed };
    };

    if (run.stage === "repair") {
      // 1 · Deterministic repair, FULL STRENGTH: the harmonizer's fail-severity
      // fixes + the contrast/accessibility ladder across every text role/element
      // and the logo, in ALL formats. Pins may be adjusted (the tap is consent);
      // each one is disclosed only when the patch really landed.
      const perFormat = machinery.auditAllFormats();
      const local = machinery.runLocalAudit();
      const failures = collectRepairFindings(perFormat, local, machinery.findingAckPinned);
      const plan = planRepairStage(failures, {
        pinnedProperties: pinnedPropertiesRef.current || {},
        userLogoTouched: machinery.userLogoTouched,
      });
      if (plan.patch) {
        const { applied, landed } = applyTracked(plan.patch);
        if (landed) {
          run.report.repairFields.push(...applied);
          run.report.pinChanges.push(...plan.pinChanges.filter(p => applied.includes(p.property)));
        }
      }
      advance(nextPolishStage("repair"));
      return;
    }

    if (run.stage === "declutter") {
      // 2 · De-clutter: decoration budget + collision findings, lowest visual
      // value first, one targeted removeOverlay per shape — never the media host,
      // never structural layers (lib/design-polish.mjs guards). Each removal is
      // named in the summary. Repeats on fresh findings, bounded.
      const round = run.declutterRound;
      const findings = [];
      for (const fmt of machinery.auditAllFormats()) findings.push(...(fmt.findings || []));
      findings.push(...machinery.runLocalAudit());
      const doc = machinery.designDocument;
      const plan = planDeclutterStage(findings, {
        mediaHostShapeId: doc?.composition?.mediaHostShapeId || null,
        shapes: doc?.shapes || [],
      });
      let removedAny = false;
      for (const removal of plan.removals) {
        const { landed } = applyTracked({ removeOverlay: removal.uid });
        if (landed) {
          removedAny = true;
          // A pinned (user-placed) removal is disclosed by its OWN summary line
          // ("…one you'd placed — Undo brings it back"), not a second pin entry.
          run.report.removals.push(removal);
        }
      }
      run.declutterRound = round + 1;
      advance(nextPolishStage("declutter", { moreDeclutter: removedAny, round }));
      return;
    }

    if (run.stage === "recompose") {
      // 3 · Composition re-solve: the layout solver already re-ran on every patch
      // above for system-owned placement; what remains is the hierarchy law —
      // size pins that invert the reading order are re-solved one sanctioned step
      // (pin adjustments disclosed). Render truth feeds the plan.
      machinery.runLocalAudit(); // fresh live draw so renderResultRef is current
      const truth = renderResultRef.current;
      const entries = truth?.auditSignal?.textHierarchy || [];
      const elementSteps = {};
      for (const scene of truth?.sceneElements || []) {
        if (scene?.uid) elementSteps[scene.uid] = scene.effectiveStep || scene.sizeStep || "M";
      }
      const state = machinery.chatDesignState();
      const plan = planRecomposeStage(entries, { fontSizes: state.fontSizes || {}, elementSteps });
      if (plan.patch) {
        const { landed } = applyTracked(plan.patch);
        if (landed) {
          run.report.recompositions.push(...plan.recompositions);
          run.report.pinChanges.push(...plan.pinChanges);
        }
      }
      advance(nextPolishStage("recompose"));
      return;
    }

    if (run.stage === "art-direction") {
      // 4 · ONE AI art-direction call (a real paid action — the user's tap is the
      // spend consent, same class as photo generation). The existing design-audit
      // route judges the polished state; its constrained enum fixes are APPLIED
      // when they pass the client-side schema/policy gate (the ratified carve-out
      // — in every other flow audit suggestions stay suggestions). Degrades
      // honestly: no key (503) / error / no preview → stages 1–3 stand, and the
      // summary carries the skipped-pass note.
      (async () => {
        const localFindings = machinery.runLocalAudit() || [];
        const state = machinery.chatDesignState();
        const imageDataUrl = machinery.captureAuditImage();
        if (!imageDataUrl) {
          run.report.aiPass = "no-preview";
          advance(nextPolishStage("art-direction"));
          return;
        }
        const fetcher = run.auditFetcher || ((url, init) => fetch(url, init));
        let data = null;
        let status = 0;
        try {
          const response = await fetcher("/api/design-audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageDataUrl,
              designState: state,
              dimensionId: machineryRef.current.dimensionId,
              localFindings: localFindings.map(finding =>
                `[${finding.severity}] ${finding.category}: ${finding.message}`),
            }),
          });
          status = response.status;
          data = await response.json().catch(() => ({}));
        } catch {
          run.report.aiPass = "error";
        }
        if (run.report.aiPass === null) {
          if (status === 503) run.report.aiPass = "unconfigured";
          else if (status < 200 || status >= 300) run.report.aiPass = "error";
        }
        if (run.report.aiPass === null && data) {
          // Re-diff against the freshest state (an await passed — never a stale echo).
          const freshState = machineryRef.current.chatDesignState();
          const fixes = validateAuditFixes(data.findings, freshState);
          for (const fix of fixes) {
            const machineryNow = machineryRef.current;
            const applied = machineryNow.applyDesignPatch(fix.patch, polishApplyOptions(run)) || [];
            if (recordPolishApply(run, applied)) {
              run.report.aiFixes.push({ ...fix, fields: applied.slice() });
            }
          }
        }
        advance(nextPolishStage("art-direction"));
      })();
      return;
    }

    if (run.stage === "verify") {
      // 5 · Verification: every claim in the summary is backed by the reducer-
      // confirmed changedPaths recorded above (render truth — the same honesty
      // signal the chat pipeline uses); readiness recomputes; a no-op pass says
      // so honestly (placebo guard) — never a manufactured change.
      try { machinery.refreshReadyCheck(); } catch { /* readiness is advisory */ }
      const summary = buildPolishSummary(run.report);
      try { chatNoteRef.current?.(summary); } catch { /* chat may be unmounted */ }
      // Born-clean interplay (spec): real deterministic fixes on an untouched
      // fresh design are a generation-quality bug signal — logged through the
      // existing feedback capture for the learning pass, never surfaced as blame.
      const deterministicWork = run.report.repairFields.length + run.report.removals.length
        + run.report.recompositions.length;
      if (run.freshDesign && deterministicWork > 0) {
        try {
          logFeedbackClient({
            turn_id: newTurnId(),
            session_id: machinery.sessionId || null,
            kind: "polish_fresh_fixes",
            polish: {
              repairFields: run.report.repairFields.slice(0, 12),
              removals: run.report.removals.length,
              recompositions: run.report.recompositions.length,
              format: machinery.dimensionId,
            },
          });
        } catch { /* capture is fire-and-forget */ }
      }
      runRef.current = null;
      setPolishing(false);
      return;
    }

    // Unknown stage — end the run safely rather than loop.
    runRef.current = null;
    setPolishing(false);
  }, [tick, fontsLoaded, pinnedPropertiesRef, renderResultRef, chatNoteRef]);

  return { startDesignPolish, polishing };
}
