// ── PROPOSAL ENGINE — moodboard patterns → a proposed template (P2) ───────────
// docs/moodboard-templates-spec.md §3 (pattern ledger) + §4 (synthesis) + the
// four binding laws. Invoked by the nightly learning pass (scripts/learning-pass.js).
//
// WHAT IT DOES
//  1. buildPatternLedger() — mines the classified moodboard genes into device /
//     palette / register / density frequencies, marks which devices are already
//     EXPRESSIBLE with brand archetypes, and finds the strongest UNDER-SERVED
//     cluster (frequent on the moodboard, not yet reflected in what's hearted).
//  2. planProposal() — composes a COMPLETE, render-ready template state for that
//     cluster from REAL brand elements only (real archetype, real palette token,
//     real register/treatment), plus a one-paragraph rationale that names the
//     actual source moodboard ids. Nothing is fabricated (law: only real assets).
//  3. precheckProposalState() — the BORN-CLEAN PRECHECK for P2: validates the
//     composed state against PATCH_OPTIONS enums + archetype existence and marks
//     needsRenderCheck:true. It does NOT render a canvas server-side — the real
//     6-format render verification (born-clean law) is P3's job.
//  4. synthesizeProposalRun() — the DB orchestration: respects
//     PROPOSAL_COOLDOWN_DAYS (5, stamped on the last machine-proposed row) and the
//     ONE-pending-proposal limit; inserts a status:'proposed' row (or dry-runs).
//
// GRACEFUL: every DB touch is guarded; a missing table/column/env yields a
// {configured:false}-shaped skip, never a throw.

import {
  DEVICE_TO_ARCHETYPES, PALETTE_CLASS_TO_BG, isDeviceExpressible,
  COMPOSITION_DEVICES, PALETTE_CLASSES, TYPE_REGISTERS, DENSITY_CLASSES,
} from '@/lib/moodboard-genes';
import { PATCH_OPTIONS } from '@/lib/design-patch';

const BRAND_ID = '00000000-0000-0000-0000-000000000001';
export const PROPOSAL_COOLDOWN_DAYS = 5;   // min days between autonomous proposals (spec §4 knob)
export const PENDING_PROPOSAL_LIMIT = 1;   // never more than one awaiting review (spec §5 knob)
const MOODBOARD_SCAN = 200;                // rows the synthesizer reasons over
const DAY_MS = 24 * 60 * 60 * 1000;

// Valid heroRegister values the render engine understands (Generator ARCHETYPES).
const VALID_REGISTERS = ['serif', 'heavySans', 'either', ''];
// typeRegister (moodboard vocab) → a REAL brand register. The brand has exactly
// two lettering registers; script/mixed/display/serif all read as the serif
// statement register, a sans-led board maps to heavySans.
const TYPE_REGISTER_TO_HERO = {
  serif: 'serif', script: 'serif', mixed: 'serif', display: 'serif', sans: 'heavySans',
};
// Devices that lead with a photo (drive postType + logo tone).
const PHOTO_LED_DEVICES = new Set(['type-weave', 'shape-mask', 'collage', 'pill-card', 'split', 'caption-band', 'full-bleed']);
// Dark bg tokens → an ivory logo reads; everything else → a green logo.
const DARK_BG = new Set(['burnham', 'jet', 'terracotta']);

// ── Frequency helper ─────────────────────────────────────────────────────────
function freqOf(rows, key, allowed) {
  const c = {};
  for (const v of allowed) c[v] = 0;
  let total = 0;
  for (const r of rows) {
    const g = r?.genes && typeof r.genes === 'object' ? r.genes : null;
    const val = g ? g[key] : null;
    if (val == null || !(val in c)) continue;
    c[val] += 1; total += 1;
  }
  return Object.entries(c)
    .filter(([, n]) => n > 0)
    .map(([value, count]) => ({ value, count, share: total ? count / total : 0 }))
    .sort((a, b) => b.count - a.count);
}

