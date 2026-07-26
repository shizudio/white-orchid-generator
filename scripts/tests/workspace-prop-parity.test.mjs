import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* ── THE WORKSPACE PROP-DROP GUARD (M6, mirrored surfaces) ────────────────────
   `InspectorWorkspace` is fed by a HAND-LISTED object literal in the editor root
   (`<InspectorWorkspace workspace={{ … }}`) and read by a HAND-LISTED destructure
   inside the component. The two lists are mirrored by hand, so a missing key fails
   SILENTLY at parse time and throws at click time — the prop-drop defect class that
   shipped four times (62b3a17 textSurfaceLuminance/hasFrameLayer, 04b7043 the global
   size handlers, 6e78835 liveSceneElements, and the mediaObj/brandKit precedents).

   This test parses `components/Generator.jsx` as TEXT (no JSX runtime, no React) and
   asserts the two key sets are identical in both directions:
     destructured ⊆ provided → the component can never read an undefined key
     provided ⊆ destructured → no dead key is silently passed (drift stays conscious)
   It is fail-closed: if either anchor moves or the parse degrades, the test FAILS and
   tells the maintainer to update it — it never goes silently green. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GENERATOR = path.join(HERE, "..", "..", "components", "Generator.jsx");

// Keys legitimately passed but not destructured today. Empty on purpose: any entry
// here is a deliberate, reviewed exception (add it with a one-line reason), so drift
// is always an edit somebody had to think about.
const ALLOWED_UNUSED = new Set([]);

// The keys whose absence has already shipped as a crash. They must appear on BOTH
// sides forever — a canary that fires if a future refactor drops them again.
const HISTORICAL_BUG_KEYS = [
  "mediaObj",              // the original prop-drop
  "textSurfaceLuminance",  // 62b3a17 — contrast-remedy block threw
  "hasFrameLayer",         // 62b3a17
  "dispatchSizeCommands",  // 04b7043 — the global size control threw
  "setGlobalSize",         // 04b7043
  "pinLegacyFontSize",     // 04b7043
  "clearLegacyFontSizePin",// 04b7043
];

const FIX_HINT =
  "Update scripts/tests/workspace-prop-parity.test.mjs to match the new shape — " +
  "this test is the only thing standing between us and the prop-drop crash class.";

/* Walk from `start` (the first char INSIDE an already-opened brace) to the brace that
   closes it, skipping comments and string/template bodies. Returns the code-only inner
   text plus the index of the closing brace. Brace-depth scanning, not regex: the region
   spans ~35 lines with comments, renames and nested member expressions. */
function scanBalanced(text, start) {
  let depth = 1;
  let out = "";
  let i = start;
  while (i < text.length) {
    const c = text[i];
    const n = text[i + 1];
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c; i++;
      while (i < text.length) {
        if (text[i] === "\\") { out += text[i] + (text[i + 1] ?? ""); i += 2; continue; }
        out += text[i];
        if (text[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (depth === 0) return { body: out, end: i };
    }
    out += c;
    i++;
  }
  return null;
}

// Split a comment-free object/destructure body on TOP-LEVEL commas.
function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      cur += c; i++;
      while (i < body.length) {
        if (body[i] === "\\") { cur += body[i] + (body[i + 1] ?? ""); i += 2; continue; }
        cur += body[i];
        if (body[i] === q) break;
        i++;
      }
      continue;
    }
    if (c === "{" || c === "(" || c === "[") depth++;
    if (c === "}" || c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

/* The key a segment declares: `foo` → foo, `foo:bar.baz` → foo, `foo = 1` → foo.
   Both sides key on the LEFT of the colon — that is the prop name the component reads. */
function keyOfSegment(segment) {
  const t = segment.trim();
  if (!t) return null;
  if (t.startsWith("...")) return "…spread";
  let depth = 0;
  let cut = t.length;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    if (c === "}" || c === ")" || c === "]") depth--;
    if (depth !== 0) continue;
    if (c === ":") { cut = i; break; }
    if (c === "=" && t[i + 1] !== "=" && !["=", "!", "<", ">"].includes(t[i - 1])) { cut = i; break; }
  }
  return t.slice(0, cut).trim();
}

function keysOf(body, label) {
  const keys = splitTopLevel(body).map(keyOfSegment).filter(Boolean);
  assert.ok(keys.length > 0, `[parity] extracted zero keys from the ${label}. ${FIX_HINT}`);
  for (const k of keys) {
    assert.match(
      k,
      /^[A-Za-z_$][A-Za-z0-9_$]*$/,
      `[parity] the ${label} contains a non-identifier entry ${JSON.stringify(k)} ` +
      `(a spread makes parity unprovable). ${FIX_HINT}`
    );
  }
  const set = new Set(keys);
  assert.equal(
    set.size, keys.length,
    `[parity] duplicate key in the ${label}: ` +
    `${keys.filter((k, i) => keys.indexOf(k) !== i).join(", ")}`
  );
  return set;
}

function extractProvided(src) {
  const anchor = "<InspectorWorkspace workspace={{";
  const at = src.indexOf(anchor);
  assert.notEqual(
    at, -1,
    `[parity] could not find the workspace prop opener \`${anchor}\` in components/Generator.jsx. ` +
    `If the component or its call site was renamed, ${FIX_HINT}`
  );
  assert.equal(
    src.indexOf(anchor, at + 1), -1,
    `[parity] more than one \`${anchor}\` call site — the test assumes exactly one. ${FIX_HINT}`
  );
  const scanned = scanBalanced(src, at + anchor.length);
  assert.ok(scanned, `[parity] the workspace prop object literal never closes. ${FIX_HINT}`);
  const after = src.slice(scanned.end + 1, scanned.end + 8);
  assert.match(
    after, /^\s*\}/,
    `[parity] the workspace prop object literal did not close into its JSX container ` +
    `(saw ${JSON.stringify(after)}). ${FIX_HINT}`
  );
  return keysOf(scanned.body, "workspace prop object literal");
}

