import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FONTS, DEFAULT_TYPOGRAPHY_CONFIG } from "../../lib/brand-defaults.js";
import {
  resolveTypographyConfig,
  sanctionedRegistersForClass,
  isRegisterSanctionedForClass,
  registerFontRole,
  registerFace,
  registerWeightRange,
  FONT_ROLE_TO_F_KEY,
  SANCTIONED_REGISTERS,
  isSanctionedRegister,
} from "../../lib/typography-config.mjs";

// ── MIRROR CANON: SANCTIONED_REGISTERS is the literal source for the eleventh mirrored
// surface; it must stay 1:1 with the actual DEFAULT_TYPOGRAPHY_CONFIG.registers keys. ──
test("SANCTIONED_REGISTERS matches DEFAULT_TYPOGRAPHY_CONFIG.registers keys (canonical parity)", () => {
  assert.deepEqual([...SANCTIONED_REGISTERS].sort(), Object.keys(DEFAULT_TYPOGRAPHY_CONFIG.registers).sort());
  assert.equal(isSanctionedRegister("serif"), true);
  assert.equal(isSanctionedRegister("comic-sans"), false);
  assert.equal(isSanctionedRegister(null), false);
});

// The White Orchid F map applyBrandKit builds (Generator: title=serif, body=Fira, subtitle=Syne).
const F = { ...DEFAULT_FONTS };

// ── IDENTITY: the default config reproduces today's hardcoded solver registers EXACTLY ──
// element-placement-solver make*Class ladders reference: serif/date → F.title, heavySans/
// eyebrow/badge → F.subtitle, support(sub/body) → F.body. The config must resolve to the
// same faces so wiring it in later is byte-identical (fingerprint 144/144 stays green).
test("default config — register → face identity with today's hardcoded solver faces", () => {
  const cfg = DEFAULT_TYPOGRAPHY_CONFIG;
  assert.equal(registerFace(cfg, "serif", F), F.title, "serif (hero/date) must paint F.title");
  assert.equal(registerFace(cfg, "heavySans", F), F.subtitle, "heavySans must paint F.subtitle");
  assert.equal(registerFace(cfg, "body", F), F.body, "support register must paint F.body");
  assert.equal(registerFace(cfg, "eyebrow", F), F.subtitle, "eyebrow must paint F.subtitle");
  assert.equal(registerFace(cfg, "badge", F), F.subtitle, "badge pill must paint F.subtitle");
});

test("default config — font roles map to the canvas F keys applyBrandKit hydrates", () => {
  assert.equal(FONT_ROLE_TO_F_KEY.heading, "title");
  assert.equal(FONT_ROLE_TO_F_KEY.body, "body");
  assert.equal(FONT_ROLE_TO_F_KEY.ui, "subtitle");
  assert.equal(registerFontRole(DEFAULT_TYPOGRAPHY_CONFIG, "serif"), "heading");
  assert.equal(registerFontRole(DEFAULT_TYPOGRAPHY_CONFIG, "badge"), "ui");
});

// ── ALLOWLISTS: each class's sanctioned registers match its current 1:1 solver binding ──
test("default config — class register allowlists match the sanctioned solver bindings", () => {
  const cfg = DEFAULT_TYPOGRAPHY_CONFIG;
  assert.deepEqual(sanctionedRegistersForClass(cfg, "heading"), ["serif", "heavySans"]);
  assert.deepEqual(sanctionedRegistersForClass(cfg, "subheading"), ["body"]);
  assert.deepEqual(sanctionedRegistersForClass(cfg, "body"), ["body"]);
  assert.deepEqual(sanctionedRegistersForClass(cfg, "caption"), ["serif", "eyebrow"]);
  assert.deepEqual(sanctionedRegistersForClass(cfg, "cta"), ["badge"]);
});

test("isRegisterSanctionedForClass — gate is the class allowlist, unknown pairs are false", () => {
  const cfg = DEFAULT_TYPOGRAPHY_CONFIG;
  assert.equal(isRegisterSanctionedForClass(cfg, "heading", "heavySans"), true);
  assert.equal(isRegisterSanctionedForClass(cfg, "heading", "body"), false, "heading may not use body");
  assert.equal(isRegisterSanctionedForClass(cfg, "cta", "serif"), false, "cta is badge-only");
  assert.equal(isRegisterSanctionedForClass(cfg, "nonsense", "serif"), false);
});

test("default config — weight ranges match the sanctioned ladder spans", () => {
  const cfg = DEFAULT_TYPOGRAPHY_CONFIG;
  assert.deepEqual(registerWeightRange(cfg, "serif"), [300, 700]);
  assert.deepEqual(registerWeightRange(cfg, "heavySans"), [700, 800]);
  assert.deepEqual(registerWeightRange(cfg, "badge"), [600, 600]);
});

