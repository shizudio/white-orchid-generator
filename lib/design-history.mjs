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