// ── 1 · Pattern ledger (spec §3) ─────────────────────────────────────────────
// `rows` = classified brand_moodboard rows [{id, genes}]. `counts` = the like/
// aggregate counts object (from lib/preferences computeAggregate) — used to judge
// how well each device is already SERVED by hearted archetypes.
export function buildPatternLedger(rows, counts = {}) {
  const classified = (rows || []).filter(r => r?.genes && typeof r.genes === 'object');
  const deviceFreq = freqOf(classified, 'compositionDevice', COMPOSITION_DEVICES);
  const paletteFreq = freqOf(classified, 'paletteClass', PALETTE_CLASSES);
  const registerFreq = freqOf(classified, 'typeRegister', TYPE_REGISTERS);
  const densityFreq = freqOf(classified, 'densityClass', DENSITY_CLASSES);

  const likeArch = counts.archetypeId || {};
  const totalLikeArch = Object.values(likeArch).reduce((a, b) => a + b, 0);

  // For each device present on the moodboard: is it expressible, how well served
  // by likes, and an under-served score (frequent × not-yet-served).
  const devices = deviceFreq.map(d => {
    const archetypes = DEVICE_TO_ARCHETYPES[d.value] || [];
    const expressible = archetypes.length > 0;
    const servedCount = archetypes.reduce((s, a) => s + (likeArch[a] || 0), 0);
    const served = totalLikeArch ? servedCount / totalLikeArch : 0;
    const underservedScore = d.share * (1 - Math.min(served, 1));
    return { device: d.value, count: d.count, share: d.share, expressible, archetypes, served, underservedScore };
  });

  // Strongest under-served cluster = the highest-scoring EXPRESSIBLE device.
  const strongest = devices
    .filter(d => d.expressible && d.underservedScore > 0)
    .sort((a, b) => b.underservedScore - a.underservedScore)[0] || null;

  return {
    moodboardCount: classified.length,
    deviceFreq, paletteFreq, registerFreq, densityFreq,
    devices,
    expressibleDevices: devices.filter(d => d.expressible).map(d => d.device),
    strongest,
  };
}

// Dominant gene value among the rows that belong to a given device cluster.
function dominantInCluster(rows, device, key, fallback) {
  const inCluster = rows.filter(r => r?.genes?.compositionDevice === device);
  const f = freqOf(inCluster, key, key === 'paletteClass' ? PALETTE_CLASSES
    : key === 'typeRegister' ? TYPE_REGISTERS
    : key === 'photoTreatment' ? PATCH_OPTIONS.photoTreatment
    : DENSITY_CLASSES);
  return f.length ? f[0].value : fallback;
}

// ── 2 · Compose a complete template state from brand elements (spec §4) ───────
// Returns { state, rationale, sourceIds, cluster } or null when nothing is
// expressible. Copy fields are left EMPTY (the template's placeholder convention
// — never fabricated copy, per the one-voice/honesty law).
export function planProposal(ledger, rows) {
  const cluster = ledger?.strongest;
  if (!cluster || !cluster.expressible) return null;
  const clusterRows = (rows || []).filter(r => r?.genes?.compositionDevice === cluster.device);
  const sourceIds = clusterRows.map(r => r.id).filter(Boolean).slice(0, 12);

  const archetypeId = cluster.archetypes[0];
  const paletteClass = dominantInCluster(rows, cluster.device, 'paletteClass', 'warm-neutral');
  const bgColor = PALETTE_CLASS_TO_BG[paletteClass] || 'whiteSmoke';
  const typeRegister = dominantInCluster(rows, cluster.device, 'typeRegister', 'serif');
  const heroRegister = TYPE_REGISTER_TO_HERO[typeRegister] || 'serif';
  const photoLed = PHOTO_LED_DEVICES.has(cluster.device);
  const photoTreatment = photoLed
    ? dominantInCluster(rows, cluster.device, 'photoTreatment', 'warmGrade')
    : 'none';
  const selectedLogoId = DARK_BG.has(bgColor) ? 'p3-ivory' : 'p3-green';
  const postType = photoLed ? 'photo_logo' : 'quote';

  // The complete, render-ready state — mirrors currentTemplateState() in
  // components/Generator.jsx (fields applyDesignTemplate reads). Copy empty;
  // no baked photo (imageSrc null) — a real photo is sourced at use time.
  const state = {
    postType, archetypeId, archVariant: 0, dimensionId: 'ig_portrait',
    bgColor, bgAlpha: 1, textColorId: 'auto', exportFormat: 'png', backdropMode: 'auto',
    photoTreatment, photoFrame: { type: 'none' },
    microLabel: '', pillText: '', heroRegister,
    headline: '', subtext: '', attribution: '', dateText: '',
    selectedLogoId, logoPosition: 'bottom-left', logoSize: 'm',
    userLogoTouched: false, logoByDim: {}, logoFreePos: null, logoHidden: false,
    roleOffsetsByDim: {}, imgT: {}, imgTByDim: {}, typeLayouts: {}, typeLayoutsByDim: {},
    fontSizes: {}, overlayLayers: [], imageSrc: null, acks: {},
    // Proposal metadata rides in the state (applyDesignTemplate ignores unknown
    // keys). needsRenderCheck flags P3 to run the real 6-format born-clean render
    // before the proposal may be shown (server-side we only enum-validated it).
    _proposal: {
      needsRenderCheck: true,
      device: cluster.device, paletteClass, typeRegister,
      underservedScore: Number(cluster.underservedScore.toFixed(3)),
    },
  };

  const rationale = buildRationale(cluster, { archetypeId, bgColor, paletteClass, typeRegister, photoTreatment }, sourceIds);
  return { state, rationale, sourceIds, cluster };
}

