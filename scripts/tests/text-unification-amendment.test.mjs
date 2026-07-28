/**
 * Text Unification — Amendment 2026-07-27 (client rulings, ratified).
 *
 * docs/text-unification-spec.md §Amendment:
 *   1. DEFAULT FILLS ARE HEADING + BODY — the ratified label vocabulary + the
 *      subtext→body class remap + the body→support slot fill.
 *   2. CLASS-EXCLUSIVE ADDS — one of each class maximum, enforced in the ONE
 *      reducer both the UI picker and the AI's addTextElement compile into; a
 *      refusal carries the ratified reason (never a silent no-op, M2). The chat
 *      belt refuses up front via the same designState truth.
 *   3. BODY IS NOT REPEATABLE — internal sectioning instead: the paragraph-flow
 *      per-element property (content/set-element-flow) and the pure paragraph
 *      layout the painters share (lib/body-paragraphs.mjs).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { textRoleLabel } from "../../lib/text-role-labels.mjs";
import {
  classExclusiveReason, elementClassesInUse, isElementFlow,
  ELEMENT_CLASSES, ELEMENT_FLOW_MODES,
} from "../../lib/text-elements.mjs";
import {
  applyDesignCommand, createDesignDocumentV1, DESIGN_COMMAND_TYPES, isDesignCommand,
} from "../../lib/design-document.mjs";
import { compileDesignPatchCommands } from "../../lib/design-patch-commands.mjs";
import { detectAddElement, addElementClassRefusal } from "../../lib/assistant-intents.js";
import {
  splitParagraphs, layoutParagraphFlow, PARAGRAPH_GAP_RATIO, MIN_COLUMN_PX,
} from "../../lib/body-paragraphs.mjs";

// ── RULING 1 — DEFAULT FILLS ARE HEADING + BODY ──────────────────────────────
test("(ruling 1) the ratified label vocabulary presents the default slots as Heading + Body", () => {
  // The fresh-design default (photo_logo): primary = HEADING, secondary = BODY.
  assert.equal(textRoleLabel("photo_logo", "hero"), "Heading");
  assert.equal(textRoleLabel("photo_logo", "support"), "Body");
  // The legacy "Caption"/"Support" vocabulary is retired everywhere it appeared.
  assert.equal(textRoleLabel("text_post", "support"), "Body");
  assert.equal(textRoleLabel("texture_text", "support"), "Body");
  // Deliberate archetype voices survive (they were never the retired vocabulary).
  assert.equal(textRoleLabel("quote", "hero"), "Quote");
  assert.equal(textRoleLabel("quote", "support"), "Attribution");
  assert.equal(textRoleLabel("event", "hero"), "Title");
  assert.equal(textRoleLabel("event", "support"), "Details");
});

test("(ruling 1) a fresh design's filled defaults PROJECT as heading + body", () => {
  const doc = createDesignDocumentV1({ headline:"Open day", subtext:"Saturday at ten" });
  const classes = doc.content.elements.map(el => `${el.sourceRole}:${el.class}`);
  assert.deepEqual(classes, ["headline:heading", "subtext:body"]);
  assert.deepEqual([...elementClassesInUse(doc.content)].sort(), ["body", "heading"]);
});

test("(ruling 1) stored documents are untouched in storage — the remap is projection-only", () => {
  // The class lives on the PROJECTION; the fixed fields (the painted truth for
  // migrated roles) are byte-identical through a save/reload round-trip.
  const stored = createDesignDocumentV1({ headline:"Kept", subtext:"As it was" });
  const reloaded = createDesignDocumentV1(JSON.parse(JSON.stringify(stored)));
  assert.equal(JSON.stringify(reloaded.content), JSON.stringify(stored.content));
  assert.equal(reloaded.content.headline, "Kept");
  assert.equal(reloaded.content.subtext, "As it was");
});

// ── RULING 2 — CLASS-EXCLUSIVE ADDS (one reducer, one rule) ──────────────────
const addCommand = (cls, text = "X") => ({
  type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT, element:{ class:cls, text },
});

test("(ruling 2) every class refuses a duplicate — UI command path, with the ratified reason", () => {
  // Seed one of each class: heading+body via the default fills, caption via the
  // date line, cta + subheading as added elements.
  let doc = createDesignDocumentV1({ headline:"H", subtext:"B", dateText:"18 Sep" });
  doc = applyDesignCommand(doc, addCommand("cta", "Enrol")).document;
  doc = applyDesignCommand(doc, addCommand("subheading", "Sub")).document;
  assert.deepEqual([...elementClassesInUse(doc.content)].sort(),
    ["body", "caption", "cta", "heading", "subheading"]);
  for (const cls of ELEMENT_CLASSES) {
    const result = applyDesignCommand(doc, addCommand(cls, "Second"));
    assert.deepEqual(result.changedPaths, [], `${cls}: a duplicate must change nothing`);
    assert.equal(result.refusal.class, cls);
    assert.equal(result.refusal.reason, classExclusiveReason(cls));
  }
  // The Body reason ENCOURAGES internal sectioning (ruling 3), verbatim.
  assert.equal(classExclusiveReason("body"),
    "Your design has a Body — add another paragraph inside it instead.");
  assert.match(classExclusiveReason("heading"), /already has a Heading — edit it in the list above/);
  assert.match(classExclusiveReason("cta"), /already has a Button/);
});

test("(ruling 2) the AI's addTextElement compiles into the SAME refused command", () => {
  const doc = createDesignDocumentV1({ subtext:"Existing body" });
  const plan = compileDesignPatchCommands({ addTextElement:{ class:"body", text:"Another" } });
  const entry = plan.afterMaterialization.find(e => e.patchField === "addTextElement");
  assert.ok(isDesignCommand(entry.command));
  const result = applyDesignCommand(doc, entry.command);
  assert.deepEqual(result.changedPaths, []);
  assert.equal(result.refusal.class, "body");
  assert.match(result.refusal.reason, /add another paragraph inside it/);
  // The bound is class uniqueness ONLY: an unused class still lands freely.
  const ok = applyDesignCommand(doc, compileDesignPatchCommands({
    addTextElement:{ class:"caption", text:"18 Sep" },
  }).afterMaterialization[0].command);
  assert.ok(ok.changedPaths.length > 0);
  assert.equal(ok.refusal, undefined);
});

test("(ruling 2) a replay/restore add with an explicit uid is exempt (grandfathered docs round-trip)", () => {
  const doc = createDesignDocumentV1({ subtext:"Body one" });
  const result = applyDesignCommand(doc, {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_body_7", class:"body", text:"Stored second body" },
  });
  assert.ok(result.changedPaths.includes("content.elements.el_body_7"));
  assert.equal(result.refusal, undefined);
});

test("(ruling 2) the no-model chat belt refuses up front with the honest redirect", () => {
  // The interception path: detectAddElement → class-in-use check on designState →
  // refusal reply, NO patch (mirrors app/api/assistant/route.js belt 0.5).
  const ae = detectAddElement("add a body paragraph saying more details");
  assert.equal(ae.class, "body");
  const designState = { elementClasses:["heading", "body"] };
  const refusal = addElementClassRefusal(designState, ae.class);
  assert.match(refusal, /already has a Body/);
  assert.match(refusal, /paragraph/);
  // Not in use → no refusal, the belt proceeds to patch.addTextElement.
  assert.equal(addElementClassRefusal({ elementClasses:["heading"] }, "body"), null);
  assert.equal(addElementClassRefusal({}, "cta"), null);
  // Non-body classes redirect to editing the existing one.
  assert.match(addElementClassRefusal({ elementClasses:["cta"] }, "cta"), /already has a button/);
});

// ── RULING 3 — PARAGRAPH FLOW PROPERTY (content/set-element-flow) ────────────
test("(ruling 3) the flow vocabulary is closed at stacked | columns", () => {
  assert.deepEqual([...ELEMENT_FLOW_MODES], ["stacked", "columns"]);
  assert.equal(isElementFlow("stacked"), true);
  assert.equal(isElementFlow("columns"), true);
  assert.equal(isElementFlow("grid"), false);
});

test("(ruling 3) set-element-flow round-trips on master, per-format, clears, and no-ops (M2)", () => {
  let doc = createDesignDocumentV1({ subtext:"One\nTwo" });
  const uid = "legacy:subtext";
  // Master flow.
  let result = applyDesignCommand(doc, { type:"content/set-element-flow", uid, value:"columns" });
  assert.deepEqual(result.changedPaths, [`content.elements.${uid}.master.flow`]);
  doc = result.document;
  assert.equal(doc.content.elements.find(e => e.uid === uid).master.flow, "columns");
  // Same value = no-op (no dead undo entry).
  assert.deepEqual(applyDesignCommand(doc, { type:"content/set-element-flow", uid, value:"columns" }).changedPaths, []);
  // Invalid value = no-op refusal, never a junk write.
  assert.deepEqual(applyDesignCommand(doc, { type:"content/set-element-flow", uid, value:"diagonal" }).changedPaths, []);
  // Per-format override rides byDim like every format-aware property.
  result = applyDesignCommand(doc, { type:"content/set-element-flow", uid, value:"stacked", dimensionId:"story" });
  assert.deepEqual(result.changedPaths, [`content.elements.${uid}.byDim.story.flow`]);
  doc = result.document;
  assert.equal(doc.content.elements.find(e => e.uid === uid).byDim.story.flow, "stacked");
  // Persistence round-trip: the projection preserves master/byDim for the migrated body.
  const reloaded = createDesignDocumentV1(JSON.parse(JSON.stringify(doc)));
  const el = reloaded.content.elements.find(e => e.uid === uid);
  assert.equal(el.master.flow, "columns");
  assert.equal(el.byDim.story.flow, "stacked");
  // The flow SURVIVES editing the body's words (the live projection keeps metadata).
  const edited = applyDesignCommand(doc, {
    type:DESIGN_COMMAND_TYPES.CONTENT_SET_ELEMENT_TEXT, uid, value:"One\nTwo\nThree",
  }).document;
  assert.equal(edited.content.elements.find(e => e.uid === uid).master.flow, "columns");
  assert.equal(edited.content.subtext, "One\nTwo\nThree");
  // Clearing returns to the default.
  const cleared = applyDesignCommand(edited, { type:"content/set-element-flow", uid, value:null }).document;
  assert.equal(cleared.content.elements.find(e => e.uid === uid).master.flow, undefined);
});

test("(ruling 3) set-element-flow works identically on an ADDED body element", () => {
  let doc = createDesignDocumentV1({ subtext:"" });
  doc = applyDesignCommand(doc, {
    type:DESIGN_COMMAND_TYPES.CONTENT_ADD_ELEMENT,
    element:{ uid:"el_body_0", class:"body", text:"Para one\nPara two" },
  }).document;
  const result = applyDesignCommand(doc, { type:"content/set-element-flow", uid:"el_body_0", value:"columns" });
  assert.deepEqual(result.changedPaths, ["content.elements.el_body_0.master.flow"]);
  assert.equal(result.document.content.elements.find(e => e.uid === "el_body_0").master.flow, "columns");
});

// ── RULING 3 — PARAGRAPH LAYOUT (the painters' shared geometry) ──────────────
// A deterministic character-width wrap stands in for canvas measurement.
const CHAR_W = 10;
const wrap = (text, maxWidth) => {
  const perLine = Math.max(1, Math.floor(maxWidth / CHAR_W));
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > perLine) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
};
const measureLine = line => line.length * CHAR_W;

test("(ruling 3) splitParagraphs: line breaks split, blanks drop, never collapsed", () => {
  assert.deepEqual(splitParagraphs("One\nTwo"), ["One", "Two"]);
  assert.deepEqual(splitParagraphs("One\n\n  Two  \n"), ["One", "Two"]);
  assert.deepEqual(splitParagraphs("Just one"), ["Just one"]);
  assert.deepEqual(splitParagraphs(""), []);
  assert.deepEqual(splitParagraphs(null), []);
});

test("(ruling 3) stacked flow: paragraphs run down with a PARAGRAPH gap, not merely the next line", () => {
  const px = 20, lineHeight = 26;
  const plan = layoutParagraphFlow({
    paragraphs:["first paragraph words here", "second paragraph words here"],
    flow:"stacked", maxWidth:200, fontSize:px, lineHeight, wrap, measureLine,
  });
  assert.equal(plan.flow, "stacked");
  assert.equal(plan.blocks.length, 2);
  const [a, b] = plan.blocks;
  assert.equal(a.y, 0);
  // The second block starts after block A's lines PLUS the paragraph gap.
  assert.equal(b.y, a.lines.length * lineHeight + lineHeight * PARAGRAPH_GAP_RATIO);
  assert.equal(plan.height, b.y + b.lines.length * lineHeight);
  assert.ok(plan.height > (a.lines.length + b.lines.length) * lineHeight,
    "paragraph spacing must add visible height beyond plain line stacking");
});

test("(ruling 3) columns flow: paragraphs sit side by side inside the same box", () => {
  const px = 20, lineHeight = 26;
  const plan = layoutParagraphFlow({
    paragraphs:["left column words", "right column words"],
    flow:"columns", maxWidth:400, fontSize:px, lineHeight, wrap, measureLine,
  });
  assert.equal(plan.flow, "columns");
  assert.equal(plan.blocks.length, 2);
  const [left, right] = plan.blocks;
  assert.equal(left.x, 0);
  assert.ok(right.x > left.width, "the second column starts past the first + gutter");
  assert.equal(left.y, 0);
  assert.equal(right.y, 0);
  assert.equal(plan.width, 400);
  assert.equal(plan.height, Math.max(left.lines.length, right.lines.length) * lineHeight);
  // The two flows are VISIBLY different layouts for the same text (the toggle's promise).
  const stacked = layoutParagraphFlow({
    paragraphs:["left column words", "right column words"],
    flow:"stacked", maxWidth:400, fontSize:px, lineHeight, wrap, measureLine,
  });
  assert.notEqual(plan.height, stacked.height);
});

test("(ruling 3) columns degrade to readable widths — never unreadable slivers", () => {
  const plan = layoutParagraphFlow({
    paragraphs:["one", "two", "three", "four"],
    flow:"columns", maxWidth:MIN_COLUMN_PX * 2, fontSize:20, lineHeight:26, wrap, measureLine,
  });
  for (const block of plan.blocks) {
    assert.ok(block.width >= MIN_COLUMN_PX || plan.flow === "stacked",
      "no column may be narrower than the readable floor");
  }
});

test("(ruling 3) unknown flow and single paragraphs degrade safely", () => {
  const single = layoutParagraphFlow({
    paragraphs:["only one"], flow:"columns", maxWidth:300, fontSize:20, lineHeight:26, wrap, measureLine,
  });
  assert.equal(single.blocks.length, 1);
  assert.equal(single.blocks[0].x, 0);
  const junk = layoutParagraphFlow({
    paragraphs:["a", "b"], flow:"spiral", maxWidth:300, fontSize:20, lineHeight:26, wrap, measureLine,
  });
  assert.equal(junk.flow, "stacked");
  assert.deepEqual(layoutParagraphFlow({ paragraphs:[], flow:"stacked", maxWidth:300, fontSize:20, lineHeight:26, wrap }).blocks, []);
});
