import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { z } from "zod";
import { collectionSchema, type Asset } from "../domain/edit";
import { createManualDraft } from "../domain/manual";
import { digest, inside, localSource, probe, runFfmpeg, workspaceDirectory } from "./local-media";

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/);
const identity = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
export const importSchema = z.object({
  version: z.literal(1), sourceRoot: z.string().min(1), tripId: identity, editorAccountId: identity,
  permittedAccountIds: z.array(identity).min(1),
  consent: z.literal("contributors-permitted-local-processing"),
  initialSelection: z.array(id).min(3).max(9).optional(),
  assets: z.array(z.object({
    id, ownerAccountId: identity, source: z.string().min(1),
    contributorPermission: z.literal("local-processing-and-private-recap-approved"),
    recapAllowed: z.literal(true), aiAllowed: z.literal(false),
    colorMode: z.literal("confirmed-sdr"),
  }).strict()).min(1).max(100),
}).strict();

/** Trusted, permissioned local files only; this is not an untrusted upload worker. */
export async function importLocal(raw: unknown, workspace = process.cwd()) {
  const request = importSchema.parse(raw);
  if (!request.permittedAccountIds.includes(request.editorAccountId)) throw new Error("The local editor must be included in the permission manifest.");
  if (new Set(request.assets.map((asset) => asset.id)).size !== request.assets.length) throw new Error("Duplicate asset IDs.");
  if (!isAbsolute(request.sourceRoot)) throw new Error("Provide an absolute path to the consented source folder.");
  const sourceRoot = await realpath(resolve(request.sourceRoot));
  const prepared: { source: string; extension: string; entry: typeof request.assets[number] }[] = [];
  let total = 0;
  // Preflight every file and consent before copying or preparing anything.
  for (const entry of request.assets) {
    const source = await localSource(sourceRoot, entry.source);
    const extension = extname(source).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".mp4", ".mov"].includes(extension)) throw new Error("Supported import inputs: JPEG/PNG and SDR MP4/MOV. Convert HEIC/Live Photos/HDR with a reviewed external workflow first.");
    const info = await stat(source);
    if (!info.isFile() || info.size > 500 * 1024 * 1024) throw new Error("Import files must be regular files no larger than 500 MiB.");
    total += info.size;
    if (total > 2 * 1024 ** 3) throw new Error("A local import is limited to 2 GiB.");
    prepared.push({ source, extension, entry });
  }
  const importId = randomUUID();
  const importsRoot = await workspaceDirectory(workspace, "private/imports");
  const derivativesRoot = await workspaceDirectory(workspace, "public/private");
  const stage = join(importsRoot, `.preparing-${importId}`);
  const destination = join(importsRoot, importId);
  await mkdir(join(stage, "originals"), { recursive: true });
  const createdDerivatives: string[] = [];
  const assets: Asset[] = [];
  const preparation: Record<string, unknown>[] = [];
  let committed = false;
  try {
    for (const { source, extension, entry } of prepared) {
      const original = join(stage, "originals", entry.id + extension);
      await copyFile(source, original);
      const originalHash = await digest(original);
      if (originalHash !== await digest(source)) throw new Error("A source changed during import.");
      const photo = [".jpg", ".jpeg", ".png"].includes(extension);
      const file = `private/${importId}-${entry.id}.${photo ? extension === ".png" ? "png" : "jpg" : "mp4"}`;
      const output = resolve(workspace, "public", file);
      createdDerivatives.push(output);
      let width: number, height: number, durationFrames: number | undefined, hasAudio = false;
      if (photo) {
        const meta = await sharp(original, { limitInputPixels: 40_000_000 }).metadata();
        if (!["jpeg", "png"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1) throw new Error("Only single-image JPEG/PNG photographs are supported.");
        const image = sharp(original, { limitInputPixels: 40_000_000 }).rotate()
          .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
          .toColourspace("srgb");
        const result = await (extension === ".png" ? image.png() : image.jpeg({ quality: 95 })).toFile(output);
        width = result.width; height = result.height;
      } else {
        const before = probe(original);
        const video = before.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
        if (!video || !["h264", "hevc"].includes(video.codec_name)) throw new Error("SDR video import requires H.264 or HEVC decoding support.");
        if (["smpte2084", "arib-std-b67"].includes(video.color_transfer) || /2020/.test(video.color_primaries ?? "") || /2020/.test(video.color_space ?? "") || (video.side_data_list ?? []).some((item: { side_data_type?: string }) => /dovi|dolby|mastering display|content light/i.test(item.side_data_type ?? ""))) throw new Error("HDR/wide-gamut footage requires an externally reviewed SDR Rec.709 conversion. No automatic tone map was applied.");
        const duration = Number(video.duration ?? before.format.duration);
        if (!Number.isFinite(duration) || duration <= 0 || duration > 120 || video.width * video.height > 40_000_000) throw new Error("Video must be at most 120 seconds and 40 megapixels per frame.");
        runFfmpeg(["-protocol_whitelist", "file,pipe", "-i", original, "-map", "0:v:0", "-map", "0:a:0?",
          "-vf", "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:out_color_matrix=bt709:out_range=tv,setsar=1,fps=30",
          "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-threads", "2", "-pix_fmt", "yuv420p",
          "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
          "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-map_metadata", "-1", "-map_chapters", "-1", "-movflags", "+faststart", output]);
        const after = probe(output, true);
        const normalized = after.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
        width = normalized.width; height = normalized.height; durationFrames = Number(normalized.nb_read_frames);
        hasAudio = after.streams.some((stream: { codec_type: string }) => stream.codec_type === "audio");
        if (normalized.codec_name !== "h264" || normalized.avg_frame_rate !== "30/1" || !Number.isInteger(durationFrames) || durationFrames! < 1) throw new Error("Normalization did not produce the required constant 30fps H.264 copy.");
      }
      assets.push({ id: entry.id, tripId: request.tripId, ownerAccountId: entry.ownerAccountId, version: 1,
        kind: photo ? "photo" : "video", file, width, height, durationFrames, hasAudio,
        recapAllowed: true, aiAllowed: false, ready: true, deleted: false });
      preparation.push({ assetId: entry.id, original: `originals/${entry.id}${extension}`, originalHash,
        preparedHash: await digest(output), orientation: "baked into pixels", metadata: "derivative metadata stripped",
        audio: hasAudio ? "first source track retained; AAC stereo 48kHz; no gain normalization" : "none" });
    }
    const collection = collectionSchema.parse({ tripId: request.tripId, accountId: request.editorAccountId,
      permittedAccountIds: request.permittedAccountIds, consent: request.consent, assets });
    const draft = request.initialSelection ? createManualDraft(collection, request.initialSelection) : undefined;
    await writeFile(join(stage, "collection.json"), JSON.stringify(collection, null, 2) + "\n");
    await writeFile(join(stage, "preparation.json"), JSON.stringify({ version: "local-sdr-v1", importId,
      createdAt: new Date().toISOString(), syntheticEvaluation: "not inferred", preparation }, null, 2) + "\n");
    if (draft) await writeFile(join(stage, "manual-draft.json"), JSON.stringify(draft, null, 2) + "\n");
    await rename(stage, destination);
    committed = true;
    return { importId, count: assets.length, collectionPath: join(destination, "collection.json"), draftPath: draft ? join(destination, "manual-draft.json") : null };
  } finally {
    if (!committed) {
      for (const file of createdDerivatives) if (inside(derivativesRoot, file)) await rm(file, { force: true });
      if (inside(importsRoot, stage)) await rm(stage, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error("Pass the path to an explicit local permission manifest.");
    console.log(JSON.stringify(await importLocal(JSON.parse(await readFile(process.argv[2], "utf8"))), null, 2));
  } catch (error) {
    // External parser stderr can include private source names/metadata. Do not echo it.
    console.error(error instanceof z.ZodError ? "Permission manifest is invalid; check the documented schema." : error instanceof Error && !('stderr' in error) ? error.message : "Media preparation failed. Check supported formats and local decoder availability.");
    process.exitCode = 1;
  }
}
