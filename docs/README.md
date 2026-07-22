# Documentation map

The current implementation contract is, in precedence order:

1. `design-layer-contract.md` — canonical layer taxonomy, cross-layer ownership,
   collisions, constraints, pins and validation policy.
2. `refactor-prd.md` — canonical editor state, command, render, audit, and persistence architecture.
3. `ux-architecture.md` — current product surfaces and interaction laws.
4. `copy-fit-spec.md`, `advice-ledger-spec.md`, `element-placement-spec.md`, and
   `format-design-spec.md` — active subsystem contracts.

Executable counterparts to the Design Layer Contract live in `lib/`:

- `design-layer-contract.mjs` — stable layer, ownership and rule vocabulary;
- `layout-contract.mjs` and `layout-constraints.mjs` — semantic zones and shared
  preflight/post-render relationships;
- `content-typography-contract.mjs` — authored-role, readable-size and editorial-gap
  rules;
- `constraint-remedies.mjs` — explicit, typed and undoable user-approved repairs;
- `decoration-contract.mjs` and `decoration-paint-intersection.mjs` — decoration
  ownership, approval/density/color budgets and alpha-aware visible-paint evidence;
- `render-constraint-measurements.mjs` — conversion of canvas truth into contract
  evidence;
- `readiness-policy.mjs` and `advisor-action-policy.mjs` — separate readiness domains
  and guaranteed direct-edit fallbacks for blocking findings;
- `media-logo-contract.mjs`, `logo-placement-policy.mjs`,
  `surface-contract.mjs`, and `surface-contrast-policy.mjs` — media coverage,
  official brand-mark placement, composed-surface order and legibility rules shared by
  live preview, export and validation.

Research, critique, composition studies, learning passes, and dated audits are historical
inputs. They explain decisions but do not override the current PRD or UX architecture.
Documents whose header says **Superseded** must not be used as selector or UI truth.

## Proposed platform direction

The following documents are proposals awaiting explicit product ratification. They do not
yet override the implementation contracts above:

- `product-platform-audit-2026-07-21.md` — current-state audit, target architecture and
  three-phase roadmap for the AI-native brand platform.
- `engineering-principles.md` — proposed coding, architecture, security, AI and quality
  charter for that platform.
