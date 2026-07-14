import { useEffect, useRef } from "react";
import { computeReadyChecklist } from "@/lib/audit-local";
import { fetchTemplates, mergeTemplates, pushTemplate } from "@/lib/cloud-sync";
import { listMoodboard } from "@/lib/moodboard";
import { precheckProposalState } from "@/lib/proposal-engine";
import {
  isHarnessMode,
  logFeedback as logFeedbackClient,
  newTurnId,
  setHarnessMode,
} from "@/lib/sessions";

const PROPOSAL_LATER_KEY = "wo-proposal-later";
const EXCLUDED_FINDINGS = new Set([
  "copy-dropped",
  "copy-caption-long",
  "thumb-legibility",
  "degradation-drops",
]);
const SAMPLE_COPY = {
  headline: "Open house",
  subtext: "This Saturday",
  attribution: "The White Orchid",
  dateText: "18 July",
};

/** Owns proposal born-clean gating, intake, preview, and explicit review actions. */
export function useTemplateProposalReview({
  renderScene,
  dimensions,
  ready,
  fontsLoaded,
  devHooks,
  proposal,
  proposalBusy,
  setProposal,
  setProposalBusy,
  setProposalError,
  setDesignTemplates,
  setTemplateNotice,
}) {
  const renderGate = state => {
    const precheck = precheckProposalState(state || null);
    if (!precheck.ok) return { ok: false, reasons: precheck.reasons };
    const reasons = [];
    try {
      for (const dimension of dimensions) {
        const canvas = document.createElement("canvas");
        canvas.width = dimension.w;
        canvas.height = dimension.h;
        const result = renderScene(canvas.getContext("2d"), dimension.w, dimension.h, {
          dimensionId: dimension.id,
          live: false,
          captureAudit: true,
          archOverride: state.archetypeId,
          archVariant: Number.isInteger(state.archVariant) ? state.archVariant : 0,
          calibrationContent: SAMPLE_COPY,
        });
        const verdict = computeReadyChecklist([{
          dimensionId: dimension.id,
          signal: result?.auditSignal || null,
        }]).formats[0];
        for (const issue of verdict.issues || []) {
          if (issue.severity === "fail" && !EXCLUDED_FINDINGS.has(issue.id)) {
            reasons.push(`${dimension.id}: ${issue.id}`);
          }
        }
      }
    } catch (error) {
      reasons.push(`render-error: ${String(error?.message || error)}`);
    }
    return { ok: reasons.length === 0, reasons };
  };

  const createThumbnail = state => {
    try {
      const dimension = dimensions.find(item => item.id === "ig_portrait") || dimensions[0];
      const full = document.createElement("canvas");
      full.width = dimension.w;
      full.height = dimension.h;
      renderScene(full.getContext("2d"), dimension.w, dimension.h, {
        dimensionId: dimension.id,
        live: false,
        archOverride: state.archetypeId,
        archVariant: Number.isInteger(state.archVariant) ? state.archVariant : 0,
        calibrationContent: SAMPLE_COPY,
      });
      const width = 480;
      const height = Math.round(width * dimension.h / dimension.w);
      const thumbnail = document.createElement("canvas");
      thumbnail.width = width;
      thumbnail.height = height;
      const context = thumbnail.getContext("2d");
      context.imageSmoothingQuality = "high";
      context.drawImage(full, 0, 0, width, height);
      return thumbnail.toDataURL("image/jpeg", 0.8);
    } catch {
      return null;
    }
  };

  const intakeProposal = async (row, { mock = false } = {}) => {
    if (!row?.id || !row.state || typeof row.state !== "object") return false;
    try {
      if (sessionStorage.getItem(PROPOSAL_LATER_KEY) === String(row.id)) return false;
    } catch {}
    const gate = renderGate(row.state);
    if (!gate.ok) {
      if (mock) {
        console.warn("[woMockProposal] failed the born-clean gate (mock — not logged to the pipe):", gate.reasons);
      } else {
        try {
          logFeedbackClient({
            turn_id: newTurnId(),
            session_id: null,
            kind: "proposal-render-fail",
            user_message: "[proposal] failed the born-clean render gate",
            verdict: {
              kind: "proposal-render-fail",
              proposalId: row.id,
              reasons: gate.reasons.slice(0, 12),
              ts: new Date().toISOString(),
            },
          });
        } catch {}
      }
      try {
        await fetch("/api/templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: row.id,
            action: "decline",
            name: `${row.name || "Proposal"} · failed render gate`.slice(0, 80),
          }),
        });
      } catch {}
      return false;
    }

    const thumbnail = createThumbnail(row.state);
    let sources = [];
    try {
      const ids = Array.isArray(row.source_moodboard_ids) ? row.source_moodboard_ids : [];
      if (ids.length) {
        const { items } = await listMoodboard();
        const byId = new Map((items || []).map(item => [item.id, item]));
        sources = ids.map(id => byId.get(id)).filter(item => item?.image).slice(0, 6);
      }
    } catch {}
    setProposalError("");
    setProposal({
      id: row.id,
      name: row.name || "Proposed template",
      rationale: row.rationale || "",
      state: row.state,
      thumb: thumbnail,
      sources,
      mock,
    });
    return true;
  };

  const intakeRef = useRef(null);
  intakeRef.current = intakeProposal;
  const checkedRef = useRef(false);
  useEffect(() => {
    if (!ready || !fontsLoaded || checkedRef.current) return;
    checkedRef.current = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/templates?status=proposed", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!data || data.configured === false || !Array.isArray(data.templates) || !data.templates.length) return;
        await intakeRef.current?.(data.templates[0]);
      } catch {}
    }, 1800);
    return () => clearTimeout(timer);
  }, [fontsLoaded, ready]);

  useEffect(() => {
    if (typeof window === "undefined" || !devHooks) return;
    window.__woMockProposal = row => intakeRef.current?.(row, { mock: true });
    window.__woHarnessMode = on => {
      setHarnessMode(on);
      return isHarnessMode();
    };
    return () => {
      try {
        delete window.__woMockProposal;
        delete window.__woHarnessMode;
      } catch {}
    };
  }, [devHooks]);

  const resolveProposal = async action => {
    const current = proposal;
    if (!current || proposalBusy) return;
    setProposalBusy(action);
    setProposalError("");
    let data = null;
    try {
      const response = await fetch("/api/templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: current.id, action }),
      });
      data = await response.json().catch(() => null);
    } catch {}
    setProposalBusy(null);
    if (current.mock) {
      setProposal(null);
      return;
    }
    if (!data || data.ok !== true) {
      setProposalError(data?.unmigrated
        ? "The template library hasn't been migrated for proposals yet — this will work after the database update runs."
        : "Couldn't save that just now — please try again in a moment.");
      return;
    }
    if (action === "accept") {
      try {
        if (current.thumb) {
          await pushTemplate({
            id: current.id,
            name: current.name,
            thumb: current.thumb,
            state: current.state,
          });
        }
      } catch {}
      try {
        const { configured, templates } = await fetchTemplates();
        if (configured) {
          setDesignTemplates(previous => mergeTemplates(previous, templates).merged);
        }
      } catch {}
      setTemplateNotice(`“${current.name}” joined your templates.`);
    }
    setProposal(null);
  };

  const dismissProposalLater = () => {
    if (!proposal) return;
    try { sessionStorage.setItem(PROPOSAL_LATER_KEY, String(proposal.id)); } catch {}
    setProposal(null);
  };

  useEffect(() => {
    if (!proposal) return;
    const onKeyDown = event => {
      if (event.key === "Escape") dismissProposalLater();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal]);

  return { resolveProposal, dismissProposalLater };
}
