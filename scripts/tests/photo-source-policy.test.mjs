// ── Photo-source chooser (task #69, client ruling 2026-08-17) ────────────────
// "lets always ask users to select / upload image / let AI decide, and then
// move on?" Pure contract for the shared chooser flow: which plans need the
// choice, what each choice resolves to, the HONEST degraded outcome (law 6 —
// never a silently repeated stock image), and the driver/UI mirrors that keep
// the headless MCP + resident tester passing through the default.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PHOTO_SOURCES,
  DEFAULT_PHOTO_SOURCE,
  PHOTO_SOURCE_LABELS,
  PHOTO_FALLBACK_NOTE,
  planIsPhotoLed,
  resolveLandingPhotoOutcome,
} from "../../lib/photo-source-policy.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = p => readFileSync(join(ROOT, p), "utf8");

// ── The source set and default ───────────────────────────────────────────────

test("photo-source: three sources, AI-decide first and default, all labeled", () => {
  assert.deepEqual([...PHOTO_SOURCES], ["ai", "library", "upload"]);
  assert.equal(DEFAULT_PHOTO_SOURCE, "ai");
  for (const source of PHOTO_SOURCES) {
    assert.ok(PHOTO_SOURCE_LABELS[source]?.length > 3, `${source} carries a real label`);
  }
});

// ── Which plans pause for the choice ─────────────────────────────────────────

test("photo-source: only photo-led plans (scenePrompt) need the chooser", () => {
  assert.equal(planIsPhotoLed({ scenePrompt: "children painting at a sunlit table" }), true);
  assert.equal(planIsPhotoLed({ scenePrompt: "   " }), false, "blank brief is text-only");
  assert.equal(planIsPhotoLed({ scenePrompt: null }), false);
  assert.equal(planIsPhotoLed({}), false);
  assert.equal(planIsPhotoLed(null), false);
});

// ── Choice outcomes ──────────────────────────────────────────────────────────

test("photo-source: each successful source lands its image with lineage origin", () => {
  const ai = resolveLandingPhotoOutcome({ source: "ai", aiPhotoDataUrl: "data:image/png;base64,AAA" });
  assert.deepEqual(ai, { imageUrl: "data:image/png;base64,AAA", imageOrigin: "generated", removeImage: false, note: null });

  const lib = resolveLandingPhotoOutcome({ source: "library", libraryUrl: "https://cdn/x.jpg" });
  assert.equal(lib.imageUrl, "https://cdn/x.jpg");
  assert.equal(lib.imageOrigin, "library");
  assert.equal(lib.removeImage, false);

  const up = resolveLandingPhotoOutcome({ source: "upload", uploadDataUrl: "data:image/jpeg;base64,BBB" });
  assert.equal(up.imageOrigin, "uploaded", "uploads carry the 'uploaded' taxonomy for the #64 lineage machinery");
});

test("photo-source: an empty source degrades HONESTLY — solid field + note, never stock", () => {
  for (const source of PHOTO_SOURCES) {
    const outcome = resolveLandingPhotoOutcome({ source });
    assert.equal(outcome.imageUrl, null, `${source}: no image lands`);
    assert.equal(outcome.removeImage, true, `${source}: the scratch/stock media is cleared (graceful solid-field path)`);
    assert.equal(outcome.note, PHOTO_FALLBACK_NOTE, `${source}: the honest retryable note rides along`);
  }
  assert.ok(PHOTO_FALLBACK_NOTE.length > 40 && /try again/i.test(PHOTO_FALLBACK_NOTE),
    "the note is warm and retryable (never a dead end)");
});

test("photo-source: an unknown source coerces to the AI-decide default", () => {
  const outcome = resolveLandingPhotoOutcome({ source: "carrier-pigeon", aiPhotoDataUrl: "data:image/png;base64,CCC" });
  assert.equal(outcome.imageOrigin, "generated");
});

// ── UI / driver mirrors (trap M6 — additions must land everywhere) ───────────

test("photo-source: the shared chooser exposes the data-wo-photo-source driver contract", () => {
  const src = read("components/PhotoSourceChooser.jsx");
  assert.match(src, /data-wo-photo-source=\{source\}/, "every option carries its source id");
  assert.match(src, /PHOTO_SOURCES\.map/, "options come from the one policy list");
});

test("photo-source: the landing flow wires the chooser through the shared policy", () => {
  const src = read("app/page.jsx");
  assert.match(src, /<PhotoSourceChooser/, "landing renders the shared chooser");
  assert.match(src, /planIsPhotoLed\(data\)/, "only photo-led plans pause");
  assert.match(src, /resolveLandingPhotoOutcome/, "outcomes resolve through the policy");
  assert.match(src, /removeImage: true/, "the honest no-photo path clears the scratch media");
  assert.ok(!/data\.imageUrl/.test(src), "the retired implicit server photo-attach is no longer consumed");
});

test("photo-source: the studio New-post flow offers the same shared chooser", () => {
  const src = read("components/Generator.jsx");
  assert.match(src, /import PhotoSourceChooser from ".\/PhotoSourceChooser"/);
  assert.match(src, /newPostPhotoOffer/, "New post raises the offer");
});

test("photo-source: the implicit Library auto-attach is retired server-side", () => {
  const src = read("app/api/assistant/route.js");
  assert.ok(!/pickLandingPhoto\(/.test(src), "no silent Library attach call remains");
  assert.ok(!/createSignedUrl/.test(src), "no signed-URL attach machinery remains in the assistant route");
});

test("photo-source: headless drivers accept the AI-decide default (MCP + resident tester)", () => {
  for (const p of ["mcp-server/driver.mjs", "scripts/resident-tester/journeys.js"]) {
    const src = read(p);
    assert.match(src, /data-wo-photo-source="ai"/, `${p} taps the default chooser option`);
  }
});

test("photo-source: a landing upload persists to the Library with session lineage", () => {
  const handoff = read("hooks/useLandingHandoff.js");
  assert.match(handoff, /imageOrigin === "uploaded"/);
  assert.match(handoff, /persistLandingUpload/);
  const generator = read("components/Generator.jsx");
  assert.match(generator, /fd\.append\("source_type", "uploaded"\)/);
  assert.match(generator, /fd\.append\("session_id", sid\)/);
});
