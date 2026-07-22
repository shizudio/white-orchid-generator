import test from "node:test";
import assert from "node:assert/strict";
import { createLayoutCapability } from "../../lib/layout-contract.mjs";
import { evaluateLayoutConstraints } from "../../lib/layout-constraints.mjs";

const rect = { type: "rect", rect: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } };
const overlapping = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };

const cases = [
  ["logo-text", "clears", { id: "mark:primary", kind: "mark" }, { id: "content:hero", kind: "content" }, "logo.no-text-overlap"],
  ["logo-subject", "avoids", { id: "mark:primary", kind: "mark" }, { id: "protected:subject", kind: "protected", surface: "media" }, "logo.no-subject-overlap"],
  ["content-subject", "avoids", { id: "content:hero", kind: "content" }, { id: "protected:subject", kind: "protected", surface: "media" }, "media.protected-subject"],
  ["content-platform", "avoids", { id: "content:hero", kind: "content" }, { id: "protected:top", kind: "protected", surface: "platform" }, "format.platform-occlusion"],
  ["content-structure", "does-not-straddle", { id: "content:hero", kind: "content" }, { id: "structural:panel", kind: "structural" }, "structural.no-seam-straddle"],
  ["decoration-content", "avoids", { id: "decoration:arrow", kind: "decoration" }, { id: "content:hero", kind: "content" }, "decoration.yields-to-meaning"],
  ["decoration-logo", "avoids", { id: "decoration:arrow", kind: "decoration" }, { id: "mark:primary", kind: "mark" }, "decoration.yields-to-meaning"],
  ["media-structure", "contains", { id: "structural:frame", kind: "structural" }, { id: "media:primary", kind: "media" }, "media.crop-coverage"],
  ["generic-content", "clears", { id: "content:hero", kind: "content" }, { id: "content:support", kind: "content" }, "layout.no-element-overlap"],
];

test("cross-layer collisions resolve to exactly one canonical policy owner", () => {
  for (const [name, type, from, to, expectedRuleId] of cases) {
    const fromRect = type === "does-not-straddle"
      ? { x: 0.45, y: 0.2, w: 0.4, h: 0.3 }
      : overlapping;
    const toRect = type === "contains"
      ? { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }
      : overlapping;
    const capability = createLayoutCapability({
      dimensionId: "ig_square",
      zones: [
        { ...from, geometry: rect },
        { ...to, geometry: rect },
      ],
      relations: [{ id: name, type, from: from.id, to: to.id }],
    });
    const result = evaluateLayoutConstraints(capability, {
      zoneRects: { [from.id]: fromRect, [to.id]: toRect },
      source: "matrix-test",
    });
    assert.equal(result.violations.length, 1, `${name} should have one policy owner`);
    assert.equal(result.violations[0].ruleId, expectedRuleId, name);
  }
});
