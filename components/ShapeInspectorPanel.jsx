import { memo, useState } from "react";

// Shape assets are presented by semantic responsibility, not painter mode.
// Structural deletion is consequence-aware because it can change media layout.
function ShapeInspectorPanel({
  hasLayoutShapes, layoutSectionRef, layoutFlash, layoutPicker,
  layers, selectedId, onSelect, onDelete, selectedEditor,
  addOpen, onToggleAdd, addTray, palette:B, fonts:F,
}) {
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const groups = [
    { id:"structure", label:"Structure", hint:"Frames and panels that organise the layout." },
    { id:"decoration", label:"Decoration", hint:"Optional visual accents that yield to content." },
  ].map(group => ({ ...group, layers:layers.filter(layer => layer.group === group.id) }))
    .filter(group => group.layers.length);

  const selectLayer = id => {
    setPendingDeleteId(null);
    onSelect(id);
  };
  const requestDelete = layer => {
    if (layer.isMediaHost) setPendingDeleteId(layer.id);
    else onDelete(layer.id);
  };
  const confirmDelete = id => {
    setPendingDeleteId(null);
    onDelete(id);
  };

  const renderLayer = layer => {
    const selected = selectedId === layer.id;
    const confirming = pendingDeleteId === layer.id;
    return (
      <div key={layer.id}>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 8px",borderRadius:9,border:`1.5px solid ${selected?B.burnham:B.ash+"33"}`,background:selected?`${B.burnham}0d`:"#fff"}}>
          <button onClick={()=>selectLayer(layer.id)} title="Edit this shape" style={{flex:1,display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",padding:0,textAlign:"left"}}>
            <span style={{width:30,height:30,borderRadius:7,background:`${B.celadonDeep}22`,display:"grid",placeItems:"center",flexShrink:0}}>
              {layer.src?<img src={layer.src} alt="" style={{maxWidth:22,maxHeight:22,objectFit:"contain"}}/>:<span aria-hidden="true" style={{fontSize:14,color:B.burnham}}>✦</span>}
            </span>
            <span style={{display:"flex",flexDirection:"column",gap:3,minWidth:0}}>
              <span style={{fontSize:11,fontFamily:F.subtitle,fontWeight:600,color:B.jet,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{layer.label}</span>
              <span style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                <span style={{fontSize:9,fontFamily:F.subtitle,fontWeight:700,letterSpacing:0.6,textTransform:"uppercase",color:B.ash}}>{layer.roleLabel}</span>
                {layer.isMediaHost&&<span style={{fontSize:8,fontFamily:F.subtitle,fontWeight:800,letterSpacing:0.5,textTransform:"uppercase",color:"#fff",background:B.burnham,borderRadius:999,padding:"2px 6px"}}>Photo frame</span>}
                <span style={{fontSize:9,fontFamily:F.body,color:B.ash}}>· {layer.modeLabel}</span>
              </span>
            </span>
          </button>
          <button onClick={()=>requestDelete(layer)} aria-label={`Delete ${layer.name||"shape"}`} title="Delete this shape (undoable)" style={{width:26,height:26,borderRadius:7,border:`1px solid ${B.ash}44`,background:"#fff",color:B.tangerine,cursor:"pointer",fontSize:14}}>×</button>
        </div>
        <div aria-hidden={!confirming} style={{maxHeight:confirming?110:0,opacity:confirming?1:0,visibility:confirming?"visible":"hidden",overflow:"hidden",transition:confirming?"max-height 180ms ease, opacity 150ms ease, visibility 0s":"max-height 180ms ease, opacity 150ms ease, visibility 0s linear 180ms"}}>
          <div role="alertdialog" aria-label="Remove active photo frame?" style={{margin:"6px 2px 2px",padding:"10px 11px",borderRadius:8,background:`${B.tangerine}0d`,border:`1px solid ${B.tangerine}44`}}>
            <div style={{fontSize:10,fontFamily:F.body,color:B.jet,lineHeight:1.45}}>This shape holds the photo. Removing it will move the photo to another available frame, or return it to the layout.</div>
            <div style={{display:"flex",gap:7,marginTop:8}}>
              <button type="button" onClick={()=>setPendingDeleteId(null)} style={{padding:"5px 9px",borderRadius:999,border:`1px solid ${B.ash}55`,background:"#fff",color:B.jet,fontFamily:F.subtitle,fontSize:9,fontWeight:700,cursor:"pointer"}}>Cancel</button>
              <button type="button" onClick={()=>confirmDelete(layer.id)} style={{padding:"5px 9px",borderRadius:999,border:`1px solid ${B.tangerine}`,background:B.tangerine,color:"#fff",fontFamily:F.subtitle,fontSize:9,fontWeight:800,cursor:"pointer"}}>Remove frame</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return <>
    {hasLayoutShapes&&<div ref={layoutSectionRef} style={{marginBottom:16,borderRadius:10,transition:"box-shadow 0.3s",boxShadow:layoutFlash?`0 0 0 2px ${B.burnham}`:"none"}}><div style={{fontSize:10,color:B.burnham,fontFamily:F.subtitle,fontWeight:700,letterSpacing:1.4,textTransform:"uppercase",marginBottom:8}}>Layout shape set</div>{layoutPicker}</div>}
    {/* (Client ruling 2026-07-23) The layout-shape-related pickers are grouped: the
        Layout shape set (above) is followed IMMEDIATELY by + Add shape → the brand's
        petal Shapes row + the Decoration section (addTray). The design's own shape
        list ("Shapes on this design") and the per-shape editor come AFTER — "the rest". */}
    <button onClick={onToggleAdd} aria-expanded={addOpen} style={{display:"inline-flex",alignItems:"center",gap:7,padding:"8px 14px",borderRadius:999,border:`1.5px solid ${B.burnham}`,background:addOpen?B.burnham:"#fff",color:addOpen?"#fff":B.burnham,fontFamily:F.subtitle,fontSize:11,fontWeight:700,cursor:"pointer"}}>＋ Add shape</button>
    {addOpen&&<div style={{marginTop:12,marginBottom:4}}>{addTray}</div>}
    <div style={{fontSize:10,color:B.burnham,fontFamily:F.subtitle,fontWeight:700,letterSpacing:1.4,textTransform:"uppercase",marginBottom:5,marginTop:16,paddingTop:12,borderTop:`1px solid ${B.ash}22`}}>Shapes on this design</div>
    <div style={{fontSize:10,color:B.ash,fontFamily:F.body,lineHeight:1.45,marginBottom:10}}>Structure controls the composition. Decoration adds optional expression.</div>
    {/* (Client ruling 2026-08-18 / panel-hierarchy pattern: pills → name of
        selection → selection features) When a shape is SELECTED, the section
        holding it moves to the 2nd row — directly after the selection context,
        before the other section — and the "Editing: …" block renders right
        under it, so editing is adjacent instead of below the fold. The
        unselected state keeps today's order (Structure, then Decoration). */}
    {(() => {
      const selectedGroupId = selectedId ? (layers.find(layer => layer.id === selectedId)?.group || null) : null;
      const orderedGroups = selectedGroupId
        ? [...groups.filter(g => g.id === selectedGroupId), ...groups.filter(g => g.id !== selectedGroupId)]
        : groups;
      const editorBlock = selectedEditor
        ? <div key="editor" style={{padding:"10px 11px",borderRadius:9,background:`${B.whiteSmoke}88`,border:`1px solid ${B.ash}2e`}}>{selectedEditor}</div>
        : null;
      if (!layers.length) return <>
        <div style={{fontSize:11,color:B.ash,fontFamily:F.body,lineHeight:1.5,marginBottom:10}}>No shapes yet. Add one above — then drag, rotate and resize it on the preview.</div>
        {editorBlock}
      </>;
      return <div style={{display:"flex",flexDirection:"column",gap:13,marginBottom:10}}>{orderedGroups.map(group=><section key={group.id} aria-label={group.label}><div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,marginBottom:6}}><span title={group.hint} style={{fontSize:10,color:B.jet,fontFamily:F.subtitle,fontWeight:700,letterSpacing:0.8,textTransform:"uppercase"}}>{group.label}</span><span style={{fontSize:9,color:B.ash,fontFamily:F.body,textAlign:"right"}}>{group.layers.length}</span></div><div style={{display:"flex",flexDirection:"column",gap:6}}>{group.layers.map(renderLayer)}{group.id===selectedGroupId?editorBlock:null}</div></section>)}</div>;
    })()}
  </>;
}

export default memo(ShapeInspectorPanel);
