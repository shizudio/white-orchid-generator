import { useCallback } from "react";

/** Captures the current format as a flattened, downscaled JPEG for the manual AI audit. */
export function useAuditCaptureImage({ renderScene, width, height, dimensionId }) {
  return useCallback(() => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      renderScene(context, width, height, { dimensionId, live: false });

      const maxSide = 768;
      const scale = Math.min(1, maxSide / Math.max(width, height));
      const output = document.createElement("canvas");
      output.width = Math.max(1, Math.round(width * scale));
      output.height = Math.max(1, Math.round(height * scale));
      const outputContext = output.getContext("2d");
      outputContext.imageSmoothingQuality = "high";
      outputContext.fillStyle = "#ffffff";
      outputContext.fillRect(0, 0, output.width, output.height);
      outputContext.drawImage(canvas, 0, 0, output.width, output.height);
      return output.toDataURL("image/jpeg", 0.8);
    } catch {
      return null;
    }
  }, [dimensionId, height, renderScene, width]);
}
