const finite=value=>Number.isFinite(value);

/** Pure viewport policy for keeping a selected canvas element above a mobile sheet. */
export function resolveMobileInspectorViewport({
  canvasRect,selectedBounds,canvasWidth,canvasHeight,viewportWidth,bandTop,bandBottom,
}={}){
  if(!canvasRect||![canvasRect.top,canvasRect.bottom,canvasRect.left,canvasRect.width,canvasRect.height,canvasWidth,canvasHeight,viewportWidth,bandTop,bandBottom].every(finite))return null;
  if(canvasRect.height<=0||canvasWidth<=0||canvasHeight<=0||bandBottom-bandTop<90)return null;
  const elementTop=selectedBounds
    ? canvasRect.top+(selectedBounds.y/canvasHeight)*canvasRect.height
    : canvasRect.top;
  const elementBottom=selectedBounds
    ? canvasRect.top+((selectedBounds.y+selectedBounds.h)/canvasHeight)*canvasRect.height
    : canvasRect.bottom;
  let undoSide="left";
  if(selectedBounds){
    const center=canvasRect.left+((selectedBounds.x+selectedBounds.w/2)/canvasWidth)*canvasRect.width;
    undoSide=center<viewportWidth/2?"right":"left";
  }
  let scrollDelta=0;
  if(elementBottom>bandBottom)scrollDelta=elementBottom-bandBottom;
  if(elementTop-scrollDelta<bandTop)scrollDelta=elementTop-bandTop;
  return {scrollDelta:Math.abs(scrollDelta)>1?scrollDelta:0,undoSide,elementTop,elementBottom};
}
