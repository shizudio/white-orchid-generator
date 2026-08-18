// ── Photo-source choice for fresh generations (task #69) ─────────────────────
// Client ruling 2026-08-17: "i realize we are always using the same image. lets
// always ask users to select / upload image / let AI decide, and then move on?"
// This module owns the PURE decisions behind that chooser so the landing page,
// the studio's New-post offer, and the tests all share one contract:
//   · which plans need the chooser (photo-led only — text-only plans have no
//     photo to choose), and
//   · what each choice resolves to, including the HONEST degraded outcome when
//     the chosen source produced nothing (law 6 — never a silent stock repeat).

/** The three sources, in display order. "ai" is the default and visually primary. */
export const PHOTO_SOURCES = Object.freeze(["ai", "library", "upload"]);
export const DEFAULT_PHOTO_SOURCE = "ai";

export const PHOTO_SOURCE_LABELS = Object.freeze({
  ai: "Let AI decide",
  library: "Pick from my library",
  upload: "Upload a photo",
});

// (Honesty law) The warm, retryable line shown when an AI-decide generation is
// unconfigured/fails: the design degrades to the clean solid-field path and SAYS
// so — never a silently repeated stock image.
export const PHOTO_FALLBACK_NOTE =
  "I couldn't generate a fresh photo just now, so I kept a clean solid background. " +
  "Say \"add a photo\" (or tap Refresh photo) any time and I'll try again.";

/** A landing plan is photo-led exactly when it carries a photographer brief. */
export function planIsPhotoLed(plan) {
  return !!(plan && typeof plan.scenePrompt === "string" && plan.scenePrompt.trim());
}

/**
 * Resolve one chooser outcome into the handoff-facing shape:
 *   { imageUrl, imageOrigin, removeImage, note }
 * · A successful source lands its image (origin recorded for lineage — an
 *   "uploaded" origin is persisted to the Library with session lineage by the
 *   editor, the #64 machinery).
 * · An empty source degrades HONESTLY: removeImage:true (the graceful
 *   solid-field path — never the repeated sample/stock image) + the fallback
 *   note. Unknown sources coerce to the default ("ai") semantics.
 */
export function resolveLandingPhotoOutcome({
  source = DEFAULT_PHOTO_SOURCE,
  aiPhotoDataUrl = null,
  libraryUrl = null,
  uploadDataUrl = null,
} = {}) {
  const src = PHOTO_SOURCES.includes(source) ? source : DEFAULT_PHOTO_SOURCE;
  const picked =
    src === "library" ? libraryUrl :
    src === "upload" ? uploadDataUrl :
    aiPhotoDataUrl;
  if (typeof picked === "string" && picked) {
    return {
      imageUrl: picked,
      imageOrigin: src === "library" ? "library" : src === "upload" ? "uploaded" : "generated",
      removeImage: false,
      note: null,
    };
  }
  return { imageUrl: null, imageOrigin: null, removeImage: true, note: PHOTO_FALLBACK_NOTE };
}
