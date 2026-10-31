# Local recap quality prototype

This standalone workshop is an M1 evaluation tool, separate from the Next.js
planner. It has no hosted media API, trip authentication, uploads, AI calls or
background queue. Do not expose it to a network or deploy it. A local consent
manifest is a developer attestation, not server-verified trip authorization.

## Run

From this directory, with Node >=22.12 and FFmpeg/ffprobe on PATH:

```powershell
npm ci
npm run fixtures
npm run typecheck
npm test
npm run dev
```

Open http://127.0.0.1:3400. No environment variables or provider account is
required. The dev server binds only to loopback, sends no-store headers and
does not register a service worker. It serves the selected local files without
authentication: anyone with access to this computer can access them while it
runs. Stop the dev server when finished. Never bind to 0.0.0.0 or host it.

The editor uses the same `Recap` composition and frame timing as export.
Select one of six slots, replace its asset, choose full-image or portrait crop,
adjust crop position, trim a video's start, retain original sound, and set
must-include/excluded IDs. Replacing an asset resets framing to full-image.
Invalid edits report a conflict and preserve the previous valid draft. A
must-include moment must be unchecked before it can be replaced.

Choose **Save edit for export** to download JSON. The prototype intentionally
uses a developer-run command for MP4 export rather than introducing a web job
endpoint before private storage and a durable queue have been reviewed.

```powershell
npm run render -- fixtures/mixed-media.json fixtures/collection.json artifacts/mixed-media.mp4
npm run render -- fixtures/photo-only.json fixtures/collection.json artifacts/photo-only.mp4
npm run render -- fixtures/mixed-orientation.json fixtures/collection.json artifacts/mixed-orientation.mp4
# A saved edit can be anywhere local; the third argument is the output path.
npm run render -- C:/path/to/saved-edit.json fixtures/collection.json artifacts/edited.mp4
npm run verify -- artifacts/mixed-media.mp4
npx tsx scripts/playback.ts artifacts/mixed-media.mp4
npm run test:editor
```

Use a new output filename for each run; existing exports are never overwritten.
Outputs and JSON technical reports are in ignored `artifacts/`. Open the MP4
locally to review and share it only with its contributors. No public link is
created. Browser test screenshots and a saved replacement/crop example also
appear in artifacts. Set `FFMPEG_PATH` and `FFPROBE_PATH` to local executables
if they are not on PATH. The renderer downloads Chrome Headless Shell on first
use; this install time is excluded from the reported warm render timings.

## Permissioned local examples

Use the [local import and quality-evaluation guide](../../docs/RECAP-M1-EVALUATION.md)
and [repeatable checklist](../../evals/recap/QUALITY-CHECKLIST.md). The importer
requires explicit per-file permission, preserves originals, normalizes supported
SDR inputs, and records preparation separately. The evaluation bundle starts
pending and requires real traveler and physical-phone review. No real collection
has been provided. The detailed manual-copy workflow below is retained for already
normalized inputs; new imports should use `npm run import:local`.

No real trip collection has been supplied or evaluated yet. Do not search the
user's other files for footage or reuse destination/context photos as memories.
Only a developer with permission from contributors should prepare this input.

1. Copy permitted, normalized originals into ignored `public/private/` with
   simple filenames such as `lake-01.jpg` or `walk-01.mp4`. Retain the originals
   outside this tool as well. Do not put media or base64 inside a trip document.
2. Copy `fixtures/collection.json` to ignored `private/collection.json`, change
   the trip/account identifiers, record each uploader, actual dimensions and
   source version, and set consent only after obtaining permission. Each asset
   path must be `private/<filename>.jpg`, `.png` or `.mp4`. Mark ready/eligible
   explicitly; set `aiAllowed: false` since this prototype performs no AI work.
3. Use **Open collection** to load that manifest and explicitly choose 3–9
   moments in order, then create the new edit. The existing edit remains until
   you confirm that selection. Short videos must fit their assigned slots;
   adjust the selection if rejected. Framing starts full-image and music-free.
4. Review every shot, save the edit into `private/`, and pass those two local
   JSON paths to `npm run render`. Nothing is uploaded. Do not commit any of
   these inputs, screenshots, exports or hashes. Keep private manifests out of
   `fixtures/`, which is committed and embedded in the diagnostic render bundle.

