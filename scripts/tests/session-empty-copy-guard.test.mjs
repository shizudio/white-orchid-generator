import test from "node:test";
import assert from "node:assert/strict";
import { shouldHoldEmptyingSave } from "../../lib/sessions.js";
import { createPersistedDesignPayload, documentCopyIsEmpty, persistedCopyIsEmpty } from "../../lib/design-persistence.mjs";
import { createDesignDocumentV1 } from "../../lib/design-document.mjs";

// ── The tombstone guard (data-loss defence, 2026-07-27) ──────────────────────
// A restore bug blanked a restored post's copy and the debounced autosave then wrote the
// emptied document over the client's good stored record. The guard is the second line:
// no save may turn a design that HAD words into one with none unless the owner asked.

const payload = document => createPersistedDesignPayload(document, { dimensionId:"ig_portrait" });
const record = (id, document) => ({ id, state:payload(document) });

const withCopy = () => createDesignDocumentV1({
  headline:"A week of creativity",
  subtext:"Join us on Saturday",
  copyAuthors:{ headline:"owner", subtext:"owner" },
});
const blank = () => createDesignDocumentV1();
const onlyAddedElement = () => createDesignDocumentV1({
  elements:[{ uid:"el_body_owner", class:"body", text:"My added note", authorship:"owner" }],
});

test("copy emptiness counts every legacy role AND every added element", () => {
  assert.equal(documentCopyIsEmpty(blank()), true);
  assert.equal(documentCopyIsEmpty(withCopy()), false);
  assert.equal(documentCopyIsEmpty(onlyAddedElement()), false,
    "a design whose only words live in an added element is not empty");
  assert.equal(documentCopyIsEmpty(createDesignDocumentV1({ headline:"   " })), true,
    "whitespace is not copy");
});

test("emptiness reads through the persisted payload, and fails OPEN on junk", () => {
  assert.equal(persistedCopyIsEmpty(payload(withCopy())), false);
  assert.equal(persistedCopyIsEmpty(payload(blank())), true);
  // A payload that cannot be read must never be reported empty — the guard would
  // then hold a legitimate save.
  assert.equal(persistedCopyIsEmpty({ get persistenceVersion(){ throw new Error("boom"); } }), false);
});

test("the guard holds exactly the write that destroys copy", () => {
  const stored = record("s_1", withCopy());
  const emptied = record("s_1", blank());
  assert.equal(shouldHoldEmptyingSave(stored, emptied), true,
    "stored had words, incoming has none, no owner clear → HOLD");
});

test("a deliberate owner clear still saves", () => {
  const stored = record("s_1", withCopy());
  const emptied = record("s_1", blank());
  assert.equal(shouldHoldEmptyingSave(stored, emptied, { copyEmptiedByOwner:true }), false);
});

test("the guard never blocks a normal save", () => {
  const stored = record("s_1", withCopy());
  assert.equal(shouldHoldEmptyingSave(stored, record("s_1", withCopy())), false, "copy → copy");
  assert.equal(
    shouldHoldEmptyingSave(stored, record("s_1", createDesignDocumentV1({ headline:"New words" }))),
    false, "copy → different copy");
  assert.equal(shouldHoldEmptyingSave(record("s_1", blank()), record("s_1", blank())), false,
    "a design that never had words can save empty forever");
  assert.equal(shouldHoldEmptyingSave(null, record("s_1", blank())), false, "no stored baseline → save");
  assert.equal(shouldHoldEmptyingSave(stored, { id:"s_1" }), false, "no incoming state → not our business");
  assert.equal(shouldHoldEmptyingSave({ id:"s_1" }, record("s_1", blank())), false, "no stored state → save");
  assert.equal(
    shouldHoldEmptyingSave(record("s_1", onlyAddedElement()), record("s_1", onlyAddedElement())),
    false, "element-only copy round-trips");
});

test("dropping the last added element from an otherwise blank design is still a hold", () => {
  assert.equal(shouldHoldEmptyingSave(record("s_1", onlyAddedElement()), record("s_1", blank())), true);
  assert.equal(
    shouldHoldEmptyingSave(record("s_1", onlyAddedElement()), record("s_1", blank()), { copyEmptiedByOwner:true }),
    false, "…unless the owner removed it");
});
