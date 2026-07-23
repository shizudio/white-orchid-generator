export function luminanceContrast(a,b){
  const hi=Math.max(a,b),lo=Math.min(a,b);
  return (hi+0.05)/(lo+0.05);
}

export function rgbLuminance(red,green,blue){
  const channels=[red,green,blue].map(value=>{
    const normalized=Math.max(0,Math.min(255,Number(value)||0))/255;
    return normalized<=0.03928?normalized/12.92:Math.pow((normalized+0.055)/1.055,2.4);
  });
  return 0.2126*channels[0]+0.7152*channels[1]+0.0722*channels[2];
}

export function hexLuminance(value){
  const raw=String(value||"#000000").replace("#","").trim();
  const hex=raw.length===3?raw.split("").map(part=>part+part).join(""):raw.padEnd(6,"0").slice(0,6);
  return rgbLuminance(
    parseInt(hex.slice(0,2),16)||0,
    parseInt(hex.slice(2,4),16)||0,
    parseInt(hex.slice(4,6),16)||0,
  );
}

export function summarizeLuminanceSamples(samples=[]){
  const values=Array.from(samples).filter(Number.isFinite);
  if(!values.length)return null;
  let sum=0,squareSum=0,low=1,high=0;
  for(const value of values){sum+=value;squareSum+=value*value;low=Math.min(low,value);high=Math.max(high,value);}
  const mean=sum/values.length;
  return {mean,variance:Math.max(0,squareSum/values.length-mean*mean),low,high,count:values.length};
}

export function contrastAtExtremes(surface,inkLuminance){
  if(!surface)return null;
  return Math.min(luminanceContrast(surface.low,inkLuminance),luminanceContrast(surface.high,inkLuminance));
}

/**
 * Honest low-contrast remedy (advice-ledger honesty, law 6 / M4).
 * A remedy must NEVER name the ink that is already active. Given the measured
 * surface luminance and the selectable ink options, this returns only the ink
 * options that MEASURABLY improve contrast over the current ink, plus a message
 * that offers real alternatives — and, when no ink helps, band / darker-area /
 * different-photo instead of a false colour suggestion.
 *
 * @param currentInkId   the active text-colour id (never named back to the user)
 * @param autoInkId      the colour "Auto" would resolve to (suggestedTextColor)
 * @param surfaceLuminance the measured worst-surface luminance under the text
 * @param options        [{id,label,luminance}] concrete ink choices (exclude "auto")
 * @param minimumContrast the WCAG floor the copy should reach (default 4.5)
 * @param bandAvailable  false when §6a shape-exclusion forbids a band here
 * @returns {betterInks, autoHelps, reachesFloor, message}
 */
export function contrastRemedy({
  currentInkId,
  autoInkId=null,
  surfaceLuminance,
  options=[],
  minimumContrast=4.5,
  bandAvailable=true,
}={}){
  const EPSILON=0.05;
  const current=options.find(option=>option.id===currentInkId);
  const currentContrast=current&&Number.isFinite(current.luminance)
    ? luminanceContrast(surfaceLuminance,current.luminance) : null;
  const ranked=options
    .filter(option=>option.id!==currentInkId&&Number.isFinite(option.luminance))
    .map(option=>({id:option.id,label:option.label,contrast:luminanceContrast(surfaceLuminance,option.luminance)}))
    .filter(option=>currentContrast==null||option.contrast>currentContrast+EPSILON)
    .sort((a,b)=>b.contrast-a.contrast);
  // "Auto" is a genuine remedy only when it resolves to a DIFFERENT ink that
  // measurably improves contrast (i.e. it appears in the improving set).
  const autoHelps=!!autoInkId&&autoInkId!==currentInkId&&ranked.some(option=>option.id===autoInkId);
  const reaching=ranked.filter(option=>option.contrast>=minimumContrast);
  const reachesFloor=reaching.length>0;
  const top=(reachesFloor?reaching:ranked).slice(0,2);
  const names=[];
  if(autoHelps&&(!reachesFloor||ranked.find(option=>option.id===autoInkId)?.contrast>=minimumContrast))names.push("Auto");
  for(const option of top)if(!(autoHelps&&option.id===autoInkId))names.push(option.label);
  const joined=names.slice(0,2).join(" or ");
  const darkerAndPhoto=bandAvailable
    ? "add a band, move the text to a darker area, or use a different photo"
    : "move the text to a darker area, or use a different photo";
  let message;
  if(reachesFloor){
    message=`Low contrast on this image. Try ${joined}.`;
  }else if(ranked.length){
    message=`Low contrast on this image. ${joined} reads a little better, or ${darkerAndPhoto}.`;
  }else{
    message=`Low contrast on this image — no text colour reads clearly here. ${bandAvailable?"Add a band, move":"Move"} the text to a darker area, or use a different photo.`;
  }
  return Object.freeze({
    betterInks:Object.freeze(ranked.slice(0,2)),
    autoHelps,
    reachesFloor,
    message,
  });
}

export function evaluateInkLegibility(surface,inkLuminance,{minimumContrast=3,busyStdDev=0.14}={}){
  if(!surface)return {ok:true,contrast:null,busy:false,meanContrast:null,worstContrast:null};
  const standardDeviation=Math.sqrt(surface.variance||0);
  const busy=standardDeviation>busyStdDev;
  const meanContrast=luminanceContrast(surface.mean,inkLuminance);
  const low=Math.max(0,surface.mean-standardDeviation),high=Math.min(1,surface.mean+standardDeviation);
  const worstContrast=busy?Math.min(luminanceContrast(low,inkLuminance),luminanceContrast(high,inkLuminance)):meanContrast;
  const contrast=busy?Math.min(meanContrast,worstContrast):meanContrast;
  return {ok:meanContrast>=minimumContrast&&(!busy||worstContrast>=minimumContrast),contrast,busy,meanContrast,worstContrast};
}
