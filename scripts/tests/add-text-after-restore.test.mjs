import test from "node:test";
import assert from "node:assert/strict";
import { applyDesignCommand, createDesignDocumentV1 } from "../../lib/design-document.mjs";
import { planTemplateApplicationWorkflow } from "../../lib/design-composite-workflows.mjs";
import { ELEMENT_CLASSES } from "../../lib/text-elements.mjs";

// ── "still cant add anything other than the given default fills" ──────────────
// The client's add-text complaint was a DOWNSTREAM consequence of the restore
// blanking (see fix(sessions) 2026-07-27): a restored session arrived with every copy
// field empty, so the canvas painted no text at all — and the Text panel that hosts
// "+ Add text" is reached by clicking a painted text element. With nothing to click,
// the only routes left were the chat quick-actions, which write the DEFAULT fields.
// This test freezes the shape of that failure: a restored document must still carry
// its text, and every add class must land on it.

const storedDesign = () => createDesignDocumentV1({
  headline: "Autumn open day",
  subtext: "Saturday at ten",
  copyAuthors: { headline: "owner", subtext: "owner" },
});

const restore = (stored, intent) => {
  const boot = createDesignDocumentV1();     // the freshly mounted, copy-less canvas
  const groups = planTemplateApplicationWorkflow({
    document: stored, currentDocument: boot, intent, alreadyMaterialized: true,
  });
  return groups.reduce((doc, g) => g.commands.reduce(
    (next, command) => applyDesignCommand(next, command).document, doc), boot);
};

const nonEmptyText = document => (document.content.elements || []).filter(e => e.text && e.text.trim());

test("a restored session still paints text, so the add-text surface is reachable", () => {
  const restored = restore(storedDesign(), "restore");
  assert.ok(nonEmptyText(restored).length >= 2,
    "a restored design carries its copy — there is something on the canvas to click");
});

test("the pre-fix shape is the canary: a re-skin restore leaves nothing to click", () => {
  const blanked = restore(storedDesign(), "reskin");
  assert.equal(nonEmptyText(blanked).length, 0,
    "this is the state the client was in; if this stops being empty the canary needs rewriting");
});

test("every add class lands on a restored document — no silent no-op (M2)", () => {
  let document = restore(storedDesign(), "restore");
  const outcomes = {};
  for (const cls of ELEMENT_CLASSES) {
    const before = document;
    const result = applyDesignCommand(document, {
      type: "content/add-element", element: { class: cls, text: `New ${cls}` },
    });
    document = result.document;
    assert.ok(result.changedPaths.length > 0, `adding a ${cls} changed nothing`);
    assert.notEqual(document, before, `adding a ${cls} produced the same document`);
    // Either a genuine new element, or the ratified slot fill into a declared role.
    const added = (document.content.elements || []).filter(e => !e.sourceRole).length
      - (before.content.elements || []).filter(e => !e.sourceRole).length;
    const filled = (document.content.elements || []).some(e =>
      e.sourceRole && e.text === `New ${cls}`);
    assert.ok(added === 1 || filled, `adding a ${cls} neither added an element nor filled a slot`);
    outcomes[cls] = added === 1 ? "element" : "slot-fill";
  }
  // The copy that was restored is never displaced by an add.
  assert.equal(document.content.headline, "Autumn open day");
  assert.equal(document.content.subtext, "Saturday at ten");
  assert.equal(Object.keys(outcomes).length, 5);
});
