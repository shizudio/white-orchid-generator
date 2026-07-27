export const READINESS_POLICY_VERSION=1;

export const READINESS_DOMAINS=Object.freeze({
  TECHNICAL:"technical",
  ACCESSIBILITY:"accessibility",
  BRAND:"brand",
  CHANNEL:"channel",
  APPROVAL:"approval",
});

const DOMAIN_ORDER=Object.freeze(Object.values(READINESS_DOMAINS));

export function readinessDomainForFinding(finding={}){
  const rule=String(finding.ruleId||"");
  if(rule==="format.platform-occlusion")return READINESS_DOMAINS.CHANNEL;
  if(rule.startsWith("format.")||rule.startsWith("content.")||rule.startsWith("media."))return READINESS_DOMAINS.TECHNICAL;
  if(rule.startsWith("surface."))return READINESS_DOMAINS.ACCESSIBILITY;
  if(rule.startsWith("typography.minimum")||rule==="typography.surface-contrast")return READINESS_DOMAINS.ACCESSIBILITY;
  if(rule.startsWith("logo.")||rule.startsWith("decoration.")||rule.startsWith("structural.")||rule==="typography.brand-register")return READINESS_DOMAINS.BRAND;
  if(finding.category==="contrast"||finding.category==="type-size")return READINESS_DOMAINS.ACCESSIBILITY;
  if(finding.category==="safe-zone")return READINESS_DOMAINS.CHANNEL;
  if(finding.category==="logo"||finding.category==="composition")return READINESS_DOMAINS.BRAND;
  return READINESS_DOMAINS.TECHNICAL;
}

export function findingHasActionableRemedy(finding={}){
  if(finding.fix||finding.proposedFix||finding.logoMoveTo||finding.switchTarget)return true;
  if(Array.isArray(finding.commands)&&finding.commands.length)return true;
  if(Array.isArray(finding.actions)&&finding.actions.some(action=>action&&action.kind!=="acknowledge"&&action.kind!=="keep"))return true;
  if(Array.isArray(finding.policy?.remedies)&&finding.policy.remedies.length)return true;
  if(finding.field||finding.element||finding.category==="copy-limit"||finding.category==="type-size")return true;
  return false;
}

export function createReadinessPolicyState(findings=[]){
  const rows=(Array.isArray(findings)?findings:[]).filter(Boolean);
  const domains=Object.fromEntries(DOMAIN_ORDER.map(id=>[id,{id,status:"clear",findingIds:[]}]))
  const blockers=[];
  const approvalRequired=[];
  for(const finding of rows){
    const domain=readinessDomainForFinding(finding);
    const entry=domains[domain];
    entry.findingIds.push(finding.id);
    if(finding.severity==="fail"){
      entry.status="blocked";
      blockers.push({...finding,remedyAvailable:findingHasActionableRemedy(finding)});
    }else if(entry.status==="clear")entry.status="review";
    if(finding.policy?.enforcement==="require-approval"||
      (Array.isArray(finding.commands)&&finding.commands.some(command=>command?.requiresApproval!==false))){
      approvalRequired.push(finding.id);
    }
  }
  if(approvalRequired.length){
    domains.approval.status="review";
    domains.approval.findingIds.push(...approvalRequired);
  }
  const blockersWithoutRemedy=blockers.filter(item=>!item.remedyAvailable);
  const frozenDomains=Object.fromEntries(Object.entries(domains).map(([id,entry])=>[id,Object.freeze({...entry,findingIds:Object.freeze([...entry.findingIds])})]));
  return Object.freeze({
    version:READINESS_POLICY_VERSION,
    status:blockers.length?"blocked":rows.length?"review":"ready",
    canPublish:blockers.length===0,
    domains:Object.freeze(frozenDomains),
    blockers:Object.freeze(blockers),
    blockersWithoutRemedy:Object.freeze(blockersWithoutRemedy),
    approvalRequired:Object.freeze(approvalRequired),
  });
}

