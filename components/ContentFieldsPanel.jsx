import { memo } from "react";
import { stripItalicMarkers, applyEditedText } from "@/lib/italic-markers.mjs";

function ContentFieldsPanel({idPrefix,postType,content,heroRegister,eyebrow,pill,deadRoles=[],switchLayoutId,onField,onSwitchLayout,palette:B,fonts:F}){
  const input=(field,placeholder,maxLength,{mt=false,role,id,multiline=false,markers=false}={})=>{
    const Tag=multiline?"textarea":"input";
    // (Symptom 4) Hero copy stores the italic-phrase *markers*, but a plain input
    // renders them as literal asterisks. Show CLEAN text and re-derive the markers
    // on edit (round-trip safe — see lib/italic-markers.mjs) so the convention never
    // reads as noise and the canvas still paints the italic from storage.
    const stored=content[field]??"";
    const shown=markers?stripItalicMarkers(stored):stored;
    const handle=markers?(value=>onField(field,applyEditedText(stored,value))):(value=>onField(field,value));
    return <Tag id={id} className="wo-mfield" data-wo-role={role} aria-label={placeholder} placeholder={placeholder} maxLength={maxLength} value={shown} onChange={event=>handle(event.target.value)} style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${B.ash}44`,borderRadius:10,fontSize:14,color:B.jet,boxSizing:"border-box",background:"#FAFAF7",fontFamily:F.body,marginTop:mt?8:0,...(multiline?{height:88,resize:"vertical"}:{})}}/>;
  };
  // (Selection→field routing) The editorial support role renders `subtext`, falling
  // back to `attribution` when subtext is blank — see the renderer's supportText
  // precedence in Generator.jsx. Bind the single support field to whichever key
  // currently FEEDS the role so a selected support line (e.g. a brand attribution
  // like "The White Orchid") always has an editable home, instead of focusing an
  // empty "Support line" while its words sit on the canvas with no field to edit.
  const supportKey=(!String(content.subtext||"").trim()&&String(content.attribution||"").trim())?"attribution":"subtext";
  return <>
    {postType==="quote"&&<>{input("headline","Quote text",280,{role:"hero",id:idPrefix,multiline:true})}{input("attribution","Attribution",100,{role:"support",mt:true})}</>}
    {postType==="event"&&<>{input("headline","Event title",100,{role:"hero",id:idPrefix,markers:true})}{input("dateText","Date (e.g. 15 January)",50,{role:"date",mt:true})}{input(supportKey,"Details / CTA",180,{role:"support",mt:true})}</>}
    {postType==="text_post"&&<>{input("subtext","Intro line / caption",140,{role:"support"})}{input("headline","Headline",200,{role:"hero",id:idPrefix,mt:true,markers:true})}{input("attribution","Subtext",220,{mt:true})}{content.dateText?input("dateText","Date (e.g. 15 January)",50,{role:"date",mt:true}):null}</>}
    {postType==="texture_text"&&input("headline","Overlay text (e.g. NOW OPEN)",100,{role:"hero",id:idPrefix,markers:true})}
    {postType==="photo_logo"&&<>{input("headline","Caption (optional)",100,{role:"hero",id:idPrefix,markers:true})}<div style={{fontSize:10,color:B.ash,marginTop:6,fontFamily:F.body,lineHeight:1.5}}>Leave blank for a clean photo + logo — no caption needed.</div></>}
    {["photo_logo","texture_text"].includes(postType)&&heroRegister&&<>{input(supportKey,"Support line (optional)",180,{role:"support",mt:true})}{content.dateText?input("dateText","Date (e.g. 15 January)",50,{role:"date",mt:true}):null}</>}
    {eyebrow?.visible&&<input className="wo-mfield" data-wo-role="eyebrow" aria-label="Eyebrow (small caps label)" placeholder="Eyebrow (small caps label)" maxLength={28} value={eyebrow.value??""} onChange={event=>onField("microLabel",event.target.value)} style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${B.ash}44`,borderRadius:10,fontSize:14,color:B.jet,boxSizing:"border-box",background:"#FAFAF7",fontFamily:F.body,marginTop:8}}/>}
    {pill?.visible&&<input className="wo-mfield" data-wo-role="pill" aria-label="Pill label (e.g. NOW ENROLLING)" placeholder="Pill label (e.g. NOW ENROLLING)" maxLength={30} value={pill.value??""} onChange={event=>onField("pillText",event.target.value)} style={{width:"100%",padding:"11px 14px",border:`1.5px solid ${B.ash}44`,borderRadius:10,fontSize:14,color:B.jet,boxSizing:"border-box",background:"#FAFAF7",fontFamily:F.body,marginTop:8}}/>}
    {deadRoles.length>0&&<div role="note" style={{margin:"6px 0 12px",padding:"9px 11px",borderRadius:9,border:`1px solid ${B.tangerine}55`,background:`${B.tangerine}10`,fontSize:11,fontFamily:F.body,color:B.burnham,lineHeight:1.5}}><strong style={{fontFamily:F.subtitle,letterSpacing:0.3}}>Not shown in this layout:</strong> {deadRoles.join(", ")}.{switchLayoutId&&<button type="button" onClick={()=>onSwitchLayout(switchLayoutId)} style={{display:"block",marginTop:7,padding:"6px 11px",borderRadius:999,border:`1px solid ${B.burnham}44`,background:"transparent",color:B.burnham,fontFamily:F.subtitle,fontSize:10,fontWeight:600,letterSpacing:0.5,cursor:"pointer"}}>Switch to a layout that shows it</button>}</div>}
  </>;
}

export default memo(ContentFieldsPanel);
