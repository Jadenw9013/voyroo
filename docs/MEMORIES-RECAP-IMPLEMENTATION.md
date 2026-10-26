# Voyroo Memories and Recap — Implementation Handoff

Status: M0 and local M1 prototype prepared for review; media product disabled.
Prepared: 2026-10-25.
Repository: https://github.com/Jadenw9013/voyroo
Local checkout: C:/Dev/Vacations/vacation-calendar
Inspected HEAD: f41c0b5. Reinspect before starting.
Document destination: docs/MEMORIES-RECAP-IMPLEMENTATION.md

## 1. Objective

Add private group photo/video sharing and an editable, AI-assisted
15-second vacation recap.

The recap must feel personal, preserve real uploaded footage, and be
easy to download. Prove output quality before broadening the feature.

First deliverable: a working prototype that produces a polished
15-second vertical MP4 from a permissioned trip collection.

Do not treat a successful render as proof of a good recap.

## 2. Branch, review, and deployment requirements

All documentation and implementation changes must happen on branches.

Never:
- Commit or push directly to main.
- Force-push main.
- Reset, discard, or stash unrelated user changes automatically.
- Deploy a feature branch to production.
- Use production trip data or credentials in automated tests.
- Merge or enable the production feature merely because tests pass.

First inspect:
- Repository and nested AGENTS.md instructions.
- git status, current branch, latest commits, and remote.
- Existing CI, deployment settings, and branch protection.
- Relevant bundled Next.js documentation before changing app code.

Save this document before implementation. Use a separate worktree so
the user's current checkout remains undisturbed.

Example commands, only after checking that branch/path do not exist:

    git -C "C:/Dev/Vacations/vacation-calendar" fetch origin
    git -C "C:/Dev/Vacations/vacation-calendar" worktree add -b docs/memories-recap-plan "C:/Dev/Vacations/voyroo-recap-plan" origin/main

Save this plan in that worktree, add a README documentation link, commit
only those files, push the documentation branch, and open a PR.

If the branch or worktree exists, inspect and reuse it appropriately.
Do not overwrite it.

Implement subsequent milestones on separate branches, for example:
- chore/recap-ci-foundation
- feat/recap-render-prototype
- feat/memories-storage-access
- feat/memories-gallery
- feat/recap-ai-selection
- feat/recap-export-pilot

Prefer sequential PRs against main after their dependencies merge.
If stacking PRs, document their dependencies and target the appropriate
parent branch. Do not combine the entire feature into one large PR.

Each PR must include:
- Problem and resulting behavior.
- Scope and explicit outstanding work.
- Tests executed and results.
- Screenshots or sample renders where relevant.
- Environment/configuration changes.
- Rollback instructions.

Production changes require reviewed, green PRs. Configure required
checks and protection against direct pushes where repository permissions
allow. If unavailable, report the missing protection explicitly.

Do not claim remote protection or deployment gates exist without
verifying them.

## 3. Existing architecture and compatibility constraints

The inspected application uses:
- Next.js 16.4.3, React 19.3.1, TypeScript, Zod.
- Gemini through the Vercel AI SDK.
- Upstash Redis for trip state and account memberships.
- Vitest and Playwright.
- Serwist for offline behavior.
- Google accounts plus passcode-based guest trip sessions.

Relevant existing files:
- src/server/auth.ts
- src/server/store.ts
- src/server/db.ts
- src/server/preview.ts
- src/server/ai/models.ts
- src/domain/types.ts
- src/domain/ops.ts
- src/sw/sw.ts
- playwright.config.ts
- playwright.production.config.ts
- docs/INFRA.md

Preserve:
- Google sign-in, remembered memberships, logout, and Back navigation.
- Existing itinerary editing, undo, offline outbox, and synchronization.
- New-trip planning and deterministic itinerary import.
- Existing public-preview rendering, photos, refresh, and revocation.
- Existing saved social-post links.

Uploaded memories are a separate feature from linked social posts and
contextual destination photos.

Do not put media binaries, base64 data, or an expanding media collection
inside the existing trip JSON document or itinerary operation log.

No .github directory was found in the inspected checkout. Recheck before
adding CI; do not assume remote checks or branch protection are absent.

## 4. Initial scope

Include:
- Private trip media collection.
- Batch photo and short-video uploads with progress and retry.
- Capture-date grouping, uploader attribution, and optional activity link.
- Personal favorites.
- Per-upload permission for AI processing and recap inclusion.
- A user-triggered "Make our recap" action.
- One polished editing style.
- 15-second, 9:16 output.
- Must-include, exclude, replace-shot, and crop controls.
- Private preview and downloadable MP4.

