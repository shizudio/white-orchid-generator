import { memo } from "react";

/** Full-canvas Posts/Favourites/Moodboard gallery. */
function FeedGallery({
  postTiles, archivedTiles, sessionId, currentLiked, cloudConfigured,
  folder, setFolder, moodboard, moodboardConfigured, moodboardInputRef,
  enlargedItem, setEnlargedItem, openSession, toggleLike, startNewPost,
  close, addMoodboardFile, deleteMoodboardItem, assistantName, palette:B, fonts,
}) {
  const { brand:F, ui:FU } = fonts;
  const byId = new Map();
  for (const tile of postTiles) byId.set(tile.id, tile);
  for (const tile of archivedTiles || []) if (!byId.has(tile.id)) byId.set(tile.id, tile);
  const allTiles = [...byId.values()].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const isLiked = tile => tile.liked === true || (tile.id === sessionId && currentLiked);
  const favouriteTiles = allTiles.filter(isLiked);
  const folders = [
    { id:"all", label:"All", n:allTiles.length },
    { id:"favourites", label:"Favourites", n:favouriteTiles.length },
    { id:"moodboard", label:"Moodboard", n:moodboard.length },
  ];
  const tiles = folder === "favourites" ? favouriteTiles : allTiles;

  const renderTile = tile => {
    const current = tile.id === sessionId;
    const liked = isLiked(tile);
    return <div key={tile.id} style={{position:"relative"}}>
      <button type="button" onClick={()=>openSession(tile.id)} aria-current={current}
        title={`${tile.title || "Untitled post"}${tile.exportedAt ? " · exported" : ""} — tap to open`}
        style={{width:"100%",aspectRatio:"1/1",borderRadius:8,overflow:"hidden",display:"block",padding:0,cursor:"pointer",border:current?`2px solid ${B.burnham}`:`1px solid ${B.ash}33`,background:"#fff",boxShadow:"0 1px 8px rgba(43,80,64,0.05)"}}>
        {tile.thumb ? <img src={tile.thumb} alt={tile.title || "post"} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
          : <span style={{display:"grid",placeItems:"center",width:"100%",height:"100%",fontSize:10,color:B.ash,fontFamily:FU.subtitle,fontWeight:500,letterSpacing:1,textTransform:"uppercase"}}>Post</span>}
      </button>
      <button type="button" className="wo-feed-heart" aria-pressed={liked}
        aria-label={liked ? `Unlike ${tile.title || "this post"}` : `Like ${tile.title || "this post"}`}
        title={liked ? "Liked — the studio learns from this" : "Like — the studio learns your style"}
        onClick={event=>{ event.stopPropagation(); toggleLike(tile.id); }}
        style={{position:"absolute",right:8,bottom:34,width:30,height:30,borderRadius:"50%",border:"none",background:"rgba(255,255,255,0.92)",boxShadow:"0 1px 5px rgba(43,80,64,0.16)",cursor:"pointer",display:"grid",placeItems:"center",fontSize:15,lineHeight:1,color:liked?B.tangerine:B.burnham}}>
        {liked ? "♥" : "♡"}
      </button>
      <div style={{display:"flex",alignItems:"baseline",gap:6,marginTop:7,minHeight:15}}>
        <span style={{flex:"1 1 auto",fontSize:11,color:B.jet,fontFamily:F.body,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{tile.title || "Untitled"}</span>
        {tile.exportedAt && <span title="Exported" style={{flex:"0 0 auto",fontSize:8.5,fontFamily:FU.subtitle,fontWeight:600,letterSpacing:1,textTransform:"uppercase",color:B.celadonDeep}}>↧ exported</span>}
      </div>
    </div>;
  };

  const moodboardFolder = <>
    <input ref={moodboardInputRef} type="file" accept="image/*" style={{display:"none"}}
      onChange={event=>{ const file=event.target.files?.[0]; if(file) addMoodboardFile(file); event.target.value=""; }} />
    <div style={{display:"flex",alignItems:"baseline",gap:12,marginBottom:16,flexWrap:"wrap"}}>
      <span style={{fontSize:11.5,fontFamily:F.body,color:B.ash,lineHeight:1.5,maxWidth:460}}>Inspiration you love from anywhere — reference images the studio learns your taste from. Not your designs.</span>
      <span style={{flex:1}} />
      <span title={moodboardConfigured?"Inspiration syncs across your devices":"Saved on this device"} style={{fontSize:10,fontFamily:F.body,color:moodboardConfigured?B.celadonDeep:B.ash,whiteSpace:"nowrap"}}>{moodboardConfigured?"◆ Synced":"◇ This device"}</span>
    </div>
    {moodboard.length === 0 ? <button type="button" onClick={()=>moodboardInputRef.current?.click()}
      style={{width:"100%",maxWidth:440,padding:"28px 20px",borderRadius:14,border:`1.5px dashed ${B.ash}77`,background:"transparent",color:B.burnham,fontFamily:F.subtitle,fontSize:12,fontWeight:600,letterSpacing:0.6,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:8}}>
      <span style={{fontSize:22,lineHeight:1}}>＋</span> Add inspiration
      <span style={{fontFamily:F.body,fontWeight:400,fontSize:11,color:B.ash,letterSpacing:0}}>Upload a reference image (PNG or JPG)</span>
    </button> : <div className="wo-feedgal-grid">
      <button type="button" onClick={()=>moodboardInputRef.current?.click()} aria-label="Add inspiration"
        style={{aspectRatio:"1/1",borderRadius:8,border:`1.5px dashed ${B.ash}77`,background:"transparent",color:B.burnham,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,fontFamily:F.subtitle,fontSize:11,fontWeight:600,letterSpacing:0.5}}>
        <span style={{fontSize:24,lineHeight:1}}>＋</span> Add inspiration
      </button>
      {moodboard.map(item=><div key={item.id} style={{position:"relative"}}>
        <button type="button" onClick={()=>setEnlargedItem(item)} title="Tap to enlarge" style={{width:"100%",aspectRatio:"1/1",borderRadius:8,overflow:"hidden",display:"block",padding:0,cursor:"zoom-in",border:`1px solid ${B.ash}33`,background:"#fff",boxShadow:"0 1px 8px rgba(43,80,64,0.05)"}}>
          <img src={item.image} alt={item.note || "inspiration"} style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} />
        </button>
        <button type="button" aria-label="Remove inspiration" title="Remove" onClick={event=>{ event.stopPropagation(); deleteMoodboardItem(item.id); }} style={{position:"absolute",top:-5,right:-5,width:20,height:20,borderRadius:10,border:"none",background:B.jet,color:"#fff",fontSize:13,lineHeight:"20px",cursor:"pointer",padding:0,boxShadow:"0 1px 5px rgba(43,80,64,0.2)"}}>×</button>
      </div>)}
    </div>}
  </>;

  return <div className="wo-feedgal" role="dialog" aria-modal="true" aria-label="Your posts">
    <style>{`
      .wo-feedgal{position:fixed;inset:0;z-index:380;background:${B.whiteSmoke};overflow-y:auto;-webkit-overflow-scrolling:touch}
      .wo-feedgal-inner{max-width:920px;margin:0 auto;padding:44px 40px 80px}.wo-feedgal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:30px 26px}
      .wo-feedgal-tabs{display:flex;gap:6;margin-bottom:28px;flex-wrap:wrap}.wo-feedtab{font-family:${FU.subtitle};font-size:11px;font-weight:600;letter-spacing:.06em;color:color-mix(in srgb,${B.burnham} 60%,transparent);background:transparent;border:1px solid transparent;border-radius:999px;padding:7px 15px;cursor:pointer;white-space:nowrap;transition:background 140ms ease,color 140ms ease}.wo-feedtab:hover{color:${B.burnham};background:color-mix(in srgb,${B.celadon} 18%,transparent)}.wo-feedtab[aria-selected="true"]{color:${B.burnham};background:color-mix(in srgb,${B.celadon} 26%,transparent);border-color:color-mix(in srgb,${B.burnham} 24%,transparent)}.wo-feedtab .wo-feedtab-n{opacity:.6;margin-left:5px;font-weight:500}
      @media(max-width:640px){.wo-feedgal-inner{padding:24px 18px 64px}.wo-feedgal-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 14px}}
    `}</style>
    <div className="wo-feedgal-inner">
      <div style={{display:"flex",alignItems:"baseline",gap:14,marginBottom:20,flexWrap:"wrap"}}>
        <span style={{fontSize:11,fontFamily:FU.subtitle,fontWeight:600,letterSpacing:2.4,textTransform:"uppercase",color:B.burnham}}>Your posts</span>
        <span style={{fontSize:11.5,fontFamily:F.body,color:B.ash}}>{allTiles.length ? `${allTiles.length} post${allTiles.length===1?"":"s"} — newest first` : ""}</span>
        <span title={cloudConfigured?"Posts sync across your devices":"Saved on this device"} style={{fontSize:10,fontFamily:F.body,color:cloudConfigured?B.celadonDeep:B.ash,whiteSpace:"nowrap"}}>{cloudConfigured?"◆ Synced":"◇ This device"}</span>
        <span style={{flex:1}} />
        <button type="button" onClick={()=>{ startNewPost(); close(); }} style={{fontFamily:FU.subtitle,fontSize:11,fontWeight:600,letterSpacing:.6,color:"#fff",background:B.burnham,border:"none",borderRadius:999,padding:"8px 16px",cursor:"pointer"}}>＋ New post</button>
        <button type="button" aria-label="Close the gallery" title="Back to the canvas (Esc)" onClick={close} style={{width:34,height:34,borderRadius:10,border:"none",background:`${B.ash}20`,color:B.jet,fontSize:16,lineHeight:1,cursor:"pointer",display:"grid",placeItems:"center"}}>✕</button>
      </div>
      <div className="wo-feedgal-tabs" role="tablist" aria-label="Folders">{folders.map(item=><button key={item.id} type="button" role="tab" aria-selected={folder===item.id} className="wo-feedtab" onClick={()=>setFolder(item.id)}>{item.label}<span className="wo-feedtab-n">{item.n}</span></button>)}</div>
      {folder === "moodboard" ? moodboardFolder : tiles.length === 0 ? <p style={{fontSize:13,fontFamily:F.body,color:B.ash,lineHeight:1.6,maxWidth:440}}>{folder === "favourites" ? "No favourites yet — tap the ♥ on a design or tile, and it lands here. The studio learns from what you love." : `No saved posts yet — describe one to ${assistantName} and it will appear here automatically.`}</p> : <div className="wo-feedgal-grid">{tiles.map(renderTile)}</div>}
    </div>
    {enlargedItem && <div role="dialog" aria-modal="true" aria-label="Inspiration image" onClick={()=>setEnlargedItem(null)} style={{position:"fixed",inset:0,zIndex:390,background:"rgba(37,45,40,0.72)",display:"grid",placeItems:"center",padding:32,cursor:"zoom-out"}}>
      <div onClick={event=>event.stopPropagation()} style={{maxWidth:"min(90vw,720px)",maxHeight:"86vh",display:"flex",flexDirection:"column",gap:12,alignItems:"center"}}>
        <img src={enlargedItem.image} alt={enlargedItem.note || "inspiration"} style={{maxWidth:"100%",maxHeight:"72vh",borderRadius:12,boxShadow:"0 24px 70px rgba(0,0,0,.4)",display:"block"}} />
        <div style={{display:"flex",gap:10}}><button type="button" onClick={()=>deleteMoodboardItem(enlargedItem.id)} style={{fontFamily:FU.subtitle,fontSize:11,fontWeight:600,color:"#fff",background:B.jet+"cc",border:"none",borderRadius:999,padding:"8px 16px",cursor:"pointer"}}>Remove</button><button type="button" onClick={()=>setEnlargedItem(null)} style={{fontFamily:FU.subtitle,fontSize:11,fontWeight:600,color:"#fff",background:"rgba(255,255,255,.18)",border:"1px solid rgba(255,255,255,.4)",borderRadius:999,padding:"8px 16px",cursor:"pointer"}}>Close</button></div>
      </div>
    </div>}
  </div>;
}

export default memo(FeedGallery);
