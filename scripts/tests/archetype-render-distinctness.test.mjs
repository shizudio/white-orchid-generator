// ── ARCHETYPE RENDER DISTINCTNESS (client report 2026-07-27) ─────────────────────
// "Switching layout via ai chat only changes to the same blob with different colour."
// The feared mechanism class: archetype materialization failing (or silently falling
// back to one shared silhouette — post-purge the petalMask fallback IS the same
// shape-1 egg for everything), so every layout switch paints the same composition
// and only the palette seed changes. The live investigation cleared the mechanism
// (7 consecutive chat-belt switches materialized 7 distinct compositions), and this
// guard FREEZES that property against regression using the committed render
// fingerprint (scripts/guards/render-fingerprint-baseline.json): with fixed fixture
// content, two archetypes that paint the same pixels ARE the collapse. A regression
// cannot silently ride a re-baseline — the collapsed cells would collide here.
//
// Pure and offline: reads the baseline JSON only. The live half of the guarantee is
// the fingerprint battery itself (DLC §23), which proves the baseline matches the
// canvas; this test proves the baseline's archetypes are mutually distinct.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const baseline = JSON.parse(readFileSync(join(here, "..", "guards", "render-fingerprint-baseline.json"), "utf8"));

const FORMATS = ["ig_portrait", "ig_square", "story", "twitter", "facebook", "banner"];
// The chat belt's authoritative variety rings, parsed FROM the route source
// (workspace-prop-parity precedent: text-parse the real surface, fail closed) so a
// ring edit can never drift past this guard. Every ring stop must exist as a
// materializable, distinct render — a ring naming an id the engine can't paint is
// exactly the silent-fallback class this guards.
const routeSrc = readFileSync(join(here, "..", "..", "app", "api", "assistant", "route.js"), "utf8");
function parseRing(name) {
  const m = routeSrc.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]+)\\]`));
  assert.ok(m, `${name} not found in app/api/assistant/route.js — the variety belt moved; update this guard`);
  const ids = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]);
  assert.ok(ids.length >= 5, `${name} parsed to ${ids.length} ids — extraction broke (fail closed)`);
  return ids;
}
const PHOTO_RING = parseRing("PHOTO_RING");
const TEXT_RING = parseRing("TEXT_RING");

function archHashesFor(fmt) {
  const out = {};
  for (const [key, hash] of Object.entries(baseline.hashes || {})) {
    const [kind, id, f] = key.split(":");
    if (kind === "arch" && f === fmt) out[id] = hash;
  }
  return out;
}

test("every archetype paints a DISTINCT composition in every format (no same-blob collapse)", () => {
  for (const fmt of FORMATS) {
    const hashes = archHashesFor(fmt);
    const ids = Object.keys(hashes);
    assert.ok(ids.length >= 19, `${fmt}: expected ≥19 archetype cells, got ${ids.length}`);
    const seen = new Map();
    for (const [id, h] of Object.entries(hashes)) {
      assert.ok(!seen.has(h), `${fmt}: '${id}' renders IDENTICALLY to '${seen.get(h)}' — the same-blob collapse`);
      seen.set(h, id);
    }
  }
});

test("both chat variety rings point only at archetypes that materialize and render", () => {
  for (const fmt of FORMATS) {
    const hashes = archHashesFor(fmt);
    for (const id of [...PHOTO_RING, ...TEXT_RING]) {
      assert.ok(hashes[id], `${fmt}: ring archetype '${id}' has no baseline cell — the belt would switch to a layout that cannot paint`);
    }
  }
});

test("a ring walk of 5+ switches yields 5+ distinct renders (the client's exact repro shape)", () => {
  for (const fmt of FORMATS) {
    const hashes = archHashesFor(fmt);
    for (const ring of [PHOTO_RING, TEXT_RING]) {
      const walk = ring.slice(0, Math.max(5, ring.length)).map(id => hashes[id]);
      assert.equal(new Set(walk).size, walk.length,
        `${fmt}: walking the ${ring === PHOTO_RING ? "photo" : "text"} ring re-serves a duplicate composition`);
    }
  }
});
