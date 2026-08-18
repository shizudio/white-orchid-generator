/* ─────────────────────────────────────────────────────────────────────────
   ONE-CLICK IMPROVE — docs/template-system-spec.md §8.1.

     "She writes the caption first; AI only improves it. She owns the facts, so
      the hallucinated-date/name class disappears entirely."

   Two hard requirements, both enforced SERVER-SIDE so the client cannot skip them:
     1. It must write WITHIN the slot's charBudget. The model is told the budget
        AND the result is passed through fitCopy() regardless — a model that
        ignores the instruction cannot re-open overflow through the front door.
     2. It must be revertible, visibly. The response always echoes `original`,
        and the surface shows it alongside with a one-tap undo.

   GRACEFUL DEGRADATION (operating-manual §4): no key, no network, a model error
   — all return { configured:false } with an honest reason at HTTP 200. Never a
   500, never a dead end.

   MONEY LAW: this is the only paid call in the user app. `WO_IMPROVE_MOCK=1`
   short-circuits it to a deterministic local rewrite so tests and verification
   runs spend nothing; the resident-tester convention of unsetting the key works
   too (it degrades to the honest unconfigured note).
   ───────────────────────────────────────────────────────────────────────── */

import { templateById } from '@/lib/templates/index.mjs';
import { buildImproveSystemPrompt, localPolish, normalizeImproved, resolveBudget } from '@/lib/improve-policy.mjs';

export const runtime = 'nodejs';
export const maxDuration = 20;

const MAX_INPUT = 2000;

function ok(body) { return Response.json({ configured: true, ...body }); }
function unconfigured(reason, original) {
  // Honest, retryable, never a dead end (law 6).
  return Response.json({ configured: false, reason, original, improved: null });
}

export async function POST(request) {
  let payload;
  try { payload = await request.json(); } catch { payload = null; }

  const original = String(payload?.text ?? '').slice(0, MAX_INPUT);
  const slot = String(payload?.slot ?? '');
  const templateId = String(payload?.templateId ?? '');

  if (!original.trim()) return unconfigured('nothing to improve yet — write a line first', original);

  // The budget is read from the BAKED TEMPLATE, never from the client, so a
  // tampered request cannot widen it (§8.1 requirement 1).
  const budget = resolveBudget(templateById(templateId), slot);
  if (!Number.isInteger(budget)) return unconfigured('unknown slot for this template', original);

  // MONEY LAW: the mock path never touches the network.
  if (process.env.WO_IMPROVE_MOCK === '1') {
    return ok({ original, improved: localPolish(original, budget), source: 'mock', budget });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({
      configured: false,
      reason: 'Improve needs an AI key, which is not set up here. Your words are unchanged.',
      original, improved: null,
      fallback: localPolish(original, budget), // an honest offline tidy she can take or leave
    });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.4,
        max_tokens: 200,
        messages: [
          { role: 'system', content: buildImproveSystemPrompt(budget) },
          { role: 'user', content: original },
        ],
      }),
    });
    if (!res.ok) return unconfigured(`the writing service answered ${res.status} — your words are unchanged`, original);
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') return unconfigured('the writing service sent nothing back — your words are unchanged', original);
    // Requirement 1, enforced regardless of what the model did.
    const improved = normalizeImproved(raw, budget);
    if (!improved) return unconfigured('the rewrite came back empty — your words are unchanged', original);
    return ok({ original, improved, source: 'model', budget });
  } catch (err) {
    return unconfigured('could not reach the writing service — your words are unchanged', original);
  }
}
