import {
  resolveRenderConstraints,
  resolveRenderContentTypography,
  resolveRenderDecoration,
  resolveRenderLayout,
  resolveRenderMediaLogo,
  resolveRenderSurface,
} from "./render-model.mjs";
import { createMeasuredZoneRects } from "./layout-constraints.mjs";
import { buildPaintAwareRelationTests, summarizeConstraintEvidence } from "./render-constraint-measurements.mjs";
import { evaluateContentTypographyContract } from "./content-typography-contract.mjs";
import { evaluateMediaLogoContract } from "./media-logo-contract.mjs";
import { evaluateSurfaceContract } from "./surface-contract.mjs";
import { evaluateDecorationContract } from "./decoration-contract.mjs";

/**
 * Compose the post-render Design Layer Contract checks in one deterministic place.
 * Canvas adapters provide measured geometry and decoded-asset callbacks; this module
 * owns which contracts run and the evidence each contract receives.
 */
export function evaluateRenderContracts({
  model,
  dimensionId,
  width,
  height,
  textBounds,
  roleBounds,
  logoBox,
  photoBox,
  subjectBox,
  subjectWindow,
  shapes = [],
  textMetrics,
  deadRoles,
  mediaSource = {},
  logoEvidence,
  surfaceEvidence = {},
  resolvedTextColor,
  imageForShape,
  paintIntersects,
  paintStraddles,
} = {}) {
  const layout = resolveRenderLayout(model, dimensionId);
  const zoneRects = createMeasuredZoneRects(layout, {
    width,
    height,
    textBounds,
    roleBounds,
    logoBox,
    photoBox,
    subjectBox,
    shapes,
  });
  const relationTests = buildPaintAwareRelationTests({
    layout,
    zoneRects,
    shapes,
    width,
    height,
    imageForShape,
    paintIntersects,
    paintStraddles,
  });
  const constraints = resolveRenderConstraints(model, dimensionId, {
    zoneRects,
    relationTests,
    source: "post-render",
  });
  const constraintEvidence = summarizeConstraintEvidence(constraints);
  const contentTypography = evaluateContentTypographyContract(
    resolveRenderContentTypography(model, dimensionId),
    { width, height, roleBounds, textMetrics, droppedRoles: deadRoles },
  );
  const mediaLogo = evaluateMediaLogoContract(
    resolveRenderMediaLogo(model, dimensionId),
    {
      width,
      height,
      sourceWidth: mediaSource.width || 0,
      sourceHeight: mediaSource.height || 0,
      photoBox: subjectWindow,
      logoBox,
      logoEvidence,
    },
  );
  const resolvedSurface = surfaceEvidence.resolved || {};
  const surface = evaluateSurfaceContract(resolveRenderSurface(model, dimensionId), {
    ...surfaceEvidence,
    resolved: {
      ...resolvedSurface,
      text: resolvedTextColor || resolvedSurface.text,
    },
  });
  const decoration = evaluateDecorationContract(
    resolveRenderDecoration(model, dimensionId),
    { width, height, shapes },
  );

  return Object.freeze({
    layout,
    zoneRects,
    relationTests,
    constraints,
    constraintEvidence,
    contentTypography,
    mediaLogo,
    surface,
    decoration,
  });
}

export function attachRenderContractAudit(baseAudit, evaluation, { subjectWindow, imageTransform, width = 1, height = 1 } = {}) {
  if (!baseAudit) return null;
  const drift = baseAudit.archetypeDrift;
  const evidence = evaluation.constraintEvidence;
  return {
    ...baseAudit,
    constraintResult: evaluation.constraints,
    contentTypographyResult: evaluation.contentTypography,
    mediaLogoResult: evaluation.mediaLogo,
    surfaceResult: evaluation.surface,
    decorationResult: evaluation.decoration,
    constraintContext: {
      media: subjectWindow
        ? {
            transform: { ...(subjectWindow.eff || imageTransform || {}) },
            window: {
              x: subjectWindow.x / width,
              y: subjectWindow.y / height,
              w: subjectWindow.w / width,
              h: subjectWindow.h / height,
            },
          }
        : null,
    },
    ...(drift
      ? {
          archetypeDrift: {
            ...drift,
            seamStraddles: evidence.seamStraddles,
            decorOverlapsText: (drift.decorOverlapsText || 0) + evidence.decorationTextOrMark,
            decorInFocal: (drift.decorInFocal || 0) + evidence.decorationSubject,
          },
        }
      : {}),
  };
}
