import { test } from "node:test";
import assert from "node:assert/strict";
import collectionJson from "../fixtures/collection.json";
import draftJson from "../fixtures/mixed-media.json";
import { validateEdit, replaceShot } from "./edit";

test("exact frame edit is deterministic and a replacement preserves slot timing", () => {
  const { collection, draft } = validateEdit(collectionJson, draftJson);
  assert.deepEqual(validateEdit(collection, draft).draft, draft);
  const replacement = replaceShot(collection, draft, 2, "synthetic-8");
  assert.equal(replacement.revision, 2);
  assert.equal(replacement.shots[2].start, draft.shots[2].start);
  assert.equal(replacement.shots[2].duration, draft.shots[2].duration);
  assert.equal(draft.shots[2].assetId, "synthetic-3");
});

test("revoked, deleted, stale, cross-trip or unready sources fail closed", () => {
  for (const changes of [{ recapAllowed: false }, { deleted: true }, { version: 2 }, { tripId: "other-trip" }, { ready: false }]) {
    const collection = structuredClone(collectionJson);
    Object.assign(collection.assets[0], changes);
    assert.throws(() => validateEdit(collection, draftJson), /unavailable|ineligible|changed/);
  }
  assert.throws(() => validateEdit({ ...collectionJson, permittedAccountIds: ["someone-else"] }, draftJson), /membership/);
  assert.throws(() => validateEdit(collectionJson, { ...draftJson, creatorAccountId: "guest-name" }), /ownership/);
});

test("out-of-range segments, gaps, overlaps, duplicate shots and unsupported crops are rejected", () => {
  for (const change of [{ duration: 100 }, { start: 7 }, { assetId: "synthetic-1" }, { sourceStart: 149 }, { crop: { layout: "generated-fill", x: 0, y: 0 } }]) {
    const draft = structuredClone(draftJson);
    Object.assign(draft.shots[1], change);
    assert.throws(() => validateEdit(collectionJson, draft));
  }
  assert.throws(() => validateEdit(collectionJson, { ...draftJson, shots: draftJson.shots.slice(0, 5) }), /450/);
});

test("must-include conflicts are visible; exclusions cannot be silently ignored", () => {
  assert.throws(() => validateEdit(collectionJson, { ...draftJson, mustInclude: ["synthetic-8"] }), /must-include/);
  assert.throws(() => validateEdit(collectionJson, { ...draftJson, excluded: ["synthetic-1"] }), /excluded/);
});

test("model-shaped paths, URLs, executable fields and absent consent are rejected", () => {
  for (const file of ["https://example.com/a.jpg", "private/../../.env.local", "/etc/passwd", "private/a.mp4?token=secret"]) {
    const collection = structuredClone(collectionJson);
    collection.assets[0].file = file;
    assert.throws(() => validateEdit(collection, draftJson));
  }
  assert.throws(() => validateEdit({ ...collectionJson, consent: undefined }, draftJson));
  assert.throws(() => validateEdit(collectionJson, { ...draftJson, command: "render something" }));
});
