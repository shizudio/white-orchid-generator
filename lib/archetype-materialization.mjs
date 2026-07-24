const motifSpots=[[0.13,0.15,-14,0.105],[0.86,0.82,12,0.105],[0.88,0.20,22,0.085],[0.12,0.85,-8,0.082],[0.90,0.52,4,0.072]];
const motifAssets=["shape-1","shape-2","shape-3","acc-spark"];

/** Convert one archetype into ordinary editable document-layer values. */
export function buildArchetypeMaterialization({
  archetype,
  context = {},
  current = {},
  masterDimensionId,
  dimensions = [],
  overlayAssets = [],
  backgroundIds = [],
  materializeLayout,
  layoutShapeTransform,
  createUid = prefix=>`${prefix}_${Math.random().toString(36).slice(2,7)}`,
} = {}) {
  if (!archetype || typeof materializeLayout !== "function") return null;
  const postType=context.postType||current.postType;
  const attribution=context.attribution??current.attribution??"";
  const subtext=context.subtext??current.subtext??"";
  const variant=context.variant??current.variant??0;
  const materialized=materializeLayout(archetype,masterDimensionId,variant);
  if (!materialized) return null;
  const shortAttribution=materialized.roles?.microLabel&&attribution&&attribution.length<=28&&subtext;
  let photoFrame=materialized.photoFrame||{type:"none"};
  if (photoFrame.type==="card") photoFrame={...photoFrame,rotationDeg:0};

  let layoutShapeLayer=null;
  if (photoFrame.type==="shapeMask"||photoFrame.type==="petalMask") {
    // (client ruling 2026-07-23) petalMask re-masked from the retired off-brand
    // "orchid-petal" to the sanctioned organic silhouette "shape-1" — petal_window
    // keeps its character (egg/blob) with a brand-safe mark.
    const assetId=photoFrame.shapeId||"shape-1";
    const ratio=overlayAssets.find(asset=>asset.id===assetId)?.ratio||1;
    const byDim={};
    let master=null;
    for (const dimension of dimensions) {
      const perFormat=dimension.id===masterDimensionId
        ? materialized
        : materializeLayout(archetype,dimension.id,variant);
      const box=perFormat?.photoFrame?.box;
      if (!box||typeof layoutShapeTransform!=="function") continue;
      const transform=layoutShapeTransform(dimension,postType,box,ratio);
      if (dimension.id===masterDimensionId) master=transform;
      else byDim[dimension.id]=transform;
    }
    if (master) {
      layoutShapeLayer={uid:createUid("ol_layout"),assetId,mode:"frame",origin:"layout",master,byDim};
      photoFrame={type:"none"};
    }
  }

  const hero=materialized.roles?.hero;
  const layout={
    x:hero?.x??0.08,y:hero?.y??0.18,width:hero?.w??0.8,
    align:hero?.align||"left",
    lineHeight:materialized.register==="heavySans"?1.05:1.02,
    scale:1,roles:materialized.roles,register:materialized.register,
  };
  let motifLayers=null;
  if (materialized.motif) {
    const pastels=(materialized.motif.pastels||["sage","butter"]).slice(0,2);
    const count=Math.max(2,Math.min(5,materialized.motif.count||3));
    motifLayers=Array.from({length:count},(_,index)=>{
      const [x,y,rotation,scale]=motifSpots[index%motifSpots.length];
      return {
        uid:createUid(`ol_motif_${index}`),assetId:motifAssets[index%motifAssets.length],
        mode:"overlay",motif:true,
        master:{x,y,scale,rotation,opacity:0.9,colorId:pastels[index%pastels.length]},byDim:{},
      };
    });
  }
  return {
    postType,
    bg:materialized.palette?.bg&&backgroundIds.includes(materialized.palette.bg)?materialized.palette.bg:null,
    register:materialized.register,
    microLabel:shortAttribution?attribution:null,
    photoTreatment:materialized.photoTreatment||"none",
    photoFrame,
    layout,motifLayers,layoutShapeLayer,
  };
}
