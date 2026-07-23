// Typography config resolver — brand-configurable registers (Font Ruling B, 2026-07-23).
//
// docs/text-elements-spec.md §9 (Font Ruling B). The ruling: fonts become flexible THROUGH
// the register system, not around it. The brand PROFILE (brand_kit.typography_config, with
// lib/brand-defaults.js DEFAULT_TYPOGRAPHY_CONFIG as the code fallback) owns:
//   registers      — register name → { role, weightRange }; `role` names a brand font role
//                    (heading|body|ui) that hydrates the canvas F map (title|body|subtitle).
//   classRegisters — element class → the registers that class is allowed to use (the
//                    per-element register switch's allowlist).
//
// This module is PURE (no React, no DOM, no brand literals beyond the imported default): it
// normalizes a raw config with graceful degradation (missing column/row/field → the White
// Orchid default, never a throw — the sessions/templates retry-ladder contract), and answers
// the two runtime questions the solver + inspector ask: "which face does this register
// paint?" (registerFace, given the injected F) and "which registers may this class choose?"
// (sanctionedRegistersForClass). It deliberately does NOT rewrite the escalation ladders —
// wiring registerFace into element-placement-solver's make*Class builders is the render-
// identity-bearing follow-up; until then this is additive data (fingerprint-invisible).

import { DEFAULT_TYPOGRAPHY_CONFIG, DEFAULT_FONTS } from "./brand-defaults.js";

// Brand font ROLE → the canvas F map key it hydrates (applyBrandKit: font_heading→F.title,
// font_body→F.body, font_ui→F.subtitle). This binding is about the F object's shape, not a
// brand fact, so it lives with the resolver. Unknown roles fall back to the body key.
export const FONT_ROLE_TO_F_KEY = Object.freeze({
  heading: "title",
  body: "body",
  ui: "subtitle",
});
const FONT_ROLES = Object.freeze(Object.keys(FONT_ROLE_TO_F_KEY));

// The sanctioned register vocabulary — the closed set of named typographic voices a brand
// profile and an element may reference. MIRRORS the keys of DEFAULT_TYPOGRAPHY_CONFIG.registers
// (lib/brand-defaults.js) 1:1, and is the CANONICAL source for the register mirror surfaces:
// lib/text-elements.mjs ELEMENT_REGISTERS, design-patch PATCH_OPTIONS.register, and the
// assistant route's ELEMENT_REGISTERS (the eleventh mirrored surface — run mirror-check.sh
// after any edit). Kept as a literal (not derived) so the mirror-check parser can read it; a
// unit test asserts parity with the DEFAULT_TYPOGRAPHY_CONFIG.registers keys.
export const SANCTIONED_REGISTERS = Object.freeze(["serif", "heavySans", "body", "eyebrow", "badge"]);
const SANCTIONED_REGISTER_SET = new Set(SANCTIONED_REGISTERS);
export const isSanctionedRegister = value => SANCTIONED_REGISTER_SET.has(value);

const isObject = value => !!value && typeof value === "object" && !Array.isArray(value);
const finite = value => Number.isFinite(value);

// A sane 2-tuple weight range; degrades a malformed range to the default register's range.
function normalizeWeightRange(range, fallback) {
  if (Array.isArray(range) && range.length === 2 && range.every(finite) && range[0] <= range[1]) {
    return [range[0], range[1]];
  }
  return Array.isArray(fallback) ? [fallback[0], fallback[1]] : [400, 700];
}

/**
 * Normalize a raw typography_config (from brand_kit or elsewhere) into a complete, valid
 * config. Graceful degradation is total: any missing/malformed piece falls back to the White
 * Orchid default, so a brand with no config, a partial config, or garbage renders exactly
 * today's registers instead of throwing. Never mutates the input or the default.
 *
 *   - registers: every DEFAULT register is present; a brand may override role/weightRange of
 *     a known register but cannot invent a register the code doesn't understand (unknown
 *     register keys are dropped — the render side only knows the sanctioned set).
 *   - classRegisters: every sanctioned class is present; a brand's allowlist is filtered to
 *     registers that actually resolve, and an empty/absent list degrades to the default's.
 */
export function resolveTypographyConfig(raw) {
  const src = isObject(raw) ? raw : {};
  const srcRegisters = isObject(src.registers) ? src.registers : {};
  const srcClasses = isObject(src.classRegisters) ? src.classRegisters : {};

  const registers = {};
  for (const [name, def] of Object.entries(DEFAULT_TYPOGRAPHY_CONFIG.registers)) {
    const override = isObject(srcRegisters[name]) ? srcRegisters[name] : {};
    const role = FONT_ROLES.includes(override.role) ? override.role : def.role;
    registers[name] = {
      role,
      weightRange: normalizeWeightRange(override.weightRange, def.weightRange),
    };
  }
  const knownRegisters = new Set(Object.keys(registers));

  const classRegisters = {};
  for (const [className, defList] of Object.entries(DEFAULT_TYPOGRAPHY_CONFIG.classRegisters)) {
    const raw = Array.isArray(srcClasses[className]) ? srcClasses[className] : null;
    const filtered = raw ? raw.filter(r => knownRegisters.has(r)) : null;
    // A brand allowlist must be non-empty and in-vocab to win; else the class keeps its
    // sanctioned default (a class can never be left with zero choosable registers).
    classRegisters[className] = filtered && filtered.length
      ? Array.from(new Set(filtered))
      : defList.slice();
  }

  return { registers, classRegisters };
}

/** The registers a class may choose, per a (raw or resolved) config. Unknown class → []. */
export function sanctionedRegistersForClass(config, className) {
  const resolved = config && config.classRegisters && config.registers ? config : resolveTypographyConfig(config);
  const list = resolved.classRegisters[className];
  return Array.isArray(list) ? list.slice() : [];
}

/** True when `register` is a sanctioned choice for `className` under this config. */
export function isRegisterSanctionedForClass(config, className, register) {
  return sanctionedRegistersForClass(config, className).includes(register);
}

/**
 * The font-role a register paints (heading|body|ui), per a (raw or resolved) config.
 * Unknown register → the body role (the most robust reading face).
 */
export function registerFontRole(config, register) {
  const resolved = config && config.registers ? config : resolveTypographyConfig(config);
  const def = resolved.registers[register];
  return def ? def.role : "body";
}

/**
 * The actual font face string a register paints, given the injected brand fonts F
 * (Generator's F map: {title, body, subtitle, ...}). This is the render binding the solver's
 * class builders will consult instead of hardcoding F.title / F.subtitle / F.body. Null-safe:
 * an unknown register or a missing F key falls back to F.body (then the default body face).
 */
export function registerFace(config, register, F) {
  const fonts = isObject(F) ? F : {};
  const key = FONT_ROLE_TO_F_KEY[registerFontRole(config, register)] || "body";
  return fonts[key] || fonts.body || DEFAULT_FONTS.body;
}

/** The sanctioned [min,max] weight range for a register. Unknown → the body register's. */
export function registerWeightRange(config, register) {
  const resolved = config && config.registers ? config : resolveTypographyConfig(config);
  const def = resolved.registers[register] || resolved.registers.body;
  return def.weightRange.slice();
}
