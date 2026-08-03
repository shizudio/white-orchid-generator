import test from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_VISION_PROMPT,
  VISION_MODEL,
  DEFAULT_BATCH_LIMIT,
  MAX_BATCH_LIMIT,
  clampBatchLimit,
  selectUnlabeled,
  runCategorizeBatch,
} from "../../lib/activity-vision.mjs";

/* ── MONEY LAW: every test here runs with MOCKED labelImage/saveActivity —
   no OpenAI call, no Supabase, $0. The route wires the real I/O. ─────────── */

const row = (id, activity) => ({
  id,
  storage_path: `uploads/${id}.png`,
  filename: `${id}.png`,
  metadata: activity ? { activity } : {},
});

test("the vision prompt asks for a short generic label and contains ZERO brand/domain facts", () => {
  assert.match(ACTIVITY_VISION_PROMPT, /1 to 3 words/);
  assert.match(ACTIVITY_VISION_PROMPT, /lowercase/);
  // Zero-brand-facts law: no school/childcare/brand vocabulary hardcoded.
  assert.doesNotMatch(ACTIVITY_VISION_PROMPT, /orchid|preschool|school|childcare|toddler|classroom/i);
  assert.equal(VISION_MODEL, "gpt-4o-mini");
});

test("clampBatchLimit: default 10, capped at MAX, floor 1, junk → default", () => {
  assert.equal(clampBatchLimit(undefined), DEFAULT_BATCH_LIMIT);
  assert.equal(clampBatchLimit("nope"), DEFAULT_BATCH_LIMIT);
  assert.equal(clampBatchLimit(0), DEFAULT_BATCH_LIMIT);
  assert.equal(clampBatchLimit(3), 3);
  assert.equal(clampBatchLimit(999), MAX_BATCH_LIMIT);
});

test("selectUnlabeled skips labeled rows AND owner-pinned rows (pins law)", () => {
  const rows = [
    row("plain"),
    row("labeled", { label: "painting", model: "gpt-4o-mini" }),
    row("owner", { label: "sports day", authorship: "owner" }),
    row("owner-odd", { label: "", authorship: "owner" }), // pinned even when odd
    row("junk-label", { label: "  " }),                    // unusable → still a candidate
  ];
  assert.deepEqual(selectUnlabeled(rows).map(r => r.id), ["plain", "junk-label"]);
  assert.deepEqual(selectUnlabeled(null), []);
});

test("runCategorizeBatch labels up to `limit`, writes the full activity shape, reports remaining", async () => {
  const rows = [row("a"), row("b"), row("c"), row("d")];
  const saved = {};
  const result = await runCategorizeBatch({
    rows,
    limit: 3,
    labelImage: async r => `Label For ${r.id}`,
    saveActivity: async (r, activity) => { saved[r.id] = activity; },
    now: () => new Date("2026-08-03T12:00:00Z"),
  });
  assert.equal(result.total, 4);
  assert.equal(result.processed, 3);
  assert.equal(result.labeled.length, 3);
  assert.equal(result.remaining, 1);
  assert.equal(result.done, false);
  assert.deepEqual(saved.a, {
    label: "label for a",
    raw: "Label For a",
    model: VISION_MODEL,
    labeledAt: "2026-08-03T12:00:00.000Z",
  });
  assert.deepEqual(result.labels.sort(), ["label for a", "label for b", "label for c"]);
});

test("a vision failure on ONE image skips it (named) and never aborts the batch", async () => {
  const saved = {};
  const result = await runCategorizeBatch({
    rows: [row("ok1"), row("boom"), row("ok2")],
    limit: 10,
    labelImage: async r => { if (r.id === "boom") throw new Error("vision refused"); return "gardening"; },
    saveActivity: async (r, activity) => { saved[r.id] = activity; },
  });
  assert.deepEqual(result.labeled.map(l => l.id), ["ok1", "ok2"]);
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].id, "boom");
  assert.equal(result.skipped[0].filename, "boom.png");
  assert.match(result.skipped[0].reason, /vision refused/);
  assert.equal(saved.boom, undefined); // stayed unlabeled
  assert.equal(result.done, true);     // everything left fit this batch
});

test("an empty/junk model answer skips the image instead of writing a junk group", async () => {
  const result = await runCategorizeBatch({
    rows: [row("a")],
    limit: 10,
    labelImage: async () => "  ?! ",
    saveActivity: async () => { throw new Error("must not be called"); },
  });
  assert.equal(result.labeled.length, 0);
  assert.equal(result.skipped.length, 1);
  assert.match(result.skipped[0].reason, /no usable label/);
});

test("a save failure skips that image only", async () => {
  const result = await runCategorizeBatch({
    rows: [row("a"), row("b")],
    limit: 10,
    labelImage: async () => "cooking",
    saveActivity: async r => { if (r.id === "a") throw new Error("db write failed"); },
  });
  assert.deepEqual(result.labeled.map(l => l.id), ["b"]);
  assert.equal(result.skipped[0].id, "a");
});

test("idempotent: a re-run over already-labeled rows processes ZERO images", async () => {
  const rows = [row("a"), row("b")];
  const first = await runCategorizeBatch({
    rows, limit: 10,
    labelImage: async () => "painting",
    saveActivity: async (r, activity) => { r.metadata = { ...r.metadata, activity }; },
  });
  assert.equal(first.labeled.length, 2);
  let visionCalls = 0;
  const second = await runCategorizeBatch({
    rows, limit: 10,
    labelImage: async () => { visionCalls += 1; return "painting"; },
    saveActivity: async () => {},
  });
  assert.equal(visionCalls, 0); // never re-labels — a future run only touches new rows
  assert.equal(second.processed, 0);
  assert.equal(second.total, 0);
  assert.equal(second.done, true);
});

test("owner-pinned rows are NEVER re-labeled by a run (pins law)", async () => {
  const rows = [row("pinned", { label: "sports day", authorship: "owner" }), row("new")];
  let touched = [];
  const result = await runCategorizeBatch({
    rows, limit: 10,
    labelImage: async r => { touched.push(r.id); return "outdoor play"; },
    saveActivity: async () => {},
  });
  assert.deepEqual(touched, ["new"]);
  assert.equal(result.total, 1);
});

test("remaining counts rows BEYOND the batch, so an always-failing image can't loop the client forever", async () => {
  // 12 unlabeled, batch 10 → remaining 2 even if some in-batch images failed.
  const rows = Array.from({ length: 12 }, (_, i) => row(`r${i}`));
  const result = await runCategorizeBatch({
    rows, limit: 10,
    labelImage: async r => { if (r.id === "r0") throw new Error("always fails"); return "reading"; },
    saveActivity: async () => {},
  });
  assert.equal(result.remaining, 2);
  // Next request: 3 unlabeled (r0 + the 2) → batch of 3 → remaining 0 → done.
  const rows2 = [rows[0], rows[10], rows[11]];
  const second = await runCategorizeBatch({
    rows: rows2, limit: 10,
    labelImage: async r => { if (r.id === "r0") throw new Error("always fails"); return "reading"; },
    saveActivity: async () => {},
  });
  assert.equal(second.remaining, 0);
  assert.equal(second.done, true); // the loop terminates; r0 stays honestly skipped
});
