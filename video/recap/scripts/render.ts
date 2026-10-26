import { bundle } from "@remotion/bundler";
import { makeCancelSignal, renderMedia, selectComposition } from "@remotion/renderer";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, copyFile, link, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { validateEdit } from "../domain/edit";
import { verifyExport } from "./verify";

// Developer-operated local prototype only. No web endpoint or uploaded code.
const draftPath = resolve(process.argv[2] || "fixtures/mixed-media.json");
const collectionPath = resolve(process.argv[3] || "fixtures/collection.json");
const output = resolve(process.argv[4] || `artifacts/recap-${Date.now()}.mp4`);
if (!output.endsWith(".mp4")) throw new Error("Output must be an MP4.");
try { await access(output); throw new Error("Output exists; choose a new filename."); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
const started = performance.now();
const initialDraft = await readFile(draftPath, "utf8");
const initialCollection = await readFile(collectionPath, "utf8");
const inputProps = validateEdit(JSON.parse(initialCollection), JSON.parse(initialDraft));
const sourceRoot = await realpath("public");
const stage = await mkdtemp(join(tmpdir(), "voyroo-recap-"));
const temporaryOutput = join(dirname(output), `.${randomUUID()}.mp4`);
const { cancelSignal, cancel } = makeCancelSignal();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
const selected = new Set(inputProps.draft.shots.map((shot) => shot.assetId));
const hashes = new Map<string, string>();
const files = new Map<string, string>();
const hash = async (path: string) => createHash("sha256").update(await readFile(path)).digest("hex");
try {
  for (const asset of inputProps.collection.assets.filter((asset) => selected.has(asset.id))) {
    const source = await realpath(join(sourceRoot, asset.file));
    const local = relative(sourceRoot, source);
    if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) throw new Error("Source is outside the approved local media directory.");
    const probe = JSON.parse(execFileSync(process.env.FFPROBE_PATH || "ffprobe", ["-v", "error", "-show_streams", "-of", "json", source], { encoding: "utf8", timeout: 20_000 }));
    const video = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
    if (!video || video.width !== asset.width || video.height !== asset.height) throw new Error("Source dimensions differ from the approved manifest.");
    if (asset.kind === "video" && (video.codec_name !== "h264" || video.avg_frame_rate !== "30/1" || Math.floor(Number(video.duration) * 30) < asset.durationFrames!)) throw new Error("Prototype videos must be normalized 30fps H.264 with verified duration.");
    if (asset.kind === "photo" && !["mjpeg", "png"].includes(video.codec_name)) throw new Error("Prototype photos must be JPEG or PNG.");
    const target = join(stage, "media", asset.file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target, constants.COPYFILE_EXCL);
    const sourceHash = await hash(source);
    if (await hash(target) !== sourceHash) throw new Error("A source changed while it was being staged.");
    hashes.set(asset.id, sourceHash); files.set(asset.id, source);
  }
  if (inputProps.draft.audio === "fixture-score") {
    await mkdir(join(stage, "media", "fixtures"), { recursive: true });
    await copyFile("public/fixtures/score.wav", join(stage, "media", "fixtures", "score.wav"));
  }
  // Strip unselected asset paths from browser input; only selected copies are served.
  inputProps.collection.assets = inputProps.collection.assets.filter((asset) => selected.has(asset.id));
  const serveUrl = await bundle({ entryPoint: resolve("composition/index.tsx"), publicDir: join(stage, "media"), outDir: join(stage, "bundle") });
  const composition = await selectComposition({ serveUrl, id: "VoyrooRecap", inputProps });
  await mkdir(dirname(output), { recursive: true });
  await renderMedia({ composition, serveUrl, inputProps, codec: "h264", audioCodec: "aac", pixelFormat: "yuv420p", colorSpace: "bt709", imageFormat: "png", crf: 18, x264Preset: "medium", concurrency: 2, outputLocation: temporaryOutput, cancelSignal, timeoutInMilliseconds: 60_000 });
  const technical = verifyExport(temporaryOutput, inputProps.draft.audio !== "none" || inputProps.draft.shots.some((shot) => shot.originalAudio));
  // A developer may withdraw eligibility or replace a source while rendering.
  if (await readFile(draftPath, "utf8") !== initialDraft || await readFile(collectionPath, "utf8") !== initialCollection) throw new Error("Draft or collection changed during render. Output was not published.");
  validateEdit(JSON.parse(await readFile(collectionPath, "utf8")), inputProps.draft);
  for (const [id, source] of files) if (await hash(source) !== hashes.get(id)) throw new Error("A source changed during render. Output was not published.");
  await link(temporaryOutput, output); // Atomic, refuses to overwrite an existing export.
  const report = { template: inputProps.draft.template, revision: inputProps.draft.revision,
    draftHash: createHash("sha256").update(initialDraft).digest("hex"), exportHash: await hash(output),
    sourceHashes: Object.fromEntries(hashes), ...technical, totalSeconds: (performance.now() - started) / 1000, providerCostUsd: 0, hostedCost: "unmeasured", humanEvaluation: "not performed" };
  await writeFile(`${output}.json`, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ output, ...report }, null, 2));
} finally {
  // Both targets were created by this invocation. No user-selected directory is deleted.
  await rm(temporaryOutput, { force: true });
  const stageResolved = resolve(stage);
  if (stageResolved.startsWith(resolve(tmpdir()) + sep) && stageResolved.includes("voyroo-recap-")) await rm(stageResolved, { recursive: true, force: true });
  process.removeListener("SIGINT", cancel); process.removeListener("SIGTERM", cancel);
}
