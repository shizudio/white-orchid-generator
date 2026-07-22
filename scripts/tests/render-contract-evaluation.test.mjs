import test from "node:test";
import assert from "node:assert/strict";
import { createRenderModel } from "../../lib/render-model.mjs";
import { attachRenderContractAudit, evaluateRenderContracts } from "../../lib/render-contract-evaluation.mjs";

const document = {
  headline: "Creative learning",
  subtext: "For curious minds aged ten and above.",
  image: "/photo.jpg",
  selectedLogoId: "p1-green",
  postType: "photo_logo",
  typeLayouts: {
    photo_logo: {
      roles: {
        hero: { x: 0.08, y: 0.2, w: 0.6, h: 0.14 },
        support: { x: 0.08, y: 0.39, w: 0.6, h: 0.1 },
      },
    },
  },
};

test("post-render contract orchestration evaluates every design layer", () => {
  const model = createRenderModel({ document, dimensionId: "ig_square" });
  const result = evaluateRenderContracts({
    model,
    dimensionId: "ig_square",
    width: 1000,
    height: 1000,
    textBounds: { x: 80, y: 200, w: 600, h: 290 },
    roleBounds: {
      hero: { x: 80, y: 200, w: 600, h: 140 },
      support: { x: 80, y: 390, w: 600, h: 100 },
    },
    logoBox: { x: 780, y: 740, w: 120, h: 80 },
    photoBox: { x: 0, y: 0, w: 1000, h: 1000 },
    subjectBox: { x: 720, y: 200, w: 180, h: 240 },
    subjectWindow: { x: 0, y: 0, w: 1000, h: 1000, eff: { zoom: 1 } },
    textMetrics: { headline: 80, subtext: 70 },
    deadRoles: [],
    mediaSource: { width: 1600, height: 900 },
    logoEvidence: { illegible: false },
    surfaceEvidence: {
      resolved: { background: "#173e38", field: "#173e38", text: "#f4f2e7", backdrop: "none" },
      contrast: { min: 5, mean: 7 },
    },
    resolvedTextColor: "#f4f2e7",
  });

  assert.equal(result.layout.dimensionId, "ig_square");
  assert.ok(result.zoneRects["content:hero"]);
  assert.ok(result.constraints);
  assert.ok(result.contentTypography);
  assert.ok(result.mediaLogo);
  assert.ok(result.surface);
  assert.ok(result.decoration);
  assert.deepEqual(Object.keys(result.relationTests), []);
});

test("audit attachment preserves normalized media evidence and contract drift", () => {
  const evaluation = {
    constraints: { violations: [] },
    contentTypography: { violations: [] },
    mediaLogo: { violations: [] },
    surface: { violations: [] },
    decoration: { violations: [] },
    constraintEvidence: { seamStraddles: 1, decorationTextOrMark: 2, decorationSubject: 3 },
  };
  const audit = attachRenderContractAudit(
    { archetypeDrift: { decorOverlapsText: 4, decorInFocal: 5 } },
    evaluation,
    {
      subjectWindow: { x: 50, y: 100, w: 400, h: 500, eff: { zoom: 1.2 } },
      width: 1000,
      height: 1000,
    },
  );

  assert.deepEqual(audit.constraintContext.media.window, { x: 0.05, y: 0.1, w: 0.4, h: 0.5 });
  assert.deepEqual(audit.constraintContext.media.transform, { zoom: 1.2 });
  assert.equal(audit.archetypeDrift.seamStraddles, 1);
  assert.equal(audit.archetypeDrift.decorOverlapsText, 6);
  assert.equal(audit.archetypeDrift.decorInFocal, 8);
});

test("audit attachment remains absent when no audit was requested", () => {
  assert.equal(attachRenderContractAudit(null, { constraintEvidence: {} }), null);
});
