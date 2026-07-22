/** Alpha-aware collision test for a placed decoration. Canvas decoding stays in
 * the adapter; this module owns geometry, rotation and sampling policy. */
export function decorationGridIntersectsRect(grid,shape,target,{samples=14,alphaThreshold=32}={}){
  const box=shape?.bounds;
  if(!box||!target)return false;
  const x0=Math.max(box.x,target.x),y0=Math.max(box.y,target.y);
  const x1=Math.min(box.x+box.w,target.x+target.w),y1=Math.min(box.y+box.h,target.y+target.h);
  if(x1<=x0||y1<=y0)return false;
  if(!grid)return true;
  const cx=box.x+box.w/2,cy=box.y+box.h/2;
  const angle=-(shape.transform?.rotation||0)*Math.PI/180;
  for(let yi=0;yi<samples;yi++)for(let xi=0;xi<samples;xi++){
    const px=x0+(xi+0.5)*(x1-x0)/samples,py=y0+(yi+0.5)*(y1-y0)/samples;
    const dx=px-cx,dy=py-cy;
    const rx=cx+dx*Math.cos(angle)-dy*Math.sin(angle),ry=cy+dx*Math.sin(angle)+dy*Math.cos(angle);
    const u=(rx-box.x)/box.w,v=(ry-box.y)/box.h;
    if(u<0||u>1||v<0||v>1)continue;
    const gx=Math.min(grid.size-1,Math.max(0,Math.floor(u*grid.size)));
    const gy=Math.min(grid.size-1,Math.max(0,Math.floor(v*grid.size)));
    if(grid.alpha[(gy*grid.size+gx)*4+3]>alphaThreshold)return true;
  }
  return false;
}

/** True only when a target spans both painted and unpainted shape pixels. */
export function shapeGridStraddlesRect(grid,shape,target,{samples=18,alphaThreshold=32}={}){
  const box=shape?.bounds;
  if(!box||!target||!grid?.alpha?.length)return null;
  const x0=target.x,y0=target.y,x1=target.x+target.w,y1=target.y+target.h;
  if(x1<=x0||y1<=y0)return false;
  const cx=box.x+box.w/2,cy=box.y+box.h/2;
  const angle=-(shape.transform?.rotation||0)*Math.PI/180;
  let painted=false,unpainted=false;
  for(let yi=0;yi<samples;yi++)for(let xi=0;xi<samples;xi++){
    const px=x0+(xi+0.5)*(x1-x0)/samples,py=y0+(yi+0.5)*(y1-y0)/samples;
    const dx=px-cx,dy=py-cy;
    const rx=cx+dx*Math.cos(angle)-dy*Math.sin(angle),ry=cy+dx*Math.sin(angle)+dy*Math.cos(angle);
    const u=(rx-box.x)/box.w,v=(ry-box.y)/box.h;
    let visible=false;
    if(u>=0&&u<=1&&v>=0&&v<=1){
      const gx=Math.min(grid.size-1,Math.max(0,Math.floor(u*grid.size)));
      const gy=Math.min(grid.size-1,Math.max(0,Math.floor(v*grid.size)));
      visible=grid.alpha[(gy*grid.size+gx)*4+3]>alphaThreshold;
    }
    if(visible)painted=true;else unpainted=true;
    if(painted&&unpainted)return true;
  }
  return false;
}

/** Fraction of sampled asset pixels that produce visible paint. */
export function decorationPaintFraction(grid,{alphaThreshold=32}={}){
  if(!grid?.alpha?.length)return 1;
  let visible=0,total=0;
  for(let index=3;index<grid.alpha.length;index+=4){
    total++;
    if(grid.alpha[index]>alphaThreshold)visible++;
  }
  return total?visible/total:0;
}