Defer:
- Automatic generation when the trip ends.
- Direct publishing to social networks.
- Public media links and public recap galleries.
- Facial identity recognition.
- Generated footage, voice clones, invented captions, or generative fill.
- Full timeline-editor UI.
- Multiple styles and longer recaps.
- Separate personalized cuts for every member.
- Comments, photo requests, and automatic anniversary notifications.

Existing public itinerary links must not acquire access to uploaded
media or recap exports.

## 5. Technical direction

Use provider interfaces so infrastructure can change without rewriting
the editing logic.

Initial choices:
- Cloudflare R2: private originals, analysis copies, thumbnails, exports.
- FFmpeg/ffprobe: media inspection, normalization, audio, technical checks.
- PySceneDetect: scene-boundary candidates where useful.
- Gemini: descriptions and candidate-moment selection.
- Remotion: controlled compositions and interactive preview.
- Vercel Sandbox: initial background-rendering candidate.
- Durable queue plus persistent job state: preparation, analysis, rendering.

Before implementing hosted processing, record an architecture decision
covering the queue provider, retry behavior, worker lifetime, concurrency,
and estimated operating cost.

Do not use an unawaited promise inside a web request as a job queue.
Do not run large uploads through ordinary Next.js request bodies.

Check current dependency compatibility and licensing before adoption.
Remotion uses a special license; do not describe it as MIT/open-source.
Record soundtrack provenance and rights for the intended export use.

Pin tested versions and commit the lockfile. Keep render/FFmpeg
dependencies out of browser bundles and ordinary app routes.

Suggested modules, adapting to repository conventions:
- src/domain/media/
- src/domain/recap/
- src/server/media/
- src/server/recap/
- src/features/memories/
- src/features/recap/
- workers/media/
- video/recap/
- evals/recap/
- docs/adr/

## 6. Identity and permissions

Existing guest sessions contain a name but lack a stable guest owner ID.
Names and Trip.people must never authorize ownership or moderation.

Initial release:
- Existing authorized trip members can view the private collection.
- Uploading and creating/editing recaps require a signed-in account that
  belongs to the trip.
- Existing remembered Google sessions must work without another login.
- Media ownership uses the server-verified account ID.
- Uploaders can delete their own media and change its recap eligibility.
- Recap creators can edit their own drafts.
- Favorites are personal and scoped to account plus trip.
- Trip membership does not automatically grant deletion of others' media.

Do not invent an organizer role from names or first access. If group-wide
moderation is needed, implement explicit persisted roles in a separate,
reviewed change.

Every API, job submission, playback URL, and download must enforce
trip membership and resource ownership as applicable.

A public preview token must never authorize any private media operation.

Recheck source eligibility before rendering and before serving an export.
If an upload is deleted or permission is withdrawn:
- Block its future use.
- Cancel or invalidate affected jobs and hosted exports.
- Remove derived objects according to the documented deletion policy.
- Explain that previously downloaded files cannot be recalled.

Private URLs must be short-lived. Document their residual access window.

## 7. Data model and processing contracts

Keep media metadata separately indexed by trip, with pagination and
atomic state transitions. Separate store methods from itinerary writes.

MediaAsset:
- id, tripId, ownerAccountId
- Original object key and derived object keys
- Verified content type, bytes, dimensions, duration
- Content hash, capture time, time-zone certainty
- Optional corrected trip date and activity ID
- Processing state and safe error code
- AI-processing permission and recap-inclusion permission
- Version, createdAt, deletedAt

RecapDraft:
- id, tripId, creatorAccountId, revision
- Source asset/version snapshot
- Template version, analysis/model version
- Must-include and excluded asset IDs
- Ordered shots and crop decisions
- Audio choice
- State, timestamps, export reference

Shot:
- Approved asset ID
- Source start/end for video
- Timeline start and duration in frames
- Crop/layout choice
- Allowed transition
- Original-audio settings
- Optional confirmed text

MediaJob:
- id, kind, tripId, resource ID
- Idempotency key and input revision/hash
- queued/running/succeeded/failed/cancelled state
- Attempt count, lease/heartbeat, progress
- Safe error code and output reference
- Timing and cost measurements

Derive private storage URLs on the server. Model output must reference
approved asset IDs, never arbitrary URLs, filesystem paths, commands,
or executable code.

Suggested API operations:
- Create upload intent.
- Complete and verify upload.
- List media with pagination.
- Update owned media metadata/permissions.
- Delete owned media.
- Obtain authorized playback/download access.
- Create/read/update recap draft.
- Start/cancel/read generation job.
- Export a specific draft revision.

