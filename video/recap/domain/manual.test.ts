import { test } from "node:test";
import assert from "node:assert/strict";
import collectionJson from "../fixtures/collection.json";
import { collectionSchema, replaceShot } from "./edit";
import { createManualDraft } from "./manual";

test("manual selection preserves chosen order, full-image framing and replacement", () => {
  const collection = collectionSchema.parse(collectionJson);
  const ids = ["synthetic-8", "synthetic-3", "synthetic-1"];
  const draft = createManualDraft(collection, ids);
  assert.deepEqual(draft.shots.map((shot) => shot.assetId), ids);
  assert.equal(draft.audio, "none");
  assert.equal(draft.shots.reduce((sum, shot) => sum + shot.duration, 0), 450);
  assert.equal(replaceShot(collection, draft, 1, "synthetic-2").shots[1].assetId, "synthetic-2");
  assert.throws(() => createManualDraft(collection, ["synthetic-video-2", "synthetic-1", "synthetic-2", "synthetic-video-2"]), /different/);
  collection.assets.find((asset) => asset.id === "synthetic-video-2")!.durationFrames = 30;
  assert.throws(() => createManualDraft(collection, ["synthetic-video-2", "synthetic-1", "synthetic-2"]), /shorter/);
});
