// ── ALWAYS LOGO (task #69, client ruling 2026-08-17) ─────────────────────────
// "i want there to be always logo, currently some generations dont have logo by
// default." The brand mark is REQUIRED CONTENT on every fresh generation:
//   · every archetype × variant materialization resolves to a DRAWING logo
//     class (mark|lockup) — the retired "none"/"url" restraint can no longer
//     suppress the mark;
//   · an explicit USER removal (hideLogo) stays a pin — honored verbatim,
//     surviving layout re-solves — while a NEW generation resets it (law 5
//     interplay, same as layout pins clearing on fresh generation).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  materializeArchetypeLayout,
  resolveLogoDrawClass,
} from "../../lib/archetype-layout-policy.mjs";
import {
  planLogoPatchWorkflow,
  planArchetypeMaterializationWorkflow,
} from "../../lib/design-composite-workflows.mjs";
import { createNewPostHistorySnapshot } from "../../lib/design-history.mjs";
import { DESIGN_COMMAND_TYPES } from "../../lib/design-document.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = p => readFileSync(join(ROOT, p), "utf8");

// ── The draw-class resolver is TOTAL: every input draws ──────────────────────

test("always-logo: resolveLogoDrawClass maps every class to a drawing class", () => {
  for (const value of [undefined, null, "", "none", "url", "mark", "future-unknown"]) {
    assert.equal(resolveLogoDrawClass(value), "mark", `${String(value)} → mark`);
  }
  assert.equal(resolveLogoDrawClass("lockup"), "lockup");
});

// ── Every REAL archetype × variant materialization carries a logo ────────────
// The ARCHETYPES catalog is authored as pure literal data in Generator.jsx (the
// mcp mirror tests already text-read it); evaluate it and run every cell through
// the same materialization + resolver the render uses.

function loadArchetypes() {
  const src = read("components/Generator.jsx");
  const block = src.match(/const ARCHETYPES = \[([\s\S]*?)\n\];/);
  assert.ok(block, "ARCHETYPES array found in Generator.jsx");
  return new Function("return [" + block[1] + "\n];")();
}

test("always-logo: every archetype × variant resolves to mark|lockup (never none)", () => {
  const archetypes = loadArchetypes();
  assert.ok(archetypes.length >= 19, `catalog present (${archetypes.length} archetypes)`);
  for (const archetype of archetypes) {
    const variantCount = Math.max(1, archetype.variants?.length || 1);
    for (let v = 0; v < variantCount; v++) {
      for (const dim of ["ig_square", "ig_portrait", "story", "banner", "twitter"]) {
        const mat = materializeArchetypeLayout(archetype, dim, v);
        const drawClass = resolveLogoDrawClass(mat.logoUse);
        assert.ok(
          drawClass === "mark" || drawClass === "lockup",
          `${archetype.id} v${v} @${dim}: logoUse "${mat.logoUse}" resolves to a drawing class`,
        );
      }
    }
  }
});

test("always-logo: the render consumes the resolver (not the raw archetype class)", () => {
  const src = read("components/Generator.jsx");
  assert.match(src, /const logoUse = resolveLogoDrawClass\(mat\.logoUse\)/,
    "Generator.jsx resolves the drawn logo class through resolveLogoDrawClass");
  assert.ok(!/const logoUse = mat\.logoUse \|\| "url"/.test(src),
    "the retired none/url suppression is gone from the render");
  // Safest-fallback: an uncached mark variant falls back to the official lockup
  // through putLogo instead of silently vanishing.
  assert.match(src, /if\(!drew\) putLogo\(textEnvelope/,
    "the mark path carries the safest-fallback putLogo draw");
});

// ── Pins law: removal is a pin; a fresh generation resets it ─────────────────

test("always-logo: an explicit hideLogo is honored verbatim (pin)", () => {
  const groups = planLogoPatchWorkflow({
    patch: { hideLogo: true },
    current: { assetId: "p3-ivory", position: "bottom-right", sizeId: "s", hidden: false },
    rendered: { position: "bottom-right", drawn: true },
    dimensionId: "ig_portrait",
    masterDimensionId: "ig_portrait",
  });
  const commands = groups.flatMap(g => g.commands);
  assert.ok(commands.some(c => c.type === DESIGN_COMMAND_TYPES.LOGO_SET && c.field === "hidden" && c.value === true),
    "hideLogo:true compiles to LOGO_SET hidden:true");
});

test("always-logo: a layout re-solve never silently re-adds a removed logo", () => {
  const groups = planArchetypeMaterializationWorkflow({
    archetypeId: "serif_word",
    variant: 1,
    materialized: { postType: "text_post", register: "serif", layout: {} },
    currentShapes: [],
    typeLayoutDefault: {},
    clearAddedShapes: true,
  });
  const commands = groups.flatMap(g => g.commands);
  assert.ok(commands.length > 0, "materialization produced commands");
  assert.ok(!commands.some(c => c.type === DESIGN_COMMAND_TYPES.LOGO_SET && c.field === "hidden"),
    "materialization does not touch logo.hidden — an explicit removal survives the re-solve");
  assert.ok(commands.some(c => c.type === DESIGN_COMMAND_TYPES.LOGO_SET && c.field === "variantPinned" && c.value === false),
    "the system's own free variable (variantPinned) still resets");
});

test("always-logo: a NEW post starts fresh with the logo present", () => {
  const snapshot = createNewPostHistorySnapshot({});
  assert.equal(snapshot.designDocument.logo.hidden, false,
    "the canonical New-post document births with the logo visible");
  assert.ok(snapshot.designDocument.logo.assetId, "and with a real brand asset id");
});

test("always-logo: a landing plan can never carry a model-authored removal", () => {
  const src = read("app/api/assistant/route.js");
  assert.match(src, /delete patch\.hideLogo/,
    "the landing block strips stray hideLogo from fresh plans");
});
