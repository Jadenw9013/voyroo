# M1 local prototype evidence

Continuation: [real-footage preparation and review tooling](../../docs/RECAP-M1-EVALUATION.md)
and [repeatable quality checklist](QUALITY-CHECKLIST.md). Synthetic normalization
and review-package checks are added; real traveler collections and physical
phones remain unevaluated. Creative quality has not passed.

Prepared 2026-10-25. Synthetic diagnostics only; no traveler sample or preference
evaluation. No claim of shareability, production safety or completion of M1.

## Local evidence

All paths below are relative to `video/recap/`, in ignored `artifacts/`.
Public synthetic copies of the three passing MP4s, their reports, the contact
sheet and editor screenshots are committed in [samples](samples/) for PR review.
Render reports include revision/template, source hashes, measured elapsed
time and technical results. Local CPU measurements are single runs, not
hosted latency forecasts. Provider calls cost $0; CPU/electricity, hosted
rendering, queue, storage, licensing and cost per accepted export are unmeasured.

| Example | Artifact | Total local seconds | Audio |
| --- | --- | ---: | --- |
| Mixed photo/video | artifacts/mixed-media.mp4 | 24.29 | AAC diagnostic score, peak -23.68 dB |
| Mixed orientation, full image | artifacts/mixed-orientation.mp4 | 22.34 | No audio stream |
| Photo-only, conservative framing | artifacts/photo-only-safe.mp4 | 23.40 | No audio stream |

All three: 1080x1920 H.264, yuv420p, 30fps, exactly 450 decoded frames and 15.0s.
Full FFmpeg decode passed, blackdetect found no unexpected black intervals.
Music-free exports had no audio track. Audio/video stream durations agree
within the verifier tolerance; perceptual sync is not established by this check.

Mixed-media export played through to the end without a media error in desktop
Chromium and phone-sized Chromium emulation. Actual iPhone Safari/Android
devices, HDR/rotation and social-app import have not been tested.

`artifacts/contact-sheet.png` samples the six mixed-media shot centers. Visual
inspection found all six expected synthetic sources, no missing/black slots,
legible diagnostic labels and conservative default framing. Wide sources in
the full-image example have intentional neutral letterboxing; their marker
targets stay visible. Explicit portrait crop can lose edge targets, as seen
in the editor replacement/crop test. That is why replacement resets to full
image, and real subjects require human review. Synthetic markers cannot
establish preservation of faces or complete real actions.

The fixture score has an intentional tail fade, but is not an approved travel
soundtrack. Listening/creative sound review remains pending. Frame/black and
peak checks do not measure taste, representation, distracting cuts, action
completeness, invented context or emotional quality. No frozen-frame detector
is used because still-image holds are intentional.

## Automated verification

- Isolated package TypeScript check passed.
- Five domain test groups passed: deterministic timing/replacement; revoked,
  deleted, stale and cross-trip sources; bounds/overlaps/duplicate slots; visible
  must-include/exclusion conflicts; path/URL/code and consent rejection.
- Two browser editor tests passed: saved edit preserves replacement/crop, invalid
  replacement preserves draft, mobile layout has no horizontal overflow, no
  service worker and no-store response. Screenshots: artifacts/editor-desktop.png
  and artifacts/editor-mobile.png. Saved edited example: artifacts/edited-fixture.json.
- A full 1080p mixed-media render is added to public CI with synthetic fixtures
  only, followed by decoder/technical and desktop/mobile-emulation playback.
  CI uploads generated evidence for seven days. Remote results must be checked
  on the PR; a local pass is not a remote pass.
- Existing app baseline: 101 unit/API, 23 development browser and 4 production
  browser checks passed locally in the foundation worktree. See
  [foundation](../../docs/RECAP-FOUNDATION.md) for the baseline failures and fixes.

## Evaluation still required

No consented collection was provided. Start with 3–5 permissioned collections,
hold some out, then expand toward approximately 20 varied trips before broad
release. Compare chronological, AI-selected (after M4) and human-selected cuts
using this same style and randomized order. Record counts and sample sizes for
shareability after no more than two replacements, trip representation, missing
moments, crop/cut/text/audio distractions and preference over the baseline.
The proposed >=80% shareability and zero unauthorized/invented content gates
are unmeasured. No actual-traveler approval or public launch is authorized.

Next milestone is evaluation of permitted media using the local tool. Hosted
processing requires a separate infrastructure ADR selecting queue provider,
lease/retry/cancellation semantics, worker lifetime, concurrency and measured
cost estimate before code or credentials are added.
