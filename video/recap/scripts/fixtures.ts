import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { TEMPLATE, type Asset, type Collection, type Draft } from "../domain/edit";

await mkdir("public/fixtures", { recursive: true });
await mkdir("fixtures", { recursive: true });
const palettes = [["#184d6b", "#f7cc70"], ["#b65f41", "#ffdfaa"], ["#245e56", "#bfe6c3"], ["#3c5598", "#cedaf5"], ["#67518a", "#ffdaa1"], ["#38657e", "#fff2ba"], ["#48714c", "#e1e6c0"], ["#a05656", "#f4d5b1"]];
const assets: Asset[] = [];
for (let index = 0; index < 8; index++) {
  const width = index % 3 === 1 ? 960 : 540;
  const height = index % 3 === 1 ? 540 : 960;
  const [base, accent] = palettes[index];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 540 960" preserveAspectRatio="none"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${base}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="540" height="960" fill="url(#sky)"/><circle cx="400" cy="250" r="75" fill="${accent}"/><path d="M0 650L160 390L380 690L540 510V960H0Z" fill="${base}"/><path d="M0 790Q280 650 540 810V960H0Z" fill="${accent}" opacity=".4"/><path d="M0 850Q260 750 540 900" fill="none" stroke="${accent}" stroke-width="3"/>${[36,270,504].map((x, i) => `<circle cx="${x}" cy="500" r="22" fill="white"/><text x="${x}" y="507" text-anchor="middle" fill="${base}" font-size="20" font-family="sans-serif">${i+1}</text>`).join("")}<text x="32" y="72" fill="white" font-size="24" font-family="sans-serif">Synthetic fixture ${index+1}</text><text x="32" y="915" fill="white" font-size="18" font-family="sans-serif">Crop targets · not travel footage</text></svg>`;
  await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toFile(`public/fixtures/shot-${index+1}.jpg`);
  assets.push({ id: `synthetic-${index+1}`, tripId: "synthetic-trip", ownerAccountId: `fixture-owner-${index%3}`, version: 1, kind: "photo", file: `fixtures/shot-${index+1}.jpg`, width, height, recapAllowed: true, aiAllowed: false, ready: true, deleted: false });
}
for (const n of [2, 5]) {
  // An actual moving H.264 clip with known timing, plus a quiet diagnostic tone.
  execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-loop", "1", "-i", `public/fixtures/shot-${n}.jpg`, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-vf", "zoompan=z='1+0.001*on':d=1:s=540x960:fps=30", "-t", "5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-af", "volume=0.03", "-movflags", "+faststart", `public/fixtures/clip-${n}.mp4`], { timeout: 60_000 });
  assets.push({ ...assets[n-1], id: `synthetic-video-${n}`, kind: "video", file: `fixtures/clip-${n}.mp4`, width: 540, height: 960, durationFrames: 150 });
}
// Original diagnostic arpeggio. No samples, external recordings or melody source.
// This score is intentionally restricted to synthetic fixture exports.
const rate = 48000, samples = rate * 15;
const wav = Buffer.alloc(44 + samples * 2);
wav.write("RIFF"); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(rate, 24); wav.writeUInt32LE(rate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(samples * 2, 40);
const notes = [220, 261.6256, 329.6276, 440, 196, 261.6256, 329.6276, 392];
for (let i = 0; i < samples; i++) {
  const t = i / rate;
  let signal = 0;
  for (let beat = Math.max(0, Math.floor(t / 0.5) - 4); beat <= Math.floor(t / 0.5); beat++) {
    const elapsed = t - beat * 0.5;
    const freq = beat >= 24 ? [220, 261.6256, 329.6276][(beat - 24) % 3] : notes[beat % notes.length];
    signal += Math.sin(2 * Math.PI * freq * elapsed) * Math.exp(-elapsed * 4) * Math.min(1, elapsed * 200) * 0.14;
  }
  const fade = Math.min(1, t / 0.1, (15 - t) / 1.5);
  wav.writeInt16LE(Math.round(signal * Math.max(0, fade) * 32767), 44 + i * 2);
}
await writeFile("public/fixtures/score.wav", wav);
const collection: Collection = { tripId: "synthetic-trip", accountId: "fixture-editor", permittedAccountIds: ["fixture-editor"], consent: "contributors-permitted-local-processing", assets };
await writeFile("fixtures/collection.json", JSON.stringify(collection, null, 2) + "\n");
for (const mode of ["photo-only", "mixed-orientation", "mixed-media"] as const) {
  const ids = mode === "mixed-media" ? ["synthetic-1", "synthetic-video-2", "synthetic-3", "synthetic-4", "synthetic-video-5", "synthetic-6"] : Array.from({ length: 6 }, (_, i) => `synthetic-${i+1}`);
  const durations = [90, 60, 75, 75, 60, 90];
  let start = 0;
  const draft: Draft = { tripId: collection.tripId, creatorAccountId: collection.accountId, revision: 1, template: TEMPLATE, mustInclude: [ids[0]], excluded: [], audio: mode === "mixed-media" ? "fixture-score" : "none", shots: ids.map((assetId, i) => {
    const source = assets.find((asset) => asset.id === assetId)!;
    const shot = { assetId, assetVersion: 1, start, duration: durations[i], sourceStart: 0, crop: { layout: mode === "photo-only" && source.width < source.height ? "cover" as const : "contain" as const, x: 0.5, y: 0.5 }, transition: "cut" as const, originalAudio: false };
    start += shot.duration;
    return shot;
  }) };
  await writeFile(`fixtures/${mode}.json`, JSON.stringify(draft, null, 2) + "\n");
}
console.log("Generated 8 photos, 2 clips, score, collection and 3 edit examples. No private footage.");
