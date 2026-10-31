import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export async function digest(file: string) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}

export function inside(root: string, file: string) {
  const local = relative(resolve(root), resolve(file));
  return local !== ".." && !local.startsWith(`..${sep}`) && !isAbsolute(local);
}

export async function localSource(root: string, file: string) {
  if (isAbsolute(file) || file.includes(":") || file.split(/[\\/]/).includes("..")) throw new Error("Source must be a relative file inside the consented source folder.");
  const absolute = await realpath(resolve(root, file));
  if (!inside(await realpath(root), absolute)) throw new Error("Source symlinks must stay inside the consented folder.");
  return absolute;
}

export async function workspaceDirectory(workspace: string, folder: string) {
  const root = await realpath(workspace);
  let cursor = root;
  for (const part of folder.split(/[\\/]/)) {
    if (!part || part === "." || part === ".." || part.includes(":")) throw new Error("Invalid workspace directory.");
    const next = join(cursor, part);
    try { await mkdir(next); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    if ((await lstat(next)).isSymbolicLink()) throw new Error("Workspace output directories must not be symlinks or junctions.");
    cursor = await realpath(next);
    if (!inside(root, cursor) || !(await stat(cursor)).isDirectory()) throw new Error("Private/output directories must stay inside this workspace.");
  }
  return cursor;
}

export function probe(file: string, countFrames = false) {
  const args = ["-v", "error", "-protocol_whitelist", "file,pipe", ...(countFrames ? ["-count_frames"] : []), "-show_streams", "-show_format", "-of", "json", file];
  return JSON.parse(execFileSync(process.env.FFPROBE_PATH || "ffprobe", args, { encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024 }));
}

export function runFfmpeg(args: string[]) {
  // Caller supplies fixed argument arrays, never shell strings/model instructions.
  execFileSync(process.env.FFMPEG_PATH || "ffmpeg", ["-hide_banner", "-loglevel", "error", "-nostdin", "-n", ...args], { timeout: 180_000, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "ignore", "pipe"] });
}
