const finite = value => Number.isFinite(value);

export function normalizeBounds(bounds) {
  if (!bounds || !finite(bounds.x) || !finite(bounds.y) || !finite(bounds.w) || !finite(bounds.h)) return null;
  return { x:bounds.x, y:bounds.y, w:Math.max(0,bounds.w), h:Math.max(0,bounds.h) };
}

export function shapeBounds(transform, ratio, canvasWidth, canvasHeight) {
  if (!transform || !finite(canvasWidth) || !finite(canvasHeight)) return null;
  const width=(transform.scale ?? 0.2)*canvasWidth;
  const height=width/(finite(ratio) && ratio>0 ? ratio : 1);
  return normalizeBounds({
    x:(transform.x ?? 0.5)*canvasWidth-width/2,
    y:(transform.y ?? 0.5)*canvasHeight-height/2,
    w:width,
    h:height,
  });
}

export function createSceneElement({ id, type, role = null, z = 0, bounds, transform = null, interactive = true, painted = true }) {
  const box=normalizeBounds(bounds);
  if (!id || !type || !box) return null;
  return { id, type, role, z, bounds:box, transform, interactive:!!interactive, painted:!!painted };
}

export function hitTestScene(sceneElements, x, y, options = {}) {
  const types=options.types ? new Set(options.types) : null;
  const minSize=Math.max(0,options.minSize||0);
  const padding=Math.max(0,options.padding||0);
  return [...(sceneElements||[])].filter(element=>element?.interactive&&element.painted!==false&&(!types||types.has(element.type)))
    .sort((a,b)=>(b.z-a.z)||((a.bounds.w*a.bounds.h)-(b.bounds.w*b.bounds.h)))
    .find(element=>{
      const b=element.bounds;
      const width=Math.max(b.w,minSize),height=Math.max(b.h,minSize);
      const box={x:b.x-(width-b.w)/2-padding,y:b.y-(height-b.h)/2-padding,w:width+padding*2,h:height+padding*2};
      if(element.type==="shape"&&element.transform?.rotation){
        const cx=b.x+b.w/2,cy=b.y+b.h/2,a=-element.transform.rotation*Math.PI/180;
        const dx=x-cx,dy=y-cy,rx=dx*Math.cos(a)-dy*Math.sin(a),ry=dx*Math.sin(a)+dy*Math.cos(a);
        return Math.abs(rx)<=box.w/2&&Math.abs(ry)<=box.h/2;
      }
      return x>=box.x&&x<=box.x+box.w&&y>=box.y&&y<=box.y+box.h;
    })||null;
}

export function createRenderResult({ dimensionId, width, height, textBounds, roleBounds = {}, logoBox, photoBox, shapes = [], deadRoles = [], textMetrics = {}, contrast = null, auditSignal = null, findings = [] }) {
  const sceneElements=[];
  for (const [role,bounds] of Object.entries(roleBounds || {})) {
    const furniture=role.startsWith("furn_");
    const key=furniture ? role.slice(5) : role;
    const element=createSceneElement({
      id:furniture ? `furniture:${key}` : `text:${key}`,
      type:furniture ? "furniture" : "text",
      role:key,
      z:furniture ? 30 : 40,
      bounds,
    });
    if(element) sceneElements.push(element);
  }
  if (!Object.keys(roleBounds || {}).length && textBounds) {
    const element=createSceneElement({ id:"text:hero",type:"text",role:"hero",z:40,bounds:textBounds });
    if(element) sceneElements.push(element);
  }
  const photo=createSceneElement({ id:"photo:primary",type:"photo",z:10,bounds:photoBox });
  const logo=createSceneElement({ id:"logo:primary",type:"logo",z:50,bounds:logoBox });
  if(photo) sceneElements.push(photo);
  if(logo) sceneElements.push(logo);
  for (const shape of shapes) {
    const element=createSceneElement({
      id:`shape:${shape.id}`,
      type:"shape",
      z:shape.z ?? 20,
      bounds:shape.bounds,
      transform:shape.transform || null,
      painted:shape.painted !== false,
    });
    if(element) sceneElements.push(element);
  }
  return {
    dimensionId,width,height,
    sceneElements:sceneElements.sort((a,b)=>a.z-b.z),
    textMetrics:{ ...textMetrics },
    contrast,
    auditSignal,
    measurements:{ textBounds:normalizeBounds(textBounds),roleBounds:{ ...roleBounds },logoBox:logoBox ? { ...logoBox } : null,photoBox:photoBox ? { ...photoBox } : null },
    droppedRoles:[...deadRoles],
    findings:[...findings],
  };
}
