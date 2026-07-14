import { memo } from "react";

function LogoInspectorPanel({variants,group,selectedId,suggestedColor,hasImage,onSelect,hidden,onToggleHidden,overlap,advanced,palette:B,fonts:F}){
  const visibleGroup=["primary","secondary"].includes(group)?group:"primary";
  return <>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>{variants.filter(variant=>variant.group===visibleGroup).map(variant=>{
      const selected=selectedId===variant.id,suggested=suggestedColor===variant.color&&!selected&&hasImage;
      return <button key={variant.id} aria-pressed={selected} onClick={()=>onSelect(variant.id)} title={`${variant.label} — ${variant.color}${suggested?" (suggested)":""}`} style={{position:"relative",padding:6,borderRadius:8,border:`2px solid ${selected?B.burnham:suggested?B.celadon:B.ash+"33"}`,background:selected?B.burnham+"11":variant.color==="green"?"#F0F4F1":"#FAF8F4",cursor:"pointer",aspectRatio:"1/1",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",transition:"all 0.12s"}}><img src={variant.src} alt={variant.label} style={{width:"100%",height:"60%",objectFit:"contain"}}/><span style={{fontSize:9,fontFamily:F.subtitle,fontWeight:600,color:selected?B.burnham:B.ash,marginTop:3,textAlign:"center",lineHeight:1.2}}>{variant.label}</span>{suggested&&<span style={{position:"absolute",top:3,right:3,fontSize:8,background:B.celadon,color:"#fff",borderRadius:3,padding:"1px 3px",fontFamily:F.subtitle,fontWeight:700}}>AUTO</span>}{selected&&<span style={{position:"absolute",top:3,right:3,fontSize:8,background:B.burnham,color:"#fff",borderRadius:3,padding:"1px 3px",fontFamily:F.subtitle,fontWeight:700}}>ON</span>}</button>;
    })}</div>
    <div style={{marginTop:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><button type="button" onClick={onToggleHidden} title={hidden?"Show the logo on this design again":"Take the logo off this design"} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"8px 13px",borderRadius:999,border:`1px solid ${hidden?B.burnham:B.ash+"66"}`,background:hidden?B.burnham:"#fff",color:hidden?"#fff":B.burnham,fontFamily:F.subtitle,fontSize:11,fontWeight:600,letterSpacing:0.4,cursor:"pointer"}}><span aria-hidden="true">{hidden?"＋":"×"}</span>{hidden?"Add logo back":"Remove logo"}</button>{!hidden&&<span style={{fontSize:11,fontFamily:F.body,color:B.ash,lineHeight:1.4,flex:"1 1 120px"}}>Drag the logo on the preview to place it.</span>}</div>
    {hidden&&<div style={{marginTop:8,fontSize:11,fontFamily:F.body,color:B.ash,lineHeight:1.4}}>The logo is off. It won't be added back automatically — tap above (or ask in chat) to restore it.</div>}
    {overlap&&<div role="status" style={{marginTop:10,fontSize:11,fontFamily:F.body,color:B.burnham,background:`${B.tangerine}18`,border:`1px solid ${B.tangerine}66`,borderRadius:9,padding:"8px 11px",lineHeight:1.4}}>Logo overlaps the text on this format.</div>}
    {!hidden&&advanced}
  </>;
}

export default memo(LogoInspectorPanel);