Direct rendering still expects normalized JPEG/PNG and 30fps SDR H.264 MP4.
The local importer additionally exercises synthetic SDR HEVC, VFR MOV and
rotation normalization. Native phone capture formats/devices remain unverified;
HDR, HEIC and Live Photo packages are rejected. Corrupt/untrusted upload
inspection in a restricted worker is M2 work. Do not claim native phone support.

The tool stages only selected assets for rendering and rejects path traversal,
remote URLs and symlink escapes from the local public directory. It checks
versions, readiness, eligibility and source ranges before rendering, then
rechecks the manifest/draft and source hashes before atomically publishing.
Cancellation (Ctrl+C) cancels rendering; temporary outputs are cleaned. There
is no persistent job state or crash recovery. A changed/deleted source blocks
a new export; already downloaded files cannot be recalled. Existing local
exports must be deleted manually on withdrawal. Hosted invalidation and
short-lived private access are M2/M5 work, not provided by this tool.

## Editing style and technical contract

`keepsake-v1`: six manually chosen moments, 3/2/2.5/2.5/2/3-second holds, clean
cuts and no invented captions. Photos can have a restrained 2.5% push when
portrait crop is explicitly selected; full-image framing preserves the image.
There is no generated footage, subject recognition, generative fill or AI code.
The validator permits 3–9 shots with 1–5-second holds, contiguous timeline,
unique sources, supported crops/cuts and exactly 450 frames at 30fps. The
editor starts at six and does not yet add/reorder slots.

Output is 1080x1920, H.264 yuv420p, BT.709 limited range, CRF 18, medium preset,
AAC where selected, using PNG intermediates. A music-free edit with original
audio disabled has no audio stream. Audio peaks and stream durations are
checked, but perceptual sound balance and lip/action sync still need review.
The initial renderer default produced full-range yuvj420p; verification blocked
publication. Explicit PNG/BT.709 output corrected that failure.

## Dependencies and rights

The isolated package and lockfile pin Remotion/bundler/player/renderer 4.0.538,
React/ReactDOM 19.3.1, Zod 4.6.7, Vite 8.3.5, TypeScript 5.9.3 and test tooling.
Installed peer ranges permit React 19; compilation, Player interactions and
actual rendering were tested together. These dependencies are not imported
by the Next app or ordinary routes. The app TypeScript/lint configuration
excludes this standalone package; its own typecheck and tests are in CI.

Remotion has a [special license](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md),
not an MIT license. Local evaluation is within its stated evaluation use;
commercial use must be checked against the organization's circumstances before
adoption. The installed 4.0.538 license was read. Do not assume future v5 terms
are identical. See [Player](https://www.remotion.dev/docs/player),
[renderMedia](https://www.remotion.dev/docs/renderer/render-media) and
[rendering options](https://www.remotion.dev/docs/compare-ssr).

Local FFmpeg/ffprobe tested: 8.1.2 Gyan full build (GPL enabled, version 3,
libx264). No FFmpeg binary is committed or redistributed. Hosted/container
distribution and codec/license obligations must be reviewed separately; the
Ubuntu CI package may differ and undergoes the same output checks.

All diagnostic artwork and the 15-second score are generated by
`scripts/fixtures.ts` specifically for this evaluation. No third-party samples,
recordings or song melody are used. The score is an audio diagnostic, not the
production soundtrack: validation restricts it to synthetic examples. Real
footage uses music-free/original audio until a soundtrack with explicit export
rights and provenance is reviewed. Small diagnostic JPEGs and H.264 clips are
committed; the WAV is regenerated locally/CI. No private travel media is in Git.

## Evidence and remaining work

See [prototype evaluation](../../evals/recap/PROTOTYPE.md). Successful encoding
does not establish a good recap. Actual traveler collections, randomized
baseline comparisons, real mobile playback and the proposed shareability
gate remain outstanding. Upload quotas/retention, storage, account-enforced
permissions, durable jobs, gallery, Gemini selection and hosted downloads are
separate M2–M5 changes. Do not enable any production feature on these results.
