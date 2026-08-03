import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/* ── Migration-file structure guard (2026-07-29 media organization) ───────────
   The owner runs lib/migrations/2026-07-29-media-organization.sql BY HAND in
   the Supabase SQL editor, possibly more than once. This test parses it as text
   and fails closed if any statement loses its idempotency guard or the ratified
   mappings drift. It is a structure check, not an execution check — the live
   proof is the API's fallback behaviour against the un-migrated DB. */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.join(HERE, "..", "..", "lib", "migrations", "2026-07-29-media-organization.sql");
const SCHEMA = path.join(HERE, "..", "..", "lib", "schema.sql");

const sql = readFileSync(MIGRATION, "utf8");
const schema = readFileSync(SCHEMA, "utf8");

// Strip -- comments so guards are asserted against real statements only.
const code = sql.split("\n").map(l => l.replace(/--.*$/, "")).join("\n");
const statements = code.split(";").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean);

test("every statement is guarded (idempotent) — safe to re-run top-to-bottom", () => {
  for (const stmt of statements) {
    const lower = stmt.toLowerCase();
    const guarded =
      /if exists|if not exists/.test(lower) ||                    // drop/add guards
      (/^update /.test(lower) && / where /.test(lower)) ||        // WHERE-guarded UPDATE (converges)
      /^alter table \w+ add constraint/.test(lower);              // paired with a preceding drop-if-exists (asserted below)
    assert.ok(guarded, `unguarded statement in migration: ${stmt.slice(0, 120)}…`);
  }
});

test("each ADD CONSTRAINT is preceded by its DROP CONSTRAINT IF EXISTS (idempotent pair)", () => {
  const adds = [...code.matchAll(/alter table (\w+) add constraint (\w+)/gi)];
  assert.ok(adds.length >= 2, "expected the images + exports check constraints");
  for (const [, table, name] of adds) {
    const dropRe = new RegExp(`alter table ${table} drop constraint if exists ${name}`, "i");
    assert.match(code, dropRe, `add constraint ${name} has no drop-if-exists partner`);
    assert.ok(
      code.search(dropRe) < code.indexOf(`add constraint ${name}`),
      `drop-if-exists for ${name} must run BEFORE the add`,
    );
  }
});

test("the ratified source_type mapping: drop check → UPDATE both legacy values → re-add new check", () => {
  const dropAt = code.search(/alter table images drop constraint if exists images_source_type_check/i);
  const genAt = code.search(/update images set source_type = 'generated'\s+where source_type = 'midjourney_render'/i);
  const upAt = code.search(/update images set source_type = 'uploaded'\s+where source_type = 'real_photo'/i);
  const addAt = code.search(/alter table images add constraint images_source_type_check/i);
  assert.ok(dropAt >= 0, "missing: drop the old CHECK");
  assert.ok(genAt >= 0, "missing: midjourney_render → generated mapping");
  assert.ok(upAt >= 0, "missing: real_photo → uploaded mapping");
  assert.ok(addAt >= 0, "missing: re-add the new CHECK");
  // Order matters: the old CHECK would reject the new values if the UPDATEs ran first.
  assert.ok(dropAt < genAt && dropAt < upAt, "the drop must precede the mapping UPDATEs");
  assert.ok(genAt < addAt && upAt < addAt, "the mapping UPDATEs must precede the new CHECK");
  // The new CHECK carries ONLY the new vocabulary.
  const check = code.slice(addAt).split(";")[0];
  assert.match(check, /'generated'/);
  assert.match(check, /'uploaded'/);
  assert.doesNotMatch(check, /midjourney_render|real_photo/);
});

test("consent_status is untouched (it stays an orthogonal dimension)", () => {
  assert.doesNotMatch(code, /consent_status/i);
});

test("images gains session_id (nullable text) + its grouping index, guarded", () => {
  assert.match(code, /alter table images add column if not exists session_id text/i);
  assert.match(code, /create index if not exists images_session_idx on images \(session_id, created_at desc\)/i);
  // Nullable on purpose: pre-migration rows honestly stay unlinked.
  assert.doesNotMatch(code, /session_id text not null/i);
});

test("exports is reshaped by ALTER (preserving pre-migration history rows), never dropped", () => {
  assert.doesNotMatch(code, /drop table/i, "the migration must never DROP TABLE — pre-migration export rows would be destroyed");
  for (const col of ["session_id", "dimension_id", "format"]) {
    assert.match(code, new RegExp(`alter table exports add column if not exists ${col}\\s+text`, "i"));
  }
  // The metadata → columns backfill for pre-migration rows, keyed on the marker
  // legacyExportRow writes, coalesce-guarded so a re-run changes nothing.
  assert.match(code, /update exports set[\s\S]*?coalesce\(session_id,\s*metadata->>'session_id'\)[\s\S]*?where \(metadata->>'pre_migration'\) = 'true'/i);
});

test("the obsolete exports scaffold columns are all dropped, if-exists-guarded", () => {
  for (const col of ["source_image_id", "post_type", "channel", "logo_variant_id", "logo_position", "logo_size"]) {
    assert.match(code, new RegExp(`alter table exports drop column if exists ${col}`, "i"));
  }
});

test("schema.sql mirrors the migrated end-state (fresh DBs need no migration)", () => {
  // images: new vocabulary in the CREATE, old vocabulary gone from live SQL.
  assert.match(schema, /source_type\s+text not null check \(source_type in \('generated','uploaded'\)\)/);
  const schemaCode = schema.split("\n").map(l => l.replace(/--.*$/, "")).join("\n");
  assert.doesNotMatch(schemaCode, /midjourney_render|real_photo/, "legacy vocabulary must not survive in schema.sql statements");
  // images lineage + exports new shape present.
  assert.match(schemaCode, /alter table images add column if not exists session_id text/i);
  assert.match(schemaCode, /create table if not exists exports \([\s\S]*?session_id\s+text[\s\S]*?dimension_id\s+text[\s\S]*?format\s+text check \(format in \('png','jpeg'\)\)[\s\S]*?\)/i);
  // exports old scaffold columns gone from the fresh CREATE.
  const exportsCreate = schemaCode.slice(schemaCode.search(/create table if not exists exports/i));
  const createBody = exportsCreate.slice(0, exportsCreate.indexOf(";"));
  for (const col of ["post_type", "channel", "logo_variant_id", "source_image_id"]) {
    assert.ok(!createBody.includes(col), `obsolete column ${col} survives in schema.sql exports CREATE`);
  }
});