Follow existing API conventions. Add mutation origin/CSRF protection,
rate limits, and server validation.

## 8. Upload and media preparation

Authorize upload intent, reserve quota atomically, and issue scoped
direct-upload credentials. Never trust the client's completion claim.

On completion:
- Verify object key, actual bytes, and detected media format.
- Reject unsupported or oversized media.
- Inspect in a restricted worker with time/resource limits.
- Normalize orientation, variable frame rates, and HDR/SDR handling.
- Preserve the original.
- Produce thumbnails and analysis copies.
- Strip unnecessary sensitive metadata from derivatives and exports.

Before pilot, configure and document:
- Allowed formats, including tested iPhone and Android formats.
- Per-file size and video-duration limits.
- Per-trip storage and media-count limits.
- Concurrent uploads/jobs and generation limits.
- Abandoned upload and temporary-object cleanup.

Do not silently claim support for HEIC, HEVC, or Live Photos without tests.

Treat missing/ambiguous capture dates as uncertain; allow correction.
Suggest activity matches rather than claiming planned activities occurred.

Private media must bypass broad service-worker image caching.
Test both direct object URLs and any image-optimization route used.
Signed URLs must not be persisted in offline trip snapshots.

## 9. Editing and AI behavior

First implement a manually selected edit using the production composition.

Starting design:
- Approximately 6–9 shots.
- Clean cuts and restrained transitions.
- Readable photo holds and complete actions.
- Minimal factual text.
- Conservative crops preserving important subjects.
- Original sound where useful.
- A prepared soundtrack with intentional ending, plus music-free export.

Use a full-image layout when a safe portrait crop is unavailable.
Do not invent missing scenery or force every day into 15 seconds.

AI pipeline:
1. Use technical checks to identify unusable sections.
2. Group duplicate/near-duplicate candidates.
3. Analyze previews for visible action, timestamps, crop risks, and audio.
4. Inspect shortlisted fast actions at higher temporal resolution.
5. Propose candidates and their roles in the edit.
6. Apply deterministic selection and timeline constraints.
7. Validate before preview/render.

Selection priority:
- Explicit user selections and exclusions.
- Favorites and confirmed activity context.
- Variety of experiences and contributors.
- Technical quality and layout suitability.

Contributor variety does not guarantee everyone appears on camera.

Gemini returns structured data validated with Zod. Use a dedicated media
analysis configuration; do not inherit itinerary-editing tools or web
grounding unnecessarily. Treat OCR, captions, filenames, and transcripts
as untrusted content.

Cache analysis by asset content/version plus model/prompt version.
Cache edit decisions by source snapshot, preferences, and template version.
Do not reanalyze footage when only music or a crop changes.

Validate:
- Authorized, eligible, ready assets only.
- In-range segment boundaries and compatible formats.
- Must-include and exclusion rules.
- No duplicate slots unless explicitly intended.
- Exactly 450 output frames at 30 fps, including transition overlaps.
- Permitted transitions and supported crop choices.
- Text derived only from confirmed information.

If selections cannot fit, explain the conflict. Do not silently ignore
must-include choices.

If AI fails, preserve manual selection and existing drafts.
If footage is sparse, offer a simpler photo-based edit or request more
media; do not fabricate filler.

## 10. Rendering and background reliability

Target:
- 1080x1920, 30 fps, 15 seconds.
- MP4 with tested H.264/AAC settings and broad mobile playback support.
- No audio track when appropriate for the music-free option.

Preview and export must share the same composition and timing logic.

Jobs must:
- Survive page closure and application restarts.
- Retry transient failures with bounded backoff.
- Use idempotency keys to prevent duplicate paid work.
- Recover expired leases.
- Respect cancellation and deleted media.
- Reject stale results from earlier draft revisions.
- Publish completed output atomically.
- Clean up temporary outputs after failure.

Use a trusted, fixed render bundle. Never execute AI-generated code.
Verify callback signatures if callbacks are used.

Check final exports for decode failures, duration/dimensions, unexpected
black frames, missing assets, clipping, and audio/video synchronization.
Account for intentional still-image holds when checking frozen frames.

## 11. Milestones and acceptance criteria

M0 — Documentation, baseline, CI, feature gates
- Save this plan and link it from README.
- Capture baseline test results.
- Add missing CI with isolated test configuration.
- Introduce server-side feature flags defaulting off.
- Keep the existing app operational without media credentials.

