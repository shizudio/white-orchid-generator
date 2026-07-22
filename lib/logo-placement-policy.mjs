export const LOGO_PAD=0.05;

export const LOGO_POSITIONS=Object.freeze({
  "top-left":Object.freeze({label:"Top Left",anchorX:"left",anchorY:"top"}),
  "top-center":Object.freeze({label:"Top Center",anchorX:"center",anchorY:"top"}),
  "top-right":Object.freeze({label:"Top Right",anchorX:"right",anchorY:"top"}),
  "mid-left":Object.freeze({label:"Mid Left",anchorX:"left",anchorY:"center"}),
  "mid-right":Object.freeze({label:"Mid Right",anchorX:"right",anchorY:"center"}),
  "center":Object.freeze({label:"Center",anchorX:"center",anchorY:"center"}),
  "bottom-left":Object.freeze({label:"Bottom Left",anchorX:"left",anchorY:"bottom"}),
  "bottom-center":Object.freeze({label:"Bottom Center",anchorX:"center",anchorY:"bottom"}),
  "bottom-right":Object.freeze({label:"Bottom Right",anchorX:"right",anchorY:"bottom"}),
});

export const LOGO_SIZES=Object.freeze([
  Object.freeze({id:"s",label:"S",pct:0.12}),
  Object.freeze({id:"m",label:"M",pct:0.22}),
  Object.freeze({id:"l",label:"L",pct:0.38}),
  Object.freeze({id:"xl",label:"XL",pct:0.55}),
]);

/** Converts a semantic 9-grid anchor to a canvas centre while clearing platform UI. */
export function logoCenter(position,canvasWidth,canvasHeight,size,safeZone){
  const pos=position||LOGO_POSITIONS["bottom-right"];
  const basePadX=LOGO_PAD*canvasWidth,basePadY=LOGO_PAD*canvasWidth;
  const gap=0.015;
  const padTop=safeZone?.top?Math.max(basePadY,(safeZone.top+gap)*canvasHeight):basePadY;
  const padBottom=safeZone?.bottom?Math.max(basePadY,(safeZone.bottom+gap)*canvasHeight):basePadY;
  const padLeft=safeZone?.left?Math.max(basePadX,(safeZone.left+gap)*canvasWidth):basePadX;
  const padRight=safeZone?.right?Math.max(basePadX,(safeZone.right+gap)*canvasWidth):basePadX;
  const half=size/2;
  const x=pos.anchorX==="left"?padLeft+half:pos.anchorX==="right"?canvasWidth-padRight-half:canvasWidth/2;
  const y=pos.anchorY==="top"?padTop+half:pos.anchorY==="bottom"?canvasHeight-padBottom-half:canvasHeight/2;
  return [x,y];
}
