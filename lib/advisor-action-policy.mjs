const FIELD_ROLE=Object.freeze({headline:"hero",subtext:"support",attribution:"support",microLabel:"eyebrow",dateText:"date"});

/** Last-mile direct-edit route for a blocking finding after specialized remedies. */
export function fallbackAdvisorEditTarget(finding={}){
  const rule=String(finding.ruleId||"");
  const element=String(finding.element||finding.anchor?.element||"");
  const role=FIELD_ROLE[finding.field]
    || (element==="headline"?"hero":element==="caption"?"support":["hero","support","eyebrow","date","pill"].includes(element)?element:null);
  if(role||rule.startsWith("content.")||rule.startsWith("typography.")||rule.startsWith("surface."))return {kind:"text",role:role||"hero",label:"Edit the text"};
  if(rule==="pin.no-silent-overwrite"&&element==="content")return {kind:"text",role:"hero",label:"Edit the text color"};
  if(element==="logo"||element.startsWith("mark:")||rule.startsWith("logo."))return {kind:"element",element:"logo",label:"Edit the logo"};
  if(element==="photo"||element.startsWith("media:")||rule.startsWith("media."))return {kind:"element",element:"photo",label:"Edit the photo"};
  const shapeId=finding.target?.uid||finding.anchor?.shapeId||(element.startsWith("shape:")?element.slice(6):null);
  if(shapeId||rule.startsWith("decoration."))return {kind:"shape",uid:shapeId||null,label:"Edit the shape"};
  if(rule.startsWith("format.")||rule.startsWith("layout.")||rule.startsWith("structural."))return {kind:"text",role:"hero",label:"Edit placement"};
  return null;
}

export function hasNonAcknowledgementAction(actions=[]){
  return actions.some(action=>action&&action.kind!=="ack"&&action.kind!=="acknowledge"&&action.kind!=="keep");
}
