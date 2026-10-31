import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { importLocal } from "./import-local";
import { digest, probe } from "./local-media";

const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
function ff(args: string[]) { execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args], { timeout: 60_000, stdio: ["ignore", "ignore", "pipe"] }); }
function manifest(sourceRoot: string, sources: string[]) {
  return { version: 1, sourceRoot, tripId: "local-test", editorAccountId: "editor", permittedAccountIds: ["editor"],
    consent: "contributors-permitted-local-processing", assets: sources.map((source, i) => ({ id: `test-${i+1}`, ownerAccountId: "uploader",
      source, contributorPermission: "local-processing-and-private-recap-approved", recapAllowed: true, aiAllowed: false, colorMode: "confirmed-sdr" })) };
}

test("real parser path normalizes synthetic EXIF rotation and VFR/rotated MOV while preserving originals", async () => {
  const root = await mkdtemp(join(tmpdir(), "recap-import-test-"));
  try {
    await sharp({ create: { width: 120, height: 80, channels: 3, background: "#b6634d" } }).jpeg()
      .withMetadata({ orientation: 6 }).withExif({ IFD0: { Artist: "synthetic-sensitive-metadata" } }).toFile(join(root, "rotated.jpg"));
    ff(["-f", "lavfi", "-i", "testsrc2=size=96x64:rate=30:duration=5", "-f", "lavfi", "-i", "sine=frequency=440:duration=5",
      "-vf", "select='if(lt(t,2),not(mod(n,2)),1)'", "-fps_mode", "vfr", "-c:v", "libx264", "-c:a", "aac", "-color_primaries", "bt709", "-color_trc", "bt709", join(root, "vfr.mov")]);
    ff(["-display_rotation", "90", "-i", join(root, "vfr.mov"), "-c", "copy", join(root, "rotated.mov")]);
    const originalHash = await digest(join(root, "rotated.jpg"));
    const result = await importLocal(manifest(root, ["rotated.jpg", "rotated.mov"]), root);
    const collection = JSON.parse(await readFile(result.collectionPath, "utf8"));
    const photo = collection.assets[0], clip = collection.assets[1];
    assert.deepEqual([photo.width, photo.height], [80, 120]);
    const imageMeta = await sharp(join(root, "public", photo.file)).metadata();
    assert.equal(imageMeta.exif, undefined); assert.equal(imageMeta.orientation, undefined);
    assert.equal(await digest(join(root, "rotated.jpg")), originalHash);
    assert.equal(await digest(join(result.collectionPath, "..", "originals", "test-1.jpg")), originalHash);
    assert.deepEqual([clip.width, clip.height], [64, 96]);
    assert.equal(clip.hasAudio, true);
    const normalized = probe(join(root, "public", clip.file), true).streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
    assert.equal(normalized.avg_frame_rate, "30/1"); assert.equal(normalized.codec_name, "h264");
    assert.equal(normalized.pix_fmt, "yuv420p"); assert.ok(clip.durationFrames >= 149);
    assert.equal(result.draftPath, null); // No automatic selection from newly imported media.
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("SDR HEVC decoder path is exercised with a synthetic clip; HDR is rejected without silent tone mapping", async () => {
  const root = await mkdtemp(join(tmpdir(), "recap-hevc-test-"));
  try {
    ff(["-f", "lavfi", "-i", "testsrc2=size=64x96:rate=30:duration=1", "-c:v", "libx265", "-x265-params", "log-level=error:pools=1", "-color_primaries", "bt709", "-color_trc", "bt709", join(root, "sdr.mp4")]);
    const imported = await importLocal(manifest(root, ["sdr.mp4"]), root);
    const collection = JSON.parse(await readFile(imported.collectionPath, "utf8"));
    assert.equal(collection.assets[0].hasAudio, false);
    ff(["-f", "lavfi", "-i", "testsrc2=size=64x96:rate=30:duration=1", "-c:v", "libx264", "-colorspace", "bt2020nc", "-color_range", "tv", "-color_primaries", "bt2020", "-color_trc", "smpte2084", join(root, "hdr.mp4")]);
    assert.match(probe(join(root, "hdr.mp4")).streams[0].color_space, /2020/);
    const before = await readdir(join(root, "public/private"));
    await assert.rejects(importLocal(manifest(root, ["hdr.mp4"]), root), /HDR/);
    assert.deepEqual(await readdir(join(root, "public/private")), before);
    const request = manifest(root, ["sdr.mp4"]);
    request.assets[0].contributorPermission = "not-approved";
    await assert.rejects(importLocal(request, root));
    await writeFile(join(root, "unsupported.heic"), "synthetic");
    await assert.rejects(importLocal(manifest(root, ["unsupported.heic"]), root), /Supported import inputs/);
    await assert.rejects(importLocal(manifest(root, ["../sdr.mp4"]), root), /relative file/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