M1 — Rendering quality prototype
- Use small synthetic fixtures in Git and private permissioned examples.
- Render manually selected 15-second compositions.
- Support shot replacement and crop adjustment.
- Include mixed-orientation, photo-only, and mixed-media examples.
- Record actual render artifacts and quality observations.

M2 — Private storage and permissions
- Implement upload intents, verification, preparation, metadata, and jobs.
- Test ownership, cross-trip isolation, quota races, and deletion.
- Keep originals and all derived outputs private.

M3 — Memories UI
- Batch upload with per-file status and retry.
- Paginated gallery, viewing/playback, date correction, activity association.
- Personal favorites, eligibility controls, and owned-media deletion.
- Accessible mobile UI with loading, empty, offline, and failure states.
- No general app redesign.

M4 — AI selection
- Structured candidate analysis and deterministic edit assembly.
- Must-include/exclude behavior and targeted replacements.
- Reliable fallback when AI is unavailable.
- Evaluate against chronological and human-selected baselines.

M5 — Export and private pilot
- Background export, progress, download, cancellation, and retries.
- Browser/mobile export checks.
- Cost and latency measurements.
- Pilot allowlist, rollback drill, and complete operational documentation.

Do not advance from successful technical rendering to public launch
without evaluating the videos with actual travelers.

## 12. Tests and quality evaluation

Existing commands:
- npm ci
- npm run lint
- npm run typecheck
- npm test
- npm run e2e
- npm run e2e:production

The production E2E script builds the app itself. Avoid redundant builds
unless needed for an independent job. Use isolated build directories or
separate CI jobs to prevent build artifacts from colliding.

Add tests for:
- Guest viewing versus authenticated ownership.
- Cross-trip access and public-token denial.
- Signed upload abuse and completion verification.
- Concurrent quotas and duplicate job requests.
- Revoked eligibility during analysis, rendering, and download.
- Stale draft/render races and worker crash recovery.
- Timeline bounds, exact duration, exclusions, and deterministic edits.
- Signed URL expiry and private service-worker caching.
- Upload failures, retries, offline messaging, export and cancellation.
- Existing sign-in, logout, Back navigation, preview refresh, and editing.

Mock Gemini, object storage, and rendering in normal CI.
Use tiny synthetic assets for a real render smoke test.
No paid provider calls or private travel footage in public CI.

For human evaluation:
- Start with 3–5 permissioned collections.
- Expand toward approximately 20 varied collections before broad release.
- Reserve some collections for evaluation rather than tuning.
- Compare chronological, AI-selected, and human-selected edits using the
  same rendering style and randomized presentation order.

Ask travelers:
- Would you post it?
- Does it represent your trip?
- What important moment is missing?
- Which shots would you replace?
- Are any cuts, crops, captions, or sounds distracting?

Initial pilot target:
- At least 80% judged shareable after no more than two shot replacements.
- Preference over the chronological baseline.
- Zero unauthorized assets or invented captions.

These are proposed gates, not demonstrated performance.
Report counts and sample sizes; do not overstate a small pilot.

Measure preparation time, generation time, export latency, failure rate,
and cost per accepted export, including retries and storage.

## 13. CI/CD, rollout, and rollback

Use separate development, preview, and production:
- Storage buckets.
- Redis/job namespaces or databases.
- Provider credentials and budgets.
- OAuth configuration where needed.

Preview deployments must not inherit production storage access.
Avoid production cookies and secrets in preview tests.

CI:
- Run checks on pull requests and main.
- Require successful checks before merging.
- Use least-privilege workflow permissions.
- Do not expose secrets to untrusted PR code.
- Pin actions/dependencies according to repository policy.
- Upload test reports and synthetic sample renders on failure.
- Run real provider evaluations manually in an isolated environment.

Feature gates:
- Memories availability.
- AI analysis/generation availability.
- Rendering availability.
- Pilot trip/account allowlist.

Enforce flags in server routes and workers, not just UI.
Disabled or unconfigured media features must not break the planner.

Rollout:
1. Local deterministic prototype.
2. Isolated preview with synthetic fixtures.
3. Private pilot with consented media.
4. Reviewed release with features disabled by default.
5. Explicit controlled enablement after quality and cost review.

Use additive schemas and versioned records. Avoid destructive migrations.
Document deployment order for app, workers, and data changes.

Rollback:
- Disable new uploads/generation without affecting trip planning.
- Stop or drain jobs safely.
- Roll back application and worker versions together as required.
- Preserve originals and compatible metadata.
- Revoke faulty hosted exports where necessary.
- Verify existing sign-in, trip edits, and public previews still work.

