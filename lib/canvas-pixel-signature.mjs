/** Cheap deterministic RGB signature for a canvas region used by render-truth checks. */
export function canvasPixelSignature(canvas,region=null) {
  try {
    if (!canvas?.width||!canvas?.height) return null;
    const cw=canvas.width,ch=canvas.height;
    const context=canvas.getContext("2d",{willReadFrequently:true});
    const x=region?Math.max(0,Math.floor(region.x*cw)):0;
    const y=region?Math.max(0,Math.floor(region.y*ch)):0;
    const width=region?Math.max(1,Math.floor(region.w*cw)):cw;
    const height=region?Math.max(1,Math.floor(region.h*ch)):ch;
    const data=context.getImageData(x,y,Math.min(width,cw-x),Math.min(height,ch-y)).data;
    let hash=0x811c9dc5;
    for(let index=0;index<data.length;index+=4*17){
      hash^=data[index];hash=Math.imul(hash,0x01000193);
      hash^=data[index+1];hash=Math.imul(hash,0x01000193);
      hash^=data[index+2];hash=Math.imul(hash,0x01000193);
    }
    return hash>>>0;
  } catch { return null; }
}
