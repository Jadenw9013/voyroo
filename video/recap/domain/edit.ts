import { z } from "zod";

export const FORMAT = { width: 1080, height: 1920, fps: 30, durationInFrames: 450 } as const;
export const TEMPLATE = "keepsake-v1";
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const assetSchema = z.object({
  id, tripId: id, ownerAccountId: id, version: z.number().int().positive(),
  kind: z.enum(["photo", "video"]), file: z.string().regex(/^(fixtures|private)\/[a-zA-Z0-9_-]+\.(jpg|png|mp4)$/),
  width: z.number().int().positive(), height: z.number().int().positive(),
  durationFrames: z.number().int().positive().optional(),
  recapAllowed: z.boolean(), aiAllowed: z.boolean(), ready: z.boolean(), deleted: z.boolean(),
}).strict();
export const cropSchema = z.object({
  layout: z.enum(["contain", "cover"]), x: z.number().min(0).max(1), y: z.number().min(0).max(1),
}).strict();
export const shotSchema = z.object({
  assetId: id, assetVersion: z.number().int().positive(), start: z.number().int().nonnegative(),
  duration: z.number().int().min(30).max(150), sourceStart: z.number().int().nonnegative(),
  crop: cropSchema, transition: z.literal("cut"), originalAudio: z.boolean(),
}).strict();
export const collectionSchema = z.object({
  tripId: id, accountId: id, permittedAccountIds: z.array(id).min(1),
  consent: z.literal("contributors-permitted-local-processing"),
  assets: z.array(assetSchema).min(1).max(100),
}).strict();
export const draftSchema = z.object({
  tripId: id, creatorAccountId: id, revision: z.number().int().positive(),
  template: z.literal(TEMPLATE), mustInclude: z.array(id), excluded: z.array(id),
  shots: z.array(shotSchema).min(3).max(9), audio: z.enum(["none", "fixture-score"]),
}).strict();
export type Asset = z.infer<typeof assetSchema>;
export type Collection = z.infer<typeof collectionSchema>;
export type Draft = z.infer<typeof draftSchema>;
export type Shot = z.infer<typeof shotSchema>;

/** Local fixtures use an explicit manifest. Hosted callers must replace this
 * trust boundary with verified membership and fresh server metadata (M2).
 * Never accept model-provided URLs, paths or code as composition input.
 */
export function validateEdit(rawCollection: unknown, rawDraft: unknown) {
  const collection = collectionSchema.parse(rawCollection);
  const draft = draftSchema.parse(rawDraft);
  const fail = (message: string): never => { throw new Error(message); };
  if (draft.tripId !== collection.tripId || draft.creatorAccountId !== collection.accountId || !collection.permittedAccountIds.includes(collection.accountId)) fail("Trip membership or draft ownership does not match.");
  const assets = new Map(collection.assets.map((asset) => [asset.id, asset]));
  if (assets.size !== collection.assets.length) fail("Asset IDs must be unique.");
  const selected = new Set<string>();
  let end = 0;
  for (const shot of draft.shots) {
    const asset = assets.get(shot.assetId);
    if (!asset || asset.tripId !== draft.tripId || !asset.ready || asset.deleted || !asset.recapAllowed || asset.version !== shot.assetVersion) fail("An asset is unavailable, ineligible or has changed. Refresh the edit.");
    if (selected.has(shot.assetId) || draft.excluded.includes(shot.assetId)) fail("Duplicate or excluded asset in edit.");
    if (shot.start !== end) fail("Shots must form a continuous timeline without gaps or overlap.");
    if (asset!.kind === "video" && (asset!.durationFrames === undefined || shot.sourceStart + shot.duration > asset!.durationFrames)) fail("A video segment extends beyond the approved source.");
    if (asset!.kind === "photo" && (shot.sourceStart !== 0 || shot.originalAudio)) fail("Photos cannot have source offsets or audio.");
    selected.add(shot.assetId);
    end += shot.duration;
  }
  if (end !== FORMAT.durationInFrames) fail("The recap must be exactly 450 frames (15 seconds).");
  if (draft.mustInclude.some((assetId) => !selected.has(assetId))) fail("A must-include selection is missing or conflicts with an exclusion. Replace another shot first.");
  if (draft.audio === "fixture-score" && draft.shots.some((shot) => !shot.assetId.startsWith("synthetic-") || !assets.get(shot.assetId)!.file.startsWith("fixtures/"))) fail("The diagnostic score is restricted to synthetic examples. Choose music-free for real footage.");
  return { collection, draft };
}

export function replaceShot(collection: Collection, draft: Draft, index: number, assetId: string): Draft {
  const asset = collection.assets.find((candidate) => candidate.id === assetId);
  if (!asset || !draft.shots[index]) throw new Error("Choose an available asset and shot.");
  const shots = structuredClone(draft.shots);
  shots[index] = { ...shots[index], assetId, assetVersion: asset.version, sourceStart: 0, originalAudio: false, crop: { layout: "contain", x: 0.5, y: 0.5 } };
  return validateEdit(collection, { ...draft, shots, revision: draft.revision + 1 }).draft;
}
