import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { importLocal } from "./import-local";
import { bindExport, createEvaluation } from "./evaluate";
import { assessReview } from "../domain/review";

// Literal synthetic inputs only. No user paths, credentials, footage or model calls.
const names = ["shot-1.jpg", "clip-2.mp4", "shot-3.jpg", "shot-4.jpg", "clip-5.mp4", "shot-6.jpg"];
const imported = await importLocal({ version: 1, sourceRoot: resolve("public/fixtures"), tripId: "synthetic-import",
  editorAccountId: "fixture-editor", permittedAccountIds: ["fixture-editor"], consent: "contributors-permitted-local-processing",
  initialSelection: names.map((_, i) => `import-test-${i+1}`),
  assets: names.map((source, i) => ({ id: `import-test-${i+1}`, ownerAccountId: "fixture-owner", source,
    contributorPermission: "local-processing-and-private-recap-approved", recapAllowed: true, aiAllowed: false, colorMode: "confirmed-sdr" })) });
assert.ok(imported.draftPath);
const draftPath = imported.draftPath!;
const draft = JSON.parse(await readFile(draftPath, "utf8"));
draft.shots[1].originalAudio = true;
await writeFile(draftPath, JSON.stringify(draft, null, 2) + "\n");
const output = join(imported.collectionPath, "..", "smoke.mp4");
execFileSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "scripts/render.ts", draftPath, imported.collectionPath, output], { timeout: 180_000, stdio: "pipe", maxBuffer: 4 * 1024 * 1024 });
const folder = resolve("private/evaluations", `synthetic-${randomUUID()}`);
await createEvaluation(draftPath, imported.collectionPath, output, folder);
const review = JSON.parse(await readFile(join(folder, "review.json"), "utf8"));
assert.equal(assessReview(review), "pending");
const args = ["node_modules/tsx/dist/cli.mjs", "scripts/review-summary.ts", folder];
const summary = JSON.parse(execFileSync(process.execPath, args, { encoding: "utf8" }));
assert.deepEqual([summary.pending, summary.accepted, summary.invalidOrRevoked], [1, 0, 0]);
const originalDraft = await readFile(draftPath, "utf8");
draft.shots[0].crop.x = 0.25;
await writeFile(draftPath, JSON.stringify(draft));
await assert.rejects(bindExport(draftPath, imported.collectionPath, output), /exact draft/);
await writeFile(draftPath, originalDraft);
const collectionText = await readFile(imported.collectionPath, "utf8");
const collection = JSON.parse(collectionText); collection.assets[0].recapAllowed = false;
await writeFile(imported.collectionPath, JSON.stringify(collection));
let blocked = false;
try { execFileSync(process.execPath, args, { stdio: "pipe" }); }
catch (error) { blocked = JSON.parse(String((error as { stdout: Buffer }).stdout)).invalidOrRevoked === 1; }
assert.equal(blocked, true);
await writeFile(imported.collectionPath, collectionText);
console.log("Synthetic local import → manual selection/original sound → render → private review bundle passed. Initial creative review stayed pending; changed crops and revoked eligibility blocked acceptance.");
