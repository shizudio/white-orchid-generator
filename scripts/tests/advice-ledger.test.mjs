import test from "node:test";
import assert from "node:assert/strict";
import { ackKey, extractAuditFindings, findingDedupKey, mergeAuditIntoChecklist, normalizeAuditFinding, normalizeFinding, runLocalAudit, withoutAuditFindings } from "../../lib/audit-local.js";

const signal={
  dimensionId:"ig_square",hasMedia:true,hasText:true,textColorId:"burnham",backdropMode:"none",
  zoneContrast:{mean:2.2,min:1.8,zoneMeanL:0.08,flat:false},
  ready:{textBoxes:[{x:0.1,y:0.2,w:0.6,h:0.2}],logoBox:null,pinned:[]},copy:{headline:"Learn boldly"},
};

test("deterministic audit emits the canonical finding contract", () => {
  const [finding]=runLocalAudit(signal);
  assert.equal(finding.format,"ig_square");
  assert.equal(finding.elementId,"text");
  assert.deepEqual(finding.sources,["local"]);
  assert.ok(finding.fingerprint&&finding.geometryFingerprint&&finding.propertyFingerprint);
  assert.deepEqual(finding.proposedFix,{backdropMode:"band"});
  assert.equal(finding.actions[0].kind,"patch");
});

test("dedup identity is category plus element plus geometry, independent of messenger", () => {
  const local=normalizeFinding({id:"local",category:"composition",message:"Local",severity:"warn"},{dimensionId:"story",elementId:"logo",geometry:{x:0.7,y:0.8,w:0.2,h:0.1}});
  const ai=normalizeAuditFinding({category:"composition",message:"AI",severity:"warn"},{dimensionId:"story",element:"logo",fingerprint:local.geometryFingerprint});
  assert.equal(findingDedupKey(local),findingDedupKey(ai));
});

test("acknowledgement identity expires when an affected property changes", () => {
  const first=runLocalAudit(signal)[0];
  const changed=runLocalAudit({...signal,textColorId:"whiteSmoke"})[0];
  assert.notEqual(ackKey("ig_square",first,first.geometry),ackKey("ig_square",changed,changed.geometry));
});

test("one matching local and AI concern remains one ledger row", () => {
  const local=normalizeFinding({id:"local",category:"composition",message:"Local",severity:"warn"},{dimensionId:"story",elementId:"logo",geometry:{x:0.7,y:0.8,w:0.2,h:0.1}});
  const ai=normalizeAuditFinding({category:"composition",message:"A richer AI observation",severity:"warn"},{dimensionId:"story",element:"logo",fingerprint:local.geometryFingerprint,designFP:"design-1"});
  const merged=mergeAuditIntoChecklist({formats:[{dimensionId:"story",issues:[local],ready:false}]},[ai]);
  assert.equal(merged.formats[0].issues.length,1);
  assert.deepEqual(merged.formats[0].issues[0].sources,["local","ai-audit"]);
  assert.equal(extractAuditFindings(merged).length,1);
  assert.equal(withoutAuditFindings(merged).formats[0].issues.length,1);
});
