import { designDocumentToLegacyFields, migrateDesignDocument } from "./design-document.mjs";

export const PERSISTED_DESIGN_VERSION=1;

// ── (2026-07-15 client-approved one-time stored-stump cleanup) ────────────────
// A persisted design may carry AI-authored copy that ends on a DANGLING FUNCTION
// WORD ("…a week of creativity and", "join us for") — the stump class 81ebe5e
// closed for NEW generations at apply time. Stored designs authored before that
// guard still paint the fragment. This load-time adapter repairs them once,
// idempotently, on EVERY load path (sessions, templates — cloud and localStorage
// both funnel through readPersistedDesignPayload), never as a bulk write to the
// shared brand row.
//
// Rules (law 5 — never revert explicit user choice):
//   · AI-authored fields ONLY (content.authorship[field] === "ai"). Owner-typed
//     copy — or copy with no authorship record — is NEVER altered.
//   · Repair = trim back to the last complete meaningful phrase (strip trailing
//     function words + dangling separators) where that leaves ≥ 4 words AND
//     ≥ 16 chars. Text already ending cleanly ([.!?…]) is never touched.
//   · Otherwise LEAVE the stored value untouched — the advisor surfaces it as the
//     standard copy finding (Tighten it for me / Edit it myself / Leave it off)
//     via lib/audit-local.js `copy-stump`; content is never silently deleted.
// Idempotent by construction: a repaired phrase no longer ends in a function word.
const STUMP_COPY_FIELDS=["headline","subtext","attribution","dateText","microLabel","pillText"];
// Mirrors the apply-time detector in components/Generator.jsx (81ebe5e — keep in sync).
const DANGLING_FUNCTION_WORD=/\b(?:and|or|but|nor|yet|so|for|of|to|in|on|at|by|as|with|from|into|the|a|an|our|your|their|its|his|her|is|are|was|were|be|been)\s*$/i;
const ENDS_CLEAN=/[.!?…]["')\]]?$/;

export function isDanglingStump(text){
  const t=String(text||"").trim();
  if(!t||ENDS_CLEAN.test(t))return false;
  return DANGLING_FUNCTION_WORD.test(t);
}

// Trim a stump back to the last complete meaningful phrase, or null when the
// remainder is too thin to stand alone (< 4 words or < 16 chars).
export function repairStumpText(text){
  let t=String(text||"").trim();
  if(!isDanglingStump(t))return null;
  // Strip trailing function words and the separators they dangle from, repeatedly
  // ("…creativity, and" → "…creativity", "…a week of" → "…a week" → too thin? keep going).
  let guard=0;
  while(guard++<24){
    const next=t.replace(DANGLING_FUNCTION_WORD,"").replace(/[\s,;:–—-]+$/,"").trim();
    if(next===t)break;
    t=next;
    if(!DANGLING_FUNCTION_WORD.test(t))break;
  }
  const words=t.split(/\s+/).filter(Boolean).length;
  if(words>=4&&t.length>=16&&t!==String(text).trim())return t;
  return null;   // too thin to repair — leave stored value; the advisor surfaces it
}

// ── (§2.9.2 slice 3) legacy layout-shape migration ───────────────────────────
// Old documents carry the archetype's shape cutout as the special `media.frame`
// field (shapeMask / petalMask). Post-unification it is a GENUINE frame-mode
// shape layer (origin:"layout"). This pure adapter converts a legacy document
// exactly once, idempotently:
//   · `layer` (the converted shape layer) is supplied by the CALLER — the exact
//     per-format geometry needs the archetype data model, which lives in the
//     client (components/Generator.jsx convertLegacyLayoutShape). Without a
//     layer the document is returned unchanged: the renderer still paints a
//     legacy frame identically through the unified painter's synthesized job,
//     so an unconverted document NEVER renders differently.
//   · A document that somehow carries BOTH forms (saved mid-transition) is
//     normalized to the layer form — the frame field clears so the painter
//     can't double-draw the shape.
//   · Idempotent: after migration media.frame is {type:"none"} → early return.
// The card frame is not a layout shape and passes through untouched.
export function migrateLegacyLayoutShape(document, layer){
  const frame=document?.media?.frame;
  if(!frame||(frame.type!=="shapeMask"&&frame.type!=="petalMask"))return document;
  const withoutFrame=()=>({...document,media:{...document.media,frame:{type:"none"}}});
  if((document.shapes||[]).some(s=>s&&s.origin==="layout"))return withoutFrame();
  if(!layer||typeof layer!=="object"||!layer.assetId||!layer.master)return document;
  return {
    ...withoutFrame(),
    shapes:[...(document.shapes||[]),{...clone(layer),mode:"frame",origin:"layout"}],
  };
}

// Pure document-level pass. Returns the same reference when nothing changed (so
// callers/tests can assert idempotence cheaply).
export function repairStoredCopyStumps(document){
  const content=document?.content;
  const authorship=content?.authorship;
  if(!content||!authorship||typeof authorship!=="object")return document;
  let repaired=null;
  for(const field of STUMP_COPY_FIELDS){
    if(authorship[field]!=="ai")continue;            // owner or unknown → never altered
    const value=content[field];
    if(typeof value!=="string"||!isDanglingStump(value))continue;
    const fixed=repairStumpText(value);
    if(fixed==null)continue;                          // un-repairable → advisor finding
    if(!repaired)repaired={...content};
    repaired[field]=fixed;
  }
  return repaired?{...document,content:repaired}:document;
}

const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
export const acknowledgementMapToArray = map => Object.entries(map||{}).map(([key,value])=>({key,...clone(value)}));
export const acknowledgementArrayToMap = list => Object.fromEntries((Array.isArray(list)?list:[]).filter(item=>item?.key).map(({key,...value})=>[key,value]));

export function createPersistedDesignPayload(document,{dimensionId="ig_portrait",exportFormat="png",revision=1}={},acknowledgements={}) {
  const canonical=migrateDesignDocument(document);
  return {
    persistenceVersion:PERSISTED_DESIGN_VERSION,
    document:{...canonical,acknowledgements:acknowledgementMapToArray(acknowledgements)},
    metadata:{dimensionId,exportFormat,revision:Math.max(1,Number.isInteger(revision)?revision:1)},
  };
}

export function readPersistedDesignPayload(source) {
  if(source?.persistenceVersion===PERSISTED_DESIGN_VERSION&&source.document){
    const document=migrateLegacyLayoutShape(repairStoredCopyStumps(migrateDesignDocument(source.document)));
    return {document,metadata:{dimensionId:source.metadata?.dimensionId||"ig_portrait",exportFormat:source.metadata?.exportFormat||"png",revision:Math.max(1,source.metadata?.revision||1)},acknowledgements:acknowledgementArrayToMap(document.acknowledgements)};
  }
  const document=migrateLegacyLayoutShape(repairStoredCopyStumps(migrateDesignDocument(source||{})));
  return {
    document,
    metadata:{dimensionId:source?.dimensionId||"ig_portrait",exportFormat:source?.exportFormat||"png",revision:1},
    acknowledgements:source?.acks&&typeof source.acks==="object"?clone(source.acks):acknowledgementArrayToMap(document.acknowledgements),
  };
}

// Temporary adapter only for code paths that still consume the old flat view.
export function persistedDesignToLegacyView(payload) {
  const restored=readPersistedDesignPayload(payload);
  return {...designDocumentToLegacyFields(restored.document),...restored.metadata,acks:restored.acknowledgements};
}

/** Migrate a collection while retaining exact legacy records for one-click rollback. */
export function migratePersistedDesignCollection(records, { getPayload=item=>item?.state, setPayload=(item,state)=>({...item,state}) } = {}) {
  const migrated=[],backups=[];
  const telemetry={attempted:0,succeeded:0,failed:0,alreadyCurrent:0};
  for(const item of Array.isArray(records)?records:[]){
    const source=getPayload(item);
    if(source?.persistenceVersion===PERSISTED_DESIGN_VERSION){migrated.push(clone(item));telemetry.alreadyCurrent++;continue;}
    telemetry.attempted++;
    try{
      const restored=readPersistedDesignPayload(source);
      backups.push(clone(item));
      migrated.push(setPayload(clone(item),createPersistedDesignPayload(restored.document,restored.metadata,restored.acknowledgements)));
      telemetry.succeeded++;
    }catch{
      migrated.push(clone(item));telemetry.failed++;
    }
  }
  return {migrated,backups,telemetry};
}
