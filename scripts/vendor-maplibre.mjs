// MapLibre 6 starts its tile worker from a module file it expects beside its
// own; bundled, that file isn't there. Copy it into public/vendor under a
// versioned name (cached forever, offline too) for setWorkerUrl to point at.
// Runs after every install and before every build.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(root, "node_modules", "maplibre-gl");
const { version } = JSON.parse(readFileSync(join(pkg, "package.json"), "utf8"));
const out = join(root, "public", "vendor");
const name = `maplibre-gl-worker-${version}.mjs`;
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (f.startsWith("maplibre-gl-worker-") && f !== name) rmSync(join(out, f));
copyFileSync(join(pkg, "dist", "maplibre-gl-worker.mjs"), join(out, name));
console.log(`public/vendor/${name}`);
