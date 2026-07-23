import { memo, useState } from "react";

// (Client ruling 2026-07-23) System-disabled logo variants must READ as inert, not
// merely un-suggested. A variant whose colour fails the mark's legibility floor on
// the current field is rendered clearly inert (strong opacity + desaturation +
// not-allowed cursor + aria-disabled, no hover lift) AND — never a silent no-op
// (M2) — tapping it surfaces a one-line advisor-voice reason with the fix, instead
// of doing nothing. `disabledInfo` maps a logo colour → its reason string; the
// currently-selected variant is never disabled (law 5/6: keep the active choice usable).
function LogoInspectorPanel({variants,group,selectedId,suggestedColor,hasImage,onSelect,hidden,onToggleHidden,overlap,advanced,disabledInfo,palette:B,fonts:F}){
  const visibleGroup=["primary","secondary"].includes(group)?group:"primary";
  const [inertNote,setInertNote]=useState(null); // {color,reason} of the last-tapped disabled option
  return <>
    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>{variants.filter(variant=>variant.group===visibleGroup).map(variant=>{
      const selected=selectedId===variant.id,suggested=suggestedColor===variant.color&&!selected&&hasImage;
      const disabledReason=(!selected&&disabledInfo&&disabledInfo[variant.color])||null;
      const inert=!!disabledReason;
      const tapped=inertNote&&inertNote.color===variant.color;
      return <button key={variant.id} aria-pressed={selected} aria-disabled={inert||undefined}
        onClick={()=>{ if(inert){ setInertNote({color:variant.color,reason:disabledReason}); } else { setInertNote(null); onSelect(variant.id); } }}
        title={inert?`${variant.label} — ${variant.color} · unavailable here`:`${variant.label} — ${variant.color}${suggested?" (suggested)":""}`}
        style={{position:"relative",padding:6,borderRadius:8,
          border:`2px solid ${inert?(tapped?B.tangerine:B.ash+"33"):selected?B.burnham:suggested?B.celadon:B.ash+"33"}`,
          background:inert?`${B.ash}22`:selected?B.burnham+"11":variant.color==="green"?"#F0F4F1":"#FAF8F4",
          cursor:inert?"not-allowed":"pointer",aspectRatio:"1/1",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",
          opacity:inert?0.35:1,filter:inert?"grayscale(0.85) saturate(0.4)":"none",transition:"all 0.12s"}}>
        <img src={variant.src} alt={variant.label} style={{width:"100%",height:"60%",objectFit:"contain"}}/>
        <span style={{fontSize:9,fontFamily:F.subtitle,fontWeight:600,color:selected?B.burnham:B.ash,marginTop:3,textAlign:"center",lineHeight:1.2}}>{variant.label}</span>
        {suggested&&<span style={{position:"absolute",top:3,right:3,fontSize:8,background:B.celadon,color:"#fff",borderRadius:3,padding:"1px 3px",fontFamily:F.subtitle,fontWeight:700}}>AUTO</span>}
        {selected&&<span style={{position:"absolute",top:3,right:3,fontSize:8,background:B.burnham,color:"#fff",borderRadius:3,padding:"1px 3px",fontFamily:F.subtitle,fontWeight:700}}>ON</span>}
      </button>;
    })}</div>
    {inertNote&&<div role="status" style={{marginTop:9,fontSize:11,fontFamily:F.body,color:B.jet,background:`${B.tangerine}14`,border:`1px solid ${B.tangerine}55`,borderRadius:9,padding:"8px 11px",lineHeight:1.45}}>{inertNote.reason}</div>}
    <div style={{marginTop:14,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}><button type="button" onClick={onToggleHidden} title={hidden?"Show the logo on this design again":"Take the logo off this design"} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"8px 13px",borderRadius:999,border:`1px solid ${hidden?B.burnham:B.ash+"66"}`,background:hidden?B.burnham:"#fff",color:hidden?"#fff":B.burnham,fontFamily:F.subtitle,fontSize:11,fontWeight:600,letterSpacing:0.4,cursor:"pointer"}}><span aria-hidden="true">{hidden?"＋":"×"}</span>{hidden?"Add logo back":"Remove logo"}</button>{!hidden&&<span style={{fontSize:11,fontFamily:F.body,color:B.ash,lineHeight:1.4,flex:"1 1 120px"}}>Drag the logo on the preview to place it.</span>}</div>
    {hidden&&<div style={{marginTop:8,fontSize:11,fontFamily:F.body,color:B.ash,lineHeight:1.4}}>The logo is off. It won't be added back automatically — tap above (or ask in chat) to restore it.</div>}
    {overlap&&<div role="status" style={{marginTop:10,fontSize:11,fontFamily:F.body,color:B.burnham,background:`${B.tangerine}18`,border:`1px solid ${B.tangerine}66`,borderRadius:9,padding:"8px 11px",lineHeight:1.4}}>Logo overlaps the text on this format.</div>}
    {!hidden&&advanced}
  </>;
}

export default memo(LogoInspectorPanel);
