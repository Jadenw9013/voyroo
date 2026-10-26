# Permissioned local footage and repeatable M1 quality evaluation

Status: tooling prepared; **zero real traveler collections and zero physical
devices evaluated**. Creative quality has not passed. No real collection was
identified during this work. M2 hosted storage/jobs and AI remain separate.

## Exact input needed

Provide the local absolute folder path (not a public link or upload to GitHub)
containing one consented trip collection. To start:

- At least three usable permitted assets; preferably 8–20 varied photos and
  5–15-second clips so a human can choose 6–9 moments. Three photos can form a
  simpler edit. Each chosen clip must fit its assigned hold; never loop or
  fabricate filler to make it fit.
- An explicit list of filenames to import, stable uploader IDs for each,
  the local editor's stable ID, and each contributor's approval for local
  processing, private recap inclusion and viewing by the evaluation participants.
  The manifest is an operator attestation, not Google/account authorization.
- Confirmation that sources are SDR or separately reviewed SDR exports. Native
  HDR, HEIC and Live Photo packages require the preparation described below.
- An ordered manual selection, exclusions and important actions/moments to
  preserve. Optional context must be confirmed by the traveler; do not infer
  dates or activities from a planned itinerary.
- An actual traveler available to review, plus an iPhone and Android device
  and their browser/gallery versions for physical playback checks. Devices
  are needed for acceptance, not for starting preparation.

No trip passcode, OAuth/session secret, R2 credential, Redis token or AI key is
needed. Do not scan other user folders or borrow destination photos as memories.

## 1. Prepare an explicit permission manifest

From `video/recap`, copy the intentionally invalid
[`import-manifest.example.json`](../evals/recap/import-manifest.example.json)
to ignored `private/import-manifest.json`. Fill the absolute source folder,
listed relative filenames and uploader IDs. After obtaining permission, replace
the global consent placeholder with `contributors-permitted-local-processing`,
each file's permission with `local-processing-and-private-recap-approved`, and
colorMode with `confirmed-sdr`. Keep aiAllowed false. A placeholder is not consent:
the tool rejects the example until these attestations are explicitly supplied.

`initialSelection` is optional. If present, it must be 3–9 distinct listed IDs
in the precise human-chosen order. Without it, importing creates a collection
and no draft. Nothing selects the first six automatically. The browser's
**Open collection** shows a picker and preserves the current draft until the
operator explicitly creates an edit. Replacement, crop, must-include, exclusion,
source start and original-sound controls remain available.

Local preparation limits: at most 100 explicitly listed regular files, 500 MiB
per file, 2 GiB total, video <=120 seconds and <=40 megapixels per frame/photo.
These are tool bounds, not atomic cloud storage quotas. Symlink/path traversal
outside the consented source folder is rejected; output directories must stay
within the workspace. Input files and filenames are never passed through a shell.

## 2. Import and normalize without changing originals

```powershell
cd C:/Dev/Vacations/voyroo-recap-evaluation/video/recap
npm ci
npm run import:local -- private/import-manifest.json
```

The command reports a new ignored `private/imports/<id>/` folder containing
byte-preserved originals, collection.json, preparation.json and (only if selected)
manual-draft.json. Ready derivatives use random import-prefixed IDs in ignored
`public/private/`. A failure cleans only that invocation's new staging/derivatives;
it does not modify source files. Failed imports do not publish a partial collection.

| Input | Preparation performed | Acceptance limit |
| --- | --- | --- |
| Single JPEG/PNG | Apply EXIF orientation, preserve full image, reduce long edge to <=2560 without upscaling, convert to sRGB, strip unnecessary metadata; PNG transparency retained | Synthetic rotation/metadata checks pass. Compare the prepared copy to the original before choosing a crop. |
| SDR H.264 MP4/MOV | Bake display rotation into pixels, preserve full aspect ratio, square pixels, even dimensions, long edge <=1920 without upscaling, constant 30fps H.264 yuv420p with Rec.709 output settings; strip metadata/chapters | Synthetic rotation and variable-frame-rate MOV checks pass. Frame-rate conversion may drop/repeat frames: inspect complete actions, duration and sync. |
| SDR HEVC MP4/MOV | Decode using installed FFmpeg, then the same SDR preparation | Exercised with synthetic HEVC. This does not certify a native iPhone/Android codec/device combination. Verify each real sample. |
| Source audio | First track retained as AAC stereo, 48kHz, 160kbps, no gain normalization; no track added when absent | Listen for downmix changes, clipping, silence and sync. A no-audio source cannot enable original sound. No production music is supplied. |
| HDR/PQ/HLG/BT.2020/Dolby metadata | Reject, without applying a silent tone map | Obtain a reviewed SDR/Rec.709 export from a trusted editor/device workflow. Compare highlights, skin, color, full action/duration and sync. Keep original HDR. No blanket native HDR support claim. |
| HEIC/Live Photos | Reject package/HEIC import | Export a normal SDR JPEG/PNG and, if wanted and permitted, a separate motion clip with a trusted device/editor. Review each as a separate asset. No automatic Live Photo assembly. |

