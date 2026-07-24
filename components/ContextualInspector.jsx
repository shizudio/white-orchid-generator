import { memo, useRef, useState } from "react";

// (Half-sheet — ratified 2026-07-15, ux-architecture §2.11) On mobile the
// inspector is a CONTENT-HEIGHT bottom sheet with two detents: the default
// "half" detent caps at ~45vh so the canvas band above stays visible (the
// audit's #1/#2 fix — a fixed 72vh sheet buried the element under edit); a
// drag on the handle promotes to the "tall" detent (~78vh) for the long Text
// inspector. Dragging DOWN from tall returns to half; down from half closes
// (#18 — the expected iOS sheet gesture; the 44px ✕ is retained). The handle
// is display:none on desktop, where the inspector stays the in-flow column.
const DETENT_DRAG_PX = 40;

function ContextualInspector({ info, removeAction, onClose, onDeleteElement, elements=[], activeKey, onSelect, palette, fonts }) {
  const [tall, setTall] = useState(false);
  const handleDrag = useRef(null);
  if (!info) return null;
  const B=palette,FU=fonts;
  const activeIsDeletable = elements.some(el => el.key===activeKey && el.deletable);
  const onHandleDown = e => {
    handleDrag.current = { y: e.clientY, dy: 0 };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  };
  const onHandleMove = e => {
    if (handleDrag.current) handleDrag.current.dy = e.clientY - handleDrag.current.y;
  };
  const onHandleUp = () => {
    const drag = handleDrag.current;
    handleDrag.current = null;
    if (!drag) return;
    if (drag.dy <= -DETENT_DRAG_PX) { if (!tall) setTall(true); }
    else if (drag.dy >= DETENT_DRAG_PX) { if (tall) setTall(false); else onClose(); }
  };
  return <div role="dialog" aria-label={`${info.title} controls`} className={`wo-inspector wo-inspector-dock${tall?" wo-sheet-tall":""}`}>
    <div className="wo-sheet-handle" role="button" tabIndex={0}
      aria-label={tall?"Sheet handle. Drag down for the smaller sheet; drag down again to close.":"Sheet handle. Drag up for a taller sheet; drag down to close."}
      onPointerDown={onHandleDown} onPointerMove={onHandleMove} onPointerUp={onHandleUp}
      onPointerCancel={()=>{handleDrag.current=null;}}
      onKeyDown={e=>{ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); setTall(prev=>!prev); } if(e.key==="Escape") onClose(); }}>
      <span className="wo-sheet-handle-bar" aria-hidden="true" />
    </div>
    {/* (Panel hierarchy redesign 2026-07-24, client-approved) New order:
        slim top bar (close only) → element pills (nav, with per-pill delete ×) →
        selection name (title) → features. The old title+Delete header row is gone;
        deletes live on the pills, clears live as a quiet secondary by the title. */}
    <div className="wo-inspector-head" style={{display:"flex",alignItems:"center",padding:"8px 12px",borderBottom:`1px solid ${B.ash}18`,background:"#fff",flex:"0 0 auto"}}>
      <button type="button" aria-label="Close inspector" className="wo-ins-close" onClick={onClose} style={{marginLeft:"auto",flex:"0 0 auto",width:30,height:30,borderRadius:8,border:"none",background:`${B.ash}18`,color:B.jet,fontSize:15,lineHeight:1,cursor:"pointer",display:"grid",placeItems:"center"}}>✕</button>
    </div>
    {elements.length >= 2 && <div role="toolbar" aria-label="Elements" style={{display:"flex",flexWrap:"wrap",gap:8,padding:"10px 14px 12px",borderBottom:`1px solid ${B.ash}22`,background:"#fff",flex:"0 0 auto"}}>
      {elements.map(el => {
        const on=activeKey===el.key;
        return <span key={el.key} className={`wo-ins-pill-wrap${on?" is-active":""}`} style={{position:"relative",display:"inline-flex"}}>
          <button type="button" className="wo-ins-pill" aria-pressed={on} title={`Edit ${el.label}`} onClick={()=>onSelect(el)} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"5px 11px",minHeight:30,borderRadius:999,border:`1px solid ${on?B.burnham:B.ash+"33"}`,background:on?B.burnham:"transparent",color:on?"#fff":B.jet,fontFamily:FU.subtitle,fontSize:10,fontWeight:500,letterSpacing:0.4,cursor:"pointer"}}><span aria-hidden="true" style={{fontSize:11,lineHeight:1}}>{el.icon}</span>{el.label}</button>
          {el.deletable && onDeleteElement && <button type="button" className="wo-ins-pill-x" aria-label={`Delete ${el.label}`} title={`Delete ${el.label} — undoable (⌘Z)`} onClick={e=>{e.stopPropagation();onDeleteElement(el.key);}}>
            <span className="wo-ins-pill-x-dot" aria-hidden="true">×</span>
          </button>}
        </span>;
      })}
    </div>}
    <div className="wo-inspector-title" style={{display:"flex",alignItems:"baseline",gap:10,padding:"12px 15px 2px",background:"#fff",flex:"0 0 auto"}}>
      <span style={{fontSize:13,fontFamily:FU.title,fontWeight:600,color:B.burnham,flex:"0 1 auto",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{info.title}</span>
      {removeAction && removeAction.kind==="clear" && <button type="button" onClick={removeAction.act} style={{marginLeft:"auto",flex:"0 0 auto",border:"none",background:"transparent",color:B.ash,fontFamily:FU.subtitle,fontSize:10,fontWeight:600,letterSpacing:0.4,cursor:"pointer",padding:"2px 2px"}}>{removeAction.label}</button>}
    </div>
    {activeIsDeletable && <div style={{padding:"2px 15px 0",background:"#fff",flex:"0 0 auto"}}><span style={{fontSize:10,color:B.ash,fontFamily:FU.body,lineHeight:1.4}}>Deleting is undoable — ⌘Z brings it back.</span></div>}
    <div className="wo-inspector-body" style={{padding:"12px 15px 18px",overflowY:"auto",flex:"1 1 auto",background:"#fff"}}>{info.body}</div>
  </div>;
}

export default memo(ContextualInspector);
