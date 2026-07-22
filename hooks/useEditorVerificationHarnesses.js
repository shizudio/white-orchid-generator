import { useEffect, useRef } from "react";
import { withHarnessMode } from "@/lib/sessions";

/** Owns development-only editor-state walkthroughs used by resident verification. */
export function useEditorVerificationHarnesses({
  enabled,
  checkFormatFit,
  canvasRef,
  dimensions,
  dimensionId,
  dimensionIdRef,
  editorState,
  editorActions,
}) {
  const stateRef = useRef(editorState);
  stateRef.current = editorState;
  const actionsRef = useRef(editorActions);
  actionsRef.current = editorActions;

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
    const settleFrame = () => new Promise(resolve => {
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      setTimeout(finish, 200);
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => requestAnimationFrame(finish));
    });
    const settle = async () => {
      await settleFrame();
      await new Promise(resolve => setTimeout(resolve, 120));
    };

    window.__woFormatFitGuard = () => withHarnessMode(async () => {
      const failures = [];
      const canvas = canvasRef.current;
      if (!canvas) return { pass: false, failures: ["no live canvas"] };
      const snapshot = stateRef.current;
      const actions = actionsRef.current;
      const restore = {
        archetypeId: snapshot.archetypeId,
        postType: snapshot.postType,
        headline: snapshot.headline,
        subtext: snapshot.subtext,
        dimensionId: snapshot.dimensionId,
      };
      const assertFit = label => {
        const currentDimension = dimensions.find(item => item.id === dimensionIdRef.current);
        if (canvas.width !== currentDimension?.w || canvas.height !== currentDimension?.h) {
          failures.push(`${label}: buffer ${canvas.width}x${canvas.height} ≠ state ${currentDimension?.w}x${currentDimension?.h}`);
        }
        const record = checkFormatFit();
        if (record?.diverged.some(item => item.startsWith("dead-strip"))) {
          failures.push(`${label}: ${record.diverged.filter(item => item.startsWith("dead-strip")).join(",")} (buf ${canvas.width}x${canvas.height}, src ${canvas.dataset.lastDrawSource})`);
        }
      };

      try {
        actions.applyPatch({
          archetypeId:"none",
          postType:"text_post",
          headline:"Format Fit Guard",
          subtext:"automated invariant check",
        },{amendUndo:true,systemFreeVariables:true,preserveSelection:true});
        await settle();
        for (const dimension of dimensions) {
          actions.setDimensionId(dimension.id);
          await settle();
          assertFit(`format:${dimension.id}`);
        }
        actions.setDimensionId("ig_square");
        await settle();
        assertFit("sessionA:ig_square");
        actions.setDimensionId("story");
        await settle();
        assertFit("sessionB:story");
        actions.setDimensionId("ig_square");
        await settle();
        assertFit("sessionA-return:ig_square");
      } finally {
        actions.applyPatch({
          archetypeId:restore.archetypeId || "none",
          postType:restore.postType,
          headline:restore.headline,
          subtext:restore.subtext,
        },{amendUndo:true,systemFreeVariables:true,preserveSelection:true});
        actions.setDimensionId(restore.dimensionId ?? dimensionId);
        await settle();
      }
      const report = { pass: failures.length === 0, checks: dimensions.length + 3, failures };
      console.log("[woFormatFitGuard]", JSON.stringify(report));
      return report;
    });
    return () => {
      try { delete window.__woFormatFitGuard; } catch {}
    };
  }, [canvasRef, checkFormatFit, dimensionId, dimensionIdRef, dimensions, enabled]);

  useEffect(() => {
    if (typeof window === "undefined" || !enabled) return;
    window.__woReproStep = (step, argument) => {
      const state = stateRef.current;
      const actions = actionsRef.current;
      if (step === "archetype") {
        actions.applyPatch({archetypeId:argument || "petal_window"},{
          amendUndo:true,systemFreeVariables:true,preserveSelection:true,
        });
      } else if (step === "textColor") {
        actions.applyPatch({textColorId:argument || "tangerine"},{source:"ui"});
      } else if (step === "addOverlay") {
        const asset = state.defaultOverlays.find(item => item.id === (argument || "acc-spark"));
        if (asset) {
          actions.applyPatch({
            replaceShapeCollection:state.overlayLayers.filter(layer=>layer.assetId!==asset.id),
            addOverlay:{assetId:asset.id,mode:"overlay"},
          },{source:"ui"});
        }
      } else if (step === "dragHero") {
        actions.updateTextLayout({ x: argument?.x ?? 0.12, y: argument?.y ?? 0.20 });
      } else if (step === "placeLogo") {
        actions.placeLogo(argument || { position: "top-left" });
      } else if (step === "setCopy") {
        actions.applyPatch(argument || {}, { source:"ui" });
      }
      return step;
    };
    window.__woReproState = () => {
      const state = stateRef.current;
      return {
        archetypeId: state.archetypeId,
        textColorId: state.textColorId,
        heroRegister: state.heroRegister,
        photoTreatment: state.photoTreatment,
        photoFrameType: state.photoFrame?.type,
        heroXY: {
          x: state.typeLayouts[state.postType]?.x,
          y: state.typeLayouts[state.postType]?.y,
          w: state.typeLayouts[state.postType]?.width,
        },
        hasRoles: !!state.typeLayouts[state.postType]?.roles,
        overlayCount: state.overlayLayers.length,
        motifCount: state.overlayLayers.filter(layer => layer.motif).length,
        logoPosition: state.logoPosition,
        userLogoTouched: state.userLogoTouched,
        undoDepth: state.undoDepth,
        redoDepth: state.redoDepth,
        bgColor: state.bgColor,
        headline: state.headline,
        subtext: state.subtext,
      };
    };
    window.__woUndo = () => {
      actionsRef.current.undoLastAiChange();
      return "undone";
    };
    window.__woRedo = () => {
      actionsRef.current.redoLastChange();
      return "redone";
    };
    return () => {
      try {
        delete window.__woReproStep;
        delete window.__woReproState;
        delete window.__woUndo;
        delete window.__woRedo;
      } catch {}
    };
  }, [enabled]);
}
