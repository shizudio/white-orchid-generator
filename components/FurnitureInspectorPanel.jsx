import { memo } from "react";

function FurnitureInspectorPanel({elementKey,type,overrides={},onUpdate,palette:B,fonts:F}){
  const isLine=type==="rule"||type==="underline";
  const colors=["burnham","whiteSmoke","jet","tangerine","wisteria","celadon"];
  return <>
    <div style={{fontSize:11,color:B.ash,fontFamily:F.body,lineHeight:1.5,marginBottom:12}}>A small editorial detail of this layout. Recolour it, {isLine?"resize it, ":""}or remove it with the × on its pill above.</div>
    <div style={{fontSize:10,color:B.ash,fontFamily:F.subtitle,fontWeight:700,letterSpacing:1,textTransform:"uppercase",marginBottom:6}}>Colour</div>
    <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:12}}>
      <button aria-pressed={!overrides.color} title="Auto (layout ink)" onClick={()=>onUpdate({key:elementKey,color:""})} style={{width:34,height:34,borderRadius:"50%",border:!overrides.color?`3px solid ${B.tangerine}`:`2px solid ${B.ash}66`,background:"#fff",display:"grid",placeItems:"center",fontFamily:F.subtitle,fontSize:8,fontWeight:800,color:B.jet,cursor:"pointer"}}>AUTO</button>
      {colors.map(id=><button key={id} aria-pressed={overrides.color===id} title={id} onClick={()=>onUpdate({key:elementKey,color:id})} style={{width:34,height:34,borderRadius:"50%",border:overrides.color===id?`3px solid ${B.tangerine}`:`2px solid ${B.ash}66`,background:B[id],boxShadow:"0 0 0 2px #fff inset",cursor:"pointer"}}/>)}
    </div>
    {isLine&&<div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}><span style={{fontSize:12,fontFamily:F.subtitle,fontWeight:500,color:B.ash,minWidth:50}}>Width</span><input aria-label="Width" type="range" min={0.5} max={2} step={0.05} value={overrides.widthScale??1} onChange={e=>onUpdate({key:elementKey,widthScale:Number(e.target.value)})} style={{flex:1,accentColor:B.burnham}}/><span style={{fontSize:12,fontFamily:F.body,color:B.ash,minWidth:40,textAlign:"right"}}>{Math.round((overrides.widthScale??1)*100)}%</span></div>}
  </>;
}

export default memo(FurnitureInspectorPanel);