// ── INTEGRITY: every register resolves to a valid role; every allowlist entry is in-vocab ──
test("default config — self-consistent (registers use valid roles, allowlists in-vocab)", () => {
  const cfg = resolveTypographyConfig(DEFAULT_TYPOGRAPHY_CONFIG);
  const known = new Set(Object.keys(cfg.registers));
  for (const def of Object.values(cfg.registers)) {
    assert.ok(FONT_ROLE_TO_F_KEY[def.role], `register role '${def.role}' must be a known F role`);
  }
  for (const [cls, list] of Object.entries(cfg.classRegisters)) {
    assert.ok(list.length > 0, `class ${cls} must have >=1 choosable register`);
    for (const r of list) assert.ok(known.has(r), `class ${cls} references unknown register '${r}'`);
  }
});

// ── GRACEFUL DEGRADATION: missing/partial/garbage config → the White Orchid default ──
test("resolveTypographyConfig — null/undefined/garbage degrade to the default (never throws)", () => {
  for (const bad of [null, undefined, 42, "x", [], { registers: 7 }]) {
    const cfg = resolveTypographyConfig(bad);
    assert.deepEqual(sanctionedRegistersForClass(cfg, "heading"), ["serif", "heavySans"]);
    assert.equal(registerFace(cfg, "serif", F), F.title);
  }
});

test("resolveTypographyConfig — a partial override keeps unspecified registers/classes at default", () => {
  // brand overrides only heading's allowlist; everything else must survive.
  const cfg = resolveTypographyConfig({ classRegisters: { heading: ["serif"] } });
  assert.deepEqual(sanctionedRegistersForClass(cfg, "heading"), ["serif"], "override wins");
  assert.deepEqual(sanctionedRegistersForClass(cfg, "caption"), ["serif", "eyebrow"], "untouched class defaults");
  assert.equal(registerFace(cfg, "heavySans", F), F.subtitle, "untouched register defaults");
});

test("resolveTypographyConfig — an unknown register in an allowlist is filtered out", () => {
  const cfg = resolveTypographyConfig({ classRegisters: { heading: ["serif", "phantom"] } });
  assert.deepEqual(sanctionedRegistersForClass(cfg, "heading"), ["serif"]);
});

test("resolveTypographyConfig — an empty allowlist degrades to the sanctioned default (never zero)", () => {
  const cfg = resolveTypographyConfig({ classRegisters: { heading: [], subheading: ["phantom"] } });
  assert.deepEqual(sanctionedRegistersForClass(cfg, "heading"), ["serif", "heavySans"]);
  assert.deepEqual(sanctionedRegistersForClass(cfg, "subheading"), ["body"]);
});

test("resolveTypographyConfig — a valid register role override re-points the face", () => {
  // a brand points its 'serif' register at the body role instead — the face follows.
  const cfg = resolveTypographyConfig({ registers: { serif: { role: "body" } } });
  assert.equal(registerFace(cfg, "serif", F), F.body, "re-pointed register paints the new role's face");
  assert.deepEqual(registerWeightRange(cfg, "serif"), [300, 700], "unspecified weightRange keeps default");
});

test("resolveTypographyConfig — an invalid role override is ignored (keeps default role)", () => {
  const cfg = resolveTypographyConfig({ registers: { serif: { role: "not-a-role" } } });
  assert.equal(registerFontRole(cfg, "serif"), "heading");
});

test("registerFace — null-safe when F is missing keys (falls back to a real body face)", () => {
  // empty F: serif → heading role → no title key → falls back to the default body face.
  assert.equal(registerFace(DEFAULT_TYPOGRAPHY_CONFIG, "serif", {}), DEFAULT_FONTS.body);
  assert.equal(registerFace(DEFAULT_TYPOGRAPHY_CONFIG, "serif", null), DEFAULT_FONTS.body);
  // body-only F: serif (heading role, no title key) falls back to that F's body face.
  assert.equal(registerFace(DEFAULT_TYPOGRAPHY_CONFIG, "serif", { body: F.body }), F.body);
});

// ── NON-MUTATION: resolving never mutates the shared default ──
test("resolveTypographyConfig — does not mutate DEFAULT_TYPOGRAPHY_CONFIG", () => {
  const before = JSON.stringify(DEFAULT_TYPOGRAPHY_CONFIG);
  resolveTypographyConfig({ classRegisters: { heading: ["serif"] }, registers: { serif: { role: "body" } } });
  assert.equal(JSON.stringify(DEFAULT_TYPOGRAPHY_CONFIG), before);
});