// One-paragraph rationale that names the REAL sources (honesty law — no invented
// justification). Deterministic (no LLM spend).
function buildRationale(cluster, chosen, sourceIds) {
  const pct = Math.round(cluster.share * 100);
  const idList = sourceIds.length ? sourceIds.join(', ') : 'the current moodboard';
  return (
    `Your moodboard leans on the "${cluster.device}" composition device — it appears in ` +
    `${cluster.count} of the classified inspiration images (${pct}% of them), yet the templates ` +
    `you've hearted rarely use it, so it's the strongest under-served pattern right now. This ` +
    `proposal composes it entirely from brand elements: the ${chosen.archetypeId} archetype on a ` +
    `${chosen.bgColor} field (${chosen.paletteClass}), a ${chosen.typeRegister} type register` +
    `${chosen.photoTreatment !== 'none' ? `, ${chosen.photoTreatment} photo treatment` : ''}. ` +
    `Inspired by moodboard images: ${idList}.`
  );
}

// ── 3 · Born-clean precheck (P2) ─────────────────────────────────────────────
// Validate the composed state against PATCH_OPTIONS enums + archetype existence.
// Returns { ok, reasons }. Does NOT render (that is P3). A proposal that fails
// this is discarded and logged, never surfaced (born-clean law).
export function precheckProposalState(state) {
  const reasons = [];
  const inEnum = (val, key) => PATCH_OPTIONS[key].includes(val);
  if (!state || typeof state !== 'object') return { ok: false, reasons: ['no state'] };
  if (!inEnum(state.archetypeId, 'archetypeId') || state.archetypeId === 'none') reasons.push(`archetypeId '${state.archetypeId}' not a real archetype`);
  if (!inEnum(state.dimensionId, 'dimensionId')) reasons.push(`dimensionId '${state.dimensionId}' invalid`);
  if (!inEnum(state.bgColor, 'bgColor')) reasons.push(`bgColor '${state.bgColor}' invalid`);
  if (!inEnum(state.textColorId, 'textColorId')) reasons.push(`textColorId '${state.textColorId}' invalid`);
  if (!inEnum(state.photoTreatment, 'photoTreatment')) reasons.push(`photoTreatment '${state.photoTreatment}' invalid`);
  if (!inEnum(state.postType, 'postType')) reasons.push(`postType '${state.postType}' invalid`);
  if (!inEnum(state.selectedLogoId, 'logoId')) reasons.push(`selectedLogoId '${state.selectedLogoId}' invalid`);
  if (!inEnum(state.logoPosition, 'logoPosition')) reasons.push(`logoPosition '${state.logoPosition}' invalid`);
  if (!inEnum(state.logoSize, 'logoSize')) reasons.push(`logoSize '${state.logoSize}' invalid`);
  if (!inEnum(state.backdropMode, 'backdropMode')) reasons.push(`backdropMode '${state.backdropMode}' invalid`);
  if (!VALID_REGISTERS.includes(state.heroRegister)) reasons.push(`heroRegister '${state.heroRegister}' invalid`);
  return { ok: reasons.length === 0, reasons };
}

// ── DB helpers (graceful) ────────────────────────────────────────────────────
function isMissing(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || err?.code === '42703' || /not set|not configured|does not exist|schema cache/i.test(msg);
}

// Newest classified moodboard rows (id + genes).
export async function fetchClassifiedMoodboard(supabase) {
  try {
    const { data, error } = await supabase
      .from('brand_moodboard')
      .select('id, genes')
      .eq('brand_id', BRAND_ID)
      .not('genes', 'is', null)
      .order('ts', { ascending: false })
      .limit(MOODBOARD_SCAN);
    if (error) return { configured: !isMissing(error), rows: [] };
    return { configured: true, rows: data || [] };
  } catch (err) {
    return { configured: !isMissing(err), rows: [] };
  }
}

