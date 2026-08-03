import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/* ── CONSENT REMOVAL (client ruling 2026-08-03: "remove the consent category")
   App-route files import through the '@/' alias, so (like
   workspace-prop-parity.test.mjs) these are TEXT contracts: they parse the
   shipped source and fail closed if the consent machinery creeps back into the
   UI/validation surface, or if the dormant-column write is dropped. ─────────── */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = p => readFileSync(join(root, p), "utf8");

test("images POST no longer reads, requires, or validates consent_status", () => {
  const src = read("app/api/images/route.js");
  assert.doesNotMatch(src, /formData\.get\(['"]consent_status['"]\)/);
  assert.doesNotMatch(src, /Real photos require a consent status/);
});

test("images POST keeps the dormant column valid by writing its default 'na'", () => {
  const src = read("app/api/images/route.js");
  assert.match(src, /consent_status:\s*'na'/);
});

test("upload page has no consent question or selector left", () => {
  const src = read("app/upload/page.jsx");
  assert.doesNotMatch(src, /CONSENT_OPTIONS/);
  assert.doesNotMatch(src, /consentStatus|consent_status'/); // no state, no field sent (comments fine)
  assert.doesNotMatch(src, /peopleTag/);
  assert.doesNotMatch(src, /Real people in this photo/);
  // The upload POST sends only file + source_type — no consent field.
  assert.match(src, /fd\.append\('source_type', 'uploaded'\)/);
  const appended = [...src.matchAll(/fd\.append\('([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(appended.sort(), ["file", "source_type"]);
});

test("Library page renders no consent filter, badges, or blocked gating", () => {
  const src = read("app/library/page.jsx");
  assert.doesNotMatch(src, /CONSENT_BADGE/);
  assert.doesNotMatch(src, /\.consent_status/); // no reader (mentions in comments are fine)
  assert.doesNotMatch(src, /filter\.consent\b/);
  assert.doesNotMatch(src, /isBlocked|Consent required/);
});

test("LibraryPicker renders no consent badges and never hides 'blocked' images", () => {
  const src = read("components/LibraryPicker.jsx");
  assert.doesNotMatch(src, /CONSENT_BADGE/);
  assert.doesNotMatch(src, /consent_status\s*!==/);
  assert.doesNotMatch(src, /Blocked images are hidden/);
});

test("schema keeps the consent_status column (no destructive change), marked dormant", () => {
  const src = read("lib/schema.sql");
  assert.match(src, /consent_status\s+text not null default 'na'/);
  assert.match(src, /DORMANT/);
});

/* ── The categorize route spends credits → gated + degrading (contract) ───── */

test("categorize route is admin-key gated BEFORE any spend, and degrades without an OpenAI key", () => {
  const src = read("app/api/images/categorize/route.js");
  const gateAt = src.indexOf("requireAdminKey(request)");
  const spendAt = src.indexOf("api.openai.com");
  assert.ok(gateAt > -1 && spendAt > -1 && gateAt < spendAt, "gate must precede the OpenAI call");
  assert.match(src, /OPENAI_API_KEY/);
  assert.match(src, /configured:\s*false/);
  assert.match(src, /detail:\s*'low'/); // money law: low-detail vision only
});