The `confirmed-sdr` declaration matters when color metadata is absent or wrong.
Do not relabel HDR as SDR to pass validation. Automated metadata checks cannot
prove the color content is SDR. Any tone-map/color conversion must be visually
reviewed; the tool deliberately does not apply a one-size-fits-all HDR filter.

Preparation uses [sharp orientation handling](https://sharp.pixelplumbing.com/api-operation/#rotate)
and fixed [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html) / 
[rotation and mapping options](https://ffmpeg.org/ffmpeg-doc.html). FFmpeg must
include the needed decoders/libx264; tests exercise installed tools rather
than claiming support from a filename. Local tested build is 8.1.2; CI checks
its Ubuntu build separately. These are local trusted-file tools, not restricted
workers for hostile uploads. No new dependency/provider or commercial license
is adopted by this change; retain the Remotion/FFmpeg review requirements.

## 3. Make and render a manual edit

Run `npm run dev` and open the loopback address. If another worktree is using
3400, set `$env:RECAP_EDITOR_PORT='3402'` before starting. Tests refuse to reuse
an unknown running server. Stop the server after reviewing private media.

Open collection.json, explicitly choose moments in order, and create the edit;
or open the imported collection and its explicitly selected manual-draft.json.
Save the edited draft under ignored `private/`. The default is music-free,
full-image framing; a replacement resets to full-image. An invalid choice keeps
the previous valid draft and reports the conflict. No new style or AI selection
is introduced. Short clips that cannot fit the slots require another human
choice or explicitly rebalanced frame allocations in saved JSON (450 total).

```powershell
npm run render -- private/imports/IMPORT-ID/manual-draft.json private/imports/IMPORT-ID/collection.json private/recap-revision-1.mp4
```

The new render report binds the exact draft text, source hashes and MP4 hash.
Old reports without that binding cannot be evaluated automatically; rerender.
No upload, web job queue, public access URL or automatic trip JSON change occurs.

## 4. Build a private review package

```powershell
npm run evaluate -- private/imports/IMPORT-ID/manual-draft.json private/imports/IMPORT-ID/collection.json private/recap-revision-1.mp4 private/evaluations/trip-01-revision-1
```

Use a new direct child folder of private/evaluations each time. The bundle
contains the exact MP4, uncropped prepared sources, start/middle/end frames
for each shot, a contact sheet, technical diagnostics, the
[quality checklist](../evals/recap/QUALITY-CHECKLIST.md), review.json, and a local
index.html for playback/comparison. It may duplicate substantial media; keep
disk space available and everything private. No report is saved in public CI
artifacts. Filled reviews and private media must not be added to Git.

The tool rechecks current eligibility, source bytes, exact draft and MP4 binding
before/after packaging. Withdrawing eligibility or changing an input invalidates
the later summary. Already downloaded/review copies cannot be recalled; remove
them manually on withdrawal. This local check is not hosted job/export revocation.

## 5. Review and report honestly

Complete CHECKLIST.md while watching normal-speed playback and full sources.
Record framing, action completeness, pacing, sound and physical mobile playback
in review.json; leave unknowns pending/null. The traveler answers wouldShare,
representsTrip, missingMoment and replacementCount. Record unauthorized assets
or invented text explicitly. Supply actual physical device/browser versions;
emulated Chromium cannot satisfy the iPhone/Android requirement.

```powershell
npm run evaluate:summary -- private/evaluations/trip-01-revision-1
```

The summary emits counts only: pending/rejected/accepted examples and invalid
or revoked records. It does not expose reviewer notes or names, infer approvals
from a render, or declare the style's overall gate passed. Counts are exports,
not independent trips. Keep reviews per revision. Repeat with 3–5 varied
permissioned collections, reserving holdouts; compare chronological and human
selection with the same composition/audio, randomized A/B order saved privately.
AI comparison remains deferred. Report denominators and preference/ties; expand
toward ~20 varied trips before broad release. The proposed >=80% shareability
after <=2 replacements is still unmeasured.

## Verification and boundaries

`npm test`: timing/manual choice and review-state validation. `npm run test:media`:
actual synthetic EXIF rotation, VFR MOV/display rotation, metadata stripping,
SDR HEVC preparation, HDR rejection, consent/path/HEIC refusal and failure cleanup.
`npm run test:editor`: selection/replacement preservation. The synthetic end-to-end
smoke imports explicit fixtures, retains original sound, renders, creates a bundle,
leaves its creative review pending, and rejects changed crop/withdrawn eligibility.
It is in CI with no private inputs or provider calls.

Vercel Preview currently shares production credentials: see
[audit PR #7](https://github.com/Jadenw9013/voyroo/pull/7). This branch disables
its automatic Git deployment. Do not test permissioned footage in existing
Previews. Nothing is merged or enabled in production. M2 hosted storage/jobs
and AI work stay separate until the rendering style has been evaluated.