// How many proposals are pending review (status:'proposed', not deleted), and
// when the most recent MACHINE-proposed row (source_moodboard_ids not null) was
// created — the cooldown stamp (spec §4).
async function proposalGate(supabase) {
  try {
    const pendingQ = await supabase
      .from('design_templates')
      .select('id', { count: 'exact', head: true })
      .eq('brand_id', BRAND_ID)
      .eq('status', 'proposed')
      .eq('deleted', false);
    if (pendingQ.error) return { configured: !isMissing(pendingQ.error), pending: 0, lastAt: 0 };
    const lastQ = await supabase
      .from('design_templates')
      .select('created_at')
      .eq('brand_id', BRAND_ID)
      .not('source_moodboard_ids', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);
    const lastAt = !lastQ.error && lastQ.data?.[0]?.created_at ? Date.parse(lastQ.data[0].created_at) : 0;
    return { configured: true, pending: pendingQ.count || 0, lastAt };
  } catch (err) {
    return { configured: !isMissing(err), pending: 0, lastAt: 0 };
  }
}

// ── 4 · The run — cooldown + pending gate + compose + (optional) insert ───────
// opts: { now, force, dryRun, counts }. `counts` is the aggregate counts (for the
// served-share judgement); pass computeAggregate().counts from the caller.
// Returns a descriptor the learning-pass report renders. Never throws.
export async function synthesizeProposalRun(supabase, { now = Date.now(), force = false, dryRun = false, counts = {} } = {}) {
  const mb = await fetchClassifiedMoodboard(supabase);
  if (!mb.configured) return { proposed: false, reason: 'unconfigured', configured: false };
  if (!mb.rows.length) return { proposed: false, reason: 'no-classified-moodboard', configured: true, ledger: null };

  const ledger = buildPatternLedger(mb.rows, counts);

  const gate = await proposalGate(supabase);
  if (!gate.configured) return { proposed: false, reason: 'unconfigured', configured: false, ledger };

  // One pending at a time — ABSOLUTE (force does not bypass; spec §5).
  if (gate.pending >= PENDING_PROPOSAL_LIMIT) {
    return { proposed: false, reason: 'pending-exists', configured: true, ledger, pending: gate.pending };
  }
  // Cooldown — force ("propose now") bypasses ONLY this.
  const sinceMs = gate.lastAt ? now - gate.lastAt : Infinity;
  const cooldownRemainingDays = gate.lastAt ? Math.max(0, PROPOSAL_COOLDOWN_DAYS - sinceMs / DAY_MS) : 0;
  if (!force && gate.lastAt && sinceMs < PROPOSAL_COOLDOWN_DAYS * DAY_MS) {
    return { proposed: false, reason: 'cooldown', configured: true, ledger, cooldownRemainingDays };
  }

  const plan = planProposal(ledger, mb.rows);
  if (!plan) return { proposed: false, reason: 'no-expressible-cluster', configured: true, ledger };

  const check = precheckProposalState(plan.state);
  if (!check.ok) {
    // Discarded and logged, never surfaced (born-clean law).
    return { proposed: false, reason: 'precheck-failed', configured: true, ledger, precheck: check, plan };
  }

  if (dryRun) {
    return { proposed: true, dryRun: true, configured: true, ledger, plan, precheck: check, forced: force };
  }

  // Insert the proposal row (status:'proposed'). Graceful on any DB problem.
  try {
    const name = `Proposal · ${plan.cluster.device}`;
    const { data, error } = await supabase
      .from('design_templates')
      .insert({
        brand_id: BRAND_ID, name, thumb: null, state: plan.state,
        status: 'proposed', deleted: false,
        rationale: plan.rationale, source_moodboard_ids: plan.sourceIds,
        updated_at: new Date().toISOString(),
      })
      .select('id, name, status, rationale, source_moodboard_ids')
      .single();
    if (error) return { proposed: false, reason: 'insert-failed', configured: !isMissing(error), ledger, plan, error: error.message };
    return { proposed: true, configured: true, ledger, plan, precheck: check, row: data, forced: force };
  } catch (err) {
    return { proposed: false, reason: 'insert-threw', configured: !isMissing(err), ledger, plan, error: String(err?.message || err) };
  }
}
