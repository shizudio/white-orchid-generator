/* ─────────────────────────────────────────────────────────────────────────
   ONE-CLICK IMPROVE — the pure policy (docs/template-system-spec.md §8.1).

   The route (app/api/improve/route.js) is a thin shell over these functions so
   the two hard requirements are testable WITHOUT a paid call:
     1. write within the slot's charBudget  → resolveBudget + normalizeImproved
     2. be revertible, visibly              → the response always carries `original`

   The model is never trusted: whatever it returns goes through fitCopy against
   the budget READ FROM THE BAKED TEMPLATE, not from the request body.
   ───────────────────────────────────────────────────────────────────────── */

import { fitCopy } from './copy-fit.mjs';

/** The budget for a slot, from the template data. Never from the client. */
export function resolveBudget(template, slot) {
  const b = template?.slots?.[slot];
  return b?.present && Number.isInteger(b.charBudget) ? b.charBudget : null;
}

/**
 * The deterministic OFFLINE rewrite. No network, no spend, invents nothing —
 * just tidies spacing/punctuation and sentence-cases the opening. This is what
 * degrades gracefully into place when there is no key.
 */
export function localPolish(text, budget) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const tidy = t
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(?=\S)/g, '$1 ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return fitCopy(tidy.charAt(0).toUpperCase() + tidy.slice(1), budget);
}

/** Strips a model's quoting/preamble habits and ENFORCES the budget. */
export function normalizeImproved(raw, budget) {
  const one = String(raw || '')
    .replace(/^\s*(?:here(?:'s| is)[^:]*:)\s*/i, '')
    .replace(/\s*\n[\s\S]*$/, '')       // first line only — never a menu of options
    .replace(/^["'“‘\s]+|["'”’\s]+$/g, '')
    .trim();
  return fitCopy(one, budget);
}

/** The system prompt. She owns the facts (§8) — the model may invent nothing. */
export function buildImproveSystemPrompt(budget) {
  return [
    'You improve a single line of social copy for a preschool.',
    'RULES, all absolute:',
    `1. The result MUST be at most ${budget} characters.`,
    '2. Invent NOTHING. No dates, names, prices, times or claims that are not already in the input.',
    "3. Keep the writer's meaning and voice. Warm, plain, never salesy.",
    '4. Reply with the improved line ONLY — no quotes, no preamble, no options.',
  ].join('\n');
}
