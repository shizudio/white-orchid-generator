import { useEffect, useRef } from "react";
import { scheduleIdleWork } from "@/lib/idle-work-queue.mjs";
import { shouldDeferFreshnessWork } from "@/lib/readiness-policy.mjs";

// Six-format preview thumbnails on a cancellable idle queue.
//
// The effect must re-run ONLY when the design (or format set / readiness) actually
// changes — keyed on the stable `signature` string. It must NOT re-run on every
// React commit: `renderScene`/`computeReadyAll` are rebuilt on each render (their
// own deps — renderModel, readable-logo helpers — are fresh objects every render),
// so depending on their identity used to cancel the in-flight queue on every
// unrelated re-render and restart it from the first dimension. During the
// post-generate harmonizer/first-shot re-render storm that meant the first few
// formats rendered and the rest never did ("Checking every format…" stuck at 3/6).
// We read the live render fns through a ref (M1 — deferred canvas work goes through
// *Ref.current, never a captured function) and gate re-runs on `signature`.
// (Typing lag, 2026-07-27) The queue is a FRESHNESS sweep, not a render the owner is
// waiting on: it renders all six formats FULL SIZE offscreen and then runs
// computeReadyAll() — six more. Keyed on designFingerprint with a 400ms timer, that
// whole batch fired between keystrokes, because a person typing pauses for longer than
// 400ms constantly. Measured on a petal_window design at 4x CPU throttle: 183 offscreen
// drawImage calls and 972 measureText calls landed inside a single keystroke's 400ms
// window; per-keystroke input→paint sat at p50 432ms against the D2 budget of 150ms.
// The editing grace (editingRole — the same signal the live draw already honours) now
// extends here: while a text field is focused the sweep does not schedule at all, and
// blur re-runs this effect so the thumbnails and the verdict land once, settled.
export function useFormatPreviewQueue({enabled,dimensions,renderScene,computeReadyAll,onThumbnail,onReady,signature,editing=false}){
  const live=useRef({renderScene,computeReadyAll,onThumbnail,onReady});
  live.current={renderScene,computeReadyAll,onThumbnail,onReady};
  useEffect(()=>{
    if(!enabled||shouldDeferFreshnessWork({editingRole:editing}))return;
    let cancelQueue=()=>{};
    const timer=setTimeout(()=>{
      const height=72;
      cancelQueue=scheduleIdleWork(dimensions,dimension=>{
        try{
          const full=document.createElement("canvas");full.width=dimension.w;full.height=dimension.h;
          live.current.renderScene(full.getContext("2d"),dimension.w,dimension.h,{dimensionId:dimension.id,live:false});
          const width=Math.max(1,Math.round(height*dimension.w/dimension.h));
          const thumb=document.createElement("canvas");thumb.width=width;thumb.height=height;
          const context=thumb.getContext("2d");context.imageSmoothingQuality="high";context.drawImage(full,0,0,width,height);
          live.current.onThumbnail(dimension.id,thumb.toDataURL("image/png"));
        }catch{/* one unavailable format must not block the rest */}
      },()=>{try{live.current.onReady(live.current.computeReadyAll());}catch{/* preserve the previous verdict */}});
    },400);
    return()=>{clearTimeout(timer);cancelQueue();};
  },[enabled,dimensions,signature,editing]);
}