A UI flag alone is not a complete rollback.

## 14. Required documentation and completion report

Maintain:
- This implementation plan with milestone status.
- Architecture decisions and infrastructure setup.
- .env.example with names/placeholders only.
- Local setup and synthetic fixture instructions.
- Format/size limits and retention policy.
- Privacy, eligibility, and deletion behavior.
- Render/model/template versioning.
- Evaluation results and sample artifact locations.
- CI checks, preview environment setup, rollout, and rollback runbook.

Never commit .env.local, credentials, private footage, or signed URLs.

At handoff/PR completion report:
- Branch and commit.
- PR and preview links, if created.
- What works and what remains.
- Tests actually run and results.
- Sample video evidence.
- Measured costs/latency, or clearly state they are unmeasured.
- Required infrastructure or account setup.
- Production deployment/enablement status.

Do not say the feature is complete, production-safe, or deployed without
evidence for that specific claim.

## 15. Research references

Recheck current documentation and terms when implementing:

- Gemini video understanding:
  https://ai.google.dev/gemini-api/docs/video-understanding
- Gemini structured outputs:
  https://ai.google.dev/gemini-api/docs/structured-output
- Remotion Player:
  https://www.remotion.dev/docs/player
- Remotion rendering options:
  https://www.remotion.dev/docs/compare-ssr
- Remotion license:
  https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- R2 signed URLs:
  https://developers.cloudflare.com/r2/api/s3/presigned-urls/
- FFmpeg filters:
  https://ffmpeg.org/ffmpeg-filters.html
- PySceneDetect:
  https://github.com/Breakthrough/PySceneDetect
- Google AutoFlip research:
  https://research.google/blog/autoflip-an-open-source-framework-for-intelligent-video-reframing/
- OpenCut status:
  https://github.com/OpenCut-app/OpenCut
- OpenCut Classic:
  https://github.com/OpenCut-app/opencut-classic

Study CapCut and GoPro Quik as output-quality benchmarks. Do not assume
their editing engines are open source or available as embeddable APIs.

## 16. Execution status — 2026-10-25

The original handoff above was saved before implementation in isolated worktree
`C:/Dev/Vacations/voyroo-recap-plan`, committed with only the README link, and
opened as [documentation PR #4](https://github.com/Jadenw9013/voyroo/pull/4).
The user's original checkout remains on main at f41c0b5.

| Milestone | Status and evidence |
| --- | --- |
| M0 | [CI/flags PR #5](https://github.com/Jadenw9013/voyroo/pull/5), independent against main; local lint/typecheck, 101 unit/API, 23 development and 4 production browser checks passed. Linux CI exposed missing optional lockfile entries and a saved-post hydration race; both were repaired. Latest remote checks must be verified on the PR. |
| M1 | [Local prototype PR #6](https://github.com/Jadenw9013/voyroo/pull/6), stacked on #5; shared preview/export, shot replacement, crops, must-include/exclusions, music-free and original audio. Three synthetic 1080x1920 MP4s each decoded to exactly 450 frames. Five domain groups and two editor tests passed. Desktop/phone-emulated Chromium playback passed. |
| M2–M5 | Not started; no hosted storage/uploads, account-enforced media API, durable jobs, gallery, Gemini selection, hosted download or private pilot. |

Review/merge CI #5 first, then update this documentation branch from main to
acquire required CI checks; retarget prototype #6 after its foundation merges.
No merge, production deployment or enablement was performed. Main branch
protection was configured and read back: one approving review, three strict
required CI checks, admins included, stale approvals dismissed, conversation
resolution, and no force pushes/deletion. Vercel production-branch/promotion
controls and Preview credential separation remain unverified; GitHub Production
has no additional deployment protection rules.

Synthetic evidence and measurements are committed under
[`evals/recap/`](https://github.com/Jadenw9013/voyroo/tree/feat/recap-render-prototype/evals/recap).
Local render times were 22–25 seconds; paid provider calls $0. Hosted cost,
latency, accepted-export cost, actual-phone compatibility, music listening
review and traveler shareability remain unmeasured. Remotion's special license
was read for evaluation; commercial adoption and a production soundtrack
require review. No private travel footage, secrets or signed URLs were committed.

No permissioned collection has been identified. M1 creative-quality acceptance
remains open until real contributors' footage is reviewed with actual travelers.
Use the local setup guide in PR #6. Do not broaden toward a pilot or public
launch based on the synthetic checks. A hosted-processing ADR is required before
implementing M2 processing; the local ADR does not select or provision a queue.