function extractDestructured(src) {
  const anchor = "function InspectorWorkspace({ workspace }) {";
  const at = src.indexOf(anchor);
  assert.notEqual(
    at, -1,
    `[parity] could not find \`${anchor}\` in components/Generator.jsx. ` +
    `If the component signature changed, ${FIX_HINT}`
  );
  const openAt = src.indexOf("const {", at);
  assert.notEqual(
    openAt, -1,
    `[parity] no \`const {\` destructure follows the InspectorWorkspace signature. ${FIX_HINT}`
  );
  const scanned = scanBalanced(src, openAt + "const {".length);
  assert.ok(scanned, `[parity] the InspectorWorkspace destructure never closes. ${FIX_HINT}`);
  const after = src.slice(scanned.end + 1, scanned.end + 20);
  assert.match(
    after, /^\s*=\s*workspace\s*;/,
    `[parity] the first \`const {\` in InspectorWorkspace is not the workspace destructure ` +
    `(saw ${JSON.stringify(after)}). ${FIX_HINT}`
  );
  return keysOf(scanned.body, "InspectorWorkspace destructure");
}

const SRC = readFileSync(GENERATOR, "utf8");

test("every key InspectorWorkspace destructures is provided by the workspace prop", () => {
  const provided = extractProvided(SRC);
  const destructured = extractDestructured(SRC);
  const missing = [...destructured].filter(k => !provided.has(k)).sort();
  assert.deepEqual(
    missing, [],
    `[parity] InspectorWorkspace reads ${missing.length} key(s) the workspace prop never ` +
    `provides: ${missing.join(", ")}. They are \`undefined\` at runtime and throw at click ` +
    `time (the prop-drop class: 62b3a17, 04b7043, 6e78835). Add them to the ` +
    `\`<InspectorWorkspace workspace={{ … }}\` object in components/Generator.jsx.`
  );
});

test("the workspace prop passes no key InspectorWorkspace does not read", () => {
  const provided = extractProvided(SRC);
  const destructured = extractDestructured(SRC);
  const dead = [...provided].filter(k => !destructured.has(k) && !ALLOWED_UNUSED.has(k)).sort();
  assert.deepEqual(
    dead, [],
    `[parity] the workspace prop passes ${dead.length} key(s) InspectorWorkspace never ` +
    `destructures: ${dead.join(", ")}. Either read them, drop them, or add them to ` +
    `ALLOWED_UNUSED with a reason in scripts/tests/workspace-prop-parity.test.mjs.`
  );
  const staleAllowance = [...ALLOWED_UNUSED].filter(k => !provided.has(k) || destructured.has(k)).sort();
  assert.deepEqual(
    staleAllowance, [],
    `[parity] ALLOWED_UNUSED lists ${staleAllowance.join(", ")}, which is no longer a ` +
    `dead key — remove the stale allowance so the guard keeps its teeth.`
  );
});

test("the keys that already shipped as crashes ride both sides (canary)", () => {
  const provided = extractProvided(SRC);
  const destructured = extractDestructured(SRC);
  for (const key of HISTORICAL_BUG_KEYS) {
    assert.ok(
      provided.has(key),
      `[parity] canary: \`${key}\` fell out of the workspace prop object — this exact key ` +
      `already shipped as a crash once.`
    );
    assert.ok(
      destructured.has(key),
      `[parity] canary: \`${key}\` fell out of the InspectorWorkspace destructure — this exact ` +
      `key already shipped as a crash once. If the panel genuinely stopped needing it, drop it ` +
      `from HISTORICAL_BUG_KEYS in the same commit, deliberately.`
    );
  }
});

test("the parity extraction is fail-closed, not vacuously green", () => {
  // A rename that silently produced empty sets would make every assertion above pass.
  // Anchor the extraction to a realistic floor instead.
  const provided = extractProvided(SRC);
  const destructured = extractDestructured(SRC);
  assert.ok(
    provided.size >= 80,
    `[parity] only ${provided.size} keys parsed out of the workspace prop — the scanner is ` +
    `probably reading the wrong region. ${FIX_HINT}`
  );
  assert.ok(
    destructured.size >= 80,
    `[parity] only ${destructured.size} keys parsed out of the InspectorWorkspace destructure — ` +
    `the scanner is probably reading the wrong region. ${FIX_HINT}`
  );
  assert.equal(provided.size - ALLOWED_UNUSED.size, destructured.size);
});
