import { execFileSync, spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export function verifyExport(file: string, expectAudio?: boolean) {
  const started = performance.now();
  const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
  const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
  const probe = JSON.parse(execFileSync(ffprobe, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", file], { encoding: "utf8", timeout: 120_000 }));
  const video = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "video");
  const audio = probe.streams.find((stream: { codec_type: string }) => stream.codec_type === "audio");
  if (!video || video.codec_name !== "h264" || video.width !== 1080 || video.height !== 1920 || video.pix_fmt !== "yuv420p" || video.avg_frame_rate !== "30/1" || Number(video.nb_read_frames) !== 450 || Math.abs(Number(video.duration) - 15) > 1/30) throw new Error(`Export violates the video contract: ${JSON.stringify({ codec: video?.codec_name, width: video?.width, height: video?.height, pixelFormat: video?.pix_fmt, fps: video?.avg_frame_rate, frames: video?.nb_read_frames, seconds: video?.duration })}`);
  if (expectAudio !== undefined && !!audio !== expectAudio) throw new Error("Unexpected audio track configuration.");
  if (audio && (audio.codec_name !== "aac" || Math.abs(Number(audio.duration) - 15) > 0.08)) throw new Error("Audio codec/duration does not match export.");
  execFileSync(ffmpeg, ["-v", "error", "-xerror", "-i", file, "-f", "null", "-"], { timeout: 120_000, stdio: ["ignore", "ignore", "pipe"] });
  let diagnostics = "";
  try {
    const result = spawnSync(ffmpeg, ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.03:pix_th=0.02", ...(audio ? ["-af", "astats=metadata=0:reset=0"] : []), "-f", "null", "-"], { encoding: "utf8", timeout: 120_000 });
    if (result.status !== 0) throw new Error("Diagnostics failed.");
    diagnostics = result.stderr;
  } catch { throw new Error("Could not run final media diagnostics."); }
  if (/black_start:/.test(diagnostics)) throw new Error("Unexpected black frames detected; inspect the source and edit.");
  const peaks = [...diagnostics.matchAll(/Peak level dB: ([-\d.]+)/g)].map((match) => Number(match[1]));
  if (peaks.some((peak) => peak >= -0.1)) throw new Error("Audio peak needs review for clipping.");
  return { width: video.width, height: video.height, codec: video.codec_name, pixelFormat: video.pix_fmt, frames: 450, fps: 30, seconds: 15, audioCodec: audio?.codec_name ?? null, audioPeakDb: peaks.length ? Math.max(...peaks) : null, decode: "passed", unexpectedBlackFrames: false, verificationSeconds: (performance.now() - started) / 1000 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Pass a local MP4 path.");
  const result = verifyExport(resolve(process.argv[2]));
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
