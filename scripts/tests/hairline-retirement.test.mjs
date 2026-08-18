import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* ── HAIRLINE RETIREMENT GUARD (task #71, client ruling 2026-08-18) ────────────
   "remove the hairline decoration all together." The hairline furniture types
   ("rule" — the horizontal divider under editorial_split's copy block — and
   "underline" — the short rule under an eyebrow/label) are retired across the
   WHOLE design system: no archetype authors one and no painter path can draw
   one. Following the workspace-prop-parity precedent, this test parses
   `components/Generator.jsx` as TEXT (the catalog lives in a client component)
   and fails closed if either form ever returns.

   Deliberately OUT of scope: schedule_tile's row separators (special:
   "scheduleRows") — functional table rules between time rows, part of the
   schedule content itself, not a decoration; kept by design. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR = path.join(HERE, "..", "..", "components", "Generator.jsx");
const src = readFileSync(GENERATOR, "utf8");

test("no archetype authors hairline furniture (type rule/underline)", () => {
  assert.equal((src.match(/type\s*:\s*["']rule["']/g) || []).length, 0,
    'found a furniture item with type:"rule" — the hairline rule is retired (client ruling 2026-08-18)');
  assert.equal((src.match(/type\s*:\s*["']underline["']/g) || []).length, 0,
    'found a furniture item with type:"underline" — the hairline underline is retired (client ruling 2026-08-18)');
});

test("the furniture painter has no rule/underline draw path", () => {
  // The old drawFurniture branch tested `it.type==="rule"||it.type==="underline"`.
  assert.equal((src.match(/it\.type\s*===\s*["']rule["']/g) || []).length, 0,
    "drawFurniture still branches on the retired rule type");
  assert.equal((src.match(/it\.type\s*===\s*["']underline["']/g) || []).length, 0,
    "drawFurniture still branches on the retired underline type");
});

test("the surviving furniture vocabulary is intact (index / counterweight / badge)", () => {
  // Guards against an over-zealous cleanup: the non-hairline tells must remain.
  assert.ok(/type\s*:\s*["']index["']/.test(src), "index furniture disappeared");
  assert.ok(/type\s*:\s*["']counterweight["']/.test(src), "counterweight furniture disappeared");
  assert.ok(/type\s*:\s*["']badge["']/.test(src), "badge furniture disappeared");
  // The schedule tile's functional row separators stay (kept by design).
  assert.ok(/scheduleRows/.test(src), "scheduleRows special disappeared");
});
