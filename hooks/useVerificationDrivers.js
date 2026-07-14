import { useEffect } from "react";

async function buildBrandLibrary(countRequested, startIndex = 0) {
  window.__woBuildLibraryStopFlag = false;
  let total = 8;
  try {
    const plan = await (await fetch("/api/brand-library")).json();
    total = plan.total || total;
  } catch {}
  const count = Number.isInteger(countRequested) && countRequested > 0
    ? Math.min(countRequested, total - startIndex)
    : total - startIndex;
  const results = [];
  console.log(`[brand-library] building ${count} photos (index ${startIndex}…${startIndex + count - 1} of ${total})`);
  for (let offset = 0; offset < count; offset += 1) {
    if (window.__woBuildLibraryStopFlag) {
      console.log("[brand-library] stopped by request");
      break;
    }
    const index = startIndex + offset;
    try {
      const response = await fetch("/api/brand-library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ index }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.ok) {
        console.log(`[brand-library] ${offset + 1}/${count} ✓ index ${index} via ${data.provider} — ${String(data.scene || "").slice(0, 48)}…`);
      } else {
        console.warn(`[brand-library] ${offset + 1}/${count} ✗ index ${index}:`, data.error || response.status);
      }
      results.push({ index, ...data });
    } catch (error) {
      console.warn(`[brand-library] ${offset + 1}/${count} ✗ index ${index} threw:`, error?.message || error);
      results.push({ index, ok: false, error: String(error?.message || error) });
    }
    if (offset < count - 1) await new Promise(resolve => setTimeout(resolve, 1500));
  }
  const succeeded = results.filter(result => result.ok).length;
  console.log(`[brand-library] done — ${succeeded}/${results.length} saved to the Library. Refresh /library to view.`);
  return results;
}

/** Registers gated resident-test oracles and development-only console drivers. */
export function useVerificationDrivers({ testHooks, devHooks, archetypeIds, actionsRef }) {
  useEffect(() => {
    if (typeof window === "undefined" || !testHooks) return undefined;
    window.__woRoleBounds = () => actionsRef.current.getRoleBounds?.();
    window.__woTruth = () => actionsRef.current.getRenderTruth?.();

    if (devHooks) {
      window.__woSetArchetype = (id, content = {}) => actionsRef.current.setArchetype?.(id, content);
      window.__woArchAudit = () => actionsRef.current.getAudit?.();
      window.__woArchFontMeta = () => actionsRef.current.getFontMeta?.();
      window.__woArchTextBounds = () => actionsRef.current.getTextBounds?.();
      window.__woArchetypeIds = archetypeIds;
      window.__woApplyPatch = (patch, options) => actionsRef.current.applyPatch?.(
        patch,
        options || { source: "ui", uiSource: true },
      );
      window.__woSelectElement = (kind, uid) => actionsRef.current.selectElement?.(kind, uid || null);
      window.__woDateLadderProbe = options => actionsRef.current.dateLadderProbe?.(options);
      window.__woEyebrowLadderProbe = options => actionsRef.current.eyebrowLadderProbe?.(options);
    }

    // Credit-spending builder is development-only, never resident-production.
    if (process.env.NODE_ENV !== "production") {
      window.__woBuildLibraryStop = () => { window.__woBuildLibraryStopFlag = true; };
      window.__woBuildLibrary = buildBrandLibrary;
    }

    return () => {
      for (const key of [
        "__woRoleBounds", "__woTruth", "__woSetArchetype", "__woArchAudit",
        "__woArchFontMeta", "__woArchTextBounds", "__woArchetypeIds",
        "__woApplyPatch", "__woSelectElement", "__woDateLadderProbe",
        "__woEyebrowLadderProbe", "__woBuildLibrary", "__woBuildLibraryStop",
      ]) {
        try { delete window[key]; } catch {}
      }
    };
  }, [actionsRef, archetypeIds, devHooks, testHooks]);
}
