// ── ACTIVITY VISION BATCH ENGINE (client ruling 2026-08-03) ──────────────────
// The pure, node-testable half of app/api/images/categorize: batch selection,
// idempotency, per-image failure isolation, and the response shape. The route
// injects the real I/O (labelImage → OpenAI vision, saveActivity → Supabase
// update); tests inject mocks — the OpenAI call is NEVER exercised from tests
// (money law).
//
// ZERO-BRAND-FACTS LAW: the prompt asks for a short GENERIC activity label —
// no school/childcare vocabulary, no brand facts. Whatever the model answers is
// canonicalized by lib/activity-labels.mjs (pure string logic).

import { normalizeActivityLabel } from './activity-labels.mjs';

export const VISION_MODEL = 'gpt-4o-mini';

// detail:"low" + tiny max_tokens keeps a full-library pass in cent territory.
export const ACTIVITY_VISION_PROMPT = [
  'Name the activity shown in this image: what are the people or main subjects doing?',
  'Reply with ONLY a short lowercase label of 1 to 3 words, like "painting together" or "outdoor play".',
  'If there are no people, describe what the scene is in 1 to 3 words.',
  'No sentences, no punctuation, no quotes — just the label.',
].join(' ');

export const DEFAULT_BATCH_LIMIT = 10;
export const MAX_BATCH_LIMIT = 10; // serverless time budget: ≤10 vision calls/request

export function clampBatchLimit(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH_LIMIT;
  return Math.min(n, MAX_BATCH_LIMIT);
}

// A row is a candidate only when it carries NO activity yet. Already-labeled
// rows (model or owner) are never re-labeled — idempotent by construction, and
// the pins law falls out: an owner label blocks the categorizer forever.
export function selectUnlabeled(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row => {
    const activity = row?.metadata?.activity;
    if (!activity) return true;
    if (activity.authorship === 'owner') return false; // pinned, even if odd
    return !normalizeActivityLabel(activity.label);
  });
}

// Run one batch. deps:
//   rows         — [{ id, storage_path, filename, metadata }] (ALL rows; we filter)
//   limit        — requested batch size (clamped 1..MAX_BATCH_LIMIT)
//   labelImage   — async row → raw label text (throws on failure)
//   saveActivity — async (row, activity) → void (throws on failure)
//   model, now   — optional overrides for provenance/timestamps
// One image failing (vision OR save) skips that image — named in `skipped` —
// and NEVER aborts the batch. `remaining` counts unlabeled rows beyond this
// batch, so a permanently-failing image can't loop the client forever: once
// everything left fits in one batch, remaining is 0 and the client stops.
export async function runCategorizeBatch({ rows, limit, labelImage, saveActivity, model = VISION_MODEL, now = () => new Date() }) {
  const unlabeled = selectUnlabeled(rows);
  const batch = unlabeled.slice(0, clampBatchLimit(limit));
  const labeled = [];
  const skipped = [];

  for (const row of batch) {
    let raw;
    try {
      raw = await labelImage(row);
    } catch (err) {
      skipped.push({ id: row.id, filename: row.filename || null, reason: String(err?.message || err || 'vision failed') });
      continue;
    }
    const label = normalizeActivityLabel(raw);
    if (!label) {
      skipped.push({ id: row.id, filename: row.filename || null, reason: 'model returned no usable label' });
      continue;
    }
    const activity = {
      label,
      raw: String(raw ?? '').slice(0, 120),
      model,
      labeledAt: now().toISOString(),
    };
    try {
      await saveActivity(row, activity);
      labeled.push({ id: row.id, label });
    } catch (err) {
      skipped.push({ id: row.id, filename: row.filename || null, reason: String(err?.message || err || 'save failed') });
    }
  }

  const remaining = Math.max(0, unlabeled.length - batch.length);
  return {
    total: unlabeled.length,          // unlabeled at the start of THIS request
    processed: batch.length,
    labeled,                          // [{ id, label }]
    labels: [...new Set(labeled.map(l => l.label))],
    skipped,                          // [{ id, filename, reason }] — left unlabeled
    remaining,
    done: remaining === 0,
  };
}
