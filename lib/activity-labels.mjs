// ── ACTIVITY LABELS (client ruling 2026-08-03) ───────────────────────────────
// "detect what is the activity within the images and help categorize."
// Each image may carry metadata.activity = { label, raw, model, labeledAt } —
// written by the vision categorizer (app/api/images/categorize) or by the owner
// ("Change group" → authorship:'owner'; pins law — owner labels are never
// overwritten by a future categorize run).
//
// ZERO-BRAND-FACTS LAW: nothing here knows what a school, brand, or activity
// vocabulary looks like. Labels are freeform model/owner text; this module only
// applies GENERIC string normalization (trim/lowercase/punctuation/word-cap)
// and merges near-duplicate labels by token-overlap similarity — pure string
// logic, no AI, no domain word lists.

const LEADING_ARTICLES = new Set(['a', 'an', 'the']);

// Canonicalize a freeform label: lowercase, strip punctuation/quotes, collapse
// whitespace, drop a leading article, cap at 3 words. '' means "no usable label"
// (callers treat it as unlabeled — never invent a group for junk).
export function normalizeActivityLabel(raw) {
  if (raw == null) return '';
  const cleaned = String(raw)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ') // keep letters/digits/hyphens only
    .replace(/\s+/g, ' ')
    .trim();
  let words = cleaned.split(' ').filter(Boolean);
  if (words.length > 1 && LEADING_ARTICLES.has(words[0])) words = words.slice(1);
  return words.slice(0, 3).join(' ');
}

// Naive singular-ish stem for COMPARISON only (display keeps the real label):
// 'kids'→'kid', 'activities'→'activity'. Generic English morphology, no vocab.
function stemToken(token) {
  const t = String(token || '');
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !t.endsWith('us')) return t.slice(0, -1);
  return t;
}

function tokenSet(label) {
  return new Set(String(label).split(' ').map(stemToken).filter(Boolean));
}

// Two labels belong to one group when (a) one's tokens are a subset of the
// other's ("painting" ~ "children painting"), or (b) they share a gerund — the
// activity word itself ("kids painting" ~ "children painting" via 'painting').
// Sharing only a subject word ("children painting" vs "children reading") does
// NOT merge — same people, different activity.
export function labelsAlike(a, b) {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return false;
  const shared = [...A].filter(t => B.has(t));
  if (shared.length === A.size || shared.length === B.size) return true;
  return shared.some(t => t.length >= 5 && t.endsWith('ing'));
}

export const NOT_CATEGORIZED_KEY = '__not_categorized__';
export const NOT_CATEGORIZED_LABEL = 'Not categorized yet';

export function imageActivityLabel(img) {
  return normalizeActivityLabel(img?.metadata?.activity?.label);
}

// Group images by DETECTED activity (the client's clarified meaning of
// "by activity" — content, not session lineage; lineage stays recorded on the
// rows). Near-duplicate labels merge (union-find over labelsAlike); each merged
// group displays its most-populated member label (ties → shorter, then A-Z).
// Order: biggest groups first (ties → newest first); newest image first within
// each group; one honest "Not categorized yet" group last for unlabeled rows.
export function groupImagesByActivity(images) {
  const byLabel = new Map(); // normalized label → items
  const unlabeled = [];
  for (const img of Array.isArray(images) ? images : []) {
    const label = imageActivityLabel(img);
    if (!label) { unlabeled.push(img); continue; }
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(img);
  }

  // Union-find over the distinct labels.
  const labels = [...byLabel.keys()];
  const parent = labels.map((_, i) => i);
  const find = i => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (i, j) => { const a = find(i), b = find(j); if (a !== b) parent[b] = a; };
  for (let i = 0; i < labels.length; i += 1) {
    for (let j = i + 1; j < labels.length; j += 1) {
      if (labelsAlike(labels[i], labels[j])) union(i, j);
    }
  }

  const clusters = new Map(); // root index → [{ label, items }]
  labels.forEach((label, i) => {
    const root = find(i);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root).push({ label, items: byLabel.get(label) });
  });

  const newestOf = items => items.reduce((t, i) => Math.max(t, Date.parse(i?.created_at) || 0), 0);
  const byNewest = (a, b) => (Date.parse(b?.created_at) || 0) - (Date.parse(a?.created_at) || 0);

  const groups = [...clusters.values()].map(members => {
    const display = [...members].sort((m, n) =>
      n.items.length - m.items.length
      || m.label.length - n.label.length
      || m.label.localeCompare(n.label))[0].label;
    const items = members.flatMap(m => m.items).sort(byNewest);
    return { key: display, label: display, categorized: true, newestAt: newestOf(items), items };
  }).sort((a, b) => b.items.length - a.items.length || b.newestAt - a.newestAt);

  if (unlabeled.length) {
    groups.push({
      key: NOT_CATEGORIZED_KEY,
      label: NOT_CATEGORIZED_LABEL,
      categorized: false,
      newestAt: newestOf(unlabeled),
      items: [...unlabeled].sort(byNewest),
    });
  }
  return groups;
}
