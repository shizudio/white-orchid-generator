/* ─────────────────────────────────────────────────────────────────────────
   LIBRARY BACKDROP SWEEP — where the template's scrim opacity came from.

   Runs EVERY photo in the brand's live library through the same backdrop check
   the render core applies (lib/render-core/backdrop-contrast.mjs), on both
   colour classes, at the template's declared scrim opacity, and reports how
   many fall below the 4.5 floor.

   This is the evidence behind the 0.72 in template-label-headline.mjs: the
   opacity is a MEASURED number, not taste. Re-run it when the library grows or
   the scrim changes, and when it names a worst case, that is the photo
   scripts/tools/verify-post-composer.mjs uses to prove the refusal fires on a
   REAL asset rather than a synthetic one.

   MONEY LAW: reads GET /api/images only. Nothing is generated, nothing spends.

   Usage: node scripts/tools/scan-library-backdrop.mjs [--port 3100]
   ───────────────────────────────────────────────────────────────────────── */

import { chromium } from 'playwright';
const b = await chromium.launch({headless:true});
const p = await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 3100;
await p.goto(`http://localhost:${PORT}/post`,{waitUntil:'networkidle'});
const rows = await p.evaluate(async ()=>{
  const lum=(r,g,bl)=>{const f=c=>{const s=c/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;};return 0.2126*f(r)+0.7152*f(g)+0.0722*f(bl);};
  const cr=(a,c)=>{const hi=Math.max(a,c),lo=Math.min(a,c);return (hi+0.05)/(lo+0.05);};
  const hexL=h=>{const s=h.replace('#','');return lum(parseInt(s.slice(0,2),16),parseInt(s.slice(2,4),16),parseInt(s.slice(4,6),16));};
  const imgs = (await (await fetch('/api/images')).json()).filter(r=>r.url);
  const ALPHA=0.72;
  const out=[];
  const W=1080,H=1350;
  const c=document.createElement('canvas');c.width=W;c.height=H;
  const cx=c.getContext('2d',{willReadFrequently:true});
  const boxes={eyebrow:[.08,.170,.84,.040],heading:[.08,.245,.84,.170],body:[.08,.490,.80,.134]};
  for (const row of imgs) {
    const img = await new Promise(res=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=()=>res(null);i.src=row.url;});
    if(!img) continue;
    const rec={f:row.filename,id:row.id};
    for (const [klass,scrimHex,fieldHex,inkHex] of [['light','#F5F6E7','#F5F6E7','#254E48'],['dark','#254E48','#254E48','#F5F6E7']]) {
      cx.fillStyle=fieldHex;cx.fillRect(0,0,W,H);
      const s=Math.max(W/img.naturalWidth,H/img.naturalHeight),sw=W/s,sh=H/s;
      cx.drawImage(img,(img.naturalWidth-sw)/2,(img.naturalHeight-sh)/2,sw,sh,0,0,W,H);
      cx.save();cx.globalAlpha=ALPHA;cx.fillStyle=scrimHex;cx.fillRect(0,0,W,H);cx.restore();
      let worstAll=99;
      for (const [n,[fx,fy,fw,fh]] of Object.entries(boxes)) {
        const bx=Math.round(fx*W),by=Math.round(fy*H),bw=Math.round(fw*W),bh=Math.round(fh*H);
        const d=cx.getImageData(bx,by,bw,bh).data;
        const sx=Math.max(1,Math.floor(bw/24)),sy=Math.max(1,Math.floor(bh/24));
        const vals=[];for(let y=0;y<bh;y+=sy)for(let x=0;x<bw;x+=sx){const i=(y*bw+x)*4;if(d[i+3]<16)continue;vals.push(lum(d[i],d[i+1],d[i+2]));}
        let sum=0,sq=0;for(const v of vals){sum+=v;sq+=v*v;}
        const mean=sum/vals.length,sd=Math.sqrt(Math.max(0,sq/vals.length-mean*mean));
        const inkL=hexL(inkHex),busy=sd>0.14,meanC=cr(mean,inkL);
        const worst=busy?Math.min(cr(Math.max(0,mean-sd),inkL),cr(Math.min(1,mean+sd),inkL)):meanC;
        worstAll=Math.min(worstAll, busy?Math.min(meanC,worst):meanC);
      }
      rec[klass]=+worstAll.toFixed(2);
    }
    out.push(rec);
  }
  return out;
});
const failLight=rows.filter(r=>r.light<4.5).sort((a,b)=>a.light-b.light);
const failDark=rows.filter(r=>r.dark<4.5).sort((a,b)=>a.dark-b.dark);
console.log('total',rows.length,'| fail on IVORY pair:',failLight.length,'| fail on FOREST pair:',failDark.length);
console.log('worst on ivory:',failLight.slice(0,6).map(r=>`${r.f}=${r.light}`));
console.log('worst on forest:',failDark.slice(0,6).map(r=>`${r.f}=${r.dark}`));
await b.close();
