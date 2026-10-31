import { TEMPLATE, validateEdit, type Collection, type Draft } from "./edit";

/** Explicit ordered human choice only. Never substitutes or drops a selection. */
export function createManualDraft(collection: Collection, assetIds: string[]): Draft {
  if (assetIds.length < 3 || assetIds.length > 9 || new Set(assetIds).size !== assetIds.length) {
    throw new Error("Choose 3–9 different moments in the order you want them shown.");
  }
  let start = 0;
  const draft: Draft = {
    tripId: collection.tripId, creatorAccountId: collection.accountId, revision: 1,
    template: TEMPLATE, mustInclude: [], excluded: [], audio: "none",
    shots: assetIds.map((assetId, index) => {
      const asset = collection.assets.find((candidate) => candidate.id === assetId);
      if (!asset) throw new Error("A selected moment is absent from this collection.");
      const duration = Math.floor(450 / assetIds.length) + (index < 450 % assetIds.length ? 1 : 0);
      if (asset.kind === "video" && (asset.durationFrames ?? 0) < duration) {
        throw new Error(`Moment ${index + 1} is shorter than its ${duration / 30}s hold. Choose more shots, use a photo, or edit the frame allocations in a saved draft; your selection was preserved.`);
      }
      const shot = { assetId, assetVersion: asset.version, start, duration, sourceStart: 0,
        crop: { layout: "contain" as const, x: 0.5, y: 0.5 }, transition: "cut" as const, originalAudio: false };
      start += duration;
      return shot;
    }),
  };
  return validateEdit(collection, draft).draft;
}
