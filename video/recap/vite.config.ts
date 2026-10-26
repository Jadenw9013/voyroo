import { defineConfig } from "vite";
import { resolve } from "node:path";

// Local-only preview. No deployment, service worker, analytics or remote media.
export default defineConfig({
  server: { host: "127.0.0.1", port: Number(process.env.RECAP_EDITOR_PORT || "3400"), strictPort: true, cors: false,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    fs: { strict: true, allow: [resolve(".")], deny: ["**/.env*", "**/artifacts/**", "**/.git/**", "**/private/**"] },
  },
});
