import { useCallback } from "react";
import {
  enrichVerdict as enrichVerdictClient,
  logFeedback as logFeedbackClient,
  newTurnId,
} from "@/lib/sessions";

const slugify = value => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .slice(0, 30);

/** Owns single/all-format downloads, retry reporting, and export success signals. */
export function useExportOrchestration({
  canvasRef,
  draw,
  renderScene,
  dimensions,
  exportFormat,
  headline,
  activeTemplateName,
  postType,
  markSessionExported,
  sessionConversation,
  sessionId,
  nudgeDismissedRef,
  setExportNudge,
  setExportFail,
}) {
  const exportSlug = headline
    ? slugify(headline)
    : activeTemplateName
      ? slugify(activeTemplateName)
      : postType;

  const download = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    draw("download");
    const isJpeg = exportFormat === "jpeg";
    let source = canvas;
    if (isJpeg) {
      const flattened = document.createElement("canvas");
      flattened.width = canvas.width;
      flattened.height = canvas.height;
      const context = flattened.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, flattened.width, flattened.height);
      context.drawImage(canvas, 0, 0);
      source = flattened;
    }

    const dataUrl = source.toDataURL(isJpeg ? "image/jpeg" : "image/png", isJpeg ? 0.92 : undefined);
    const anchor = document.createElement("a");
    anchor.download = `white-orchid-${exportSlug}.${isJpeg ? "jpg" : "png"}`;
    anchor.href = dataUrl;
    anchor.click();
    markSessionExported();
    try {
      const lastTurn = [...sessionConversation].reverse().find(message => message.turnId);
      if (lastTurn?.turnId) {
        enrichVerdictClient(lastTurn.turnId, { implicit: "success", implicitSignal: "export" });
      }
    } catch {}
    if (sessionId && !nudgeDismissedRef.current.has(sessionId)) setExportNudge(true);
  }, [
    canvasRef,
    draw,
    exportFormat,
    exportSlug,
    markSessionExported,
    nudgeDismissedRef,
    sessionConversation,
    sessionId,
    setExportNudge,
  ]);

  const downloadAll = useCallback(async (only) => {
    const retryIds = Array.isArray(only) && only.length ? only : null;
    const targetDimensions = retryIds
      ? dimensions.filter(dimension => retryIds.includes(dimension.id))
      : dimensions;
    setExportFail(null);
    const isJpeg = exportFormat === "jpeg";
    const failed = [];

    for (const dimension of targetDimensions) {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = dimension.w;
        canvas.height = dimension.h;
        const context = canvas.getContext("2d");
        if (isJpeg) {
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, dimension.w, dimension.h);
        }
        renderScene(context, dimension.w, dimension.h, {
          dimensionId: dimension.id,
          live: false,
        });
        const dataUrl = canvas.toDataURL(isJpeg ? "image/jpeg" : "image/png", isJpeg ? 0.92 : undefined);
        const anchor = document.createElement("a");
        anchor.download = `white-orchid-${exportSlug}-${dimension.id}.${isJpeg ? "jpg" : "png"}`;
        anchor.href = dataUrl;
        await new Promise(resolve => setTimeout(resolve, 300));
        anchor.click();
      } catch (error) {
        console.warn("Could not export", dimension.id, error);
        failed.push(dimension.id);
      }
    }

    const succeeded = targetDimensions.length - failed.length;
    if (succeeded > 0) markSessionExported();
    if (!failed.length) return;
    setExportFail({ failedIds: failed, ok: succeeded, run: targetDimensions.length });
    try {
      logFeedbackClient({
        turn_id: newTurnId(),
        session_id: sessionId || null,
        kind: "export-error",
        export_error: {
          failed,
          of: targetDimensions.length,
          format: exportFormat,
          retry: !!retryIds,
        },
      });
    } catch {}
  }, [
    dimensions,
    exportFormat,
    exportSlug,
    markSessionExported,
    renderScene,
    sessionId,
    setExportFail,
  ]);

  return { download, downloadAll };
}
