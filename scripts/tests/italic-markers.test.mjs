import test from "node:test";
import assert from "node:assert/strict";
import {stripItalicMarkers, italicPhrase, applyEditedText} from "../../lib/italic-markers.mjs";

test("display strips paired markers but keeps the words",()=>{
  assert.equal(stripItalicMarkers("Now *Enrolling*"),"Now Enrolling");
  assert.equal(stripItalicMarkers("Freedom to *explore* today"),"Freedom to explore today");
  assert.equal(stripItalicMarkers(""),"");
  assert.equal(stripItalicMarkers(null),"");
});

test("italicPhrase returns the first marked phrase",()=>{
  assert.equal(italicPhrase("Now *Enrolling*"),"Enrolling");
  assert.equal(italicPhrase("Freedom to *explore* and *grow*"),"explore");
  assert.equal(italicPhrase("No emphasis here"),null);
});

test("showing then re-storing an untouched value is idempotent",()=>{
  const stored="Now *Enrolling*";
  const shown=stripItalicMarkers(stored);
  assert.equal(applyEditedText(stored,shown),stored);   // no duplicated/dropped markers
});

test("editing around the phrase preserves the italics",()=>{
  assert.equal(applyEditedText("Now *Enrolling*","Now Enrolling Today"),"Now *Enrolling* Today");
  assert.equal(applyEditedText("Now *Enrolling*","We are Enrolling"),"We are *Enrolling*");
});

test("removing the phrase honestly drops the italics — no stale marker",()=>{
  assert.equal(applyEditedText("Now *Enrolling*","Now Open"),"Now Open");
  assert.equal(applyEditedText("Now *Enrolling*",""),"");
});

test("a field with no prior emphasis stays clean",()=>{
  assert.equal(applyEditedText("Plain title","Plain title edited"),"Plain title edited");
});

test("pasted raw markers never double-wrap",()=>{
  // User pastes clean text that happens to contain markers → strip, then re-wrap once.
  assert.equal(applyEditedText("Now *Enrolling*","Now *Enrolling* soon"),"Now *Enrolling* soon");
});
