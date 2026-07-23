import { migrateDesignDocument } from "./design-document.mjs";

/**
 * Capture the only state an editor undo/redo entry is allowed to own.
 *
 * Design truth lives in DesignDocument. Dimension and logo tab are transient view
 * context restored alongside it; duplicated legacy fields are intentionally not
 * written because they can drift from the document between capture and restore.
 */
export function createDesignHistorySnapshot({
  designDocument,
  dimensionId = "ig_portrait",
  markTab,
} = {}) {
  const document = migrateDesignDocument(designDocument);
  const resolvedMarkTab = markTab === "primary" || markTab === "secondary"
    ? markTab
    : (document.logo.assetId || "p3-ivory").startsWith("s") ? "secondary" : "primary";
  return {
    designDocument:document,
    dimensionId:typeof dimensionId === "string" && dimensionId ? dimensionId : "ig_portrait",
    markTab:resolvedMarkTab,
  };
}

/** Build the canonical blank design used by the New post action. */
export function createNewPostHistorySnapshot({
  typeLayouts = {},
  fontSizes = {},
  defaultImage = null,
} = {}) {
  const designDocument = migrateDesignDocument({
    postType:"photo_logo",
    archetypeId:null,
    archVariant:0,
    headline:"",
    subtext:"",
    attribution:"",
    dateText:"",
    bgColor:"burnham",
    fieldColorOverride:null,
    bgAlpha:1,
    textColorId:"auto",
    selectedLogoId:"p3-ivory",
    logoPosition:"bottom-center",
    logoSize:"m",
    backdropMode:"auto",
    photoTreatment:"none",
    photoFrame:{type:"none"},
    microLabel:"",
    pillText:"",
    heroRegister:"",
    typeLayouts,
    userLogoTouched:false,
    logoByDim:{},
    logoFreePos:null,
    logoHidden:false,
    roleOffsetsByDim:{},
    typeLayoutsByDim:{},
    fontSizes,
    overlayLayers:[],
    furnitureOverrides:{},
    image:defaultImage,
    imgT:{zoom:1,cx:0.5,cy:0.5,rotation:0},
    imgTByDim:{},
    photoTouchedByDim:{},
  });
  return createDesignHistorySnapshot({
    designDocument,
    dimensionId:"ig_portrait",
    markTab:"primary",
  });
}

/**
 * Decide whether an incoming owner edit CONTINUES the open undo burst or begins a
 * distinct action that deserves its own undo entry.
 *
 * The debounced burst exists so a continuous gesture (typing a heading, dragging a
 * box) collapses into ONE undo — every patch in it shares an interaction kind. But a
 * semantically DIFFERENT discrete action performed inside the same debounce window (a
 * colour pick right after a headline edit) is its own action: folding it robbed the
 * user of a revert step, which read as "undo only works once" when several quick
 * distinct edits landed in one window (Generator.jsx one-action-one-undo contract).
 *
 * Rule: a burst folds only edits that share at least one interaction tag with the
 * work already in it. An edit whose tags are wholly disjoint from the open burst
 * opens a new entry. Untagged edits (empty) never split — they extend the burst.
 */
export function planManualEditBurstStep({pending=false,touchedTags=[],tags=[]}={}) {
  const incoming=(Array.isArray(tags)?tags:[tags]).filter(tag=>typeof tag==="string"&&tag);
  const touched=new Set((Array.isArray(touchedTags)?touchedTags:[]).filter(Boolean));
  const distinctAction=pending
    &&incoming.length>0
    &&touched.size>0
    &&!incoming.some(tag=>touched.has(tag));
  const startNewEntry=!pending||distinctAction;
  const nextTouched=startNewEntry?new Set(incoming):new Set([...touched,...incoming]);
  return {startNewEntry,nextTouched:[...nextTouched]};
}

/** Plan one undo/redo stack step without performing React state updates. */
export function planDesignHistoryStep({stack,currentSnapshot,depth=8}={}) {
  if (!Array.isArray(stack)||stack.length===0) return null;
  const [snapshotToRestore,...remainingStack]=stack;
  return {
    snapshotToRestore,
    remainingStack,
    oppositeEntry:currentSnapshot,
    depth:Number.isInteger(depth)&&depth>0?depth:8,
  };
}
