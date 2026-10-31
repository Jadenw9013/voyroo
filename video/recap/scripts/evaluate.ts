import { copyFile, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { validateEdit } from "../domain/edit";
import { pendingReview } from "../domain/review";
import { digest, inside, runFfmpeg, workspaceDirectory } from "./local-media";
import { verifyExport } from "./verify";

export async function bindExport(draftPath: string, collectionPath: string, exportPath: string, workspace = process.cwd()) {
  const draftText = await readFile(draftPath, "utf8");
  const collectionText = await readFile(collectionPath, "utf8");
  const { collection, draft } = validateEdit(JSON.parse(collectionText), JSON.parse(draftText));
  const report = JSON.parse(await readFile(exportPath + ".json", "utf8"));
  const exportHash = await digest(exportPath);
  if (report.exportHash !== exportHash || report.draftHash !== await digest(draftPath) || report.revision !== draft.revision || report.template !== draft.template) throw new Error("Export is not bound to this exact draft/file. Render a fresh revision before evaluation.");
  const sources = [];
  const publicRoot = await realpath(resolve(workspace, "public"));
  for (const shot of draft.shots) {
    const asset = collection.assets.find((candidate) => candidate.id === shot.assetId)!;
    const file = await realpath(join(publicRoot, asset.file));
    if (!inside(publicRoot, file) || report.sourceHashes[asset.id] !== await digest(file)) throw new Error("A source is missing, outside the approved folder or changed since render.");
    sources.push({ asset, shot, file });
  }
  return { collection, draft, sources, exportHash, report };
}

export async function createEvaluation(draftPath: string, collectionPath: string, exportPath: string, destination: string, workspace = process.cwd()) {
  const bound = await bindExport(draftPath, collectionPath, exportPath, workspace);
  const root = resolve(workspace, "private/evaluations");
  if (!inside(root, destination) || resolve(destination) === root) throw new Error("Evaluation output must be a new folder under private/evaluations/.");
  const actualRoot = await workspaceDirectory(workspace, "private/evaluations");
  // One fresh direct child prevents nested symlink escapes and overwriting runs.
  const child = relative(root, resolve(destination));
  if (!child || child.includes("/") || child.includes("\\")) throw new Error("Choose a single new run folder directly inside private/evaluations/.");
  await mkdir(destination);
  let complete = false;
  try {
    const technical = verifyExport(exportPath, bound.draft.audio !== "none" || bound.draft.shots.some((shot) => shot.originalAudio));
    await mkdir(join(destination, "sources"));
    for (const { asset, file } of bound.sources) await copyFile(file, join(destination, "sources", asset.file.split("/").at(-1)!));
    await copyFile(exportPath, join(destination, "export.mp4"));
    await writeFile(join(destination, "draft.json"), JSON.stringify(bound.draft, null, 2) + "\n");
    await writeFile(join(destination, "technical.json"), JSON.stringify(technical, null, 2) + "\n");
    const indices = [...new Set(bound.draft.shots.flatMap((shot) => [shot.start, shot.start + Math.floor(shot.duration / 2), shot.start + shot.duration - 1]))];
    runFfmpeg(["-i", exportPath, "-vf", `select='${indices.map((frame) => `eq(n,${frame})`).join("+")}',scale=180:320`, "-fps_mode", "vfr", join(destination, "frame-%02d.png")]);
    const overlays = indices.map((_, index) => ({ input: join(destination, `frame-${String(index + 1).padStart(2, "0")}.png`), left: (index % 3) * 180, top: Math.floor(index / 3) * 320 }));
    await sharp({ create: { width: 540, height: bound.draft.shots.length * 320, channels: 3, background: "#e9edf3" } }).composite(overlays).png().toFile(join(destination, "shot-boundaries.png"));
    await writeFile(join(destination, "review.json"), JSON.stringify(pendingReview(bound.exportHash, bound.draft.shots.length), null, 2) + "\n");
    await writeFile(join(destination, "binding.json"), JSON.stringify({ exportHash: bound.exportHash, draftPath: resolve(draftPath), collectionPath: resolve(collectionPath), exportPath: resolve(exportPath) }, null, 2) + "\n");
    const checklist = await readFile(resolve(workspace, "../../evals/recap/QUALITY-CHECKLIST.md"), "utf8");
    await writeFile(join(destination, "CHECKLIST.md"), checklist);
    const sourceLinks = bound.sources.map(({ asset, shot }, index) => `<li>Shot ${index + 1}: ${shot.start}–${shot.start + shot.duration - 1} frames; <a href="sources/${asset.file.split("/").at(-1)}">full uncropped prepared source ${asset.id}</a>; video source offset ${shot.sourceStart} frames.</li>`).join("");
    await writeFile(join(destination, "index.html"), `<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private recap review</title><style>body{font:16px system-ui;max-width:900px;margin:24px auto;padding:0 20px;line-height:1.6}video{width:min(100%,360px)}img{max-width:100%}</style><h1>Private recap review</h1><p>Creative assessment is pending. This is a local review copy; keep it private. Complete CHECKLIST.md and review.json, then run evaluate:summary. Technical checks do not answer the traveler's questions.</p><video controls playsinline src="export.mp4"></video><h2>Compare full sources</h2><ol>${sourceLinks}</ol><h2>Start, middle and end of each shot</h2><img src="shot-boundaries.png" alt="Three frames per shot, one row per shot"><p><a href="CHECKLIST.md">Review checklist</a> · <a href="review.json">Pending review record</a></p>`);
    // Reject mutation during review-package creation too.
    await bindExport(draftPath, collectionPath, exportPath, workspace);
    if (await digest(join(destination, "export.mp4")) !== bound.exportHash) throw new Error("Export changed while copying the review package.");
    complete = true;
    return { status: "pending", shots: bound.draft.shots.length, technical: "passed" };
  } finally { if (!complete && inside(actualRoot, destination)) await rm(destination, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [draft, collection, output, destination] = process.argv.slice(2);
    if (!destination) throw new Error("Usage: evaluate <draft.json> <collection.json> <export.mp4> private/evaluations/<new-run>");
    console.log(JSON.stringify(await createEvaluation(resolve(draft), resolve(collection), resolve(output), resolve(destination))));
  } catch { console.error("Review bundle was not created. Confirm a fresh bound export, current permissions/sources, and a new direct child of private/evaluations/."); process.exitCode = 1; }
}