/**
 * Acknowledgement means reviewed, never approved. This projection lets the UI hide
 * repeated prompts while preserving the blocking publish state until a future
 * permissioned exception supplies real approval evidence.
 */
export function createReadinessReviewState(findings=[],isAcknowledged=()=>false){
  const rows=(Array.isArray(findings)?findings:[]).filter(Boolean);
  const policy=createReadinessPolicyState(rows);
  const open=[],acknowledged=[];
  for(const finding of rows)(isAcknowledged(finding)?acknowledged:open).push(finding);
  const blockerIds=new Set(policy.blockers.map(item=>item.id));
  const openBlockers=open.filter(item=>blockerIds.has(item.id));
  const acknowledgedBlockers=acknowledged.filter(item=>blockerIds.has(item.id));
  return Object.freeze({
    policy,
    status:policy.canPublish?"ready":openBlockers.length?"blocked":"approval-required",
    canPublish:policy.canPublish,
    open:Object.freeze(open),
    acknowledged:Object.freeze(acknowledged),
    openBlockers:Object.freeze(openBlockers),
    acknowledgedBlockers:Object.freeze(acknowledgedBlockers),
  });
}

export function findingAcknowledgedByMap(acknowledgements,dimensionId,finding={}){
  return Object.values(acknowledgements||{}).some(acknowledgement=>{
    if(!acknowledgement||acknowledgement.dimensionId!==dimensionId||acknowledgement.issueId!==finding.id)return false;
    if(finding.fingerprint)return acknowledgement.fingerprint===finding.fingerprint;
    if(finding.geometryFingerprint)return acknowledgement.geometryFingerprint===finding.geometryFingerprint;
    return !acknowledgement.fingerprint&&!acknowledgement.geometryFingerprint;
  });
}

export function createExportAuthorization(check,currentDimensionId){
  const formats=Array.isArray(check?.formats)?check.formats:[];
  if(!formats.length)return Object.freeze({known:false,allAllowed:false,currentAllowed:false,firstBlockedDimensionId:null,blockedDimensionIds:Object.freeze([])});
  const blocked=formats.filter(format=>{
    if(format?.policyState)return !format.policyState.canPublish;
    return format?.ready===false;
  });
  const current=formats.find(format=>format.dimensionId===currentDimensionId)||null;
  return Object.freeze({
    known:true,
    allAllowed:blocked.length===0,
    currentAllowed:current
      ? (current.policyState ? current.policyState.canPublish : current.ready!==false)
      : false,
    firstBlockedDimensionId:blocked[0]?.dimensionId||null,
    blockedDimensionIds:Object.freeze(blocked.map(format=>format.dimensionId)),
  });
}

/* ── EDITING GRACE for background freshness work (typing lag, 2026-07-27) ──────
   Three background passes recompute freshness across all six formats: the format
   preview queue (400ms after a design change), the manual-edit harmonizer (600ms
   after an edit burst) and the readiness sweep (2s after a design change). Each
   builds six FULL-SIZE offscreen canvases and re-renders the whole design into
   them. Measured on a petal_window design at 4x CPU throttle, they landed between
   keystrokes — 187 offscreen drawImage and 972 measureText calls inside a single
   keystroke's window, per-keystroke input→paint p50 432ms against the D2 active-
   redraw budget of 150ms.

   None of them is a render the owner is waiting on: they refresh the format strip's
   thumbnails, its "N blocked" count and the advisory repair. The live canvas already
   honours an editing grace for the role being typed into (renderScene's editingRole);
   this extends the same grace to the background work. While a text field is focused
   the pass does not schedule; blur re-runs its effect, so the freshness lands once,
   against settled copy. The predicate lives here so all three sites read ONE rule
   instead of three hand-mirrored copies (M6). */
export function shouldDeferFreshnessWork({editingRole=null}={}){
  return editingRole!=null&&editingRole!==false&&editingRole!=="";
}
