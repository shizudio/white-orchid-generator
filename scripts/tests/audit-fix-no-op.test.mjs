import test from "node:test";
import assert from "node:assert/strict";
import { coerceFixToCategory } from "../../lib/design-patch.js";

/* ── AI-AUDIT FIX NO-OP GUARD (task #71-adjacent, client report 2026-08-18 —
   "the suggested edit doesn't change anything") ────────────────────────────
   The audit's vision model reasons from a rendered screenshot and can propose
   a "fix" that's already the current value (misjudging what's on screen). The
   system prompt asks it not to; this guard enforces it server-side by diffing
   the proposed fix against the design's actual current state before it ever
   becomes an executable "Fix" button. */

test("a brand fix identical to the current bgColor is stripped to null", () => {
  const out = coerceFixToCategory("brand", { bgColor: "sage" }, { bgColor: "sage" });
  assert.equal(out, null);
});

test("a brand fix that actually differs from current state survives", () => {
  const out = coerceFixToCategory("brand", { bgColor: "sage" }, { bgColor: "butter" });
  assert.deepEqual(out, { bgColor: "sage" });
});

test("a multi-field fix keeps only the fields that are real changes", () => {
  const out = coerceFixToCategory(
    "brand",
    { bgColor: "sage", textColorId: "jet", logoId: "primary" },
    { bgColor: "sage", textColorId: "whiteSmoke", logoId: "primary" },
  );
  assert.deepEqual(out, { textColorId: "jet" });
});

test("a hierarchy fontSizes fix identical to every current step is stripped", () => {
  const out = coerceFixToCategory(
    "hierarchy",
    { fontSizes: { heading: "l", content: "m" } },
    { fontSizes: { heading: "l", content: "m" } },
  );
  assert.equal(out, null);
});

test("a hierarchy fontSizes fix with one genuine role change survives", () => {
  const out = coerceFixToCategory(
    "hierarchy",
    { fontSizes: { heading: "xl", content: "m" } },
    { fontSizes: { heading: "l", content: "m" } },
  );
  assert.deepEqual(out, { fontSizes: { heading: "xl", content: "m" } });
});

test("a uniform all-up two-role resize is still rejected as incoherent (existing guard, now fed real state)", () => {
  const out = coerceFixToCategory(
    "hierarchy",
    { fontSizes: { heading: "xl", content: "l" } },
    { fontSizes: { heading: "l", content: "m" } },
  );
  assert.equal(out, null);
});

test("composition stays advice-only regardless of state", () => {
  const out = coerceFixToCategory("composition", { bgColor: "sage" }, { bgColor: "butter" });
  assert.equal(out, null);
});

test("missing/empty state (no current-value data) does not crash and treats fields as changed", () => {
  const out = coerceFixToCategory("brand", { bgColor: "sage" }, {});
  assert.deepEqual(out, { bgColor: "sage" });
});
