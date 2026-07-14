import { computeReadyChecklist } from "@/lib/audit-local";
import { logFeedback as logFeedbackClient, newTurnId } from "@/lib/sessions";

const BLOCKER_IDS = new Set([
  "contrast-fail",
  "logo-overlap-text",
  "logo-focal-band",
  "safe-zone-violation",
  "archetype-margin-crop",
  "archetype-box-overlap",
  "logo-legibility",
]);

/** Owns the no-credit, all-format born-clean re-solve after a landing handoff. */
export function useFirstShotGate({
  resolveRef,
  renderScene,
  dimensions,
  archetypesById,
  archetypeId,
  archetypeVariant,
  postType,
  copy,
  materializeArchetype,
  setTextColorId,
  sessionId,
}) {
  const scoreCandidate = (candidateArchetypeId, variant, textColor, candidateCopy) => {
    const perFormat = [];
    let blockers = 0;
    try {
      for (const dimension of dimensions) {
        const canvas = document.createElement("canvas");
        canvas.width = dimension.w;
        canvas.height = dimension.h;
        const result = renderScene(canvas.getContext("2d"), dimension.w, dimension.h, {
          dimensionId: dimension.id,
          live: false,
          captureAudit: true,
          archOverride: candidateArchetypeId,
          archVariant: variant,
          calibrationContent: candidateCopy,
          tcOverride: textColor || null,
        });
        const verdict = computeReadyChecklist([{
          dimensionId: dimension.id,
          signal: result?.auditSignal || null,
        }]).formats[0];
        const findings = (verdict.issues || [])
          .filter(issue => issue.severity === "fail" && BLOCKER_IDS.has(issue.id))
          .map(issue => issue.id);
        blockers += findings.length;
        if (findings.length) perFormat.push({ dimId: dimension.id, findings });
      }
    } catch (error) {
      blockers += 999;
      perFormat.push({ error: String(error?.message || error) });
    }
    return { blockers, perFormat };
  };

  const resolveFirstShot = () => {
    if (!archetypeId || !archetypesById[archetypeId]) return;
    const initialVariant = Number.isInteger(archetypeVariant) ? archetypeVariant : 0;
    const baseline = scoreCandidate(archetypeId, initialVariant, null, copy);
    if (baseline.blockers === 0) return;
    const variantCount = archetypesById[archetypeId]?.variants?.length || 1;
    const candidates = [];
    for (let offset = 1; offset < variantCount && candidates.length < 3; offset += 1) {
      candidates.push({ variant: (initialVariant + offset) % variantCount, textColor: null });
    }
    candidates.push({ variant: initialVariant, textColor: "whiteSmoke" });
    candidates.push({ variant: initialVariant, textColor: "burnham" });

    let best = { variant: initialVariant, textColor: null, blockers: baseline.blockers };
    const attempts = [{ attempt: 0, variant: initialVariant, tc: null, blockers: baseline.blockers }];
    for (const [index, candidate] of candidates.slice(0, 3).entries()) {
      const score = scoreCandidate(archetypeId, candidate.variant, candidate.textColor, copy);
      attempts.push({
        attempt: index + 1,
        variant: candidate.variant,
        tc: candidate.textColor,
        blockers: score.blockers,
      });
      if (score.blockers < best.blockers) best = { ...candidate, blockers: score.blockers };
      if (score.blockers === 0) break;
    }

    if (best.blockers < baseline.blockers && (best.variant !== initialVariant || best.textColor)) {
      if (best.variant !== initialVariant) {
        materializeArchetype(archetypeId, {
          variant: best.variant,
          postType,
          attribution: copy.attribution,
          subtext: copy.subtext,
        });
      }
      if (best.textColor) setTextColorId(best.textColor);
    }
    try {
      logFeedbackClient({
        turn_id: newTurnId(),
        session_id: sessionId || null,
        kind: "first-shot-resolve",
        user_message: "[first-shot] landing gate re-solve",
        verdict: {
          kind: "first-shot-resolve",
          archetypeId,
          baseBlockers: baseline.blockers,
          chosen: {
            variant: best.variant,
            tc: best.textColor,
            blockers: best.blockers,
          },
          healed: best.blockers < baseline.blockers,
          attempts,
          ts: new Date().toISOString(),
        },
      });
    } catch {}
  };

  resolveRef.current = resolveFirstShot;
  return resolveFirstShot;
}
