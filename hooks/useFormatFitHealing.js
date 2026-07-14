import { useCallback, useEffect, useRef } from "react";
import { logFeedback as logFeedbackClient, newTurnId } from "@/lib/sessions";

const IVORY = [245, 240, 232];

/** Owns live format-fit diagnostics and bounded event-driven self-healing. */
export function useFormatFitHealing({
  canvasRef,
  canvasShellRef,
  drawRef,
  width,
  height,
  dimensionId,
  imageObject,
  videoObject,
  sessionId,
}) {
  const checkFormatFit = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const shell = canvasShellRef.current;
    const bufferWidth = canvas.width;
    const bufferHeight = canvas.height;
    const record = {
      source: canvas.dataset.lastDrawSource || "?",
      drawDims: canvas.dataset.lastDrawDims || "?",
      state: `${width}x${height}`,
      buffer: `${bufferWidth}x${bufferHeight}`,
      diverged: [],
    };
    if (bufferWidth !== width || bufferHeight !== height) record.diverged.push("buffer≠state");
    if (shell && shell.clientWidth > 0 && shell.clientHeight > 0) {
      const cssAspect = shell.clientWidth / shell.clientHeight;
      const stateAspect = width / height;
      record.css = `${shell.clientWidth}x${shell.clientHeight}`;
      if (Math.abs(cssAspect - stateAspect) / stateAspect > 0.02) record.diverged.push("css-aspect≠state");
    }

    try {
      const context = canvas.getContext("2d");
      const cornerPoints = [
        [bufferWidth * 0.04, bufferHeight * 0.04],
        [bufferWidth * 0.10, bufferHeight * 0.06],
        [bufferWidth * 0.06, bufferHeight * 0.10],
      ];
      let ivoryCornerPoints = 0;
      for (const [x, y] of cornerPoints) {
        try {
          const pixel = context.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
          if (Math.abs(pixel[0] - IVORY[0]) + Math.abs(pixel[1] - IVORY[1]) + Math.abs(pixel[2] - IVORY[2]) < 24) {
            ivoryCornerPoints += 1;
          }
        } catch {}
      }
      if (ivoryCornerPoints < 2) {
        const edgeIvory = (horizontal, position) => {
          let ivory = 0;
          let samples = 0;
          const length = horizontal ? bufferWidth : bufferHeight;
          const step = Math.max(1, Math.floor(length / 80));
          for (let index = 0; index < length; index += step) {
            const x = horizontal ? index : position;
            const y = horizontal ? position : index;
            try {
              const pixel = context.getImageData(x, y, 1, 1).data;
              samples += 1;
              if (Math.abs(pixel[0] - IVORY[0]) + Math.abs(pixel[1] - IVORY[1]) + Math.abs(pixel[2] - IVORY[2]) < 24) {
                ivory += 1;
              }
            } catch {}
          }
          return samples ? ivory / samples : 0;
        };
        const right = edgeIvory(false, bufferWidth - 2);
        const bottom = edgeIvory(true, bufferHeight - 2);
        if (right >= 0.6) record.diverged.push(`dead-strip-right(${right.toFixed(2)})`);
        if (bottom >= 0.6) record.diverged.push(`dead-strip-bottom(${bottom.toFixed(2)})`);
      }
    } catch {}
    return record.diverged.length ? record : null;
  }, [canvasRef, canvasShellRef, height, width]);

  const healingRef = useRef(false);
  const scheduleHeal = useCallback(() => {
    if (healingRef.current) return false;
    healingRef.current = true;
    let ran = false;
    const heal = () => {
      if (ran) return;
      ran = true;
      drawRef.current?.("fmt-fit-heal");
      healingRef.current = false;
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(heal);
    setTimeout(heal, 32);
    return true;
  }, [drawRef]);

  const eventCheckRef = useRef(null);
  eventCheckRef.current = origin => {
    const record = checkFormatFit();
    const isDevelopment = process.env.NODE_ENV !== "production";
    if (isDevelopment && typeof window !== "undefined") {
      (window.__woFmtFitEventLog = window.__woFmtFitEventLog || []).push({
        origin,
        t: Date.now(),
        diverged: record ? record.diverged : null,
      });
      if (window.__woFmtFitEventLog.length > 50) window.__woFmtFitEventLog.shift();
    }
    if (!record) return;
    if (isDevelopment) console.warn("[woFormatFit] event divergence", origin, record);
    const drawable = record.diverged.some(item => item.startsWith("buffer") || item.startsWith("dead-strip"));
    if (!drawable || !scheduleHeal()) return;
    try {
      logFeedbackClient({
        turn_id: newTurnId(),
        session_id: sessionId || null,
        kind: "format-fit-heal",
        fit_heal: {
          origin,
          diverged: record.diverged,
          state: record.state,
          buffer: record.buffer,
          source: record.source,
        },
      });
    } catch {}
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isDevelopment = process.env.NODE_ENV !== "production";
    let timer = 0;
    const run = () => {
      const record = checkFormatFit();
      if (record) {
        if (isDevelopment) console.warn("[woFormatFit] divergence", record);
        if (isDevelopment) {
          window.__woFormatFitLast = record;
          (window.__woFormatFitLog = window.__woFormatFitLog || []).push({ t: Date.now(), ...record });
          if (window.__woFormatFitLog.length > 50) window.__woFormatFitLog.shift();
        }
        const drawable = record.diverged.some(item => item.startsWith("buffer") || item.startsWith("dead-strip"));
        if (drawable) scheduleHeal();
      } else if (isDevelopment) {
        window.__woFormatFitLast = null;
      }
    };
    if (isDevelopment) {
      timer = setInterval(run, 250);
      window.__woFmtFitCheck = () => checkFormatFit();
      window.__woFmtFitEventCheck = origin => eventCheckRef.current?.(origin || "manual");
    }
    return () => {
      if (timer) clearInterval(timer);
      try {
        delete window.__woFmtFitCheck;
        delete window.__woFmtFitEventCheck;
      } catch {}
    };
  }, [checkFormatFit, scheduleHeal]);

  const scheduleEventCheck = (origin) => {
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      eventCheckRef.current?.(origin);
    };
    const timer = setTimeout(fire, 250);
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(fire));
    return () => {
      done = true;
      clearTimeout(timer);
    };
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    return scheduleEventCheck("dim-change");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dimensionId]);

  useEffect(() => {
    if (typeof window === "undefined" || (!imageObject && !videoObject)) return;
    return scheduleEventCheck("media-load");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageObject, videoObject]);

  return checkFormatFit;
}
